#!/usr/bin/env node
// ============================================================================
// QA DIFFERENTIAL — entry.js Tavo ASLI (di-stub tavo API) dijalankan berjajaran
// dengan port core.js. Skenario identik → hasil identik.
// Jalankan: node scripts/qa_core_diff.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import * as S from '../build/LittleDevilCompanionTT/data_schema.js';
import * as port from '../build/LittleDevilCompanionTT/core.js';

let crit = 0, warn = 0, pass = 0;
const C = m => { crit++; console.log('  🔴 ' + m); };
const W = m => { warn++; console.log('  🟡 ' + m); };
const P = m => { pass++; console.log('  ✔ ' + m); };

// ============================================================================
// 1. STUB tavo + import entry.js ASLI
// ============================================================================
const store = new Map();          // chat scope
const globalStore = new Map();    // global scope
let msgCount = 0;
let messages = [];
const appended = [];
const handlers = {}, actions = {};

globalThis.window = globalThis;
globalThis.tavo = {
    plugin: {
        on: (n, f) => { handlers[n] = f; },
        onLastMessageAction: (n, f) => { actions[n] = f; },
    },
    variable: {
        async get(key, scope) { return (scope === 'global' ? globalStore : store).get(key); },
        async set(key, val, scope) { (scope === 'global' ? globalStore : store).set(key, val); return true; },
    },
    message: {
        async count() { return msgCount; },
        async find() { return messages.map(m => ({ ...m })); },
        async get(id) { return messages[id] ?? null; },
        async append(x) { appended.push(x); messages.push({ content: x.content }); msgCount++; },
    },
    utils: { toast() {} },
};

const src = readFileSync('/home/z/my-project/analysis/tpg_extract/entry.js', 'utf8') +
    '\nexport { recomputeDerived, evalCalc, coerceTyped, scanHelenaFull, resolveCheck, parseDiceRequest, formatDiceResult, SETTING_KEYS, NUMERIC_KEYS, NUMERIC_TEXT_KEYS, DEFAULTS, SYSTEM_DEFAULTS, DERIVED_ROLLS, DERIVED_PICKS, DERIVED_FLAGS, DERIVED_NONEMPTY, DERIVED_EXPRS, HELENA_RE, DICE_TAG_RE };\n';
let orig;
try {
    orig = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
    P('entry.js asli ter-import + handler chat:opened terdaftar: ' + Object.keys(handlers).join(', '));
} catch (e) {
    C('gagal import entry.js: ' + e.message);
    process.exit(1);
}

// ============================================================================
// 2. DATA SCHEMA — diff langsung vs asli
// ============================================================================
{
    const setEq = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    setEq(orig.SETTING_KEYS, S.SETTING_KEYS) ? P(`SETTING_KEYS identik (${S.SETTING_KEYS.length})`)
        : C('SETTING_KEYS BEDA');
    setEq(orig.NUMERIC_KEYS, S.NUMERIC_KEYS) ? P(`NUMERIC_KEYS identik (${S.NUMERIC_KEYS.length})`)
        : C('NUMERIC_KEYS BEDA');
    setEq(orig.NUMERIC_TEXT_KEYS, S.NUMERIC_TEXT_KEYS) ? P('NUMERIC_TEXT_KEYS identik') : C('NUMERIC_TEXT_KEYS BEDA');
    const jd = o => JSON.stringify(o, Object.keys(o).sort());
    jd(orig.DEFAULTS) === jd(S.DEFAULTS) ? P('DEFAULTS identik (deep)') : C('DEFAULTS BEDA: ' +
        Object.keys({ ...orig.DEFAULTS, ...S.DEFAULTS }).filter(k => JSON.stringify(orig.DEFAULTS[k]) !== JSON.stringify(S.DEFAULTS[k])).map(k => `${k}:${JSON.stringify(orig.DEFAULTS[k])}→${JSON.stringify(S.DEFAULTS[k])}`).join(', '));
    jd(orig.SYSTEM_DEFAULTS) === jd(S.SYSTEM_DEFAULTS) ? P('SYSTEM_DEFAULTS identik') : C('SYSTEM_DEFAULTS BEDA');
    for (const k of ['DERIVED_ROLLS', 'DERIVED_PICKS', 'DERIVED_FLAGS', 'DERIVED_NONEMPTY', 'DERIVED_EXPRS']) {
        JSON.stringify(orig[k]) === JSON.stringify(S[k]) ? P(`${k} identik`) : C(`${k} BEDA: ${JSON.stringify(orig[k])} vs ${JSON.stringify(S[k])}`);
    }
    String(orig.HELENA_RE) === String(port.HELENA_RE) ? P('HELENA_RE identik') : C('HELENA_RE BEDA');
}

