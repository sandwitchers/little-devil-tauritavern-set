// ============================================================================
// Little Devil Companion — core.js
// Pure logic layer, ported 1:1 from the Tavo companion plugin v1.2.0
// (little-devil-companion-1.2.0.tpg → entry.js) for TauriTavern / SillyTavern.
// No imports, no DOM, no host APIs — fully unit-testable.
// ============================================================================

import {
    SETTING_KEYS, NUMERIC_KEYS, NUMERIC_TEXT_KEYS, DEFAULTS, SYSTEM_DEFAULTS,
    DERIVED_ROLLS, DERIVED_PICKS, DERIVED_FLAGS, DERIVED_NONEMPTY, DERIVED_EXPRS,
} from './data_schema.js';

// v1.3.0 install-resilience re-export (user-validated patch, adopted upstream):
// older/mixed installs (v1.2.0–1.2.1 index.js) pull SETTING_KEYS/DEFAULTS out
// of core.js. Re-exporting them here makes every file combination load, so the
// extension never fails to import again — no manual patching needed.
// Harmless duplication: core.js does not define these names itself.
export { SETTING_KEYS, DEFAULTS };

export const HELENA_RE = /(?:Helena|헬레나|ヘレナ|helena|へれな)/i;
export const DICE_TAG_RE = /<(?:DICE|dice)>([\s\S]*?)<\/(?:DICE|dice)>/gi;

export const GLOBAL_DEFAULTS_KEY = 'littledevil.global.defaults';
export const MODULE_NAME = 'littleDevilCompanion';

// ---- tiny helpers (verbatim semantics from entry.js) -----------------------
export function pad2(n) { return (n < 10 ? '0' : '') + n; }
export function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
export function isNumStr(v) { return typeof v === 'string' && /^-?\d+$/.test(v.trim()); }
export function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

// Store a value with the type the preset's EJS expects.
export function coerceTyped(key, value) {
    if (NUMERIC_KEYS.indexOf(key) >= 0) return toNum(value);
    if (NUMERIC_TEXT_KEYS.indexOf(key) >= 0) {
        if (typeof value === 'number') return value;
        return isNumStr(value) ? Number(String(value).trim()) : String(value == null ? '' : value);
    }
    return value;
}

// ---- chat:opened init ------------------------------------------------------
// First-write init of preset variables (TYPED) + v1.0.0 numeric-string migration.
// Returns { writes: {key: value}, initCount, migCount } — caller persists them.
export function buildInitWrites(currentVars, globalDefaults) {
    const seed = Object.assign({}, DEFAULTS, (globalDefaults && typeof globalDefaults === 'object') ? globalDefaults : {});
    const allKeys = SETTING_KEYS.concat(Object.keys(SYSTEM_DEFAULTS));
    const writes = {};
    let initCount = 0;
    let migCount = 0;
    for (const key of allKeys) {
        const existing = currentVars ? currentVars[key] : undefined;
        if (existing === null || existing === undefined) {
            const val = seed[key] !== undefined ? seed[key] : SYSTEM_DEFAULTS[key];
            if (val !== undefined) {
                writes[key] = coerceTyped(key, val);
                initCount++;
            }
        } else if (isNumStr(existing) && typeof existing === 'string'
            && (NUMERIC_KEYS.indexOf(key) >= 0 || NUMERIC_TEXT_KEYS.indexOf(key) >= 0)) {
            // v1.0.0 stored numeric values as strings — migrate to real numbers
            writes[key] = Number(String(existing).trim());
            migCount++;
        }
    }
    return { writes, initCount, migCount };
}

// ---- derived variables -----------------------------------------------------
// Port of recomputeDerived(): given a snapshot of current chat variables and an
// environment, produce all derived writes. Caller merges them into storage.
export function computeDerivedWrites(currentVars, env) {
    const vars = currentVars || {};
    const now = env && env.now ? env.now : new Date();
    const messageCount = env && Number.isFinite(env.messageCount) ? env.messageCount : 0;
    const writes = {};

    // 1. random gates (one fresh roll per variable per turn)
    for (const name of Object.keys(DERIVED_ROLLS)) {
        const r = DERIVED_ROLLS[name];
        writes[name] = randInt(r.lo, r.hi);
    }
    // 2. random picks
    for (const name of Object.keys(DERIVED_PICKS)) {
        const p = DERIVED_PICKS[name];
        const opts = p.options || [''];
        writes[name] = opts[Math.floor(Math.random() * opts.length)] ?? '';
    }
    // 3. date / time for this turn
    writes.LD_date = now.toISOString().slice(0, 10);
    writes.LD_time = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    // 4. message count mirror
    writes.LD_msg = messageCount;
    // 5. keyword flags (contains checks over text variables)
    for (const name of Object.keys(DERIVED_FLAGS)) {
        const f = DERIVED_FLAGS[name];
        const src = String(vars[f.source] == null ? '' : vars[f.source]);
        writes[name] = src.indexOf(f.needle) >= 0 ? 1 : 0;
    }
    // 5b. non-empty text flags (author note slot on/off)
    for (const name of Object.keys(DERIVED_NONEMPTY)) {
        const f = DERIVED_NONEMPTY[name];
        const v = String(vars[f.source] == null ? '' : vars[f.source]).trim();
        writes[name] = v.length > 0 ? 1 : 0;
    }
    // 6. fallback expressions (Lumiverse littleDevilCalc semantics)
    for (const name of Object.keys(DERIVED_EXPRS)) {
        const spec = DERIVED_EXPRS[name];
        let src = String(spec.expr);
        src = src.replace(/V:([A-Za-z_]\w*)/g, (_, k) => String(toNum(vars[k])));
        src = src.replace(/LEN:([A-Za-z_]\w*)/g, (_, k) => String(String(vars[k] == null ? '' : vars[k]).length));
        src = src.replace(/ROLL:(\d+)_(\d+)/g, (_, lo, hi) => String(randInt(Number(lo), Number(hi))));
        writes[name] = evalCalc(src) ? 1 : 0;
    }
    return writes;
}

