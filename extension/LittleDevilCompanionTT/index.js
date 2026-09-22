// ============================================================================
// Little Devil Companion — TauriTavern / SillyTavern port (index.js)
// Adapter between the pure logic (core.js) + dashboard UI (ui.js) and the
// SillyTavern / TauriTavern runtime. Ported from the Tavo companion plugin
// v1.2.0 (little-devil-companion-1.2.0.tpg).
//
// Variable bridge (verified against ST-Prompt-Template docs):
//   chat_metadata.variables  ←→  STPT 'local' scope  ←→  native {{getvar}}
// so values written here are read by BOTH the preset's EJS getvar() calls and
// its native {{getvar}} macros.
//
// TauriTavern notes:
//  - getContext().chat is guaranteed to be the complete ordered history
//    (same contract as SillyTavern 1.18.0), so chat.length is the true count.
//  - The dashboard host carries data-tt-mobile-surface="free-window" and the
//    CSS consumes :root --tt-inset-* (safe areas) inside the Shadow DOM.
//
// v1.3.0 dice immersion:
//  - MESSAGE_RECEIVED auto-rolls pending <DICE> requests and posts the result
//    to the chat as a user message of <DiceCard>/<DiceFree> markers (toggle:
//    dashboard menu → "Auto-roll dice into chat").
//  - Regex-rendered request chips ([data-ld-dice-request]) are tappable and
//    roll the tags of their own message — faithful to the Tavo client's
//    "rendered roll button".
//  - Anti-double-roll key is content-based (index + tag text), so swipes of
//    the same message re-roll correctly while repeats stay blocked.
//
// v1.3.1 preset bridge diagnostics:
//  - The preset reads EVERYTHING through ST-Prompt-Template (STPT) getvar();
//    if that extension is missing/disabled the model sees raw <% %> and every
//    dashboard toggle looks dead. The dashboard now shows an integration
//    status card (STPT detected? enabled? generate processing on?), a sync
//    self-test, and a FAB warning badge when the bridge is down.
//  - "Save now" chip forces an immediate saveMetadata() (auto-save stays on).
//  - Settings commits scrub our keys from STPT per-message variable snapshots
//    (chat[i].variables) so no stale clone can shadow fresh values on any
//    STPT version.
//
// v1.3.2 dice display hardening (fixes EMPTY chat bubbles after a roll):
//  - Root cause of the empty bubble: roll results are stored as raw
//    <DiceCard>/<DiceFree> markers and rendering was delegated to the
//    companion regex pack — but installs that never imported the newer pack
//    (the dice trio was added after the original 51 scripts) let DOMPurify
//    strip the unknown self-closing tags, leaving a blank user bubble.
//  - Fix A: the extension now self-installs/refreshes the three dice regex
//    scripts into extension_settings.regex at boot (same ids/names as the
//    import pack → upsert, never duplicates). The host's regex engine then
//    renders markers natively at display time on every install.
//  - Fix B (safety net): a debounced DOM fallback scans rendered bubbles for
//    raw markers and repaints them via core.js renderDiceContent() whenever
//    the regex path could not run (e.g. regex extension disabled). Markers can
//    no longer collapse to empty bubbles in any configuration.
// ============================================================================

// NOTE on relative depth: third-party extensions live at
//   scripts/extensions/third-party/LittleDevilCompanionTT/index.js
// which is FOUR levels below the served root. Verified against TauriTavern
// 2.3.0 source (src/script.js served at /script.js, src/scripts/extensions.js
// served at /scripts/extensions.js) and against Extension-TopInfoBar, which
// uses the same depth and loads fine.
import { eventSource, event_types, chat_metadata, sendMessageAsUser, saveSettingsDebounced, saveMetadata } from '../../../../script.js';
import { extension_settings, getContext, saveMetadataDebounced } from '../../../extensions.js';

// SETTING_KEYS/DEFAULTS live in data_schema.js (core.js does not re-export them)
import { SETTING_KEYS, DEFAULTS, SYSTEM_DEFAULTS } from './data_schema.js';

