#!/usr/bin/env node
// ============================================================================
// QA STATIS — preset Little Devil + extension schema + i18n + regex scripts.
// Jalankan: node scripts/qa_static.mjs
// Output: laporan temuan per kategori, exit 1 jika ada temuan CRITICAL.
// ============================================================================
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import ejs from 'ejs';
import * as S from '../build/LittleDevilCompanionTT/data_schema.js';
import { L10N } from '../build/LittleDevilCompanionTT/data_i18n.js';

const PRESET_PATH = '/home/z/my-project/download/Little_Devil_Hotfix_Tavo_preset.json';
const REGEX_PATH = '/home/z/my-project/download/Little_Devil_Regex_Scripts_TT_Import.json';

const findings = { critical: [], warn: [], info: [] };
const crit = (cat, msg) => findings.critical.push(`[${cat}] ${msg}`);
const warn = (cat, msg) => findings.warn.push(`[${cat}] ${msg}`);
const info = (cat, msg) => findings.info.push(`[${cat}] ${msg}`);

// ---- load ------------------------------------------------------------------
const preset = JSON.parse(readFileSync(PRESET_PATH, 'utf8'));
const regexFile = JSON.parse(readFileSync(REGEX_PATH, 'utf8'));

const derivedKeys = [
    ...Object.keys(S.DERIVED_ROLLS), ...Object.keys(S.DERIVED_PICKS),
    ...Object.keys(S.DERIVED_FLAGS), ...Object.keys(S.DERIVED_NONEMPTY),
    ...Object.keys(S.DERIVED_EXPRS), 'LD_date', 'LD_time',
];
const coveredKeys = new Set([
    ...S.SETTING_KEYS, ...Object.keys(S.SYSTEM_DEFAULTS), ...derivedKeys,
]);
const stringKeys = new Set([
    ...Object.keys(S.DEFAULTS).filter(k => typeof S.DEFAULTS[k] === 'string'),
    ...Object.keys(S.SYSTEM_DEFAULTS).filter(k => typeof S.SYSTEM_DEFAULTS[k] === 'string'),
    ...Object.keys(S.DERIVED_PICKS), // picks store strings
]);
const numericKeys = new Set([
    ...S.NUMERIC_KEYS, ...S.NUMERIC_TEXT_KEYS,
    ...Object.keys(S.DERIVED_ROLLS), ...Object.keys(S.DERIVED_FLAGS),
    ...Object.keys(S.DERIVED_NONEMPTY), ...Object.keys(S.DERIVED_EXPRS),
    'LD_date', 'LD_time', 'LD_msg', 'genre_check',
]);

// opsi select per kontrol (untuk drift check)
const selectOptions = {};
for (const cat of S.CATEGORIES) for (const ctl of cat.controls) {
    if (ctl.type === 'select') selectOptions[ctl.name] = ctl.options.map(o => o.value);
}

// opsi select DASHBOARD TAVO ASLI (ground truth) — dari floating-dashboard.html
const origHtml = readFileSync('/home/z/my-project/analysis/tpg_extract/ui/floating-dashboard.html', 'utf8');
const origSelectOptions = {};
for (const [, name, opts] of origHtml.matchAll(/"name":\s*"([A-Za-z_0-9]+)",[^{}]*?"type":\s*"select",[^{}]*?"options":\s*\[([^\]]+)\]/g)) {
    origSelectOptions[name] = [...opts.matchAll(/"value":\s*"?(-?[A-Za-z0-9_.]+)"?/g)].map(m => m[1]);
}
info('drift', `dashboard asli: ${Object.keys(origSelectOptions).length} select, port: ${Object.keys(selectOptions).length} select`);
for (const [name, vals] of Object.entries(origSelectOptions)) {
    const mine = (selectOptions[name] || []).map(String);
    const lost = vals.filter(v => !mine.includes(v));
    if (lost.length) crit('drift', `porting HILANG opsi select "${name}": [${lost}] (asli: [${vals}])`);
    const extra = mine.filter(v => !vals.includes(v));
    if (extra.length) warn('drift', `port menambah opsi select "${name}": [${extra}] (tidak ada di asli)`);
}
for (const name of Object.keys(selectOptions)) {
    if (!(name in origSelectOptions)) crit('drift', `select "${name}" ada di port tapi TIDAK ADA di dashboard asli`);
}