// -- RPN evaluator: faithful port of the Lumiverse littleDevilCalc -----------
const RPN_OPS = {
    '+': { p: 2, a: 'L' }, '-': { p: 2, a: 'L' }, '*': { p: 3, a: 'L' },
    '/': { p: 3, a: 'L' }, '^': { p: 4, a: 'L' }, '%': { p: 3, a: 'L' },
    '<': { p: 1, a: 'L' }, '>': { p: 1, a: 'L' }, '|': { p: 1, a: 'L' },
    '&': { p: 1, a: 'L' }, '≤': { p: 1, a: 'L' }, '≥': { p: 1, a: 'L' },
    '=': { p: 1, a: 'L' }, '≠': { p: 1, a: 'L' }, '!': { p: 5, a: 'R' },
};

function toRPN(expression) {
    const out = [];
    const stack = [];
    const compact = String(expression).replace(/\s+/g, '');
    const tokens = [];
    let last = '';
    const opKeys = Object.keys(RPN_OPS);
    for (let i = 0; i < compact.length; i++) {
        const ch = compact[i];
        if (ch === '-' && (i === 0 || opKeys.indexOf(compact[i - 1]) >= 0 || compact[i - 1] === '(')) {
            last += ch;
        } else if (opKeys.indexOf(ch) >= 0) {
            tokens.push(last !== '' ? last : '0');
            last = '';
            tokens.push(ch);
        } else {
            last += ch;
        }
    }
    tokens.push(last !== '' ? last : '0');
    for (const t of tokens) {
        if (parseFloat(t) || t === '0') out.push(t);
        else if (opKeys.indexOf(t) >= 0) {
            while (stack.length > 0 && (
                (RPN_OPS[t].a === 'L' && RPN_OPS[t].p <= RPN_OPS[stack[stack.length - 1]].p) ||
                (RPN_OPS[t].a === 'R' && RPN_OPS[t].p < RPN_OPS[stack[stack.length - 1]].p))) {
                out.push(stack.pop());
            }
            stack.push(t);
        }
    }
    while (stack.length > 0) out.push(stack.pop());
    return out.join(' ');
}

function calcRPN(rpn) {
    const st = [];
    for (const t of String(rpn).split(' ')) {
        if (parseFloat(t) || t === '0') st.push(parseFloat(t));
        else {
            const b = st.pop();
            const a = st.pop();
            switch (t) {
                case '+': st.push(a + b); break;
                case '-': st.push(a - b); break;
                case '*': st.push(a * b); break;
                case '/': st.push(a / b); break;
                case '^': st.push(Math.pow(a, b)); break;
                case '%': st.push(a % b); break;
                case '<': st.push(a < b ? 1 : 0); break;
                case '>': st.push(a > b ? 1 : 0); break;
                case '|': st.push(a || b); break;
                case '&': st.push(a && b); break;
                case '≤': st.push(a <= b ? 1 : 0); break;
                case '≥': st.push(a >= b ? 1 : 0); break;
                case '=': st.push(a === b ? 1 : 0); break;
                case '≠': st.push(a !== b ? 1 : 0); break;
                case '!': st.push(b ? 0 : 1); break;
            }
        }
    }
    return st.length === 0 ? 0 : st.pop();
}