import {
    GLOBAL_DEFAULTS_KEY, MODULE_NAME,
    coerceTyped, isNumStr, buildInitWrites, computeDerivedWrites,
    scanHelenaMessages, helenaInText,
    extractDiceTags, parseDiceRequest, resolveCheck,
    buildDiceResultMessage, scrubMessageVariables,
    DICE_REGEX_SCRIPTS, hasDiceMarkers, renderDiceContent,
} from './core.js';
import { buildDashboard } from './ui.js';
import { L10N } from './data_i18n.js';

const LOG = '[LittleDevilCompanion]';
const HELENA_SCAN_LIMIT = 300;      // same bound as the Tavo plugin
const DICE_LOOKBACK = 30;           // how many recent messages to scan for <DICE>

// ---- extension settings (global, survives chat switches) -------------------
function ext() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = {
            globalDefaults: null, // typed snapshot of the 105 setting keys
            ui: { theme: 'auto', lang: 'auto', pos: null, locked: false, autoRoll: true },
        };
    }
    if (!extension_settings[MODULE_NAME].ui) extension_settings[MODULE_NAME].ui = { theme: 'auto', lang: 'auto', pos: null, locked: false, autoRoll: true };
    return extension_settings[MODULE_NAME];
}

// ---- chat variable bridge --------------------------------------------------
function varsObj() {
    if (!chat_metadata || typeof chat_metadata !== 'object') return {};
    if (!chat_metadata.variables || typeof chat_metadata.variables !== 'object') chat_metadata.variables = {};
    return chat_metadata.variables;
}
function getVar(key) { return varsObj()[key]; }
async function setVar(key, value) {
    varsObj()[key] = coerceTyped(key, value);
    // v1.3.1: a user-facing settings change must never be shadowed by stale
    // STPT per-message snapshots — strip our key from every snapshot (cheap,
    // and a no-op on STPT builds that never clone chat variables).
    if (SETTING_KEYS.indexOf(key) >= 0) {
        try { scrubMessageVariables(getContext()?.chat, SETTING_KEYS); } catch { /* non-fatal */ }
    }
    saveMetadataDebounced();
    return varsObj()[key];
}
async function setVarsBulk(writes) {
    const o = varsObj();
    Object.assign(o, writes);
    saveMetadataDebounced();
}

function snapshotForInit() {
    const seed = Object.assign({}, DEFAULTS, ext().globalDefaults || {});
    const out = {};
    for (const k of SETTING_KEYS) out[k] = seed[k];
    return out;
}

// ---- chat lifecycle --------------------------------------------------------
let lastInitChatId = null;

async function initChat() {
    try {
        const ctx = getContext();
        if (!ctx || !ctx.chatId || !ctx.chat) return;

        const { writes, initCount, migCount } = buildInitWrites(varsObj(), ext().globalDefaults);
        if (initCount > 0 || migCount > 0) await setVarsBulk(writes);
        lastInitChatId = ctx.chatId;

        await recomputeDerived();
        await scanHelenaFull();
        if (initCount || migCount) {
            console.log(`${LOG} chat init: seeded=${initCount} migrated=${migCount} chat=${ctx.chatId}`);
        }
        dash && dash.refresh();
    } catch (e) {
        console.error(`${LOG} initChat failed:`, e);
    }
}

async function recomputeDerived() {
    try {
        const ctx = getContext();
        const messageCount = ctx && Array.isArray(ctx.chat) ? ctx.chat.length : 0;
        const writes = computeDerivedWrites(varsObj(), { messageCount, now: new Date() });
        await setVarsBulk(writes);
    } catch (e) {
        console.warn(`${LOG} recomputeDerived failed:`, e);
    }
}

// Sticky HELENA history scan (once TRUE it stays TRUE for the chat).
async function scanHelenaFull() {
    try {
        if (getVar('HELENA') === 'TRUE') return;
        const ctx = getContext();
        if (!ctx || !Array.isArray(ctx.chat) || !ctx.chat.length) return;
        const recent = ctx.chat.slice(-HELENA_SCAN_LIMIT);
        const write = scanHelenaMessages(recent);
        if (write) await setVarsBulk(write);
    } catch (e) {
        console.warn(`${LOG} HELENA scan failed:`, e);
    }
}

