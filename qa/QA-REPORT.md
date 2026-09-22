# QA Report — Little Devil × TauriTavern Set (v1.2.2)

Tanggal QA: 22 September 2026 · Environment: Node 24, Playwright/Chromium, ejs 6 (simulator STPT), source TauriTavern 2.3.0 sebagai ground truth.

## Ringkasan eksekutif

| # | Suite | Cakupan | Hasil |
|---|---|---|---|
| 1 | `verify_imports` | Semua relative import resolve ke file TT asli + **named exports** tervalidasi | ✅ 0 gagal |
| 2 | `qa_static` | JSON preset, prompt order, compile EJS per-prompt, coverage 112 kunci `getvar`, audit 1.565 perbandingan literal, drift opsi select vs dashboard asli, i18n, validasi 51 regex | ✅ 0 critical |
| 3 | `test_core` | Unit test logic inti | ✅ 25/25 |
| 4 | `qa_core_diff` | **Differential testing**: entry.js Tavo asli (di-stub) dijalankan berjajaran dengan port pada state acak | ✅ 40 pass, 0 critical |
| 5 | `qa_regex_sample` | Substitusi nyata 12 pola + audit `$N` capture references 51 script | ✅ 0 critical |
| 6 | `qa_render` | **Simulasi STPT**: 12.888 render EJS nyata × 7 skenario state + uji efektivitas kontrol | ✅ 0 critical, 31/31 select efektif |
| 7 | `qa_ui_e2e` | **Integrasi penuh**: `index.js` asli + mock ST di browser — event flow, dadu, profil global, migrasi tipe | ✅ 12/12 |
| 8 | `test_ui` | Dashboard unit E2E (desktop + mobile 540×1237@1.33) | ✅ 17/17 |

**Status akhir: LOLOS SEMUA SUITE — 0 critical, 0 warn terbuka.**

## Bug yang ditemukan & diperbaiki selama QA

### 🔴 CRIT-1: `index.js` meng-import nama yang tidak diekspor `core.js` (v1.2.1)
`index.js` meng-import `SETTING_KEYS, DEFAULTS` dari `./core.js`, padahal `core.js` hanya
meng-import keduanya dari `data_schema.js` tanpa re-export → **dynamic import tetap akan
gagal di TauriTavern meskipun perbaikan path v1.2.1 sudah benar** (gejala yang sama:
"Failed to fetch dynamically imported module").
- **Akar masalah keterlambatan deteksi**: unit test hanya memuat `core.js`/`ui.js`
  secara langsung; graph modul `index.js` tidak pernah dieksekusi.
- **Perbaikan**: import diarahkan ke `./data_schema.js` + `verify_imports` diperkuat
  agar memvalidasi named exports modul lokal juga.
- **Pelajaran**: ditemukan oleh harness integrasi baru (`qa_ui_e2e`) yang memuat
  `index.js` ASLI dengan mock `script.js`/`extensions.js` pada struktur path yang
  sama persis dengan TT.

### 🔧 FIX-2 (bug upstream Tavo v1.2.0, diperbaiki di port): `LD_note_on` membaca dirinya sendiri
`recomputeDerived` asli memanggil `getVarSafe('LD_note_on')` — membaca **nilai kunci
hasilnya sendiri**, bukan sumbernya (`note`). Akibatnya di plugin Tavo asli, flag
author-note **tidak pernah aktif** (blok author note di preset tak pernah muncul).
Port membaca `vars['note']` sesuai intent yang terdokumentasi di kode aslinya
("1 when the source text var has trimmed content"). Verifikasi semantik ditambahkan
di `qa_core_diff` (note kosong → 0, terisi → 1).

### 🔧 FIX-3 (adaptasi disengaja, terdokumentasi): dukungan field pesan `.mes`
Pembaca pesan asli hanya mengenali `.content`/`.text` (format Tavo). Port menambahkan
`.mes` (format pesan SillyTavern/TauriTavern) sehingga HELENA scan bekerja di TT.