// ============================================================================
// 1. INTEGRITAS PRESET
// ============================================================================
info('preset', `prompt_count = ${preset.prompts.length}, order = ${preset.prompt_order[0].order.length}`);

const orderIds = preset.prompt_order[0].order.map(o => o.identifier);
const promptIds = preset.prompts.map(p => p.identifier);
for (const id of orderIds) if (!promptIds.includes(id)) crit('preset', `order identifier tidak ada di prompts: ${id}`);
for (const id of promptIds) if (!orderIds.includes(id)) warn('preset', `prompt tidak masuk prompt_order: ${id}`);
const dupOrder = orderIds.filter((v, i) => orderIds.indexOf(v) !== i);
if (dupOrder.length) crit('preset', `identifier dobel di prompt_order: ${dupOrder.join(', ')}`);

for (const p of preset.prompts) {
    if (p.injection_position !== undefined && ![0, 1].includes(p.injection_position)) crit('preset', `injection_position aneh di "${p.name}": ${p.injection_position}`);
    if (p.role && !['system', 'user', 'assistant'].includes(p.role)) crit('preset', `role aneh di "${p.name}": ${p.role}`);
    if (typeof p.content !== 'string' && !p.marker) warn('preset', `content bukan string: "${p.name}"`);
}

// ============================================================================
// 2. EJS — COMPILE SEMUA BLOK (simulasi parse STPT)
// ============================================================================
const allContents = preset.prompts.map(p => p.content || '')
    .concat([preset.impersonation_prompt, preset.new_chat_prompt, preset.new_group_chat_prompt,
             preset.continue_nudge_prompt, preset.group_nudge_prompt, preset.personality_format,
             preset.scenario_format, preset.wi_format, preset.new_example_chat_prompt])
    .filter(c => typeof c === 'string');

const blockRe = /<%[\s\S]*?%>/g;
const blocks = new Set();
for (const c of allContents) for (const m of c.matchAll(blockRe)) blocks.add(m[0]);
info('ejs', `total blok unik: ${blocks.size}`);

// compile per-PROMP UTUH (fidelity dengan STPT yang me-render tiap prompt
// secara independen — braces if/else/} balance antar-blok dalam satu prompt)
let compileFail = 0;
const contentsWithEjs = allContents.filter(c => c.includes('<%'));
info('ejs', `prompt ber-EJS: ${contentsWithEjs.length}`);
contentsWithEjs.forEach((c, i) => {
    try {
        ejs.compile(c, { compileDebug: false, async: false });
    } catch (e) {
        compileFail++;
        crit('ejs', `prompt #${i} gagal compile: ${e.message.split('\n')[0]} | blok: ${(c.match(blockRe) || ['?']).slice(0, 3).join(' ').slice(0, 100)}`);
    }
});
if (!compileFail) info('ejs', `semua ${contentsWithEjs.length} prompt ber-EJS compile OK (per-prompt utuh)`);