async function onMessageAdded(messageId) {
    try {
        const ctx = getContext();
        const msg = ctx && Array.isArray(ctx.chat) ? ctx.chat[messageId] : null;
        const content = msg ? String(msg.mes ?? '') : '';
        if (content && helenaInText(content) && getVar('HELENA') !== 'TRUE') {
            await setVarsBulk({ HELENA: 'TRUE' });
        }
    } catch (e) { /* non-fatal */ }
    await recomputeDerived();
    dash && dash.refresh();
}

// ---- dice (port of the Tavo 'roll-dice' action + v1.3.0 chat immersion) -----
// The result is appended to the chat as ONE user message: one <DiceCard>/
// <DiceFree> marker per roll (rendered as premium cards by the companion
// regex scripts), plain ⚠️ lines for malformed tags. The AI reads the raw
// markers in the prompt and narrates the outcome.
async function performRoll(foundIndex, tags, announce) {
    const rollKey = foundIndex + ':' + tags.join('|');
    if (String(getVar('LD_last_roll') ?? '') === rollKey) {
        if (announce) toast(t('runtime.dice.already'));
        return false;
    }
    const entries = [];
    for (const raw of tags) {
        try {
            entries.push({ ok: true, card: resolveCheck(parseDiceRequest(raw)) });
        } catch (e) {
            entries.push({ ok: false, text: raw.slice(0, 80) + ' — ' + (e && e.message ? e.message : 'invalid') });
        }
    }
    await setVarsBulk({ LD_last_roll: rollKey });
    await sendMessageAsUser(buildDiceResultMessage(entries));
    scheduleDiceScan(); // v1.3.2 — paint the result bubble even if events lag
    if (announce) toast(t('runtime.dice.rolled', { count: String(tags.length) }));
    return true;
}

// Shared roller: scan the given message (or, when null, the last 30) for
// <DICE> tags and roll them. Used by the FAB button and the rendered chips.
async function rollFromMessage(messageId) {
    try {
        const ctx = getContext();
        if (!ctx || !Array.isArray(ctx.chat) || !ctx.chat.length) return;
        let found = null;
        if (Number.isFinite(messageId) && ctx.chat[messageId]) {
            const tags = extractDiceTags(String(ctx.chat[messageId].mes ?? ''));
            if (tags.length) found = { index: messageId, tags };
        }
        if (!found) {
            for (let i = ctx.chat.length - 1; i >= Math.max(0, ctx.chat.length - DICE_LOOKBACK); i--) {
                const tags = extractDiceTags(String(ctx.chat[i]?.mes ?? ''));
                if (tags.length) { found = { index: i, tags }; break; }
            }
        }
        if (!found) { toast(t('runtime.dice.none')); return; }
        await performRoll(found.index, found.tags, true);
    } catch (e) {
        console.error(`${LOG} rollDice failed:`, e);
        toast(t('runtime.dice.failed'));
    }
}

async function rollDiceAction() {
    await rollFromMessage(null);
}

// ---- v1.3.2 dice display: self-installed regex scripts ----------------------
// Roll results and request chips are painted by the host's regex engine. The
// companion import pack ships these scripts, but installs that never imported
// the newer pack render nothing (DOMPurify strips the unknown self-closing
// tags → empty bubble). Upserting our definitions into
// extension_settings.regex at boot makes rendering automatic everywhere; ids
// and scriptNames match the import pack so this can never create duplicates.
function ensureDiceRegexScripts() {
    try {
        if (!Array.isArray(extension_settings.regex)) extension_settings.regex = [];
        const list = extension_settings.regex;
        let changed = 0;
        for (const script of DICE_REGEX_SCRIPTS) {
            const i = list.findIndex(s => s && typeof s === 'object' &&
                (s.id === script.id || s.scriptName === script.scriptName));
            if (i < 0) {
                list.push({ ...script });
                changed++;
            } else if (list[i].findRegex !== script.findRegex ||
                       list[i].replaceString !== script.replaceString ||
                       list[i].scriptName !== script.scriptName) {
                // Outdated definition → refresh it, keep the user's disabled
                // flag: if they deliberately switched the script off, that
                // choice wins (the DOM fallback still paints the bubble).
                list[i] = { ...script, disabled: list[i].disabled === true };
                changed++;
            }
        }
        if (changed) {
            saveSettingsDebounced();
            console.log(`${LOG} dice display scripts installed/refreshed: ${changed}`);
        }
    } catch (e) {
        console.warn(`${LOG} ensureDiceRegexScripts failed:`, e);
    }
}

