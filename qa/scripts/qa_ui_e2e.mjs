#!/usr/bin/env node
// ============================================================================
// QA UI E2E + INTEGRASI — index.js ASLI dijalankan di browser dengan mock ST.
// Event flow lengkap + interaksi UI via locator (jalur pointer asli).
// Jalankan: node scripts/qa_ui_e2e.mjs
// ============================================================================
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = '/home/z/my-project/scripts/qa_integration';
const SHOTS = '/home/z/my-project/analysis/qa_shots';
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = join(ROOT, p);
    if (!existsSync(file)) { res.writeHead(404); res.end('nf: ' + p); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
});
await new Promise(r => server.listen(4188, r));

const browser = await chromium.launch();
const results = [];
const test = async (name, fn) => {
    try { await fn(); results.push(['✓', name]); console.log('  ✓', name); }
    catch (e) { results.push(['✗', name]); console.error('  ✗', name, '\n    ', String(e.message).split('\n')[0]); }
};

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('dialog', d => d.accept().catch(() => {})); // auto-accept confirm()
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto('http://localhost:4188/');
await page.waitForFunction('window.__PAGE_READY === true', null, { timeout: 8000 });

// 124 = 105 setting + 5 system + 14 derived (3 roll + 4 pick + date + time + msg + 3 kw + note_on + x1)
const waitDerivedDone = () => page.waitForFunction('window.__CHAT_METADATA.variables?.LD_x1 !== undefined', null, { timeout: 5000 });
const host = page.locator('#littleDevilCompanionHost');

// ============================================================================
console.log('\n── FLOW 1: APP_READY → init chat ──');
await test('boot: modul index.js import tanpa error halaman', async () => {
    assert.equal(pageErrors.length, 0, 'pageerror: ' + pageErrors.join(' | '));
});

await test('APP_READY → 110 variabel seeded + 14 derived = 124, typed', async () => {
    await page.evaluate('window.__EVENTS.emit("app_ready")');
    await page.waitForFunction('window.__lildevilCompanionReady === true', null, { timeout: 5000 });
    await waitDerivedDone();
    const v = await page.evaluate('window.__CHAT_METADATA.variables');
    assert.equal(Object.keys(v).length, 124, 'jumlah variabel = ' + Object.keys(v).length);
    assert.equal(v.writing_mode, 0);
    assert.equal(v.speech_variance, 'Balanced');
    assert.equal(v.HELENA, 'FALSE');
    assert.ok(Number.isInteger(v.LD_roll_1_500) && v.LD_roll_1_500 >= 1 && v.LD_roll_1_500 <= 500);
    assert.ok(['special ability', 'special item', 'power awakening', 'romance', 'item enhancement', ''].includes(v.LD_pick_1));
});

await test('host dashboard + fab cluster tampil di DOM', async () => {
    assert.equal(await host.locator('.ldc-fab-btn').count(), 2);
});