export function evalCalc(text) {
    // Port of Lumiverse calcString: evaluate (...) depth-first, then RPN the rest.
    const norm = String(text)
        .replace(/&&/g, '&').replace(/\|\|/g, '|')
        .replace(/<=/g, '≤').replace(/>=/g, '≥')
        .replace(/==/g, '=').replace(/!=/g, '≠')
        .replace(/true/gi, '1').replace(/false/gi, '0').replace(/null/gi, '0');
    const depthText = [''];
    for (let i = 0; i < norm.length; i++) {
        const ch = norm[i];
        if (ch === '(') depthText.push('');
        else if (ch === ')' && depthText.length > 1) {
            const res = calcRPN(toRPN(depthText.pop()));
            depthText[depthText.length - 1] += res;
        } else {
            depthText[depthText.length - 1] += ch;
        }
    }
    const parts = calcRPN(toRPN(depthText.join('')));
    return parts ? 1 : 0;
}

// ---- HELENA history scan ---------------------------------------------------
// Sticky: once TRUE it stays TRUE for the chat (history only grows).
// scanMessages(messages) → HELENA:'TRUE' write when a mention is found.
export function scanHelenaMessages(messages) {
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const content = typeof m === 'string' ? m : String((m && (m.mes ?? m.content ?? m.text)) ?? '');
        if (HELENA_RE.test(content)) return { HELENA: 'TRUE' };
    }
    return null;
}

export function helenaInText(content) {
    return HELENA_RE.test(String(content == null ? '' : content));
}

// ---- TTRPG dice (faithful port of the Lumiverse roller) --------------------
function integer(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseNotation(notation, system) {
    const fallback = system === 'coc_low' ? '1d100' : '1d20';
    const text = String(notation || fallback).replace(/\s+/g, '');
    const m = text.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) throw new Error('Invalid dice notation: ' + text);
    return {
        text: text,
        count: Math.max(1, Math.min(100, integer(m[1] || 1, 1))),
        sides: Math.max(2, Math.min(10000, integer(m[2], 20))),
        modifier: integer(m[3] || 0, 0),
    };
}

function rollPool(notation) {
    const dice = [];
    for (let i = 0; i < notation.count; i++) dice.push(randInt(1, notation.sides));
    return { dice: dice, raw: dice.reduce(function (s, v) { return s + v; }, 0) };
}

function normalizeMode(mode) {
    const v = String(mode || 'normal').toLowerCase();
    if (v === 'adv' || v === 'advantage') return 'advantage';
    if (v === 'dis' || v === 'disadvantage') return 'disadvantage';
    return 'normal';
}

function cocDegree(selected, target) {
    if (selected === 1) return 'critical';
    if (selected >= (target < 50 ? 96 : 100)) return 'fumble';
    if (selected <= Math.floor(target / 5)) return 'extreme';
    if (selected <= Math.floor(target / 2)) return 'hard';
    if (selected <= target) return 'regular';
    return 'failure';
}

export function resolveCheck(input) {
    const system = input.system === 'coc_low' ? 'coc_low' : 'dnd_high';
    const mode = normalizeMode(input.roll_mode);
    const notation = parseNotation(input.notation, system);
    const hasTarget = input.target !== undefined && input.target !== null
        && input.target !== '' && Number.isFinite(Number(input.target));
    const target = hasTarget ? integer(input.target, 0) : null;
    const extra = integer(input.modifier, 0);
    const attempts = [];
    for (let i = 0; i < (mode === 'normal' ? 1 : 2); i++) attempts.push(rollPool(notation));
    const raws = attempts.map(function (a) { return a.raw; });
    let selIdx = 0;
    if (mode === 'advantage') {
        selIdx = raws.indexOf(system === 'coc_low' ? Math.min.apply(null, raws) : Math.max.apply(null, raws));
    } else if (mode === 'disadvantage') {
        selIdx = raws.indexOf(system === 'coc_low' ? Math.max.apply(null, raws) : Math.min.apply(null, raws));
    }
    const selected = attempts[selIdx].raw;
    const total = selected + notation.modifier + extra;
    const success = hasTarget ? (system === 'coc_low' ? total <= target : total >= target) : null;
    const natural = notation.count === 1 ? attempts[selIdx].dice[0] : null;

    const result = {
        label: String(input.label || 'Check'),
        system: system,
        notation: notation.text,
        rollMode: mode,
        attempts: attempts.map(function (a) { return a.dice; }),
        selectedAttempt: selIdx + 1,
        selectedRaw: selected,
        notationModifier: notation.modifier,
        extraModifier: extra,
        total: total,
        target: target,
        success: success,
    };

    if (system === 'dnd_high') {
        result.critical = notation.count === 1 && notation.sides === 20 && natural === 20;
        result.fumble = notation.count === 1 && notation.sides === 20 && natural === 1;
    } else if (hasTarget) {
        result.degree = cocDegree(total, target);
        result.critical = notation.count === 1 && notation.sides === 100 && natural <= 5;
        result.fumble = notation.count === 1 && notation.sides === 100 && natural >= 96;
    } else {
        result.critical = total === 1;
        result.fumble = false;
    }
    return result;
}