// ---- v1.3.2 dice display: DOM fallback safety net ----------------------------
// If the regex path could not run for a bubble (regex extension disabled,
// unexpected host behavior, scripts switched off), repaint the bubble here.
// Detection is signature-based: the regex replacement HTML carries
// data-ld-dice-request/card/free attributes — if none are present while the
// raw message still holds markers, the fallback takes over. A fingerprint
// attribute keeps the rescan (and our own mutation) from looping.
let diceChatObserver = null;
let diceObservedChatEl = null;
let diceScanTimer = null;

function scanDiceBubbles() {
    try {
        const ctx = getContext();
        const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : null;
        if (!chat) return;
        const blocks = document.querySelectorAll('#chat .mes');
        for (const block of blocks) {
            const idx = parseInt(block.getAttribute('mesid') ?? '', 10);
            if (!Number.isFinite(idx) || !chat[idx]) continue;
            const msg = chat[idx];
            const raw = String((msg && (msg.extra && msg.extra.display_text)) || (msg && msg.mes) || '');
            if (!hasDiceMarkers(raw)) continue;
            const textEl = block.querySelector('.mes_text');
            if (!textEl || block.classList.contains('editing')) continue;
            if (textEl.querySelector('[data-ld-dice-request],[data-ld-dice-card],[data-ld-dice-free]')) continue;
            const fingerprint = 'L' + raw.length + ':' + idx;
            if (textEl.getAttribute('data-ld-dice-fallback') === fingerprint) continue;
            textEl.innerHTML = renderDiceContent(raw);
            textEl.setAttribute('data-ld-dice-fallback', fingerprint);
        }
    } catch (e) {
        console.warn(`${LOG} dice bubble scan failed:`, e);
    }
}

function scheduleDiceScan() {
    ensureDiceObserver();
    clearTimeout(diceScanTimer);
    diceScanTimer = setTimeout(scanDiceBubbles, 250);
}

function ensureDiceObserver() {
    try {
        const chatEl = document.getElementById('chat');
        if (!chatEl) return;
        if (diceChatObserver && diceObservedChatEl === chatEl) return;
        if (diceChatObserver) { try { diceChatObserver.disconnect(); } catch { /* stale */ } }
        diceChatObserver = new MutationObserver(scheduleDiceScan);
        diceChatObserver.observe(chatEl, { childList: true, subtree: true, characterData: true });
        diceObservedChatEl = chatEl;
    } catch (e) {
        console.warn(`${LOG} dice observer failed:`, e);
    }
}

// v1.3.0 immersion: when the AI (or a swipe variant / first message) asks for
// a roll, roll it automatically and post the result card to the chat. The
// dashboard menu toggle ("Auto-roll dice into chat") disables this.
async function maybeAutoRoll(messageId) {
    try {
        if (ext().ui.autoRoll === false) return;
        const ctx = getContext();
        if (!ctx || !Array.isArray(ctx.chat)) return;
        const i = Number.isFinite(messageId) ? messageId : ctx.chat.length - 1;
        const msg = ctx.chat[i];
        if (!msg) return;
        const tags = extractDiceTags(String(msg.mes ?? ''));
        if (!tags.length) return;
        await performRoll(i, tags, false);
    } catch (e) {
        console.warn(`${LOG} auto-roll failed:`, e);
    }
}

// ---- global defaults profile ------------------------------------------------
async function saveGlobalDefaults() {
    const snap = snapshotForInit();
    const current = varsObj();
    const out = {};
    for (const k of SETTING_KEYS) {
        out[k] = current[k] !== undefined && current[k] !== null ? current[k] : coerceTyped(k, snap[k]);
    }
    ext().globalDefaults = out;
    saveSettingsDebounced();
    toast(t('runtime.toast.globalSaved'));
}

