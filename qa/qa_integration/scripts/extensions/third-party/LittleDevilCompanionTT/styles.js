// Little Devil Companion — styles.js
// Premium-minimalist CSS injected into the Shadow Root (style isolation from
// host app CSS + TauriTavern geometry firewall). Consumes TT :root vars
// (--tt-inset-*) with env() fallbacks so safe areas work on Android/iOS.
//
// v1.2.3: tighter FAB footprint (38px), SVG icon styling, lock badge,
// "nope" shake for drag-while-locked, language chip, search icon.
export const PANEL_CSS = /* css */`
:host {
  all: initial;
  --ldc-accent: #f43f5e;
  --ldc-accent-2: #fb923c;
  --ldc-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Noto Sans SC", sans-serif;
  --ldc-radius: 18px;
  --ldc-z: 99999;
  font-family: var(--ldc-font);
  font-size: 14px;
  line-height: 1.45;
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: var(--ldc-z);
}
:host * { box-sizing: border-box; }

/* ---------- theme tokens ---------- */
.ldc-root {
  --bg: rgba(24, 22, 28, 0.92);
  --bg-soft: rgba(255, 255, 255, 0.045);
  --bg-hover: rgba(255, 255, 255, 0.09);
  --fg: #f4f2f7;
  --fg-dim: rgba(244, 242, 247, 0.62);
  --fg-faint: rgba(244, 242, 247, 0.38);
  --line: rgba(255, 255, 255, 0.09);
  --card: rgba(255, 255, 255, 0.03);
}
.ldc-root[data-theme="light"] {
  --bg: rgba(252, 250, 251, 0.95);
  --bg-soft: rgba(24, 22, 28, 0.045);
  --bg-hover: rgba(24, 22, 28, 0.08);
  --fg: #241d22;
  --fg-dim: rgba(36, 29, 34, 0.62);
  --fg-faint: rgba(36, 29, 34, 0.4);
  --line: rgba(36, 29, 34, 0.1);
  --card: rgba(255, 255, 255, 0.6);
}
@media (prefers-color-scheme: light) {
  .ldc-root[data-theme="auto"] {
    --bg: rgba(252, 250, 251, 0.95);
    --bg-soft: rgba(24, 22, 28, 0.045);
    --bg-hover: rgba(24, 22, 28, 0.08);
    --fg: #241d22;
    --fg-dim: rgba(36, 29, 34, 0.62);
    --fg-faint: rgba(36, 29, 34, 0.4);
    --line: rgba(36, 29, 34, 0.1);
    --card: rgba(255, 255, 255, 0.6);
  }
}

/* ---------- floating action cluster ---------- */
.ldc-fab {
  pointer-events: auto;
  position: fixed;
  display: flex;
  flex-direction: row;
  gap: 7px;
  right: calc(max(env(safe-area-inset-right, 0px), var(--tt-inset-right, 0px)) + 12px);
  bottom: calc(max(env(safe-area-inset-bottom, 0px), var(--tt-inset-bottom, 0px)) + 16px);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.ldc-fab.ldc-nope { animation: ldc-nope .28s ease; }
@keyframes ldc-nope {
  25% { transform: translateX(-4px); }
  55% { transform: translateX(4px); }
  80% { transform: translateX(-2px); }
}
.ldc-fab-btn {
  position: relative;
  width: 38px;
  height: 38px;
  min-height: 38px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24);
  color: var(--fg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: transform .15s ease, box-shadow .15s ease, background-color .25s ease, border-color .25s ease, color .25s ease;
}
.ldc-fab-btn:active { transform: scale(.92); }
.ldc-fab-btn > svg { width: 18px; height: 18px; display: block; }
.ldc-fab-btn.ldc-devil {
  background: linear-gradient(135deg, var(--ldc-accent), var(--ldc-accent-2));
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 16px rgba(244, 63, 94, 0.42);
}
.ldc-fab-lock {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg);
  border: 1px solid var(--line);
  color: var(--ldc-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.ldc-fab-lock svg { width: 8px; height: 8px; display: block; }
.ldc-fab-lock[hidden] { display: none; }

/* ---------- panel ---------- */
.ldc-panel {
  pointer-events: auto;
  position: fixed;
  right: calc(max(env(safe-area-inset-right, 0px), var(--tt-inset-right, 0px)) + 10px);
  bottom: calc(max(env(safe-area-inset-bottom, 0px), var(--tt-inset-bottom, 0px)) + 66px);
  width: min(430px, calc(100vw - 20px));
  max-height: min(74vh, 680px);
  max-height: min(74dvh, 680px);
  display: flex;
  flex-direction: column;
  border-radius: var(--ldc-radius);
  border: 1px solid var(--line);
  background: var(--bg);
  backdrop-filter: blur(22px) saturate(1.25);
  -webkit-backdrop-filter: blur(22px) saturate(1.25);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.4);
  color: var(--fg);
  overflow: hidden;
  transition: background-color .25s ease, border-color .25s ease, color .25s ease;
}
.ldc-panel[hidden] { display: none; }

.ldc-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--line);
}
.ldc-logo {
  width: 30px; height: 30px; min-width: 30px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--ldc-accent), var(--ldc-accent-2));
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  box-shadow: 0 4px 14px rgba(244, 63, 94, 0.4);
}
.ldc-logo svg { width: 17px; height: 17px; display: block; }
.ldc-titles { flex: 1; min-width: 0; }
.ldc-titles h2 {
  margin: 0; font-size: 15px; font-weight: 700; letter-spacing: .2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ldc-sub {
  margin: 1px 0 0; font-size: 11.5px; color: var(--fg-dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ldc-sub .ldc-pulse {
  color: #34d399; opacity: 0; transition: opacity .25s ease; font-weight: 600;
}
.ldc-sub .ldc-pulse.on { opacity: 1; }
.ldc-head-btns { display: flex; align-items: center; gap: 4px; }
.ldc-icon-btn {
  width: 30px; height: 30px; min-height: 30px;
  border-radius: 9px; border: none; background: transparent;
  color: var(--fg-dim); cursor: pointer; padding: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700;
  transition: background .15s ease, color .15s ease;
}
.ldc-icon-btn svg { width: 16px; height: 16px; display: block; }
.ldc-icon-btn:hover, .ldc-icon-btn:active { background: var(--bg-hover); color: var(--fg); }
.ldc-icon-btn.ldc-lang {
  width: auto;
  gap: 4px;
  padding: 0 8px 0 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 10px; font-weight: 700; letter-spacing: .5px;
}
.ldc-icon-btn.ldc-lang svg { width: 12px; height: 12px; }
.ldc-icon-btn.ldc-lang .ldc-lang-code { line-height: 1; }

/* ---------- search ---------- */
.ldc-search { position: relative; padding: 10px 12px 6px; }
.ldc-search-ic {
  position: absolute;
  left: 23px; top: 50%;
  transform: translateY(calc(-50% + 2px));
  color: var(--fg-faint);
  pointer-events: none;
  display: flex;
}
.ldc-search-ic svg { width: 14px; height: 14px; display: block; }
.ldc-search input {
  width: 100%;
  height: 36px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--bg-soft);
  color: var(--fg);
  padding: 0 12px 0 33px;
  font-size: 13.5px;
  font-family: inherit;
  outline: none;
}
.ldc-search input:focus { border-color: color-mix(in srgb, var(--ldc-accent) 55%, transparent); }
.ldc-search input::placeholder { color: var(--fg-faint); }
.ldc-search input, .ldc-input, .ldc-select { transition: border-color .2s ease, background-color .2s ease, color .2s ease; }

/* ---------- menu ---------- */
.ldc-menu {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 4px 12px 8px;
}
.ldc-menu[hidden] { display: none; }
.ldc-chip {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--line);
  background: var(--bg-soft);
  color: var(--fg-dim);
  font-size: 12px; font-weight: 600;
  border-radius: 999px;
  padding: 5px 11px;
  cursor: pointer;
  font-family: inherit;
  transition: background .15s ease, color .15s ease;
}
.ldc-chip svg { width: 12px; height: 12px; display: block; }
.ldc-chip:hover { background: var(--bg-hover); color: var(--fg); }
.ldc-chip.is-on {
  color: var(--fg);
  border-color: color-mix(in srgb, var(--ldc-accent) 45%, transparent);
  background: color-mix(in srgb, var(--ldc-accent) 10%, transparent);
}
.ldc-chip.is-on svg { color: var(--ldc-accent); }
.ldc-chip.danger:hover { color: var(--ldc-accent); border-color: color-mix(in srgb, var(--ldc-accent) 50%, transparent); }

/* ---------- body ---------- */
.ldc-body { overflow-y: auto; overscroll-behavior: contain; padding: 2px 6px 10px; flex: 1; }
.ldc-body::-webkit-scrollbar { width: 8px; }
.ldc-body::-webkit-scrollbar-thumb { background: var(--bg-hover); border-radius: 4px; }

.ldc-cat { border-radius: 12px; margin: 4px 4px 0; background: var(--card); border: 1px solid transparent; transition: background-color .2s ease, border-color .2s ease; }
.ldc-cat[open] { border-color: var(--line); }
.ldc-cat > summary {
  list-style: none;
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 650; font-size: 13.5px;
  color: var(--fg);
  user-select: none; -webkit-user-select: none;
}
.ldc-cat > summary::-webkit-details-marker { display: none; }
.ldc-cat > summary:hover { background: var(--bg-hover); border-radius: 12px; }
.ldc-dot {
  width: 8px; height: 8px; min-width: 8px;
  border-radius: 50%;
  background: var(--c, var(--ldc-accent));
  box-shadow: 0 0 8px color-mix(in srgb, var(--c, var(--ldc-accent)) 70%, transparent);
}
.ldc-cat-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ldc-chev { display: flex; color: var(--fg-faint); transition: transform .18s ease; }
.ldc-chev svg { width: 12px; height: 12px; display: block; }
.ldc-cat[open] .ldc-chev { transform: rotate(90deg); }
.ldc-cat-badge {
  font-size: 10.5px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, var(--ldc-accent), var(--ldc-accent-2));
  border-radius: 999px; padding: 1.5px 7px;
}
.ldc-cat-badge[hidden] { display: none; }

.ldc-controls { padding: 2px 10px 10px; display: flex; flex-direction: column; }
.ldc-ctl {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 6px;
  border-radius: 10px;
}
.ldc-ctl:hover { background: var(--bg-soft); }
.ldc-ctl + .ldc-ctl { border-top: 1px solid var(--line); }
.ldc-ctl-label { flex: 1; min-width: 0; font-size: 13px; color: var(--fg); }
.ldc-ctl.is-text, .ldc-ctl.is-note { flex-direction: column; align-items: stretch; gap: 6px; }

/* switch */
.ldc-switch { position: relative; display: inline-block; width: 40px; height: 23px; min-width: 40px; }
.ldc-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.ldc-switch i {
  position: absolute; inset: 0;
  border-radius: 999px;
  background: var(--bg-hover);
  border: 1px solid var(--line);
  transition: background .18s ease;
}
.ldc-switch i::before {
  content: "";
  position: absolute; top: 2px; left: 2px;
  width: 17px; height: 17px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.35);
  transition: transform .18s ease;
}
.ldc-switch input:checked + i {
  background: linear-gradient(135deg, var(--ldc-accent), var(--ldc-accent-2));
  border-color: transparent;
}
.ldc-switch input:checked + i::before { transform: translateX(17px); }

/* select */
.ldc-select {
  min-width: 0;
  max-width: 52%;
  height: 32px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg-soft);
  color: var(--fg);
  font-size: 12.5px;
  font-family: inherit;
  padding: 0 8px;
  outline: none;
}
.ldc-select:focus { border-color: color-mix(in srgb, var(--ldc-accent) 55%, transparent); }
.ldc-select option { background: #241d22; color: #f4f2f7; }
.ldc-root[data-theme="light"] .ldc-select option,
.ldc-root[data-theme="auto"] .ldc-select option { background: #fff; color: #241d22; }
@media (prefers-color-scheme: light) {
  .ldc-root[data-theme="auto"] .ldc-select option { background: #fff; color: #241d22; }
}

/* text / textarea */
.ldc-input {
  width: 100%;
  min-height: 34px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg-soft);
  color: var(--fg);
  font-size: 13px;
  font-family: inherit;
  padding: 7px 10px;
  outline: none;
  resize: vertical;
}
.ldc-input:focus { border-color: color-mix(in srgb, var(--ldc-accent) 55%, transparent); }
textarea.ldc-input { min-height: 56px; }

.ldc-empty {
  text-align: center; color: var(--fg-faint);
  font-size: 12.5px; padding: 26px 10px;
}
.ldc-empty[hidden] { display: none; }

.ldc-ctl mark {
  background: color-mix(in srgb, var(--ldc-accent) 28%, transparent);
  color: inherit; border-radius: 3px; padding: 0 1px;
}

@media (max-width: 520px) {
  .ldc-fab { right: calc(max(env(safe-area-inset-right, 0px), var(--tt-inset-right, 0px)) + 8px); }
  .ldc-panel {
    right: 6px;
    width: calc(100vw - 12px);
    bottom: calc(max(env(safe-area-inset-bottom, 0px), var(--tt-inset-bottom, 0px)) + 64px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ldc-root * { transition: none !important; }
  .ldc-fab.ldc-nope { animation: none; }
}
`;