// ============================================================================
// 3. INIT differential — handler chat:opened ASLI vs buildInitWrites port
// ============================================================================
const randKeys = ['LD_roll_1_500', 'LD_roll_1_100', 'LD_roll_1_111', 'LD_pick_1', 'LD_pick_2', 'LD_pick_3', 'LD_pick_4'];

function compareStores(mine, label) {
    // mine = hasil port (object), store = hasil asli (Map)
    const keys = new Set([...store.keys(), ...Object.keys(mine)]);
    let bad = 0;
    for (const k of keys) {
        const o = store.get(k), m = mine[k];
        if (randKeys.includes(k)) {
            if (k.startsWith('LD_roll_1_')) {
                const hi = Number(k.split('_')[3]); // LD_roll_1_500 → ['LD','roll','1','500']
                if (!(Number.isInteger(o) && o >= 1 && o <= hi && Number.isInteger(m) && m >= 1 && m <= hi)) { C(`${label}: ${k} di luar rentang (${o} / ${m})`); bad++; }
            } else {
                const opts = { LD_pick_1: 6, LD_pick_2: 4, LD_pick_3: 7, LD_pick_4: 6 }[k];
                if (o === undefined || m === undefined) { C(`${label}: ${k} hilang`); bad++; }
            }
            continue;
        }
        if (k === 'LD_time') continue; // jam dinding dua proses — format sama, nilai boleh geser menit
        if (k === 'LD_note_on') {
            // PERBAIKAN DISengaja: entry.js asli membaca getVarSafe('LD_note_on')
            // (dirinya sendiri — bug upstream, fitur note tak pernah aktif); port
            // membaca vars['note'] sesuai intent. Verifikasi semantik port di sini.
            const noteVal = String(mine['note'] ?? '').trim();
            if (m !== (noteVal.length > 0 ? 1 : 0)) { C(`${label}: LD_note_on port salah semantik (note=${JSON.stringify(mine['note'])} → ${m})`); bad++; }
            continue;
        }
        if (JSON.stringify(o) !== JSON.stringify(m)) { C(`${label}: ${k} BEDA: asli=${JSON.stringify(o)} port=${JSON.stringify(m)}`); bad++; }
    }
    return bad;
}

const preStates = [
    ['chat kosong', {}],
    ['sebagian terisi', { trpgmode: 1, note: 'halo', writing_mode: 3 }],
    ['string numerik korup (v1.0.0)', { writing_mode: '2', trpgmode: '1', customlength1: '300', SFW: '0' }],
    ['nilai null', { trpgmode: null, keywords: null, HELENA: null }],
    ['global profile aktif', { __global: { writing_mode: 5, mature: 2, note: 'global note' } }],
];
for (const [name, preRaw] of preStates) {
    const globalProf = preRaw.__global; const pre = { ...preRaw }; delete pre.__global;
    // --- asli ---
    store.clear(); globalStore.clear();
    for (const [k, v] of Object.entries(pre)) store.set(k, v);
    if (globalProf) globalStore.set('littledevil.global.defaults', globalProf); // stub global scope utk asli
    await handlers['chat:opened']({ chatId: 't-' + name });
    const origSnapshot = Object.fromEntries(store);
    // --- port ---
    const mineVars = { ...pre };
    const init = port.buildInitWrites(mineVars, globalProf ?? null);
    Object.assign(mineVars, init.writes);
    Object.assign(mineVars, port.computeDerivedWrites(mineVars, { messageCount: 0, now: new Date() }));
    // compare
    store.clear();
    for (const [k, v] of Object.entries(origSnapshot)) store.set(k, v);
    const bad = compareStores(mineVars, `init[${name}]`);
    if (!bad) P(`init[${name}]: ${Object.keys(origSnapshot).length} variabel — asli ≡ port`);
}

