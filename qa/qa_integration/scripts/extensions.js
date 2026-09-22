// ============================================================================
// MOCK SillyTavern/TauriTavern extensions.js — served at /scripts/extensions.js
// ============================================================================
export const extension_settings = {};

export function getContext() { return window.__CTX; }
export function saveMetadataDebounced() { window.__SAVED_META++; }

window.__SAVED_META = 0;
window.__EXT_SETTINGS = extension_settings;   // observability utk QA
