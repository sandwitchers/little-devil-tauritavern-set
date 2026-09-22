// Playwright UI test for the Little Devil Companion dashboard.
// Run: node scripts/test_ui.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = '/home/z/my-project/scripts/ui_harness';
const SHOTS = '/home/z/my-project/analysis/ui_shots';
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const file = join(ROOT, p);
    if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
});
await new Promise(r => server.listen(4173, r));

const browser = await chromium.launch();
const results = [];
const test = async (name, fn) => {
    process.stdout.write('  … ' + name + '\n');
    try { await fn(); results.push(['✓', name]); console.log('  ✓', name); }
    catch (e) { results.push(['✗', name]); console.error('  ✗', name, '\n    ', e.message?.split('\n')[0]); }
};

// ---- Desktop context ----
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('pageerror', e => console.error('  [pageerror]', e.message));
await page.goto('http://localhost:4173/');

await test('module boot', async () => {
    await page.waitForFunction('window.__LDC_READY === true', null, { timeout: 8000 });
});

const shadow = page.locator('#littleDevilCompanionHost');

await test('fab cluster visible with 2 buttons', async () => {
    const btns = shadow.locator('.ldc-fab-btn');
    await btns.first().waitFor({ timeout: 5000 });
    assert.equal(await btns.count(), 2);
});

await test('panel opens with 13 categories and 105 controls', async () => {
    await shadow.locator('[data-act="panel"]').click();
    await shadow.locator('.ldc-panel:not([hidden])').waitFor({ timeout: 3000 });
    assert.equal(await shadow.locator('.ldc-cat').count(), 13);
    assert.equal(await shadow.locator('.ldc-ctl').count(), 105);
});

await test('first category open by default, others closed', async () => {
    assert.equal(await shadow.locator('.ldc-cat[open]').count(), 1);
});

await test('switch toggle → typed save (0 → 1)', async () => {
    const ctl = shadow.locator('.ldc-ctl[data-key="helenabreak"]');
    await ctl.scrollIntoViewIfNeeded();
    await ctl.locator('.ldc-ctl-label').click(); // tap the row label (real user path)
    await page.waitForFunction(`window.__LDC_STATE.saved.some(s => s[0]==='helenabreak' && s[1]===1)`, null, { timeout: 5000 });
});

await test('switch toggle back (1 → 0)', async () => {
    const ctl = shadow.locator('.ldc-ctl[data-key="helenabreak"]');
    await ctl.locator('.ldc-ctl-label').click();
    await page.waitForFunction(`window.__LDC_STATE.saved.some(s => s[0]==='helenabreak' && s[1]===0)`, null, { timeout: 5000 });
});

await test('select change → typed numeric save', async () => {
    await shadow.locator('.ldc-cat[data-cat="cat-1"] > summary').click(); // open TRPG section
    const ctl = shadow.locator('.ldc-ctl[data-key="trpgmode"]');
    await ctl.scrollIntoViewIfNeeded();
    await ctl.locator('select').selectOption('2');
    await page.waitForFunction(`window.__LDC_STATE.saved.some(s => s[0]==='trpgmode' && s[1]===2)`, null, { timeout: 5000 });
    assert.equal(await page.evaluate(`typeof window.__LDC_STORE.trpgmode`), 'number');
});

await test('string select stays string', async () => {
    await shadow.locator('.ldc-cat[data-cat="cat-11"] > summary').click(); // open adult section
    const ctl = shadow.locator('.ldc-ctl[data-key="speech_variance"]');
    await ctl.scrollIntoViewIfNeeded();
    await ctl.locator('select').selectOption('Expressive');
    await page.waitForFunction(`window.__LDC_STATE.saved.some(s => s[0]==='speech_variance' && s[1]==='Expressive')`, null, { timeout: 5000 });
});

await test('text input → debounced commit ~700ms', async () => {
    await shadow.locator('.ldc-cat[data-cat="cat-3"] > summary').click(); // open style section
    const ctl = shadow.locator('.ldc-ctl[data-key="keywords"]');
    await ctl.scrollIntoViewIfNeeded();
    await ctl.locator('input.ldc-input').fill('nyaring, gelap, hujan');
    await page.waitForFunction(`window.__LDC_STATE.saved.some(s => s[0]==='keywords' && s[1]==='nyaring, gelap, hujan')`, null, { timeout: 5000 });
});