## Verifikasi fidelity terhadap plugin/preset asli

- **Data schema**: `SETTING_KEYS` (105), `NUMERIC_KEYS` (84), `NUMERIC_TEXT_KEYS` (4),
  `DEFAULTS`, `SYSTEM_DEFAULTS`, `DERIVED_ROLLS/PICKS/FLAGS/NONEMPTY/EXPRS`, `HELENA_RE`,
  `DICE_TAG_RE` — **identik deep-Equal** dengan `entry.js` asli.
- **Evaluator `evalCalc`/RPN**: 1.000 ekspresi acak (14 operator, unary, nested parens)
  → output asli ≡ port.
- **Init & migrasi**: 5 skenario state (kosong / sebagian / string numerik korup v1.0.0 /
  null / profil global) → 124 variabel hasil asli ≡ port.
- **Derived recompute**: 15 state acak (roll, pick, tanggal/jam, keyword Korea, note,
  ekspresi `LD_x1`) → asli ≡ port (LD_note_on dikecualikan — lihat FIX-2).
- **Dadu**: 200 kasus seeded (Math.random PRNG sama) → hasil asli ≡ port **bit-per-bit**,
  termasuk jalur throw untuk notasi invalid; CoC low/D&D high, ADV/DIS, DC, critical/fumble.
- **Regex**: 51 script konversi 1:1 dengan upload asli (nama + pola identik),
  semua `findRegex` compile, placement `[2]` sesuai asli, tidak ada `$N` yang melebihi
  capture group.

## Cakupan skenario render (simulasi STPT)

| Skenario | State | Hasil |
|---|---|---|
| S1 | Chat baru (default 105 kunci) | Bersih |
| S2 | Semua toggle ON + semua teks terisi (Korea/emoji) | Bersih |
| S3 | Sweep **semua opsi × semua 31 select × 2 basis** (12.888 render) | Bersih, 31/31 select mengubah output preset |
| S4 | `HELENA='TRUE'` | Bersih |
| S5 | Tiap kunci dihapus satu per satu (112 iterasi) — ketahanan `undefined` | Nol throw |
| S6 | Tipe rusak (string di kunci numeric, null di numeric-text) | Bersih |
| S7 | Semua kunci `null` | Bersih (null-safe) |

Bocor "undefined"/"NaN" dipantau dengan baseline teks statis template (false positive
seperti contoh kode `SECRET_PAYLOAD = undefined;` yang memang bagian prosa preset
terfilter otomatis).

## Hal yang diketahui (bukan bug)

1. **Dead branch upstream**: `getvar("writing_style") === 6` tidak pernah terpicu karena
   dashboard asli Tavo juga hanya punya opsi 0–5. Port mempertahankan perilaku yang sama
   (fidelity); tidak ada kehilangan fungsionalitas.
2. **"Hide Tips" regex adalah no-op by design** (`$&` + `promptOnly`) — sesuai asli;
   skrip ini tampaknya memang disediakan untuk diedit pengguna.
3. **4 kunci yang tampak "tidak dibaca"** (`customlength1`, `fthink_min`, `speech_variance`,
   `note`) ternyata dibaca via makro native `{{getvar::...}}` — terkonfirmasi ter-coverage.

## Cara mereproduksi

```bash
npm install playwright ejs
node qa/scripts/verify_imports.mjs     # import path + named exports
node qa/scripts/qa_static.mjs          # audit statis preset + schema + i18n + regex
node qa/scripts/test_core.mjs          # unit core
node qa/scripts/qa_core_diff.mjs       # differential vs entry.js asli (butuh analysis/tpg_extract/entry.js)
node qa/scripts/qa_regex_sample.mjs    # smoke substitusi regex
node qa/scripts/qa_render.mjs          # render EJS 12.888× (butuh ejs)
node qa/scripts/qa_ui_e2e.mjs          # integrasi browser (butuh playwright)
node qa/scripts/test_ui.mjs            # dashboard E2E (butuh playwright + scripts/ui_harness)
```
