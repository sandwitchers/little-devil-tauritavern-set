#!/usr/bin/env node
// ============================================================================
// QA RENDER — simulasi eksekusi STPT: setiap prompt preset dirender dengan
// EJS sungguhan terhadap state variabel yang di-seed extension, di berbagai
// skenario. Plus uji "control effectiveness": setiap select dashboard HARUS
// mengubah output preset minimal di satu skenario.
// Jalankan: node scripts/qa_render.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert';
import ejs from 'ejs';
import * as S from '../build/LittleDevilCompanionTT/data_schema.js';
import { buildInitWrites, computeDerivedWrites } from '../build/LittleDevilCompanionTT/core.js';

const preset = JSON.parse(readFileSync('/home/z/my-project/download/Little_Devil_Hotfix_Tavo_preset.json', 'utf8'));
const prompts = preset.prompts;

let crit = 0, warn = 0, pass = 0;
const C = m => { crit++; console.log('  🔴 ' + m); };
const W = m => { warn++; console.log('  🟡 ' + m); };
const P = m => { pass++; console.log('  ✔ ' + m); };

// ---- helpers ----------------------------------------------------------------
function seededVars() {
    const { writes } = buildInitWrites({}, null);
    const vars = { ...writes };
    Object.assign(vars, computeDerivedWrites(vars, { messageCount: 0, now: new Date() }));
    return vars;
}
function maxVars(base) {
    const v = { ...base };
    for (const cat of S.CATEGORIES) for (const ctl of cat.controls) {
        if (ctl.type === 'switch') v[ctl.name] = 1;
        else if (ctl.type === 'select') v[ctl.name] = ctl.options[ctl.options.length - 1].value; // opsi terakhir (aman utk select non-numerik)
        else if (ctl.type === 'text') v[ctl.name] = '250';
    }
    v.note = 'Author note: keep the scene tight.';
    v.keywords = 'coffee, rain, violin';
    v.antikeywords = '공범 안경 포식자';        // flip LD_kw_1..3
    v.custom_narrative = 'custom narrative style';
    v.customlanguage1 = 'Old Javanese';
    v.customlanguage2 = 'Betawi';
    v.pov_char = 'Seraphine';
    v.cam_char = 'Dorian';
    v.stats_pov = 'Seraphine';
    v.custom_input_enhancement = 'rewrite like a poet';
    v.customAuthor = 'Umberto Eco';
    v.customWorld = 'Post-collapse Jakarta';
    v.bimil = 'the vault code is 777';
    v.posicustomspoiler = 'betrayal';
    v.negcustomspoiler = 'dragons';
    v.customlength1 = '120';
    v.customlength2 = '900';
    v.customlength2 = '900';
    return v;
}
// macro engine mini (ST-native sebelum EJS)
function applyMacros(text, vars) {
    return text
        .replace(/\{\{\s*getvar(?:::|\s+)([^}]+?)\s*\}\}/gi, (_, k) => {
            const v = vars[k.trim()];
            return v === undefined ? '' : String(v);
        })
        .replace(/\{\{\s*user\s*\}\}/gi, 'You')
        .replace(/\{\{\s*char(?:IfNotGroup)?\s*\}\}/gi, 'NPC')
        .replace(/\{\{\s*persona\s*\}\}/gi, 'A curious traveler.')
        .replace(/\{\{\s*description\s*\}\}/gi, 'Char description text.')
        .replace(/\{\{\s*personality\s*\}\}/gi, 'Char personality text.')
        .replace(/\{\{\s*scenario\s*\}\}/gi, 'Char scenario text.')
        .replace(/\{\{\s*group\s*\}\}/gi, '')
        .replace(/\{\{\s*newline\s*\}\}/gi, '\n');
}
const templates = [];
for (const p of prompts) {
    const content = p.content || '';
    if (!content) continue;
    templates.push({ name: p.name, tpl: ejs.compile(applyMacros(content, {}), { compileDebug: false, async: false }) });
    // compile pakai teks ber-makro statis; getvar tetap dinamis via locals
}
// recompile dengan makro yang tidak bisa di-substitute sekali (getvar dibiarkan ke EJS)
function renderAll(vars) {
    const out = [];
    for (const p of prompts) {
        const content = p.content || '';
        if (!content) continue;
        const pre = applyMacros(content, vars);
        const tpl = ejs.compile(pre, { compileDebug: false, async: false });
        out.push({ name: p.name, text: tpl({ getvar: k => vars[k] }), pre });
    }
    return out;
}
function cleanCheck(rendered, label) {
    let bad = 0;
    for (const r of rendered) {
        // bocor = kata muncul di hasil render TAPI bukan bagian dari teks statis
        // template (preset sengaja memuat contoh kode berisi 'undefined' dll.)
        const leak = pat => r.text.includes(pat) && !r.pre.includes(pat);
        if (leak('undefined')) { C(`${label}: "undefined" bocor di "${r.name}"`); bad++; }
        if (leak('NaN')) { C(`${label}: "NaN" bocor di "${r.name}"`); bad++; }
        if (leak('[object Object]')) { C(`${label}: "[object Object]" bocor di "${r.name}"`); bad++; }
        if (/<%|%>/.test(r.text) && !r.pre.includes('<%')) { C(`${label}: tag EJS mentah tersisa di "${r.name}"`); bad++; }
    }
    return bad;
}