async function applyGlobalDefaults() {
    const g = ext().globalDefaults;
    if (!g) { toast(t('runtime.toast.globalEmpty')); return; }
    const writes = {};
    for (const k of SETTING_KEYS) writes[k] = coerceTyped(k, g[k] !== undefined ? g[k] : DEFAULTS[k]);
    await setVarsBulk(writes);
    await recomputeDerived();
    toast(t('runtime.toast.globalLoaded'));
}

async function resetChatToDefaults() {
    const writes = {};
    for (const k of SETTING_KEYS) writes[k] = coerceTyped(k, DEFAULTS[k]);
    await setVarsBulk(writes);
    try { scrubMessageVariables(getContext()?.chat, SETTING_KEYS); } catch { /* non-fatal */ }
    await recomputeDerived();
    toast(t('runtime.toast.defaultApplied'));
}

// ---- preset bridge diagnostics (v1.3.1) -------------------------------------
// The Little Devil preset is ~3.4k EJS blocks evaluated by ST-Prompt-Template
// (STPT). Without STPT (or with its generate processing off) the model receives
// raw <% %> text and EVERY dashboard toggle looks dead — TRPG mode included.
// These helpers expose the bridge state to the dashboard instead of guessing.
function detectStpt() {
    const s = extension_settings && extension_settings.EjsTemplate;
    if (!s || typeof s !== 'object') {
        return { installed: false, enabled: false, generate: false };
    }
    const enabled = s.enabled !== false;                 // '#pt_enabled'
    const generate = enabled && s.generate_enabled !== false; // '#pt_generate_enabled'
    return { installed: true, enabled, generate };
}

function countSeededVars() {
    let n = 0;
    for (const k of SETTING_KEYS) {
        const v = getVar(k);
        if (v !== undefined && v !== null) n++;
    }
    return n;
}

function integrationStatus() {
    const stpt = detectStpt();
    return {
        stpt,
        ok: stpt.generate,
        seeded: countSeededVars(),
        total: SETTING_KEYS.length,
        trpgmode: getVar('trpgmode'),
        helena: getVar('HELENA'),
        ldMsg: getVar('LD_msg'),
    };
}

// Writes a probe variable, reads it back and clears it — proves the
// chat_metadata.variables bridge (the one STPT getvar() merges) works.
async function syncSelfTest() {
    try {
        const probeKey = 'LD_sync_probe';
        const stamp = Date.now();
        await setVar(probeKey, stamp);
        const back = getVar(probeKey);
        delete varsObj()[probeKey];
        const scrubbed = scrubMessageVariables(getContext()?.chat, SETTING_KEYS.concat(Object.keys(SYSTEM_DEFAULTS)));
        saveMetadataDebounced();
        if (Number(back) !== stamp) {
            console.error(`${LOG} sync self-test: probe mismatch`, stamp, back);
            toast(t('runtime.toast.syncFail'));
            return false;
        }
        const st = integrationStatus();
        toast(t('runtime.toast.syncOk', { n: String(st.seeded), total: String(st.total) })
            + (scrubbed ? ` (+${scrubbed})` : ''));
        dash && dash.refresh();
        return true;
    } catch (e) {
        console.error(`${LOG} sync self-test failed:`, e);
        toast(t('runtime.toast.syncFail'));
        return false;
    }
}

// Auto-save stays on; this is an explicit, immediate flush for users who want
// the certainty of a real save button (delegated to script.js saveMetadata).
async function saveNow() {
    try {
        await saveMetadata();
        toast(t('runtime.toast.saveNow'));
    } catch (e) {
        console.warn(`${LOG} saveNow fallback to debounced:`, e);
        saveMetadataDebounced();
        toast(t('runtime.toast.saveNow'));
    }
}

// ---- i18n -------------------------------------------------------------------
function currentLang() {
    const pref = ext().ui.lang || 'auto';
    if (pref !== 'auto') return pref;
    const nav = (navigator.language || 'en').toLowerCase();
    return nav.startsWith('id') ? 'id' : 'en';
}
function t(key, params) {
    const lang = currentLang();
    let s = (L10N[lang] && L10N[lang][key]) ?? (L10N.en && L10N.en[key]) ?? key;
    if (params) {
        for (const [k, v] of Object.entries(params)) s = s.replaceAll('{' + k + '}', v);
    }
    return s;
}
function toast(text) {
    try { toastr.info(text, 'Little Devil', { timeOut: 2600 }); }
    catch { console.log(`${LOG} toast: ${text}`); }
}