export function parseDiceRequest(content) {
    const source = String(content == null ? '' : content).trim();
    if (!source || source.length > 512) throw new Error('Invalid or oversized dice request.');
    const parts = source.split(':').map(function (p) { return p.trim(); });
    if (parts.length < 2) throw new Error('Dice request must include notation and a label.');

    const notation = parts.shift();
    const label = String(parts.shift() || 'Check').slice(0, 120);
    let target = null;
    let system = 'dnd_high';
    let rollMode = 'normal';

    for (const part of parts) {
        const norm = part.toUpperCase();
        if (norm === 'LOW' || norm === 'L') system = 'coc_low';
        else if (norm === 'ADV' || norm === 'ADVANTAGE') rollMode = 'advantage';
        else if (norm === 'DIS' || norm === 'DISADVANTAGE') rollMode = 'disadvantage';
        else {
            const tm = norm.match(/^DC\s*(-?\d+)$/) || norm.match(/^(-?\d+)$/);
            if (tm) target = integer(tm[1], 0);
        }
    }
    return { notation: notation, label: label, target: target, system: system, roll_mode: rollMode };
}

export function formatDiceResult(result) {
    const attempts = result.attempts.map(function (d) { return '[' + d.join('+') + ']'; });
    const sel = attempts[result.selectedAttempt - 1];
    const rollText = attempts.length === 1 ? sel : attempts.join(' / ') + ' → ' + sel;
    const totalMod = result.notationModifier + result.extraModifier;
    const modText = totalMod > 0 ? '+' + totalMod : (totalMod < 0 ? String(totalMod) : '');
    let outcome = '';
    if (result.target !== null) {
        const cmp = result.system === 'coc_low'
            ? result.total + (result.success ? ' <= ' : ' > ') + result.target
            : result.total + (result.success ? ' >= ' : ' < ') + 'DC' + result.target;
        outcome = result.success ? cmp + ' ✅ Success!' : cmp + ' ❌ Failure...';
    }
    if (result.critical) outcome += ' ✨ Critical!';
    if (result.fumble) outcome += ' 💀 Fumble!';
    return result.label + ': ' + result.notation + ' = ' + rollText + modText + ' = ' + result.total + (outcome ? ' ' + outcome : '');
}

// Extract <DICE>…</DICE> payloads from a message body.
export function extractDiceTags(content) {
    const tags = [];
    DICE_TAG_RE.lastIndex = 0;
    let m;
    const source = String(content == null ? '' : content);
    while ((m = DICE_TAG_RE.exec(source)) !== null) tags.push(m[1].trim());
    return tags;
}

// ---- immersive dice result cards (v1.3.0) -----------------------------------
// Roll results are appended to the chat as a USER message containing one
// machine-readable marker per roll: <DiceCard …/> when a target number was
// set, <DiceFree …/> for plain rolls. The companion regex scripts ("Little
// Devil — Dice Result Card / Free Roll") render the markers as premium cards
// inside the chat bubble, while the raw marker text stays compact and fully
// readable for the AI in the prompt.

