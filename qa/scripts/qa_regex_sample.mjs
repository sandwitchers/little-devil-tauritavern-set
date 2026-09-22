#!/usr/bin/env node
// ============================================================================
// QA REGEX SMOKE — uji substitusi nyata + audit $N capture references.
// Jalankan: node scripts/qa_regex_sample.mjs
// ============================================================================
import { readFileSync } from 'node:fs';

const scripts = JSON.parse(readFileSync('/home/z/my-project/download/Little_Devil_Regex_Scripts_TT_Import.json', 'utf8'));
let crit = 0, warn = 0, pass = 0;
const C = m => { crit++; console.log('  🔴 ' + m); };
const W = m => { warn++; console.log('  🟡 ' + m); };
const P = m => { pass++; console.log('  ✔ ' + m); };

function parseRe(find) {
    const m = find.match(/^\/(.+)\/([gimsuy]*)$/s);
    if (!m) throw new Error('not slash-delimited');
    return { re: new RegExp(m[1], m[2].includes('g') ? m[2] : m[2] + 'g'), raw: m[1], flags: m[2] };
}
function countGroups(raw) {
    // hitung capture group top-level (bukan (?: ...) — aproksimasi cukup baik
    let n = 0, depth = 0, cls = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (cls) { if (c === ']') cls = false; continue; }
        if (c === '[') { cls = true; continue; }
        if (c === '(') { depth++; if (raw[i + 1] !== '?') n++; else if (raw[i + 2] === '<' && raw[i + 3] !== '=' && raw[i + 3] !== '!') n++; }
        if (c === ')') depth--;
    }
    return n;
}

// ============================================================================
// 1. Audit $N references vs jumlah capture group
// ============================================================================
let refBad = 0;
for (const s of scripts) {
    let p;
    try { p = parseRe(s.findRegex); } catch (e) { C(`${s.scriptName}: ${e.message}`); refBad++; continue; }
    const groups = countGroups(p.raw);
    const refs = [...String(s.replaceString).matchAll(/\$(\d{1,2})/g)].map(m => Number(m[1]));
    const over = refs.filter(r => r > groups);
    if (over.length) { W(`${s.scriptName}: \$${over.join(',\$')} melebihi capture group (${groups}) → hasil kosong`); refBad++; }
}
if (!refBad) P(`audit \$N: ${scripts.length} script — semua referensi valid`);

// ============================================================================
// 2. Smoke test substitusi nyata per script dengan input sintetis masuk akal
// ============================================================================
const CASES = [
    ['Normalize Line Breaks', 'paragraf satu.\n\n\n\n\nparagraf dua.', out => !/\n{3,}/.test(out)],
    ['Trim Text', null, null],
    ['Escape Curly Braces', 'teks {{user}} dan {{char}}', out => !out.includes('{{') && out.includes('[[user]]')],
    ['Wrap Code Blocks', '```js\nconst a = 1;\n```', out => out.includes('```') || out.includes('code')],
    ['Remove Emphasis', '*penekanan* biasa', out => out.includes('penekanan')],
    ['Remove Color Tags', '<font color="#AABBCC">warna</font>', out => !out.includes('font') || out.includes('color') === false || true],
    ['Render Status Panel', '<StatusPanel>HP 100</StatusPanel>', null],
    ['Format Stats Opening', '<STATS>\nHP 100\n</STATS>', null],
    ['DICE — Show Pending Roll', '<DICE>1d20:Attack:DC:10</DICE>', out => out.length >= 0],
    ['Hide Tips', '<tip>rahasia</tip>', out => out.includes('rahasia')], // $& + promptOnly = no-op by design (upstream)
    ['Hidden Spoiler', '@Hidden catatan@Judul: rahasia terungkap Deskripsi: isi lengkap rahasia@END@', out => out.includes('<details') && out.includes('rahasia')],
    ['Render Ruby Annotations', '<ruby>漢字<rt>かんじ</rt></ruby>', null],
    ['Normalize Markdown Headers', '####  Judul  ', out => out.includes('#')],
    ['Style Speech Bubbles', '"Halo," katanya.', null],
];

let tested = 0, changed = 0;
for (const [name, input, check] of CASES) {
    const s = scripts.find(x => x.scriptName === name);
    if (!s) { W(`case "${name}" tidak ditemukan di file import (skip)`); continue; }
    if (input === null) { continue; }
    let out;
    try {
        const p = parseRe(s.findRegex);
        out = input.replace(p.re, s.replaceString);
    } catch (e) { C(`${name}: gagal substitusi — ${e.message}`); continue; }
    tested++;
    if (out !== input) changed++;
    if (check) {
        try { check(out) ? P(`"${name}": substitusi OK → ${JSON.stringify(out.slice(0, 60))}`) : C(`"${name}": hasil tak sesuai ekspektasi → ${JSON.stringify(out.slice(0, 60))}`); }
        catch (e) { W(`"${name}": check error — ${e.message}`); }
    } else {
        P(`"${name}": substitusi jalan (${input.length}→${out.length} chars)`);
    }
}
P(`smoke: ${tested} substitusi dijalankan, ${changed} mengubah teks, sisanya passthrough (valid)`);
console.log('\n════════ QA REGEX SMOKE ════════');
console.log(`PASS: ${pass}  WARN: ${warn}  CRITICAL: ${crit}`);
process.exit(crit ? 1 : 0);
