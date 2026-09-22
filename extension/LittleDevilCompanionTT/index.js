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
// ============================================================================

// NOTE on relative depth: third-party extensions live at
//   scripts/extensions/third-party/LittleDevilCompanionTT/index.js
// which is FOUR levels below the served root. Verified against TauriTavern
// 2.3.0 source (src/script.js served at /script.js, src/scripts/extensions.js
// served at /scripts/extensions.js) and against Extension-TopInfoBar, which
// uses the same depth and loads fine.
import { eventSource, event_types, chat_metadata, sendMessageAsUser, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext, saveMetadataDebounced } from '../../../extensions.js';

import {
    SETTING_KEYS, DEFAULTS,
    GLOBAL_DEFAULTS_KEY, MODULE_NAME,
    coerceTyped, isNumStr, buildInitWrites, computeDerivedWrites,
    scanHelenaMessages, helenaInText,
    extractDiceTags, parseDiceRequest, resolveCheck, formatDiceResult,
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
            ui: { theme: 'auto', lang: 'auto', pos: null, locked: false },
        };
    }
    if (!extension_settings[MODULE_NAME].ui) extension_settings[MODULE_NAME].ui = { theme: 'auto', lang: 'auto', pos: null, locked: false };
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

// ---- dice (port of the Tavo 'roll-dice' last-message action) ----------------
async function rollDiceAction() {
    try {
        const ctx = getContext();
        if (!ctx || !Array.isArray(ctx.chat) || !ctx.chat.length) return;
        let found = null;
        for (let i = ctx.chat.length - 1; i >= Math.max(0, ctx.chat.length - DICE_LOOKBACK); i--) {
            const tags = extractDiceTags(String(ctx.chat[i]?.mes ?? ''));
            if (tags.length) { found = { index: i, tags }; break; }
        }
        if (!found) { toast(t('runtime.dice.none')); return; }

        const rollKey = found.index + ':' + found.tags.length;
        if (String(getVar('LD_last_roll') ?? '') === rollKey) { toast(t('runtime.dice.already')); return; }

        const lines = [];
        for (const raw of found.tags) {
            try {
                lines.push(formatDiceResult(resolveCheck(parseDiceRequest(raw))));
            } catch (e) {
                lines.push('⚠️ ' + raw.slice(0, 80) + ' — ' + (e && e.message ? e.message : 'invalid'));
            }
        }
        await setVarsBulk({ LD_last_roll: rollKey });
        await sendMessageAsUser(lines.join('\n'));
        toast(t('runtime.dice.rolled', { count: String(found.tags.length) }));
    } catch (e) {
        console.error(`${LOG} rollDice failed:`, e);
        toast(t('runtime.dice.failed'));
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
    await recomputeDerived();
    toast(t('runtime.toast.defaultApplied'));
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
            },
        });

        // Tavo-dashboard compatibility bridge
        window.__lildevilRecompute = () => recomputeDerived();
        window.__lildevilCompanionReady = true;
        console.log(`${LOG} dashboard injected`);
    } catch (e) {
        console.error(`${LOG} injectUI failed:`, e);
    }
}

// ---- boot --------------------------------------------------------------------
function register() {
    eventSource.on(event_types.APP_READY, () => {
        injectUI();
        // TT activates deferred third-party extensions after APP_READY; the chat
        // may already be open — seed it here, CHAT_CHANGED covers later switches.
        initChat();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => { initChat(); });
    eventSource.on(event_types.MESSAGE_SENT, (idx) => { onMessageAdded(idx); });
    eventSource.on(event_types.MESSAGE_RECEIVED, (idx) => { onMessageAdded(idx); });
    eventSource.on(event_types.MESSAGE_SWIPED, () => { recomputeDerived(); });
    eventSource.on(event_types.MESSAGE_DELETED, () => { recomputeDerived(); });
}

register();
