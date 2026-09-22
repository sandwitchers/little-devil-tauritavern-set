// Little Devil Companion — ui.js
// Premium-minimalist floating dashboard (Shadow DOM). Pure DOM builder with
// dependency injection — no host-app imports, fully testable.
// Ported from ui/floating-dashboard.html (Tavo) — Planet tab removed per user,
// auto-save replaces the explicit Save button (fewer taps on mobile).
//
// v1.2.3 UX fixes:
//  - LOCK BUG: pointer state machine no longer bails on pointerdown when the
//    position lock is on. Taps always reach the dice / panel actions; only the
//    *drag* is suppressed. (Previously the lock killed both FAB buttons.)
//  - All glyphs (😈 ◐ ⋯ ▶) replaced with a consistent stroked SVG icon set.
//  - Smaller FAB footprint (38px) with a lock badge + "nope" shake feedback.
//  - Menu gained "Reset button position"; keyboard activation supported.
import { CATEGORIES } from './data_schema.js';
import { PANEL_CSS } from './styles.js';

const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ---- premium icon set -------------------------------------------------------
// 24px grid, stroke 1.8, round caps — tuned to stay crisp at 12–20px.
const I = (inner, sw = 1.8) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const SVG = {
    dice: I('<rect x="3" y="3" width="18" height="18" rx="4.5"/><circle cx="8.4" cy="8.4" r="1.35" fill="currentColor" stroke="none"/><circle cx="15.6" cy="8.4" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="8.4" cy="15.6" r="1.35" fill="currentColor" stroke="none"/><circle cx="15.6" cy="15.6" r="1.35" fill="currentColor" stroke="none"/>'),
    devil: I('<path d="M6.8 9.2L3.6 2.4l7 3.8z" fill="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M17.2 9.2l3.2-6.8-7 3.8z" fill="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 21.6c-4.3 0-7.2-2.8-7.2-6.8 0-3.7 2.9-6.5 7.2-6.5s7.2 2.8 7.2 6.5c0 4-2.9 6.8-7.2 6.8z"/><path d="M9.3 12.5h.01M14.7 12.5h.01" stroke-width="2.6"/><path d="M9.7 16.3c1.4.9 3.2.9 4.6 0"/>'),
    close: I('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 2),
    dots: I('<circle cx="5.2" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.8" cy="12" r="1.7" fill="currentColor" stroke="none"/>'),
    chev: I('<path d="M9.2 6l6.2 6-6.2 6"/>', 2),
    search: I('<circle cx="11" cy="11" r="6.3"/><path d="M19.6 19.6L16 16"/>', 2),
    globe: I('<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/><path d="M12 3.6c2.6 2.3 3.9 5.1 3.9 8.4s-1.3 6.1-3.9 8.4c-2.6-2.3-3.9-5.1-3.9-8.4s1.3-6.1 3.9-8.4z"/>'),
    lock: I('<rect x="5.8" y="10.6" width="12.4" height="9.4" rx="2.6"/><path d="M8.6 10.6V8.2a3.4 3.4 0 0 1 6.8 0v2.4"/>'),
    check: I('<path d="M4.5 12.6l5 5L19.5 6.8"/>', 2.6),
    reset: I('<path d="M3.8 8.2A8.6 8.6 0 1 1 3.4 13"/><path d="M3.4 4.5v4h4"/>'),
    expand: I('<path d="M4.5 9.2V4.5h4.7M19.5 9.2V4.5h-4.7M4.5 14.8v4.7h4.7M19.5 14.8v4.7h-4.7"/>', 2),
    collapse: I('<path d="M9.2 4.5v4.7H4.5M14.8 4.5v4.7h4.7M9.2 19.5v-4.7H4.5M14.8 19.5v-4.7h4.7"/>', 2),
    theme_auto: I('<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/>'),
    theme_dark: I('<path d="M20.6 13.4A8.6 8.6 0 1 1 10.6 3.4a6.8 6.8 0 0 0 10 10z"/>'),
    theme_light: I('<circle cx="12" cy="12" r="4.1"/><path d="M12 2.6v2.1M12 19.3v2.1M4.7 4.7l1.5 1.5M17.8 17.8l1.5 1.5M2.6 12h2.1M19.3 12h2.1M4.7 19.3l1.5-1.5M17.8 6.2l1.5-1.5"/>'),
};

const themeIcon = t => t === 'dark' ? SVG.theme_dark : t === 'light' ? SVG.theme_light : SVG.theme_auto;

export function buildDashboard(host, api) {
    const root = document.createElement('div');
    root.className = 'ldc-root';
    root.setAttribute('data-theme', api.prefs.theme || 'auto');

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);
    shadow.appendChild(root);

    root.innerHTML = `
      <div class="ldc-fab" part="fab">
        <button class="ldc-fab-btn" data-act="dice" title="" aria-label=""></button>
        <button class="ldc-fab-btn ldc-devil" data-act="panel" title="" aria-label="">
          <span class="ldc-fab-lock" hidden>${SVG.lock}</span>
        </button>
      </div>
      <section class="ldc-panel" hidden>
        <header class="ldc-head">
          <span class="ldc-logo">${SVG.devil}</span>
          <div class="ldc-titles">
            <h2></h2>
            <p class="ldc-sub"><span class="ldc-subtext"></span> <span class="ldc-pulse"></span></p>
          </div>
          <div class="ldc-head-btns">
            <button class="ldc-icon-btn ldc-lang" data-act="lang">${SVG.globe}<span class="ldc-lang-code"></span></button>
            <button class="ldc-icon-btn" data-act="theme"></button>
            <button class="ldc-icon-btn" data-act="menu">${SVG.dots}</button>
            <button class="ldc-icon-btn" data-act="close">${SVG.close}</button>
          </div>
        </header>
        <div class="ldc-search">
          <span class="ldc-search-ic">${SVG.search}</span>
          <input type="text" enterkeyhint="search">
        </div>
        <div class="ldc-menu" hidden></div>
        <div class="ldc-body"></div>
      </section>`;

    const $ = sel => shadow.querySelector(sel);
    $('.ldc-fab-btn').insertAdjacentHTML('afterbegin', SVG.dice);
    $('.ldc-devil').insertAdjacentHTML('afterbegin', SVG.devil);
    const fab = $('.ldc-fab');
    const panel = $('.ldc-panel');
    const searchInput = $('.ldc-search input');
    const menuEl = $('.ldc-menu');
    const bodyEl = $('.ldc-body');
    const subtext = $('.ldc-subtext');
    const pulse = $('.ldc-pulse');

    let pulseTimer = null;
    const textTimers = new Map();
    let openCats = new Set();
    let firstOpen = true;

    const T = (k, p) => api.t(k, p);

    function labelOf(key) { return T('var.' + key); }

    // ---- value helpers -----------------------------------------------------
    function typedCommit(ctl, rawValue) {
        let v = rawValue;
        if (ctl.type === 'switch') v = rawValue ? 1 : 0;
        else if (ctl.type === 'select' && ctl.options && typeof ctl.options[0].value === 'number') {
            v = Number(rawValue);
        }
        return api.setValue(ctl.name, v);
    }
    function valuesEqual(ctl, a, b) {
        if (ctl.type === 'switch') return Number(a ? 1 : 0) === Number(b ? 1 : 0);
        return String(a ?? '') === String(b ?? '');
    }

    // ---- rendering ----------------------------------------------------------
    function controlHtml(ctl) {
        const value = api.getValue(ctl.name);
        if (ctl.type === 'switch') {
            const on = Number(value) === 1;
            return `<label class="ldc-ctl is-switch" data-key="${esc(ctl.name)}">
              <span class="ldc-ctl-label" data-label="${esc(ctl.name)}">${hl(labelOf(ctl.name))}</span>
              <span class="ldc-switch"><input type="checkbox" ${on ? 'checked' : ''}><i></i></span>
            </label>`;
        }
        if (ctl.type === 'select') {
            const opts = (ctl.options || []).map(o =>
                `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(T(o.labelKey))}</option>`).join('');
            return `<div class="ldc-ctl is-select" data-key="${esc(ctl.name)}">
              <span class="ldc-ctl-label" data-label="${esc(ctl.name)}">${hl(labelOf(ctl.name))}</span>
              <select class="ldc-select">${opts}</select>
            </div>`;
        }
        const isNote = ctl.type === 'note';
        const val = esc(String(value ?? ''));
        const field = isNote
            ? `<textarea class="ldc-input" rows="3">${val}</textarea>`
            : `<input class="ldc-input" type="text" value="${val}">`;
        return `<div class="ldc-ctl ${isNote ? 'is-note' : 'is-text'}" data-key="${esc(ctl.name)}">
          <span class="ldc-ctl-label" data-label="${esc(ctl.name)}">${hl(labelOf(ctl.name))}</span>
          ${field}
        </div>`;
    }

    function hl(text) {
        const q = (searchInput.value || '').trim().toLowerCase();
        const raw = esc(text);
        if (!q) return raw;
        const i = String(text).toLowerCase().indexOf(q);
        if (i < 0) return raw;
        const pre = esc(String(text).slice(0, i));
        const mid = esc(String(text).slice(i, i + q.length));
        const post = esc(String(text).slice(i + q.length));
        return pre + '<mark>' + mid + '</mark>' + post;
    }

    function renderBody() {
        const q = (searchInput.value || '').trim().toLowerCase();
        let shown = 0;
        bodyEl.innerHTML = CATEGORIES.map((cat, ci) => {
            const controls = cat.controls.filter(c => {
                if (!q) return true;
                return labelOf(c.name).toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
            });
            if (!controls.length) return '';
            shown += controls.length;
            const open = q ? true : (firstOpen ? ci === 0 : openCats.has(cat.key));
            const badge = q ? 0 : controls.filter(c => !valuesEqual(c, api.getValue(c.name), c.type === 'switch' ? 0 : (api.defaults[c.name] ?? ''))).length;
            return `<details class="ldc-cat" data-cat="${esc(cat.key)}" ${open ? 'open' : ''}>
              <summary>
                <span class="ldc-dot" style="--c:${esc(cat.color)}"></span>
                <span class="ldc-cat-name">${esc(T(cat.nameKey))}</span>
                <span class="ldc-cat-badge" ${badge ? '' : 'hidden'}>${badge}</span>
                <span class="ldc-chev">${SVG.chev}</span>
              </summary>
              <div class="ldc-controls">${controls.map(controlHtml).join('')}</div>
            </details>`;
        }).join('');
        $('.ldc-empty')?.remove();
        if (!shown) {
            const div = document.createElement('div');
            div.className = 'ldc-empty';
            div.textContent = T('tt.dashboard.noResults');
            bodyEl.appendChild(div);
        }
        wireBody();
        updateSubtitle();
    }

    function wireBody() {
        bodyEl.querySelectorAll('.ldc-cat > summary').forEach(sum => {
            sum.addEventListener('click', () => {
                const det = sum.parentElement;
                const key = det.getAttribute('data-cat');
                requestAnimationFrame(() => {
                    if (det.open) openCats.add(key); else openCats.delete(key);
                    if (!searchInput.value.trim()) updateSubtitle();
                });
            });
        });
        // switches
        bodyEl.querySelectorAll('.is-switch input').forEach(inp => {
            inp.addEventListener('change', () => {
                const key = inp.closest('.ldc-ctl').getAttribute('data-key');
                commitKey(key, inp.checked);
            });
        });
        // selects
        bodyEl.querySelectorAll('.is-select select').forEach(sel => {
            sel.addEventListener('change', () => {
                const key = sel.closest('.ldc-ctl').getAttribute('data-key');
                commitKey(key, sel.value);
            });
        });
        // text inputs / textareas — debounced commit
        bodyEl.querySelectorAll('.is-text .ldc-input, .is-note .ldc-input').forEach(inp => {
            const key = inp.closest('.ldc-ctl').getAttribute('data-key');
            inp.addEventListener('input', () => {
                clearTimeout(textTimers.get(key));
                textTimers.set(key, setTimeout(() => commitKey(key, inp.value), 700));
            });
        });
    }

    function findCtl(key) {
        for (const c of CATEGORIES) {
            const hit = c.controls.find(x => x.name === key);
            if (hit) return hit;
        }
        return null;
    }

    async function commitKey(key, raw) {
        const ctl = findCtl(key);
        if (!ctl) return;
        await typedCommit(ctl, raw);
        savedPulse();
        updateBadges();
    }

    function updateBadges() {
        bodyEl.querySelectorAll('.ldc-cat').forEach(det => {
            const cat = CATEGORIES.find(c => c.key === det.getAttribute('data-cat'));
            if (!cat) return;
            const badge = det.querySelector('.ldc-cat-badge');
            const n = cat.controls.filter(c => !valuesEqual(c, api.getValue(c.name), c.type === 'switch' ? 0 : (api.defaults[c.name] ?? ''))).length;
            badge.textContent = String(n);
            badge.hidden = !n;
        });
        updateSubtitle();
    }

    function updateSubtitle() {
        const q = (searchInput.value || '').trim();
        if (q) {
            const n = bodyEl.querySelectorAll('.ldc-ctl').length;
            subtext.textContent = `${n} ${T('runtime.dashboard.variables')}`;
        } else {
            const changed = CATEGORIES.reduce((sum, cat) => sum + cat.controls.filter(c =>
                !valuesEqual(c, api.getValue(c.name), c.type === 'switch' ? 0 : (api.defaults[c.name] ?? ''))).length, 0);
            subtext.textContent = `${T('runtime.dashboard.subtitle')} · ${changed} ${T('tt.dashboard.changes')}`;
        }
    }

    function savedPulse() {
        pulse.textContent = '✓ ' + T('tt.dashboard.savedPulse');
        pulse.classList.add('on');
        clearTimeout(pulseTimer);
        pulseTimer = setTimeout(() => pulse.classList.remove('on'), 1400);
    }

    // ---- header / menu -------------------------------------------------------
    function refreshChrome() {
        root.setAttribute('data-theme', api.prefs.theme || 'auto');
        $('.ldc-lang-code').textContent = langLabel();
        $('[data-act="theme"]').innerHTML = themeIcon(api.prefs.theme || 'auto');
        $('[data-act="theme"]').title = T('ui.menu.theme');
        $('[data-act="menu"]').title = T('ui.menu.title') || '⋯';
        $('[data-act="close"]').title = T('tt.dashboard.close') || '✕';

        const diceBtn = fab.querySelector('[data-act="dice"]');
        const devilBtn = fab.querySelector('[data-act="panel"]');
        diceBtn.title = T('tt.dashboard.roll');
        diceBtn.setAttribute('aria-label', T('tt.dashboard.roll'));
        devilBtn.title = T('tt.dashboard.open');
        devilBtn.setAttribute('aria-label', T('tt.dashboard.open'));

        // lock badge mirrors the position-lock state
        const locked = !!api.prefs.locked;
        const lockBadge = fab.querySelector('.ldc-fab-lock');
        if (lockBadge) lockBadge.hidden = !locked;

        searchInput.placeholder = T('runtime.dashboard.searchPlaceholder');
        panel.querySelector('h2').textContent = T('runtime.dashboard.title');
        renderMenu();
        updateSubtitle();
    }

    function langLabel() {
        return (api.prefs.lang || 'auto').toUpperCase(); // AUTO / ID / EN
    }

    function renderMenu() {
        const locked = !!api.prefs.locked;
        menuEl.innerHTML = `
          <button class="ldc-chip" data-m="expand">${SVG.expand}${T('runtime.dashboard.expandAll')}</button>
          <button class="ldc-chip" data-m="collapse">${SVG.collapse}${T('runtime.dashboard.collapseAll')}</button>
          <button class="ldc-chip ${locked ? 'is-on' : ''}" data-m="lock">${locked ? SVG.check : SVG.lock}${T('ui.menu.lockPosition')}</button>
          <button class="ldc-chip" data-m="posreset">${SVG.reset}${T('ui.menu.resetPosition')}</button>
          <button class="ldc-chip" data-m="saveg">${T('tt.menu.saveGlobal')}</button>
          <button class="ldc-chip" data-m="applyg">${T('tt.menu.applyGlobal')}</button>
          <button class="ldc-chip danger" data-m="reset">${T('runtime.dashboard.resetAll')}</button>`;
    }

    menuEl.addEventListener('click', async e => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        const m = b.getAttribute('data-m');
        if (m === 'expand') { bodyEl.querySelectorAll('.ldc-cat').forEach(d => d.open = true); openCats = new Set(CATEGORIES.map(c => c.key)); }
        else if (m === 'collapse') { bodyEl.querySelectorAll('.ldc-cat').forEach(d => d.open = false); openCats.clear(); }
        else if (m === 'lock') {
            const next = !api.prefs.locked;
            api.setPrefs({ locked: next });
            refreshChrome();
            api.notify?.(T(next ? 'runtime.toast.lockOn' : 'runtime.toast.lockOff'));
        }
        else if (m === 'posreset') {
            api.setPrefs({ pos: null });
            fab.style.right = '';
            fab.style.bottom = '';
            api.notify?.(T('runtime.toast.positionReset'));
        }
        else if (m === 'saveg') { await api.actions.saveGlobal(); savedPulse(); }
        else if (m === 'applyg') {
            if (window.confirm(T('tt.confirm.applyGlobal'))) { await api.actions.applyGlobal(); firstOpen = true; openCats.clear(); renderBody(); savedPulse(); }
        }
        else if (m === 'reset') {
            if (window.confirm(T('tt.confirm.reset'))) { await api.actions.resetChat(); firstOpen = true; openCats.clear(); renderBody(); savedPulse(); }
        }
    });

    panel.querySelector('.ldc-head-btns').addEventListener('click', async e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.getAttribute('data-act');
        if (act === 'close') closePanel();
        else if (act === 'theme') {
            const order = ['auto', 'dark', 'light'];
            const next = order[(order.indexOf(api.prefs.theme || 'auto') + 1) % order.length];
            api.setPrefs({ theme: next });
            refreshChrome();
        } else if (act === 'lang') {
            const order = ['auto', 'id', 'en'];
            const next = order[(order.indexOf(api.prefs.lang || 'auto') + 1) % order.length];
            api.setPrefs({ lang: next });
            refreshChrome();
            renderBody();
        } else if (act === 'menu') {
            menuEl.hidden = !menuEl.hidden;
        }
    });

    searchInput.addEventListener('input', () => renderBody());

    // ---- open / close ---------------------------------------------------------
    function openPanel() {
        panel.hidden = false;
        refreshChrome();
        if (firstOpen) { renderBody(); firstOpen = false; }
        else { updateBadges(); }
        setTimeout(() => { try { searchInput.blur(); } catch { /* noop */ } }, 0);
    }
    function closePanel() {
        panel.hidden = true;
        menuEl.hidden = true;
    }
    function togglePanel() { panel.hidden ? openPanel() : closePanel(); }

    document.addEventListener('pointerdown', e => {
        if (panel.hidden) return;
        if (e.composedPath().includes(host)) return;
        closePanel();
    }, true);

    // ---- fab actions + drag -----------------------------------------------------
    // Pointer capture is set immediately on pointerdown so fast flicks keep
    // delivering events after the pointer leaves the fab. Tap-vs-drag is decided
    // by an 8px threshold; the pressed button is tracked in state (e.target is
    // retargeted to the capture element once captured).
    //
    // v1.2.3 FIX: the position lock must NOT swallow taps. The state machine now
    // always tracks the gesture; the lock only suppresses repositioning (and, if
    // the user actually dragged, the release is treated as a cancelled gesture —
    // with a small "nope" shake — instead of an accidental dice roll).
    let dragState = null;

    fab.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button !== 0) return;
        const btn = e.target.closest('.ldc-fab-btn');
        dragState = {
            btn,
            startX: e.clientX,
            startY: e.clientY,
            pointerId: e.pointerId,
            moved: false,
        };
        try { fab.setPointerCapture(e.pointerId); } catch { /* noop */ }
    });

    fab.addEventListener('pointermove', e => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (!dragState.moved && Math.hypot(dx, dy) < 8) return;
        dragState.moved = true;
        if (api.prefs.locked) return; // locked → keep tracking, never reposition
        const rect = fab.getBoundingClientRect();
        let right = window.innerWidth - e.clientX - (rect.width / 2);
        let bottom = window.innerHeight - e.clientY - (rect.height / 2);
        right = Math.min(Math.max(right, 2), window.innerWidth - rect.width - 2);
        bottom = Math.min(Math.max(bottom, 2), window.innerHeight - rect.height - 2);
        fab.style.right = right + 'px';
        fab.style.bottom = bottom + 'px';
    });

    fab.addEventListener('pointerup', e => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const st = dragState;
        dragState = null;
        if (st.moved) {
            if (api.prefs.locked) { nopeShake(); return; } // dragged while locked → cancelled
            const rect = fab.getBoundingClientRect();
            api.setPrefs({ pos: { r: Math.round(window.innerWidth - rect.right), b: Math.round(window.innerHeight - rect.bottom) } });
            return;
        }
        fireAction(st.btn);
    });
    fab.addEventListener('pointercancel', e => {
        if (dragState && e.pointerId === dragState.pointerId) dragState = null;
    });

    // Keyboard activation (Enter/Space on a focused FAB button fires a click
    // with detail === 0; pointer-generated clicks are handled by pointerup).
    fab.addEventListener('click', e => {
        if (e.detail !== 0) return;
        fireAction(e.target.closest('.ldc-fab-btn'));
    });

    function fireAction(btn) {
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        if (act === 'dice') api.actions.rollDice();
        else if (act === 'panel') togglePanel();
    }

    function nopeShake() {
        fab.classList.remove('ldc-nope');
        void fab.offsetWidth; // restart animation
        fab.classList.add('ldc-nope');
    }
    fab.addEventListener('animationend', () => fab.classList.remove('ldc-nope'));

    // restore fab position
    if (api.prefs.pos && typeof api.prefs.pos.r === 'number') {
        fab.style.right = Math.max(2, api.prefs.pos.r) + 'px';
        fab.style.bottom = Math.max(2, api.prefs.pos.b) + 'px';
    }

    refreshChrome();
    renderBody();

    return {
        refresh() { if (!panel.hidden) { updateBadges(); } },
        rerender() { refreshChrome(); renderBody(); },
        close: closePanel,
    };
}