// ============================================================================
// 4. DERIVED differential — recomputeDerived ASLI vs computeDerivedWrites port
// ============================================================================
function randomizeStore() {
    store.clear();
    for (const k of S.SETTING_KEYS) {
        const d = S.DEFAULTS[k];
        if (typeof d === 'number') store.set(k, Math.random() < 0.5 ? 0 : Math.min(1, d));
        else if (k === 'antikeywords') store.set(k, Math.random() < 0.5 ? '' : '공범 안경 포식자 extra');
        else if (k === 'note') store.set(k, Math.random() < 0.5 ? '' : 'note text');
        else if (typeof d === 'string') store.set(k, Math.random() < 0.5 ? '' : 'teks-' + k);
        else store.set(k, d);
    }
    store.set('HELENA', 'FALSE'); store.set('genre_check', 0); store.set('util_speech', 'true');
}
for (let i = 0; i < 15; i++) {
    randomizeStore();
    msgCount = 1 + Math.floor(Math.random() * 500);
    const pre = Object.fromEntries(store);
    // asli
    await orig.recomputeDerived();
    const origSnapshot = Object.fromEntries(store);
    // port
    const mine = { ...pre };
    Object.assign(mine, port.computeDerivedWrites(mine, { messageCount: msgCount, now: new Date() }));
    store.clear();
    for (const [k, v] of Object.entries(origSnapshot)) store.set(k, v);
    const bad = compareStores(mine, `derived#${i}`);
    if (!bad) P(`derived#${i}: state acak ${Object.keys(pre).length} kunci — asli ≡ port`);
}

// ============================================================================
// 5. evalCalc differential — 1000 ekspresi acak
// ============================================================================
const OPS = ['+', '-', '*', '/', '%', '^', '<', '>', '≤', '≥', '=', '≠', '&', '|'];
function genExpr(depth) {
    if (depth <= 0 || Math.random() < 0.3) {
        const r = Math.random();
        if (r < 0.15) return '0';
        if (r < 0.3) return String(Math.floor(Math.random() * 1000));
        return String(Math.floor(Math.random() * 20)); // angka kecil lebih sering → cabang logika hidup
    }
    const r = Math.random();
    if (r < 0.15) return '(' + genExpr(depth - 1) + ')';
    if (r < 0.25) return '!' + genExpr(depth - 1);
    const op = OPS[Math.floor(Math.random() * OPS.length)];
    return genExpr(depth - 1) + op + genExpr(depth - 1);
}
let ecBad = 0;
for (let i = 0; i < 1000; i++) {
    const e = genExpr(3);
    let a, b;
    try { a = String(orig.evalCalc(e)); } catch (er) { a = 'THROW:' + er.message; }
    try { b = String(port.evalCalc(e)); } catch (er) { b = 'THROW:' + er.message; }
    if (a !== b) { ecBad++; if (ecBad <= 5) C(`evalCalc beda: "${e}" → asli=${a} port=${b}`); }
}
if (!ecBad) P('evalCalc: 1000 ekspresi acak — asli ≡ port');

// ============================================================================
// 6. DICE differential — seeded Math.random, hasil harus identik bit-per-bit
// ============================================================================
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const NOTATIONS = ['1d20', '1d100', '2d6', '4d10+3', '1d20-2', '10d10', '1d1000', '3d4+1'];
const MODES = ['normal', 'adv', 'dis', 'ADVANTAGE', 'garbage'];
let diceBad = 0, parseBad = 0;
for (let i = 0; i < 200; i++) {
    const notation = NOTATIONS[i % NOTATIONS.length];
    const mode = MODES[Math.floor(Math.random() * MODES.length)];
    const target = Math.random() < 0.4 ? null : Math.floor(Math.random() * 130);
    const label = 'QA';
    const system = i % 2 ? 'coc_low' : 'dnd_high';
    const input = { notation, label, target, system, roll_mode: mode, modifier: Math.floor(Math.random() * 6) - 2 };
    const seed = 1000 + i;
    Math.random = mulberry32(seed);
    let a; try { a = orig.resolveCheck(input); } catch (e) { a = 'THROW:' + e.message; }
    Math.random = mulberry32(seed);
    let b; try { b = port.resolveCheck(input); } catch (e) { b = 'THROW:' + e.message; }
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb) { diceBad++; if (diceBad <= 5) C(`resolveCheck beda (${i}): ${ja?.slice(0, 140)} vs ${jb?.slice(0, 140)}`); }
    // parseDiceRequest fuzz
    const raw = Math.random() < 0.7 ? `${notation}:${label}:${mode}:${target !== null ? 'DC ' + target : ''}` : ['', ':nolabel', '1d20', '1d20:' + 'x'.repeat(600), '1dXX:test', null][i % 6];
    let pa, pb;
    try { pa = JSON.stringify(orig.parseDiceRequest(raw)); } catch (e) { pa = 'THROW'; }
    try { pb = JSON.stringify(port.parseDiceRequest(raw)); } catch (e) { pb = 'THROW'; }
    if (pa !== pb) { parseBad++; if (parseBad <= 5) C(`parseDiceRequest beda: ${JSON.stringify(raw)?.slice(0, 60)} → ${pa} vs ${pb}`); }
}
if (!diceBad) P('resolveCheck: 200 kasus seeded — asli ≡ port (bit-per-bit)');
if (!parseBad) P('parseDiceRequest: fuzz 200 input — asli ≡ port (termasuk jalur throw)');