await test('MESSAGE_RECEIVED (Helena) → HELENA=TRUE + LD_msg update', async () => {
    await page.evaluate('window.__CTX.chat.push({ mes: "Halo, aku Helena — pembimbingmu." })');
    await page.evaluate('window.__EVENTS.emit("message_received", 0)');
    await page.waitForFunction(`window.__CHAT_METADATA.variables?.HELENA === 'TRUE'`, null, { timeout: 5000 });
    const v = await page.evaluate('window.__CHAT_METADATA.variables');
    assert.equal(v.LD_msg, 1);
    assert.match(v.LD_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(v.LD_time, /^\d{2}:\d{2}$/);
});

await test('MESSAGE_SENT ke-2 → LD_msg ikut bertambah', async () => {
    await page.evaluate('window.__CTX.chat.push({ mes: "balasan user tanpa helena" })');
    await page.evaluate('window.__EVENTS.emit("message_sent", 1)');
    await page.waitForFunction(`window.__CHAT_METADATA.variables?.LD_msg === 2`, null, { timeout: 5000 });
});

console.log('\n── FLOW 2: migrasi tipe + chat switch ──');
await test('metadata korup (string numerik) → CHAT_CHANGED migrasi ke number', async () => {
    await page.evaluate(`(() => {
        const v = window.__CHAT_METADATA.variables;
        v.writing_mode = '2'; v.trpgmode = '1'; v.customlength1 = '300'; v.SFW = '0';
    })()`);
    await page.evaluate('window.__EVENTS.emit("chat_id_changed", "chat-2")');
    await page.waitForFunction(`window.__CHAT_METADATA.variables?.writing_mode === 2`, null, { timeout: 5000 });
    const v = await page.evaluate('window.__CHAT_METADATA.variables');
    assert.equal(v.trpgmode, 1); assert.equal(v.customlength1, 300); assert.equal(v.SFW, 0);
});

await test('chat baru kosong → semua variabel di-seed ulang (124)', async () => {
    await page.evaluate('window.__CHAT_METADATA.variables = {}; window.__CTX.chat = []; window.__CTX.chatId = "chat-3"');
    await page.evaluate('window.__EVENTS.emit("chat_id_changed", "chat-3")');
    await waitDerivedDone();
    const n = await page.evaluate('Object.keys(window.__CHAT_METADATA.variables).length');
    assert.equal(n, 124, 'jumlah = ' + n);
    assert.equal(await page.evaluate('window.__CHAT_METADATA.variables.writing_mode'), 0);
});

console.log('\n── FLOW 3: dadu end-to-end ──');
await test('tombol dadu → hasil dikirim sebagai pesan user + LD_last_roll tercatat', async () => {
    await page.evaluate('window.__CTX.chat = [{ mes: "aku menyerang! <DICE>1d20:Attack:DC:10</DICE>" }]; window.__CTX.chatId = "chat-4"');
    await page.evaluate('window.__EVENTS.emit("chat_id_changed", "chat-4")');
    await page.waitForFunction(`window.__CHAT_METADATA.variables?.LD_msg === 1`, null, { timeout: 5000 });
    const before = await page.evaluate('window.__SENT.length');
    await host.locator('[data-act="dice"]').click();
    await page.waitForFunction(`window.__SENT.length > ${before}`, null, { timeout: 5000 });
    const sent = await page.evaluate('window.__SENT[window.__SENT.length - 1]');
    assert.match(sent, /Attack: 1d20 = \[\d+\]/);
    const v = await page.evaluate('window.__CHAT_METADATA.variables');
    assert.ok(String(v.LD_last_roll).includes(':1'), 'LD_last_roll = ' + v.LD_last_roll);
});

await test('anti-dobel: tombol dadu lagi pada pesan yang sama → ditolak + toast', async () => {
    const before = await page.evaluate('window.__SENT.length');
    await host.locator('[data-act="dice"]').click();
    await page.waitForTimeout(500);
    const after = await page.evaluate('window.__SENT.length');
    assert.equal(after, before, 'tidak boleh kirim ulang');
    const toasts = await page.evaluate('window.__TOASTS.join(" | ")');
    assert.match(toasts, /sudah|already/i, 'toast anti-dobel: ' + toasts);
});

console.log('\n── FLOW 4: profil global via extension_settings ──');
await test('ubah switch → Save Global → tersimpan di extension_settings', async () => {
    await page.evaluate('window.__CHAT_METADATA.variables = {}; window.__CTX.chat = []; window.__CTX.chatId = "chat-g1"');
    await page.evaluate('window.__EVENTS.emit("chat_id_changed", "chat-g1")');
    await waitDerivedDone();
    await host.locator('[data-act="panel"]').click();
    await page.waitForTimeout(300);
    const unchecked = host.locator('.ldc-ctl.is-switch input:not(:checked)').first();
    const key = await unchecked.evaluate(inp => inp.closest('.ldc-ctl').dataset.key);
    await host.locator(`.ldc-ctl.is-switch[data-key="${key}"] .ldc-ctl-label`).click(); // tap label = jalur user asli
    await page.waitForFunction(`window.__CHAT_METADATA.variables?.["${key}"] === 1`, null, { timeout: 5000 });
    // Save Global
    await host.locator('[data-act="menu"]').click();
    await host.locator('[data-m="saveg"]').click();
    await page.waitForFunction(`(window.__EXT_SETTINGS?.littleDevilCompanion?.globalDefaults ?? null) !== null`, null, { timeout: 5000 });
    const g = await page.evaluate('window.__EXT_SETTINGS.littleDevilCompanion.globalDefaults');
    assert.equal(g[key], 1, 'nilai switch ikut tersimpan');
    assert.ok(Object.keys(g).length >= 100, 'snapshot global lengkap: ' + Object.keys(g).length);
});

await test('Apply Global → nilai profil masuk ke chat variables', async () => {
    await page.evaluate('window.__CHAT_METADATA.variables = {}; window.__CTX.chat = []; window.__CTX.chatId = "chat-g2"');
    await page.evaluate('window.__EVENTS.emit("chat_id_changed", "chat-g2")');
    await waitDerivedDone();
    // chat baru: init pakai globalDefaults (tersimpan di ext()) → key harus 1
    const v = await page.evaluate('window.__CHAT_METADATA.variables');
    // key yang di-save sebelumnya harus bernilai 1 di chat baru
    const g = await page.evaluate('window.__EXT_SETTINGS.littleDevilCompanion.globalDefaults');
    const savedKey = Object.entries(g).find(([k, val]) => val === 1)?.[0];
    assert.ok(savedKey, 'ada kunci bernilai 1 di profil');
    assert.equal(v[savedKey], 1, `chat baru mulai dari profil global: ${savedKey}`);
});

console.log('\n── FLOW 5: kebersihan runtime ──');
await test('tidak ada pageerror/console.error sepanjang sesi', async () => {
    assert.equal(pageErrors.length, 0, 'pageerror: ' + pageErrors.join(' | '));
    assert.equal(consoleErrors.length, 0, 'console.error: ' + consoleErrors.join(' | '));
});

await host.locator('[data-act="panel"]').click().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: join(SHOTS, 'integration_panel.png') });

console.log('\n════════ QA UI E2E + INTEGRASI ════════');
console.log(results.map(r => r[0]).join(' '));
const failed = results.filter(r => r[0] === '✗');
console.log(`PASS: ${results.length - failed.length}  FAIL: ${failed.length}`);
await browser.close();
server.close();
process.exit(failed.length ? 1 : 0);