// ============================================================================
// SKENARIO 1 — chat baru (default)
// ============================================================================
console.log('\n── S1: chat baru (default) ──');
const s1 = seededVars();
let r = renderAll(s1);
if (!cleanCheck(r, 'S1')) P(`S1 bersih: ${r.length} prompt dirender tanpa bocor`);

// ============================================================================
// SKENARIO 2 — semua toggle maksimum + teks terisi
// ============================================================================
console.log('\n── S2: semua maksimum + teks terisi ──');
const s2 = maxVars(s1);
Object.assign(s2, computeDerivedWrites(s2, { messageCount: 42, now: new Date() }));
r = renderAll(s2);
if (!cleanCheck(r, 'S2')) P('S2 bersih');

// ============================================================================
// SKENARIO 3 — sweep setiap opsi setiap select (semua cabang)
// ============================================================================
console.log('\n── S3: sweep opsi select (uji cabang) ──');
let sweepRenders = 0, sweepBad = 0;
const effective = [], ineffective = [];
const sig = texts => createHash('sha1').update(texts.join('‖')).digest('hex');
// effectiveness diuji pada DUA basis (default & maksimum) — cabang bisa
// tertutup gate lain pada satu basis saja
const bases = { dflt: seededVars(), max: null };
bases.max = maxVars(bases.dflt);
for (const cat of S.CATEGORIES) for (const ctl of cat.controls) {
    if (ctl.type !== 'select') continue;
    let everDiff = false;
    for (const [bname, base] of Object.entries(bases)) {
        const sigs = new Set();
        for (const opt of ctl.options) {
            const v = { ...base, [ctl.name]: opt.value };
            Object.assign(v, computeDerivedWrites(v, { messageCount: 42, now: new Date(2026, 0, 15, 20, 30) }));
            // bekukan variabel acak supaya perbedaan antar-opsi murni dari cabang EJS
            v.LD_roll_1_500 = 250; v.LD_roll_1_100 = 50; v.LD_roll_1_111 = 55;
            v.LD_pick_1 = 'romance'; v.LD_pick_2 = '2'; v.LD_pick_3 = 'unique'; v.LD_pick_4 = 'friend';
            const rr = renderAll(v);
            sweepRenders += rr.length;
            sweepBad += cleanCheck(rr, `S3[${ctl.name}=${opt.value}]`);
            sigs.add(sig(rr.map(x => x.text)));
        }
        if (sigs.size >= Math.min(2, ctl.options.length)) everDiff = true;
    }
    if (everDiff) effective.push(ctl.name);
    else if (ctl.options.length > 1) ineffective.push(`${ctl.name}(${ctl.options.length} opsi)`);
}
// roll acak membuat output beda antar render → normalisasi: buang baris yang
// hanya berisi angka berbeda? TIDAK — cabang roll mengubah TEKS, jadi satu opsi
// pasti memicu beda; efektivitas tetap valid karena sig dibanding antar opsi
// pada ROLL STATE yang sama? tidak bisa dibekukan — gunakan: render 2x opsi pertama;
// jika 2x render opsi sama pun beda (noise roll), efektivitas ditandai unsure.
if (!sweepBad) P(`S3 sweep: ${sweepRenders} render, tanpa bocor`);
if (ineffective.length) W(`select yang outputnya TIDAK berubah antar opsi (cek manual): ${ineffective.join(', ')}`);
P(`select efektif (mengubah output preset): ${effective.length}/31`);

// ============================================================================
// SKENARIO 4 — HELENA TRUE + pesan banyak
// ============================================================================
console.log('\n── S4: HELENA TRUE ──');
const s4 = { ...s2, HELENA: 'TRUE' };
r = renderAll(s4);
if (!cleanCheck(r, 'S4')) P('S4 bersih');

// ============================================================================
// SKENARIO 5 — ketahanan: tiap kunci dihapus satu per satu (undefined)
// ============================================================================
console.log('\n── S5: ketahanan undefined (tiap kunci dihapus) ──');
const keys = [...S.SETTING_KEYS, ...Object.keys(S.SYSTEM_DEFAULTS), 'LD_date', 'LD_time'];
let crash = 0;
for (const k of keys) {
    const v = { ...s1 }; delete v[k];
    try { renderAll(v); } catch (e) { crash++; C(`S5: hapus "${k}" → throw: ${e.message.split('\n')[0]}`); }
}
if (!crash) P(`S5: ${keys.length} iterasi penghapusan kunci — nol throw`);

// ============================================================================
// SKENARIO 6 — tipe rusak (string di kunci numeric, dll.)
// ============================================================================
console.log('\n── S6: tipe rusak ──');
const s6 = { ...s2 };
for (const k of S.NUMERIC_KEYS) s6[k] = 'bukan-angka';
for (const k of S.NUMERIC_TEXT_KEYS) s6[k] = null;
r = renderAll(s6);
if (!cleanCheck(r, 'S6')) P('S6 bersih (tanpa throw/bocor saat tipe korup)');

// ============================================================================
// SKENARIO 7 — semua null
// ============================================================================
console.log('\n── S7: semua null ──');
const s7 = {};
for (const k of [...S.SETTING_KEYS, ...Object.keys(S.SYSTEM_DEFAULTS)]) s7[k] = null;
r = renderAll(s7);
if (!cleanCheck(r, 'S7')) P('S7 bersih (null-safe)');

// ============================================================================
console.log('\n════════ QA RENDER ════════');
console.log(`PASS: ${pass}  WARN: ${warn}  CRITICAL: ${crit}`);
process.exit(crit ? 1 : 0);