await test('search filters to matching controls only', async () => {
    await shadow.locator('.ldc-search input').fill('helena');
    await page.waitForTimeout(250);
    const n = await shadow.locator('.ldc-ctl').count();
    assert.ok(n > 0 && n < 20, 'expected filtered subset, got ' + n);
    const empty = await shadow.locator('.ldc-empty').count();
    assert.equal(empty, 0);
});

await test('search nonsense shows empty state', async () => {
    await shadow.locator('.ldc-search input').fill('zzzz-not-exist');
    await page.waitForTimeout(250);
    assert.equal(await shadow.locator('.ldc-empty').count(), 1);
    await shadow.locator('.ldc-search input').fill('');
    await page.waitForTimeout(250);
});

await test('menu: save-global & reset chips wire actions', async () => {
    await shadow.locator('[data-act="menu"]').click();
    await shadow.locator('[data-m="saveg"]').click();
    await page.waitForFunction(`window.__LDC_STATE.globalSaved === true`, null, { timeout: 3000 });
    page.once('dialog', d => d.accept());
    await shadow.locator('[data-m="reset"]').click();
    await page.waitForFunction(`window.__LDC_STORE.helenabreak === 0`, null, { timeout: 3000 });
});

await test('dice button calls roll action', async () => {
    await shadow.locator('[data-act="dice"]').click();
    await page.waitForFunction(`window.__LDC_STATE.diceRolled === 1`, null, { timeout: 3000 });
});

await test('panel closes on outside click', async () => {
    await page.mouse.click(200, 500);
    await page.waitForTimeout(200);
    const hidden = await shadow.locator('.ldc-panel').getAttribute('hidden');
    assert.ok(hidden !== null, 'panel should be hidden');
});

await test('fab drag persists new position', async () => {
    const fab = shadow.locator('.ldc-fab');
    const box = await fab.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(300, 300, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(`window.__LDC_STATE.prefs && typeof window.__LDC_STATE.prefs.pos?.b === 'number'`, null, { timeout: 3000 });
    const b = await page.evaluate(`window.__LDC_STATE.prefs.pos.b`);
    assert.ok(b > 100, 'bottom offset should have moved, got ' + b);
});

await page.screenshot({ path: SHOTS + '/desktop_after.png' });

// ---- Mobile context (user device geometry) ----
const mob = await (await browser.newContext({
    viewport: { width: 540, height: 1237 }, deviceScaleFactor: 1.33, isMobile: true, hasTouch: true,
})).newPage();
mob.on('pageerror', e => console.error('  [m-pageerror]', e.message));
await mob.goto('http://localhost:4173/');
await mob.waitForFunction('window.__LDC_READY === true', null, { timeout: 8000 });
const mshadow = mob.locator('#littleDevilCompanionHost');

await test('mobile: panel opens fully within viewport', async () => {
    await mshadow.locator('[data-act="panel"]').click();
    await mshadow.locator('.ldc-panel:not([hidden])').waitFor({ timeout: 3000 });
    const box = await mshadow.locator('.ldc-panel').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 540 + 1, 'panel x overflow: ' + JSON.stringify(box));
    assert.ok(box.y >= 0 && box.y + box.height <= 1237 + 1, 'panel y overflow: ' + JSON.stringify(box));
});
await test('mobile: switch tap works', async () => {
    const ctl = mshadow.locator('.ldc-ctl[data-key="SFW"]');
    await ctl.scrollIntoViewIfNeeded();
    await ctl.locator('.ldc-ctl-label').click();
    await mob.waitForFunction(`window.__LDC_STATE.saved.some(s => s[0]==='SFW')`, null, { timeout: 5000 });
});
await mob.screenshot({ path: SHOTS + '/mobile_panel.png' });

console.log(`\nRESULT: ${results.filter(r => r[0] === '✓').length} passed, ${results.filter(r => r[0] === '✗').length} failed`);
await browser.close();
server.close();
process.exit(results.some(r => r[0] === '✗') ? 1 : 0);
