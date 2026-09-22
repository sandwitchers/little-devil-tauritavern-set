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
await test('tombol dadu → marker DiceCard dikirim sebagai pesan user + LD_last_roll content-key', async () => {
    await page.evaluate('window.__CTX.chat = [{ mes: "aku menyerang! <DICE>1d20:Attack:DC:10</DICE>" }]; window.__CTX.chatId = "chat-4"');
    await page.evaluate('window.__EVENTS.emit("chat_id_changed", "chat-4")');
    await page.waitForFunction(`window.__CHAT_METADATA.variables?.LD_msg === 1`, null, { timeout: 5000 });
    const before = await page.evaluate('window.__SENT.length');
    await host.locator('[data-act="dice"]').click();
    await page.waitForFunction(`window.__SENT.length > ${before}`, null, { timeout: 5000 });
    const sent = await page.evaluate('window.__SENT[window.__SENT.length - 1]');
    assert.match(sent, /^<DiceCard label="Attack"/, 'marker kartu: ' + sent);
    assert.match(sent, /formula="1d20"/);
    assert.match(sent, /verdict="(SUCCESS|FAILURE|CRITICAL SUCCESS|FUMBLE) · DC 10"/);
    const v = await page.evaluate('window.__CHAT_METADATA.variables');
    assert.match(String(v.LD_last_roll), /^0:1d20:Attack:DC:10$/, 'content-key = ' + v.LD_last_roll);
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

console.log('\n── FLOW 3B: v1.3.0 auto-roll + tap-to-roll chip ──');
await test('MESSAGE_RECEIVED dengan tag DICE → auto-roll kirim kartu hasil (tanpa tombol)', async () => {
    await page.evaluate('window.__CTX.chat.push({ mes: "Rolanya dulu! <DICE>1d100:Perception:50:LOW</DICE>" })');
    const before = await page.evaluate('window.__SENT.length');
    await page.evaluate('window.__EVENTS.emit("message_received", 1)');
    await page.waitForFunction(`window.__SENT.length > ${before}`, null, { timeout: 5000 });
    const sent = await page.evaluate('window.__SENT[window.__SENT.length - 1]');
    assert.match(sent, /^<DiceCard label="Perception"/, 'auto-roll marker: ' + sent);
    assert.match(sent, /sys="CoC"/);
    assert.match(sent, /verdict="(EXTREME SUCCESS|HARD SUCCESS|SUCCESS|FAILURE|CRITICAL SUCCESS|FUMBLE) · ≤ 50"/);
});

await test('MESSAGE_RECEIVED ulang (indeks sama, isi sama) → tidak dikirim ulang', async () => {
    const before = await page.evaluate('window.__SENT.length');
    await page.evaluate('window.__EVENTS.emit("message_received", 1)');
    await page.waitForTimeout(400);
    const after = await page.evaluate('window.__SENT.length');
    assert.equal(after, before, 'anti-dobel auto-roll');
});

await test('swipe: indeks sama, tag beda → auto-roll ulang (content key)', async () => {
    await page.evaluate('window.__CTX.chat[1].mes = "Varian lain: <DICE>1d100:Spot:50:LOW</DICE>"');
    const before = await page.evaluate('window.__SENT.length');
    await page.evaluate('window.__EVENTS.emit("message_received", 1)');
    await page.waitForFunction(`window.__SENT.length > ${before}`, null, { timeout: 5000 });
    const sent = await page.evaluate('window.__SENT[window.__SENT.length - 1]');
    assert.match(sent, /^<DiceCard label="Spot"/, 'swipe re-roll: ' + sent);
});

await test('toggle auto-roll OFF → MESSAGE_RECEIVED dengan tag baru tidak melempar', async () => {
    await page.evaluate('window.__EXT_SETTINGS.littleDevilCompanion.ui.autoRoll = false');
    await page.evaluate('window.__CTX.chat.push({ mes: "Cek terakhir: <DICE>1d20:Save:DC12</DICE>" })');
    const before = await page.evaluate('window.__SENT.length');
    await page.evaluate('window.__EVENTS.emit("message_received", 2)');
    await page.waitForTimeout(500);
    const after = await page.evaluate('window.__SENT.length');
    assert.equal(after, before, 'auto-roll off → tidak kirim');
    await page.evaluate('window.__EXT_SETTINGS.littleDevilCompanion.ui.autoRoll = true');
});

await test('pesan tanpa tag DICE → tidak ada pengiriman', async () => {
    await page.evaluate('window.__CTX.chat.push({ mes: "narrasi biasa tanpa dadu." })');
    const before = await page.evaluate('window.__SENT.length');
    await page.evaluate('window.__EVENTS.emit("message_received", 3)');
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate('window.__SENT.length'), before);
});

await test('tap-to-roll: klik chip [data-ld-dice-request] di .mes → roll pesan itu', async () => {
    await page.evaluate(`(() => {
        const mes = document.createElement('div');
        mes.className = 'mes'; mes.setAttribute('mesid', '2');
        mes.innerHTML = '<span data-ld-dice-request="1">chip</span>';
        document.body.appendChild(mes);
    })()`);
    const before = await page.evaluate('window.__SENT.length');
    await page.locator('.mes[mesid="2"] [data-ld-dice-request]').click();
    await page.waitForFunction(`window.__SENT.length > ${before}`, null, { timeout: 5000 });
    const sent = await page.evaluate('window.__SENT[window.__SENT.length - 1]');
    assert.match(sent, /^<DiceCard label="Save"/, 'chip roll: ' + sent);
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

console.log('\n── FLOW 4.5: diagnostik bridge preset (v1.3.1) ──');
await test('STPT aktif → status card OK, badge warn FAB hidden, banner hidden', async () => {
    await page.evaluate('window.__EXT_SETTINGS.EjsTemplate = { enabled: true, generate_enabled: true }');
    // refreshChrome berjalan saat panel (re)open
    await host.locator('[data-act="close"]').click();
    await host.locator('[data-act="panel"]').click();
    await page.waitForTimeout(200);
    assert.equal(await host.locator('.ldc-fab-warn').isVisible().catch(() => false), false, 'badge warn hidden');
    assert.equal(await host.locator('.ldc-banner').isVisible().catch(() => false), false, 'banner hidden');
    await host.locator('[data-act="menu"]').click(); // buka menu → status card fresh
    await page.waitForTimeout(150);
    assert.ok(await host.locator('.ldc-status.is-ok').count() === 1, 'status card is-ok ter-render');
    const stText = await host.locator('.ldc-status .ok').first().textContent();
    assert.match(stText, /ST-Prompt-Template/, 'status text: ' + stText);
    assert.ok(await host.locator('.ldc-status .ldc-status-vars').count() === 1, 'readout variabel tampil');
});

await test('STPT dimatikan → badge warn FAB muncul + banner + hint', async () => {
    await page.evaluate('window.__EXT_SETTINGS.EjsTemplate.enabled = false');
    await host.locator('[data-act="close"]').click();
    await host.locator('[data-act="panel"]').click();
    await page.waitForTimeout(200);
    assert.equal(await host.locator('.ldc-fab-warn').isVisible(), true, 'badge warn tampil');
    assert.equal(await host.locator('.ldc-banner').isVisible(), true, 'banner tampil');
    await host.locator('[data-act="menu"]').click();
    await page.waitForTimeout(150);
    assert.ok(await host.locator('.ldc-status.is-bad').count() === 1, 'status card is-bad');
    assert.ok(await host.locator('.ldc-status-hint').count() === 1, 'hint install tampil');
    await page.evaluate('window.__EXT_SETTINGS.EjsTemplate.enabled = true');
});

await test('Uji sinkronisasi: probe ditulis, dibaca balik, lalu dihapus', async () => {
    await page.evaluate('window.__EXT_SETTINGS.EjsTemplate = { enabled: true, generate_enabled: true }');
    await host.locator('[data-m="sync"]').click();
    await page.waitForTimeout(400);
    const probe = await page.evaluate(`"LD_sync_probe" in window.__CHAT_METADATA.variables`);
    assert.equal(probe, false, 'probe dibersihkan setelah test');
    assert.equal(await page.evaluate('window.__SAVED_META_NOW ?? 0') >= 0, true);
});

await test('Simpan sekarang → saveMetadata() langsung terpanggil', async () => {
    const before = await page.evaluate('window.__SAVED_META_NOW ?? 0');
    await host.locator('[data-m="savenow"]').click();
    await page.waitForTimeout(300);
    const after = await page.evaluate('window.__SAVED_META_NOW ?? 0');
    assert.equal(after, before + 1, 'saveMetadata counter naik');
});

await test('pulse commit: ubah trpgmode via UI → "✓ trpgmode = 1"', async () => {
    await host.locator('[data-m="collapse"]').click().catch(() => {});
    await host.locator('.ldc-search input').fill('trpgmode');
    await page.waitForTimeout(200);
    const sel = host.locator('.ldc-ctl.is-select[data-key="trpgmode"] select');
    await sel.selectOption('1');
    await page.waitForFunction('window.__CHAT_METADATA.variables?.trpgmode === 1', null, { timeout: 5000 });
    const pulse = await host.locator('.ldc-pulse').textContent();
    assert.match(pulse, /✓\s*trpgmode = 1/, 'pulse: ' + pulse);
    await host.locator('.ldc-search input').fill('');
});

await test('scrub snapshot: commit setting menghapus kunci basi dari chat[i].variables', async () => {
    await page.evaluate(`(() => {
        window.__CTX.chat.push({ mes: 'snapshot basi', variables: [{ trpgmode: 0, foreign: 'keep' }] });
    })()`);
    await host.locator('.ldc-search input').fill('trpgmode');
    await page.waitForTimeout(200);
    await host.locator('.ldc-ctl.is-select[data-key="trpgmode"] select').selectOption('2');
    await page.waitForFunction('window.__CHAT_METADATA.variables?.trpgmode === 2', null, { timeout: 5000 });
    const snap = await page.evaluate('window.__CTX.chat[window.__CTX.chat.length - 1].variables[0]');
    assert.ok(!('trpgmode' in snap), 'trpgmode basi dihapus dari snapshot: ' + JSON.stringify(snap));
    assert.equal(snap.foreign, 'keep', 'kunci asing dipertahankan');
    await host.locator('.ldc-search input').fill('');
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