// formatDiceResult differential pada hasil seeded
Math.random = mulberry32(7);
const sample = orig.resolveCheck({ notation: '1d100', label: 'L', target: 50, system: 'coc_low', roll_mode: 'normal', modifier: 0 });
const fa = orig.formatDiceResult(sample), fb = port.formatDiceResult(sample);
fa === fb ? P('formatDiceResult identik: ' + fb.slice(0, 70)) : C(`formatDiceResult beda: "${fa}" vs "${fb}"`);

// extractDiceTags differential
const tagCases = [
    'x<DICE>1d20:Attack:DC:12</DICE>y', '<dice>1d100:Spot:LOW</dice>',
    'a<DICE>2d6:DMG</DICE>b<DICE>1d20:Save:DC:15:ADV</DICE>c', 'kosong', null, '',
];
let tagBad = 0;
if (String(orig.DICE_TAG_RE) === String(port.DICE_TAG_RE)) P('DICE_TAG_RE identik');
else { tagBad++; C(`DICE_TAG_RE beda: ${orig.DICE_TAG_RE} vs ${port.DICE_TAG_RE}`); }
for (const tc of tagCases) {
    // asli: ekstraksi inline pakai regex yang sama — replikasi logikanya
    const origExtract = c => { const tags = []; orig.DICE_TAG_RE.lastIndex = 0; let m; while ((m = orig.DICE_TAG_RE.exec(String(c ?? ''))) !== null) tags.push(m[1].trim()); return tags; };
    if (JSON.stringify(origExtract(tc)) !== JSON.stringify(port.extractDiceTags(tc ?? ''))) { tagBad++; C(`extractDiceTags beda: ${JSON.stringify(tc)}`); }
}
if (!tagBad) P(`extractDiceTags: ${tagCases.length} kasus — asli ≡ port`);

// ============================================================================
// 7. HELENA differential
// ============================================================================
const helenaCases = [
    ['Helena muncul di teks', true], ['헬레나가 온다', true], ['ヘレナです', true], ['へれな？', true],
    ['lowercase helena', true], ['tidak ada siapa-siapa', false], ['', false],
    [{ mes: 'objek dengan mes Helena' }, true, 'adaptasi-disengaja'], // format pesan TT (.mes) — asli Tavo tak punya
    [{ content: 'objek content 헬레나' }, true], [{ text: 'text へれな' }, true],
];
let hBad = 0;
for (const [text, expect, tag] of helenaCases) {
    store.set('HELENA', 'FALSE');
    messages = [typeof text === 'string' ? { content: text } : text];
    await orig.scanHelenaFull();
    const origVal = store.get('HELENA');
    const portWrite = port.scanHelenaMessages(messages);
    const portVal = portWrite ? portWrite.HELENA : 'FALSE';
    if (origVal !== portVal) {
        if (tag) { P(`HELENA [adaptasi disengaja]: format .mes TT — asli=${origVal} port=${portVal} (benar untuk TT)`); continue; }
        hBad++; C(`HELENA beda: "${typeof text === 'string' ? text.slice(0, 30) : '[obj]'}" asli=${origVal} port=${portVal}`);
    }
    else if ((origVal === 'TRUE') !== expect) { hBad++; C(`HELENA ekspektasi salah: ${text}`); }
}
if (!hBad) P(`HELENA: ${helenaCases.length} kasus (4 skrip bahasa + objek pesan) — asli ≡ port`);

// ============================================================================
console.log('\n════════ QA DIFFERENTIAL ════════');
console.log(`PASS: ${pass}  WARN: ${warn}  CRITICAL: ${crit}`);
process.exit(crit ? 1 : 0);