// ============================================================================
// 3. getvar COVERAGE (kunci paling kritikal)
// ============================================================================
const literalGetvars = new Set();
const dynamicGetvars = [];
for (const c of allContents) {
    for (const m of c.matchAll(/getvar\(\s*(['"])([^'"]+?)\1\s*\)/g)) literalGetvars.add(m[2]);
    for (const m of c.matchAll(/getvar\(\s*(?!['"])[A-Za-z_$][\w$]*/g)) dynamicGetvars.push(m[0]);
}
info('getvar', `kunci literal unik: ${literalGetvars.size}, pemanggilan dinamis: ${dynamicGetvars.length}`);

const uncovered = [...literalGetvars].filter(k => !coveredKeys.has(k));
if (uncovered.length) {
    for (const k of uncovered) crit('getvar', `kunci "${k}" TIDAK di-seed extension → undefined di EJS`);
} else {
    info('getvar', 'SEMUA kunci getvar ter-coverage oleh init + derived extension');
}

const deadKeys = S.SETTING_KEYS.filter(k => !literalGetvars.has(k));
if (deadKeys.length) warn('getvar', `kunci schema tak pernah dibaca preset (${deadKeys.length}): ${deadKeys.join(', ')}`);

// pembanding === / !== : konsistensi tipe + drift opsi select
const cmpRe = /getvar\(\s*(['"])([^'"]+?)\1\s*\)\s*(===|!==|==|!=)\s*(?:([0-9]+)|(['"])([^'"]*?)\5|(true|false|null|undefined))/g;
let cmpCount = 0;
const nullChecked = new Set();
for (const c of allContents) {
    for (const m of c.matchAll(cmpRe)) {
        cmpCount++;
        const key = m[2], op = m[3];
        if (m[7] === 'null' || m[7] === 'undefined') { nullChecked.add(key); continue; }
        if (m[7]) { crit('type', `getvar("${key}") ${op} boolean — schema tidak menyimpan boolean: ${m[0].slice(0, 60)}`); continue; }
        if (m[4] !== undefined) {
            const num = Number(m[4]);
            if (stringKeys.has(key) && !numericKeys.has(key)) crit('type', `getvar("${key}") ${op} angka ${num} tapi key bertipe string`);
            if (selectOptions[key]) {
                const mineHas = selectOptions[key].map(String).includes(String(num));
                const origHas = (origSelectOptions[key] || []).includes(String(num));
                if (!mineHas && origHas) crit('drift', `getvar("${key}") ${op} ${num} — preset memakai nilai yang HILANG dari dashboard port (asli punya!)`);
                else if (!mineHas && !origHas) info('drift', `getvar("${key}") ${op} ${num} — dead branch upstream (dashboard asli juga tak punya); fidelity terjaga`);
            }
        } else {
            const str = m[6];
            if (numericKeys.has(key) && !stringKeys.has(key)) {
                // numeric keys dibanding string — curiga, tapi bisa disengaja (mis. String(getvar()))
                warn('type', `getvar("${key}") ${op} string "${str}" padahal numeric: ${m[0].slice(0, 70)}`);
            }
            if (selectOptions[key]) {
                const asNum = Number(str);
                if (selectOptions[key].some(v => String(v) === str || v === asNum)) { /* match */ }
                else warn('drift', `getvar("${key}") ${op} "${str}" — tidak cocok opsi select manapun`);
            }
        }
    }
}
info('cmp', `${cmpCount} perbandingan literal diaudit (${nullChecked.size} kunci pakai null-check)`);
for (const k of nullChecked) if (!coveredKeys.has(k)) crit('nullcheck', `null-check pada kunci tak ter-coverage: "${k}" — undefined !== null = TRUE, logika bisa terbalik`);

// macro native {{getvar::x}} / {{getvar x}}
const macroGetvar = new Set();
for (const c of allContents) {
    for (const m of c.matchAll(/\{\{\s*getvar(?:::|\s+)([^}]+?)\s*\}\}/gi)) macroGetvar.add(m[1].trim());
}
info('macro', `kunci {{getvar}} native: ${[...macroGetvar].join(', ')}`);
// kunci yang dianggap "mati" tapi mungkin dibaca via macro native
const deadReal = deadKeys.filter(k => !macroGetvar.has(k));
if (deadReal.length !== deadKeys.length) info('getvar', `dari dead keys, ${deadKeys.length - deadReal.length} ternyata dibaca via {{getvar}} native`);
const macroUncovered = [...macroGetvar].filter(k => !coveredKeys.has(k));
if (macroUncovered.length) crit('macro', `{{getvar}} tak ter-coverage: ${macroUncovered.join(', ')}`);
else info('macro', `${macroGetvar.size} kunci {{getvar}} native semua ter-coverage`);

// ============================================================================
// 4. MAKRO INVENTORY (harus didukung TT/ST)
// ============================================================================
const KNOWN_MACROS = new Set(['user', 'char', 'charIfNotGroup', 'group', 'persona', 'time', 'date', 'weekday',
    'datetimeformat', 'idle_duration', 'input_sequence', 'reverse', 'comment', 'random', 'roll', 'pick',
    'setvar', 'getvar', 'getglobalvar', 'addvar', 'incvar', 'decvar', 'lastMessage', 'firstIncludedMessageId',
    'lastUserMessage', 'lastCharMessage', 'endTimeWhenGen, time', 'model', 'vendor', 'messages', 'persona_description',
    'charVersion', 'char_prompt', 'persona_prompt', 'description', 'personality', 'scenario', 'system_prompt',
    'post_history_instructions', 'forumExample', 'nonPresets', 'char_prefix', 'emptyWaitInput', 'original',
    'newline', 'trim', 'trimInclusive', 'noop', 'showGeoLoc', 'uptime', 'jailbreak', 'examples', 'wiki',
    'third_pixel', 'createTimeWhenGen', 'waitInput', 'header', 'footer', 'middle', 'resetState']);
const macroUse = {};
for (const c of allContents) {
    for (const m of c.matchAll(/\{\{\s*([a-zA-Z_]+)(?:::|\s|\}\})/g)) {
        macroUse[m[1]] = (macroUse[m[1]] || 0) + 1;
    }
}
for (const [name, n] of Object.entries(macroUse)) {
    if (!KNOWN_MACROS.has(name)) warn('macro', `makro tidak dikenal (dicek manual ke ST/TT): {{${name}}} ×${n}`);
}
info('macro', `makro terpakai: ${Object.entries(macroUse).map(([k, v]) => `${k}×${v}`).join(', ')}`);

// ============================================================================
// 5. I18N COMPLETENESS
// ============================================================================
const needKeys = new Set();
for (const cat of S.CATEGORIES) {
    needKeys.add(cat.nameKey);
    for (const ctl of cat.controls) {
        needKeys.add('var.' + ctl.name);
        if (ctl.type === 'select') for (const o of ctl.options) needKeys.add(o.labelKey);
    }
}
for (const lang of ['id', 'en']) {
    const miss = [...needKeys].filter(k => !(k in L10N[lang]));
    if (miss.length) crit('i18n', `(${lang}) kunci hilang: ${miss.join(', ')}`);
    else info('i18n', `(${lang}) ${needKeys.size} kunci schema lengkap`);
}
// runtime keys dipakai di ui.js/index.js
const usedRuntime = new Set();
for (const f of ['ui.js', 'index.js']) {
    const src = readFileSync('/home/z/my-project/build/LittleDevilCompanionTT/' + f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*['"]([a-z][\w.]*[\w])['"]/g)) usedRuntime.add(m[1]);
}
for (const lang of ['id', 'en']) {
    const miss = [...usedRuntime].filter(k => !(k in L10N[lang]));
    if (miss.length) crit('i18n', `(${lang}) runtime key hilang: ${miss.join(', ')}`);
    else info('i18n', `(${lang}) ${usedRuntime.size} runtime key lengkap`);
}

// ============================================================================
// 6. REGEX SCRIPTS (import file + banding embedded preset)
// ============================================================================
const scripts = Array.isArray(regexFile) ? regexFile : (regexFile.scripts ?? regexFile.regex_scripts ?? []);
info('regex', `script di file import: ${scripts.length}`);
const names = new Set();
let reFail = 0;
scripts.forEach((r, i) => {
    if (!r.scriptName) crit('regex', `script #${i} tanpa scriptName`);
    if (names.has(r.scriptName)) warn('regex', `nama dobel: ${r.scriptName}`);
    names.add(r.scriptName);
    if (typeof r.findRegex !== 'string' || !r.findRegex) { crit('regex', `"${r.scriptName}" findRegex kosong`); reFail++; return; }
    try {
        const m = r.findRegex.match(/^\/(.+)\/([gimsuy]*)$/s);
        new RegExp(m ? m[1] : r.findRegex, m ? m[2] : 'g');
    } catch (e) { crit('regex', `"${r.scriptName}" regex invalid: ${e.message}`); reFail++; }
    if (r.placement !== undefined && !Array.isArray(r.placement)) warn('regex', `"${r.scriptName}" placement bukan array`);
    if (r.trimStrings !== undefined && !Array.isArray(r.trimStrings)) warn('regex', `"${r.scriptName}" trimStrings bukan array`);
});
if (!reFail && scripts.length) info('regex', `semua findRegex compile OK`);

// cross-check file import vs UPLOAD ASLI user (Little_Devil_Regex_Scripts_English.json)
try {
    const orig = JSON.parse(readFileSync('/home/z/my-project/upload/Little_Devil_Regex_Scripts_English.json', 'utf8'));
    const origArr = Array.isArray(orig) ? orig : (orig.scripts ?? orig.regex_scripts ?? []);
    const origNames = new Set(origArr.map(r => r.scriptName));
    const convNames = new Set(scripts.map(r => r.scriptName));
    const lost = [...origNames].filter(n => !convNames.has(n));
    const added = [...convNames].filter(n => !origNames.has(n));
    if (lost.length) warn('regex', `script asli HILANG saat konversi: ${lost.join(', ')}`);
    if (added.length) warn('regex', `script tambahan (bukan di asli): ${added.join(', ')}`);
    if (!lost.length && !added.length) info('regex', `konversi 1:1 dengan upload asli (${origArr.length} script)`);
    // banding pola regex per nama
    let patDiff = 0;
    for (const o of origArr) {
        const c = scripts.find(s => s.scriptName === o.scriptName);
        if (c && String(c.findRegex) !== String(o.findRegex)) {
            patDiff++;
            warn('regex', `pola berubah pada "${o.scriptName}" (konversi placement/trim saja seharusnya)`);
        }
    }
    if (!patDiff) info('regex', `semua pola regex identik dengan asli`);
} catch (e) { info('regex', `upload asli tidak bisa dibaca: ${e.message}`); }

// embedded di preset (dari Tavo export) — banding jumlah & nama
if (Array.isArray(preset.regex_scripts)) {
    const emb = preset.regex_scripts;
    info('regex', `embedded di preset: ${emb.length}`);
    const embNames = new Set(emb.map(r => r.scriptName || r.scriptName));
    const missing = [...names].filter(n => !embNames.has(n));
    const extra = [...embNames].filter(n => !names.has(n));
    if (missing.length) warn('regex', `ada di file import tapi tidak di embedded: ${missing.join(', ')}`);
    if (extra.length) warn('regex', `ada di embedded tapi tidak di file import: ${extra.join(', ')}`);
    if (!missing.length && !extra.length) info('regex', `file import = embedded preset (1:1, ${emb.length} script)`);
}

// ============================================================================
// REPORT
// ============================================================================
console.log('\n════════ QA STATIS — LAPORAN ════════');
console.log(`CRITICAL: ${findings.critical.length}`);
findings.critical.forEach(s => console.log('  🔴 ' + s));
console.log(`WARN: ${findings.warn.length}`);
findings.warn.forEach(s => console.log('  🟡 ' + s));
console.log(`INFO/PASS: ${findings.info.length}`);
findings.info.forEach(s => console.log('  ✔ ' + s));
console.log('══════════════════════════════════════');
process.exit(findings.critical.length ? 1 : 0);
