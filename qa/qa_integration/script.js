// ============================================================================
// MOCK SillyTavern/TauriTavern main script — untuk integration harness.
// Served at /script.js (path yang di-import index.js via '../../../../script.js')
// ============================================================================
const handlers = new Map();

export const event_types = {
    APP_READY: 'app_ready',
    CHAT_CHANGED: 'chat_id_changed',
    MESSAGE_SENT: 'message_sent',
    MESSAGE_RECEIVED: 'message_received',
    MESSAGE_SWIPED: 'message_swiped',
    MESSAGE_DELETED: 'message_deleted',
    SETTINGS_LOADED: 'settings_loaded',
};

export const chat_metadata = { variables: {} };

export const sendMessageAsUser = async (text) => {
    window.__SENT.push(String(text));
    return null;
};
export const saveSettingsDebounced = () => { window.__SAVED_SETTINGS++; };
// v1.3.1: immediate metadata flush (Save now) — observability via counter
export const saveMetadata = async () => { window.__SAVED_META_NOW++; };

export const eventSource = {
    on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, []); handlers.get(ev).push(fn); },
    once(ev, fn) { const wrap = (...a) => { off(ev, wrap); fn(...a); }; this.on(ev, wrap); },
    async emit(ev, ...args) { for (const fn of (handlers.get(ev) ?? [])) await fn(...args); },
};
function off(ev, fn) { const l = handlers.get(ev); if (l) handlers.set(ev, l.filter(f => f !== fn)); }

// test bridge
window.__EVENTS = { emit: (ev, ...a) => eventSource.emit(ev, ...a), handlers };
window.__SENT = [];
window.__SAVED_SETTINGS = 0;
window.__SAVED_META_NOW = 0;
window.__CTX = { chatId: 'chat-1', chat: [] };
window.__CHAT_METADATA = chat_metadata;   // observability utk QA