// ---- dashboard wiring --------------------------------------------------------
let dash = null;

function injectUI() {
    if (dash) return;
    try {
        const host = document.createElement('div');
        host.id = 'littleDevilCompanionHost';
        // TauriTavern mobile overlay classifier surface marker (harmless in ST)
        host.setAttribute('data-tt-mobile-surface', 'free-window');
        host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;contain:layout style;';
        document.body.appendChild(host);

        dash = buildDashboard(host, {
            getValue: k => getVar(k),
            setValue: setVar,
            defaults: DEFAULTS,
            t,
            notify: toast,
            prefs: ext().ui,
            setPrefs(patch) {
                Object.assign(ext().ui, patch);
                saveSettingsDebounced();
            },
            actions: {
                rollDice: rollDiceAction,
                resetChat: resetChatToDefaults,
                saveGlobal: saveGlobalDefaults,
                applyGlobal: applyGlobalDefaults,
                syncTest: syncSelfTest,
                saveNow,
            },
            getIntegrationStatus: integrationStatus,
        });

        // Tavo-dashboard compatibility bridge
        window.__lildevilRecompute = () => recomputeDerived();
        window.__lildevilCompanionReady = true;

        // v1.3.0: tap-to-roll on the regex-rendered dice request chips.
        // The chip lives inside a .mes block; its mesid tells us which chat
        // message's tags to roll (fallback: last-30 scan). Capture phase so
        // the tap always reaches us first.
        document.addEventListener('click', (e) => {
            try {
                const chip = e.target && e.target.closest ? e.target.closest('[data-ld-dice-request]') : null;
                if (!chip) return;
                const mesEl = chip.closest ? chip.closest('.mes') : null;
                const idx = mesEl ? parseInt(mesEl.getAttribute('mesid'), 10) : NaN;
                rollFromMessage(Number.isFinite(idx) ? idx : null);
            } catch (err) {
                console.warn(`${LOG} chip roll failed:`, err);
            }
        }, true);

        // v1.3.2: dice display — watch chat mutations and repaint any marker
        // bubble the regex path missed.
        ensureDiceObserver();
        scheduleDiceScan();

        console.log(`${LOG} dashboard injected`);
    } catch (e) {
        console.error(`${LOG} injectUI failed:`, e);
    }
}

// ---- boot --------------------------------------------------------------------
function register() {
    ensureDiceRegexScripts(); // v1.3.2 — install before the first paint
    eventSource.on(event_types.APP_READY, () => {
        injectUI();
        ensureDiceRegexScripts();
        // TT activates deferred third-party extensions after APP_READY; the chat
        // may already be open — seed it here, CHAT_CHANGED covers later switches.
        initChat();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => { initChat(); scheduleDiceScan(); });
    eventSource.on(event_types.MESSAGE_SENT, (idx) => { onMessageAdded(idx); scheduleDiceScan(); });
    eventSource.on(event_types.MESSAGE_RECEIVED, (idx) => { onMessageAdded(idx); maybeAutoRoll(idx); scheduleDiceScan(); });
    eventSource.on(event_types.MESSAGE_SWIPED, () => { recomputeDerived(); scheduleDiceScan(); });
    eventSource.on(event_types.MESSAGE_DELETED, () => { recomputeDerived(); scheduleDiceScan(); });
    if (event_types.MESSAGE_UPDATED) eventSource.on(event_types.MESSAGE_UPDATED, () => { scheduleDiceScan(); });
}

register();

// v1.3.1 boot safety net: TT can activate deferred third-party extensions at
// any point; if a chat is ALREADY open and APP_READY has fired before us (or
// races us), seed + paint the dashboard anyway. initChat/injectUI are
// idempotent, so running them here is harmless when APP_READY also lands.
try {
    const bootCtx = getContext();
    ensureDiceRegexScripts();
    if (bootCtx && bootCtx.chatId && Array.isArray(bootCtx.chat)) {
        injectUI();
        initChat();
        scheduleDiceScan();
    }
} catch { /* APP_READY will cover it */ }
