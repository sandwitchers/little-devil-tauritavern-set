// Playwright interaction test for Little Devil Companion dashboard (v1.2.3).
// Proves the lock-position fix + captures visual screenshots.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8123/scripts/ui_test_harness.html';
const SHOTS = '/home/z/my-project/scripts/ui_shots';
import { mkdirSync } from 'fs';
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(name, cond, extra = '') {
    const ok = !!cond;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
    if (!ok) failures++;
}

const browser = await chromium.launch();
try {
    // ---------- mobile viewport (primary use case) ----------
    const page = await browser.newPage({ viewport: { width: 412, height: 850 } });
    await page.goto(BASE);
    await page.waitForFunction(() => window.harness?.fab(), null, { timeout: 8000 });
    await page.waitForTimeout(300);

    // basic render
    const counts = await page.evaluate(() => ({
        fabBtns: window.harness.shadow.querySelectorAll('.ldc-fab-btn').length,
        fabSvgs: window.harness.fab().querySelectorAll('svg').length,
        panelHidden: window.harness.panel().hidden,
        lockHidden: window.harness.lockBadge().hidden,
        catCount: window.harness.shadow.querySelectorAll('.ldc-cat').length,
        ctlCount: window.harness.shadow.querySelectorAll('.ldc-ctl').length,
        emojiInPanel: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(window.harness.shadow.querySelector('.ldc-head').innerHTML),
    }));
    check('FAB has 2 buttons', counts.fabBtns === 2);
    check('FAB renders SVG icons (dice+devil+lockbadge+warnbadge)', counts.fabSvgs === 4, String(counts.fabSvgs));
    check('panel starts hidden', counts.panelHidden === true);
    check('lock badge hidden initially', counts.lockHidden === true);
    check('categories rendered', counts.catCount > 5, String(counts.catCount) + ' cats / ' + counts.ctlCount + ' controls');
    check('no emoji glyphs in header (SVG replaced)', counts.emojiInPanel === false);

    await page.screenshot({ path: SHOTS + '/01_mobile_fab.png' });

    // ---------- TEST A: tap devil while LOCKED must open the panel ----------
    await page.evaluate(() => {
        window.harness.api.setPrefs({ locked: true });
        const btn = window.harness.fabBtn('panel');
        const r = btn.getBoundingClientRect();
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: r.x + 10, clientY: r.y + 10, button: 0 }));
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: r.x + 10, clientY: r.y + 10, button: 0 }));
    });
    await page.waitForTimeout(150);
    let st = await page.evaluate(() => ({
        hidden: window.harness.panel().hidden,
        lockVisible: !window.harness.lockBadge().hidden,
        lockText: window.harness.shadow.querySelector('[data-m="lock"]')?.textContent.trim(),
    }));
    check('LOCKED tap on devil opens panel (THE BUG)', st.hidden === false);
    check('lock badge visible when locked', st.lockVisible === true);
    check('menu lock chip shows ON state', (st.lockText || '').includes('Kunci posisi') || (st.lockText || '').includes('Lock button'));
    await page.screenshot({ path: SHOTS + '/02_mobile_panel_locked_open.png' });

    // ---------- TEST B: drag attempt while LOCKED → no move, no accidental action, shake ----------
    const before = await page.evaluate(() => ({
        right: window.harness.fab().style.right,
        bottom: window.harness.fab().style.bottom,
        rolls: window.harness.state.rollCount,
        panelHidden: window.harness.panel().hidden,
    }));
    await page.evaluate(() => {
        const fab = window.harness.fab();
        const r = fab.getBoundingClientRect();
        fab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, clientX: r.x + 20, clientY: r.y + 20, button: 0 }));
        for (let i = 1; i <= 6; i++) {
            fab.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 8, clientX: r.x + 20 - i * 20, clientY: r.y + 20 - i * 6, button: 0 }));
        }
        fab.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8, clientX: r.x - 100, clientY: r.y - 16, button: 0 }));
    });
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({
        right: window.harness.fab().style.right,
        bottom: window.harness.fab().style.bottom,
        rolls: window.harness.state.rollCount,
        panelHidden: window.harness.panel().hidden,
        nope: window.harness.fab().classList.contains('ldc-nope'),
    }));
    check('LOCKED drag does not reposition fab', after.right === before.right && after.bottom === before.bottom);
    check('LOCKED drag does not fire accidental action', after.rolls === before.rolls && after.panelHidden === before.panelHidden);
    check('LOCKED drag triggers nope shake', after.nope === true);
    check('position not persisted while locked', await page.evaluate(() => window.harness.prefs.pos === null));

    // ---------- TEST C: unlock via menu → tap still works ----------
    await page.evaluate(() => {
        window.harness.shadow.querySelector('[data-act="menu"]').click();
    });
    await page.waitForTimeout(80);
    await page.evaluate(() => window.harness.shadow.querySelector('[data-m="lock"]').click());
    await page.waitForTimeout(80);
    st = await page.evaluate(() => ({
        locked: window.harness.prefs.locked,
        lockHidden: window.harness.lockBadge().hidden,
        toasts: window.harness.state.toasts.length,
    }));
    check('menu unlocks position', st.locked === false);
    check('lock badge hides after unlock', st.lockHidden === true);
    check('lock toast fired', st.toasts >= 1, 'toasts=' + st.toasts);

    // ---------- TEST D: unlocked drag repositions + persists ----------
    await page.evaluate(() => {
        const fab = window.harness.fab();
        const r = fab.getBoundingClientRect();
        fab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, clientX: r.x + 19, clientY: r.y + 19, button: 0 }));
        fab.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 9, clientX: 60, clientY: 700, button: 0 }));
        fab.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, clientX: 60, clientY: 700, button: 0 }));
    });
    await page.waitForTimeout(120);
    st = await page.evaluate(() => ({ pos: window.harness.prefs.pos, right: window.harness.fab().style.right }));
    check('unlocked drag persists new position', st.pos && typeof st.pos.r === 'number', JSON.stringify(st.pos));

    // reset position via menu
    await page.evaluate(() => { window.harness.shadow.querySelector('[data-act="menu"]').click(); });
    await page.waitForTimeout(60);
    await page.evaluate(() => window.harness.shadow.querySelector('[data-m="posreset"]').click());
    await page.waitForTimeout(60);
    st = await page.evaluate(() => ({ pos: window.harness.prefs.pos, right: window.harness.fab().style.right }));
    check('menu reset-position clears pos + inline style', st.pos === null && st.right === '');

    // ---------- TEST E: dice tap (unlocked) ----------
    const rollsBefore = await page.evaluate(() => window.harness.state.rollCount);
    await page.evaluate(() => {
        const btn = window.harness.fabBtn('dice');
        const r = btn.getBoundingClientRect();
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 10, clientX: r.x + 8, clientY: r.y + 8, button: 0 }));
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 10, clientX: r.x + 8, clientY: r.y + 8, button: 0 }));
    });
    await page.waitForTimeout(80);
    const rollsAfter = await page.evaluate(() => window.harness.state.rollCount);
    check('unlocked tap on dice rolls', rollsAfter === rollsBefore + 1);

    // ---------- TEST F: menu / theme / lang / search visuals ----------
    // NOTE: full-viewport screenshots in headless Chromium can serve STALE
    // compositor tiles for fixed+backdrop-filter layers (proven via fresh-raster
    // clip comparison), so theme verification uses clipped shots (fresh raster).
    await page.evaluate(() => {
        window.harness.shadow.querySelector('[data-act="theme"]').click();
        window.harness.shadow.querySelector('[data-act="theme"]').click(); // auto→dark→light
    });
    await page.waitForTimeout(400);
    const themeState = await page.evaluate(() => {
        const head = window.harness.shadow.querySelector('.ldc-head');
        const r = head.getBoundingClientRect();
        return {
            clip: { x: r.x, y: r.y, width: r.width, height: r.height },
            theme: window.harness.prefs.theme,
            attr: window.harness.shadow.querySelector('.ldc-root').getAttribute('data-theme'),
            bg: getComputedStyle(window.harness.shadow.querySelector('.ldc-panel')).backgroundColor,
        };
    });
    check('theme switched to light (state)', themeState.theme === 'light' && themeState.attr === 'light');
    check('light bg computed (not dark token)', themeState.bg.includes('252, 250, 251'));
    await page.screenshot({ path: SHOTS + '/03_mobile_panel_light.png', clip: themeState.clip });
    await page.evaluate(() => {
        window.harness.shadow.querySelector('[data-act="theme"]').click(); // back to auto
        window.harness.shadow.querySelector('[data-act="menu"]').click();
    });
    await page.waitForTimeout(200);
    // menu region clip (top of panel) — fresh raster
    const menuRect = await page.evaluate(() => {
        const r = window.harness.shadow.querySelector('.ldc-panel').getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 400) };
    });
    await page.screenshot({ path: SHOTS + '/04_mobile_menu.png', clip: menuRect });
    const menuIcons = await page.evaluate(() => window.harness.shadow.querySelectorAll('.ldc-chip svg').length);
    check('menu chips carry SVG icons (expand/collapse/lock/reset)', menuIcons >= 4, String(menuIcons));

    // search filter with results
    await page.evaluate(() => {
        const inp = window.harness.shadow.querySelector('.ldc-search input');
        inp.value = 'HELENA';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(120);
    st = await page.evaluate(() => window.harness.shadow.querySelectorAll('.ldc-ctl').length);
    check('search filter works', st > 0, st + ' controls match');
    await page.evaluate(() => {
        const inp = window.harness.shadow.querySelector('.ldc-search input');
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // ---------- desktop dark screenshot ----------
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await desk.goto(BASE);
    await desk.waitForFunction(() => window.harness?.fab(), null, { timeout: 8000 });
    await desk.evaluate(() => {
        window.harness.shadow.querySelector('[data-act="panel"]').click = null;
    });
    // open panel via pointer tap on devil button
    await desk.evaluate(() => {
        const btn = window.harness.fabBtn('panel');
        const r = btn.getBoundingClientRect();
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: r.x + 5, clientY: r.y + 5, button: 0 }));
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3, clientX: r.x + 5, clientY: r.y + 5, button: 0 }));
    });
    await desk.waitForTimeout(250);
    await desk.screenshot({ path: SHOTS + '/05_desktop_panel_dark.png' });

    // close via head button
    await desk.evaluate(() => window.harness.shadow.querySelector('[data-act="close"]').click());
    await desk.waitForTimeout(100);
    st = await desk.evaluate(() => window.harness.panel().hidden);
    check('close button hides panel', st === true);

    // keyboard activation (click detail 0)
    await desk.evaluate(() => {
        const btn = window.harness.fabBtn('panel');
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    });
    await desk.waitForTimeout(80);
    st = await desk.evaluate(() => window.harness.panel().hidden);
    check('keyboard click (detail 0) opens panel', st === false);

    await desk.close();
    await page.close();
} finally {
    await browser.close();
}

console.log(failures === 0 ? '\nALL UI TESTS PASSED ✓' : `\n${failures} TEST(S) FAILED ✗`);
process.exit(failures === 0 ? 0 : 1);
