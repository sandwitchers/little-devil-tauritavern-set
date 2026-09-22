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