const LD_ATTR_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escAttr(value) {
    return String(value).replace(/[&<>"']/g, c => LD_ATTR_ESCAPES[c]);
}

const LD_TONE = {
    success: '#34d399',   // emerald
    critical: '#fbbf24',  // gold
    failure: '#f87171',   // soft red
    fumble: '#ef4444',    // hard red
    neutral: '#a78bfa',   // violet — free roll without target
};
const LD_SYS_CHIP = { coc_low: '#f0abfc', dnd_high: '#fbbf24' };
const LD_SYS_NAME = { coc_low: 'CoC', dnd_high: 'D&D' };

function ldSysPill(result) {
    let pill = LD_SYS_NAME[result.system] || 'D&D';
    if (result.rollMode === 'advantage') pill += ' · ADV';
    else if (result.rollMode === 'disadvantage') pill += ' · DIS';
    return pill;
}

function ldDetail(result) {
    const parts = ['Rolled ' + result.attempts.map(d => d.join('+')).join(' / ')];
    if (result.attempts.length > 1) parts.push('kept #' + result.selectedAttempt);
    const totalMod = (result.notationModifier || 0) + (result.extraModifier || 0);
    if (totalMod) parts.push('mod ' + (totalMod > 0 ? '+' : '') + totalMod);
    return parts.join(' · ');
}

// verdict badge text + accent tone; verdict '' → free-roll card (no badge)
function ldVerdict(result) {
    const hasTarget = result.target !== null && result.target !== undefined;
    if (!hasTarget) {
        if (result.critical) return { verdict: 'CRITICAL!', tone: LD_TONE.critical };
        if (result.fumble) return { verdict: 'FUMBLE', tone: LD_TONE.fumble };
        return { verdict: '', tone: LD_TONE.neutral };
    }
    const coc = result.system === 'coc_low';
    const cmp = coc ? '≤ ' + result.target : 'DC ' + result.target;
    let verdict;
    let tone;
    if (coc) {
        if (result.degree === 'critical') { verdict = 'CRITICAL SUCCESS'; tone = LD_TONE.critical; }
        else if (result.degree === 'fumble') { verdict = 'FUMBLE'; tone = LD_TONE.fumble; }
        else if (result.degree === 'extreme') { verdict = 'EXTREME SUCCESS'; tone = LD_TONE.success; }
        else if (result.degree === 'hard') { verdict = 'HARD SUCCESS'; tone = LD_TONE.success; }
        else if (result.degree === 'regular') { verdict = 'SUCCESS'; tone = LD_TONE.success; }
        else { verdict = 'FAILURE'; tone = result.fumble ? LD_TONE.fumble : LD_TONE.failure; }
    } else if (result.critical) { verdict = 'CRITICAL SUCCESS'; tone = LD_TONE.critical; }
    else if (result.fumble) { verdict = 'FUMBLE'; tone = LD_TONE.fumble; }
    else if (result.success) { verdict = 'SUCCESS'; tone = LD_TONE.success; }
    else { verdict = 'FAILURE'; tone = LD_TONE.failure; }
    return { verdict: verdict + ' · ' + cmp, tone };
}

export function buildDiceMarker(result) {
    const r = result || {};
    const { verdict, tone } = ldVerdict(r);
    const label = escAttr(r.label || 'Check');
    const sys = escAttr(ldSysPill(r));
    const chip = LD_SYS_CHIP[r.system] || LD_SYS_CHIP.dnd_high;
    const formula = escAttr(r.notation || '');
    const rolled = escAttr(ldDetail(r));
    const total = escAttr(String(r.total ?? ''));
    if (!verdict) {
        return `<DiceFree label="${label}" sys="${sys}" chip="${chip}" formula="${formula}" rolled="${rolled}" total="${total}" tone="${tone}"/>`;
    }
    return `<DiceCard label="${label}" sys="${sys}" chip="${chip}" formula="${formula}" rolled="${rolled}" total="${total}" tone="${tone}" verdict="${escAttr(verdict)}"/>`;
}

// entries: [{ ok: true, card: resolveCheckResult } | { ok: false, text }]
// → one chat message body (one marker per line, plain text for parse errors)
export function buildDiceResultMessage(entries) {
    const lines = [];
    for (const e of (entries || [])) {
        if (e && e.ok) lines.push(buildDiceMarker(e.card));
        else lines.push('⚠️ ' + String((e && e.text) || 'invalid roll'));
    }
    return lines.join('\n');
}

// ---- STPT message-snapshot hygiene (v1.3.1) ----------------------------------
// ST-Prompt-Template keeps a per-message variable snapshot (chat[i].variables)
// and — depending on version/config — merges it OVER chat_metadata.variables
// when getvar() resolves the stack. The Little Devil preset never calls setvar,
// so any key of ours found inside those snapshots is a stale shadow that would
// hide freshly-written dashboard values from the preset. After a settings
// commit we strip OUR keys from every snapshot; foreign keys (other presets /
// STPT setvar users) are left untouched.
// Returns the number of shadowed keys removed.
export function scrubMessageVariables(chat, keys) {
    if (!Array.isArray(chat) || !Array.isArray(keys) || !keys.length) return 0;
    let removed = 0;
    for (const msg of chat) {
        if (!msg || typeof msg !== 'object') continue;
        let vars = msg.variables;
        if (!vars) continue;
        if (!Array.isArray(vars)) {
            // STPT normalizes legacy {0:{},1:{}} shapes into arrays — mirror it
            try { vars = msg.variables = Object.assign([], vars); } catch { continue; }
        }
        for (const snap of vars) {
            if (!snap || typeof snap !== 'object' || Array.isArray(snap)) continue;
            for (const k of keys) {
                if (Object.prototype.hasOwnProperty.call(snap, k)) {
                    try { delete snap[k]; removed++; }
                    catch { break; } // frozen snapshot — leave it untouched, keep going
                }
            }
        }
    }
    return removed;
}

// ============================================================================
// v1.3.2 — dice display layer (single source of truth for bubble rendering)
// ----------------------------------------------------------------------------
// Roll results are stored in the chat as raw <DiceCard>/<DiceFree> markers and
// roll requests stay in the AI text as <DICE> tags. They are rendered into
// premium chat bubbles by THREE cooperating paths so immersion never depends
// on a manual regex import again:
//   1. The companion regex import pack (identical definitions to
//      DICE_REGEX_SCRIPTS below).
//   2. index.js self-installs DICE_REGEX_SCRIPTS into extension_settings.regex
//      at boot (idempotent refresh) — the host's own regex engine then renders
//      every marker at display time with no manual import step.
//   3. index.js additionally runs a DOM fallback on bubbles whose regex
//      rendering was unavailable (e.g. the regex extension disabled) — markers
//      can no longer surface as empty bubbles, because a self-closing unknown
//      tag strips to nothing under DOMPurify.
//      v1.3.3: the fallback is now formatting-preserving. Messages made ONLY
//      of dice markers (roll results) are repainted wholesale via
//      renderDiceContent(); mixed messages (roll REQUESTS inside the AI
//      narrative) are patched surgically via renderDiceMarkersInto(), which
//      replaces just the text a stripped marker leaves behind and never
//      touches <font>/<code>/markdown rendering. Rebuilding a mixed bubble
//      from raw text used to escape the entire message (v1.3.2 regression).
// The HTML builders are shared by both worlds: the regex replaceStrings are
// generated by feeding '$1'..'$8' tokens through these builders.
// ============================================================================

const LD_DISPLAY_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escape plain message text for the DOM fallback path (text → innerHTML).
function escapeDisplayText(text) {
    return String(text == null ? '' : text)
        .replace(/[&<>"']/g, c => LD_DISPLAY_ESCAPES[c])
        .replace(/\r\n|\r|\n/g, '<br>');
}

// ---- premium card builders (used by regex replaceStrings AND the DOM net) ---
// Inputs are expected PRE-ESCAPED (marker attributes already carry entities);
// the builders never escape so '$1'..'$8' tokens pass through untouched.

export function diceChipHtml(formula, label, extra) {
    return `<span data-ld-dice-request="1" title="Little Devil — tap to roll" style="display:inline-flex;align-items:center;gap:10px;max-width:100%;margin:8px 0;padding:9px 14px;border-radius:14px;background:linear-gradient(135deg,#232837,#181c26);border:1px dashed rgba(255,255,255,.22);box-shadow:0 3px 12px rgba(0,0,0,.22);cursor:pointer;-webkit-user-select:none;user-select:none;"><span style="flex:none;width:20px;height:20px;border-radius:6px;border:2px solid #eceff6;position:relative;display:inline-block;box-sizing:border-box;"><span style="position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:#eceff6;display:block;"></span></span><span style="font-size:12.5px;font-weight:800;color:#eceff6;letter-spacing:.3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span><span style="font-size:10.5px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#9aa5bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${formula}<i style="opacity:.5;font-style:normal;">${extra}</i></span><span style="flex:none;font-size:9px;font-weight:800;letter-spacing:1.5px;color:#14161d;background:#f0abfc;border-radius:999px;padding:4px 10px;">ROLL</span></span>`;
}

export function diceCardHtml(label, sys, chip, formula, rolled, total, tone, verdict) {
    return `<div data-ld-dice-card="1" style="max-width:380px;margin:10px 0;padding:12px 16px;border-radius:16px;background:linear-gradient(150deg,#1e222c,#141720);border:1px solid rgba(255,255,255,.08);border-left:3px solid ${tone};box-shadow:0 6px 22px rgba(0,0,0,.28);"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;"><span style="font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#aab3c7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span><span style="flex:none;font-size:9px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${chip};background:rgba(255,255,255,.05);border:1px solid ${chip};border-radius:999px;padding:3px 9px;">${sys}</span></div><div style="display:flex;align-items:baseline;gap:9px;margin-top:7px;"><span style="font-size:30px;font-weight:800;line-height:1;color:${tone};">${total}</span><span style="font-size:11.5px;font-weight:600;color:#7f8aa3;font-family:ui-monospace,Menlo,Consolas,monospace;">${formula}</span></div><div style="margin-top:5px;font-size:11px;color:#8b95ab;">${rolled}</div><div style="margin-top:9px;display:flex;justify-content:flex-end;"><span style="font-size:10.5px;font-weight:800;letter-spacing:.9px;text-transform:uppercase;color:#14161d;background:${tone};border-radius:999px;padding:5px 12px;white-space:nowrap;">${verdict}</span></div></div>`;
}

export function diceFreeHtml(label, sys, chip, formula, rolled, total, tone) {
    return `<div data-ld-dice-free="1" style="max-width:380px;margin:10px 0;padding:12px 16px;border-radius:16px;background:linear-gradient(150deg,#1e222c,#141720);border:1px solid rgba(255,255,255,.08);border-left:3px solid ${tone};box-shadow:0 6px 22px rgba(0,0,0,.28);"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;"><span style="font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#aab3c7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span><span style="flex:none;font-size:9px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${chip};background:rgba(255,255,255,.05);border:1px solid ${chip};border-radius:999px;padding:3px 9px;">${sys}</span></div><div style="display:flex;align-items:baseline;gap:9px;margin-top:7px;"><span style="font-size:30px;font-weight:800;line-height:1;color:${tone};">${total}</span><span style="font-size:11.5px;font-weight:600;color:#7f8aa3;font-family:ui-monospace,Menlo,Consolas,monospace;">${formula}</span></div><div style="margin-top:5px;font-size:11px;color:#8b95ab;">${rolled}</div></div>`;
}

// ---- regex script definitions (self-installed by index.js at boot) ----------
// Same ids/names as the companion import pack so installs upsert instead of
// duplicating, whatever order the user imports/enables things in.

export const DICE_CHIP_FIND_REGEX = '/<DICE>\\s*([^:\\s<>][^:<>]*?)\\s*:\\s*([^:<>]+?)\\s*((?::[^<]*)?)\\s*<\\/DICE>/gi';
export const DICE_CARD_FIND_REGEX = '/<DiceCard\\s+label="([^"]*)"\\s+sys="([^"]*)"\\s+chip="([^"]*)"\\s+formula="([^"]*)"\\s+rolled="([^"]*)"\\s+total="([^"]*)"\\s+tone="([^"]*)"\\s+verdict="([^"]*)"\\s*\\/>/g';
export const DICE_FREE_FIND_REGEX = '/<DiceFree\\s+label="([^"]*)"\\s+sys="([^"]*)"\\s+chip="([^"]*)"\\s+formula="([^"]*)"\\s+rolled="([^"]*)"\\s+total="([^"]*)"\\s+tone="([^"]*)"\\s*\\/>/g';

export const DICE_REGEX_SCRIPTS = [
    {
        id: 'little_devil_regex_51_dice_v13',
        scriptName: 'Little Devil — Dice Request Chip',
        findRegex: DICE_CHIP_FIND_REGEX,
        replaceString: diceChipHtml('$1', '$2', '$3'),
        trimStrings: [],
        placement: [1, 2],
        disabled: false,
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
    {
        id: 'little_devil_regex_52_dice_v13',
        scriptName: 'Little Devil — Dice Result Card',
        findRegex: DICE_CARD_FIND_REGEX,
        replaceString: diceCardHtml('$1', '$2', '$3', '$4', '$5', '$6', '$7', '$8'),
        trimStrings: [],
        placement: [1, 2],
        disabled: false,
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
    {
        id: 'little_devil_regex_53_dice_v13',
        scriptName: 'Little Devil — Dice Free Roll',
        findRegex: DICE_FREE_FIND_REGEX,
        replaceString: diceFreeHtml('$1', '$2', '$3', '$4', '$5', '$6', '$7'),
        trimStrings: [],
        placement: [1, 2],
        disabled: false,
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
];

// ---- DOM fallback renderer ---------------------------------------------------
// Renders a raw message body (markers + plain text) into display HTML. Used
// only when the regex path did not paint its signature data attributes.

const DICE_ATTR_RE = /([A-Za-z_][\w:-]*)\s*=\s*"([^"]*)"/g;
const DICE_CHIP_PARSE_RE = /^<DICE>\s*([^:\s<>][^:<>]*?)\s*:\s*([^:<>]+?)\s*((?::[^<]*)?)\s*<\/DICE>$/i;
const DICE_MARKER_TOKEN_RE = /<DICE>[\s\S]*?<\/DICE>|<DiceCard\b[^>]*\/>|<DiceFree\b[^>]*\/>/gi;

export function hasDiceMarkers(raw) {
    const s = String(raw == null ? '' : raw);
    return s.includes('<DICE>') || s.includes('<dice>') || s.includes('<DiceCard') || s.includes('<DiceFree');
}

function markerAttrs(marker) {
    const attrs = {};
    let m;
    DICE_ATTR_RE.lastIndex = 0;
    while ((m = DICE_ATTR_RE.exec(marker)) !== null) attrs[m[1]] = m[2];
    return attrs;
}

function renderDiceMarker(marker) {
    try {
        if (/^<DICE>/i.test(marker)) {
            const chip = marker.match(DICE_CHIP_PARSE_RE);
            if (chip) return diceChipHtml(chip[1], chip[2], chip[3] || '');
            return escapeDisplayText(marker);
        }
        const a = markerAttrs(marker);
        if (/^<DiceCard\b/i.test(marker)) {
            return diceCardHtml(
                a.label ?? 'Check', a.sys ?? '', a.chip ?? '', a.formula ?? '',
                a.rolled ?? '', a.total ?? '', a.tone ?? '', a.verdict ?? '',
            );
        }
        if (/^<DiceFree\b/i.test(marker)) {
            return diceFreeHtml(
                a.label ?? 'Check', a.sys ?? '', a.chip ?? '', a.formula ?? '',
                a.rolled ?? '', a.total ?? '', a.tone ?? '',
            );
        }
        return escapeDisplayText(marker);
    } catch {
        return escapeDisplayText(marker);
    }
}

// Full-body renderer: escapes the plain segments, renders every marker. A
// message consisting of nothing but markers therefore never collapses to an
// empty bubble, even with the regex engine out of the picture.
export function renderDiceContent(raw) {
    const src = String(raw == null ? '' : raw);
    const parts = [];
    let last = 0;
    let m;
    DICE_MARKER_TOKEN_RE.lastIndex = 0;
    while ((m = DICE_MARKER_TOKEN_RE.exec(src)) !== null) {
        if (m.index > last) parts.push(escapeDisplayText(src.slice(last, m.index)));
        parts.push(renderDiceMarker(m[0]));
        last = m.index + m[0].length;
    }
    if (last < src.length) parts.push(escapeDisplayText(src.slice(last)));
    return parts.join('');
}

// ---- v1.3.3 surgical fallback -------------------------------------------------
// The full-body repaint above is only safe for messages that consist of dice
// markers alone (roll results). A roll REQUEST lives inside the AI narrative
// next to <font> styling, §effects§, code blocks and markdown — rebuilding
// that bubble from raw text escapes the whole message (raw markup shown in
// chat, the v1.3.3 bug report). The surgical renderer instead patches the
// ALREADY-FORMATTED bubble DOM in place: it replaces only the text a stripped
// marker leaves behind and never touches any other node.

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DICE_TEXT_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
function decodeDiceText(s) {
    return String(s == null ? '' : s).replace(/&(?:amp|lt|gt|quot|#39|apos);/g, m => DICE_TEXT_ENTITIES[m] ?? m);
}

// True when the message carries nothing but dice markers (plus whitespace) —
// repainting it wholesale cannot lose any content.
export function isMarkersOnlyBody(raw) {
    const s = String(raw == null ? '' : raw);
    return s.replace(DICE_MARKER_TOKEN_RE, '').trim().length === 0;
}

function collectTextNodes(rootEl) {
    const nodes = [];
    try {
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
    } catch { /* no TreeWalker on this host — markers fall back to append */ }
    return nodes;
}

function findMarkerText(nodes, probe) {
    for (const node of nodes) {
        const data = node.data || '';
        if (probe.literal) {
            const at = data.indexOf(probe.literal);
            if (at >= 0) return { node, start: at, end: at + probe.literal.length };
        } else if (probe.pattern) {
            probe.pattern.lastIndex = 0;
            const m = probe.pattern.exec(data);
            if (m) return { node, start: m.index, end: m.index + m[0].length };
        }
    }
    return null;
}

function insertMarkerHtml(textNode, start, end, html) {
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    range.deleteContents();
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    range.insertNode(tpl.content);
}

function appendMarkerHtml(textEl, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    textEl.appendChild(tpl.content);
}

// Patch an already-formatted bubble in place. Each marker found in the raw
// text is painted over the DOM text it left behind (either the literal
// escaped `<DICE>…</DICE>` string or the bare `formula:label` residue that
// remains after DOMPurify strips the unknown tag). Markers that left no
// findable text (self-closing card tags vanish whole) are appended at the
// end of the bubble. Everything else in the bubble is untouched. Returns the
// number of markers painted.
export function renderDiceMarkersInto(textEl, raw) {
    let painted = 0;
    try {
        // Idempotence guard: a bubble already carrying a painted chip/card
        // (regex path or a previous surgical pass) must never receive a
        // second copy of its markers.
        if (textEl.querySelector('[data-ld-dice-request],[data-ld-dice-card],[data-ld-dice-free]')) return 0;
        const src = String(raw == null ? '' : raw);
        const nodes = collectTextNodes(textEl);
        DICE_MARKER_TOKEN_RE.lastIndex = 0;
        let m;
        while ((m = DICE_MARKER_TOKEN_RE.exec(src)) !== null) {
            const marker = m[0];
            const html = renderDiceMarker(marker);
            const isChip = /^<DICE>/i.test(marker);
            const body = isChip
                ? marker.replace(/^<DICE>/i, '').replace(/<\/DICE>$/i, '').trim()
                : '';
            let hit = null;
            if (nodes.length) {
                if (isChip) hit = findMarkerText(nodes, { literal: decodeDiceText(marker.trim()) });
                if (!hit && body) {
                    const tokens = body.split(/\s+/).filter(Boolean).map(escapeRegExp);
                    if (tokens.length) hit = findMarkerText(nodes, { pattern: new RegExp(tokens.join('\\s+')) });
                }
            }
            if (hit) {
                insertMarkerHtml(hit.node, hit.start, hit.end, html);
            } else {
                appendMarkerHtml(textEl, html);
            }
            painted++;
        }
        DICE_MARKER_TOKEN_RE.lastIndex = 0;
    } catch (e) {
        try { console.warn('[LittleDevilCompanion] surgical dice render failed:', e); } catch { /* noop */ }
    }
    return painted;
}
