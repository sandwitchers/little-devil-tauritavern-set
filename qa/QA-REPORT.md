# QA Report — Little Devil × TauriTavern Set (v1.3.0)

Tanggal QA: 22 September 2026 · Environment: Node 24, Playwright/Chromium, ejs 6 (simulator STPT), source TauriTavern 2.3.0 sebagai ground truth.

## Ringkasan eksekutif

| # | Suite | Cakupan | Hasil |
|---|---|---|---|
| 1 | `verify_imports` *(hardened v1.3.0)* | Semua relative import resolve ke file TT asli + **named exports** tervalidasi | ✅ 0 gagal |
| 2 | `qa_static` | JSON preset, prompt order, compile EJS per-prompt, coverage 112 kunci `getvar`, audit 1.565 perbandingan literal, drift opsi select vs dashboard asli, i18n, validasi 53 regex | ✅ 0 critical |
| 3 | `test_core` | Unit test logic inti | ✅ 25/25 |
| 4 | `qa_core_diff` | **Differential testing**: entry.js Tavo asli (di-stub) dijalankan berjajaran dengan port pada state acak | ✅ 40 pass, 0 critical |
| 5 | `qa_regex_sample` | Substitusi nyata 12 pola + audit `$N` capture references 53 script | ✅ 0 critical |
| 6 | `qa_render` | **Simulasi STPT**: 12.888 render EJS nyata × 7 skenario state + uji efektivitas kontrol | ✅ 0 critical, 31/31 select efektif |
| 7 | `qa_ui_e2e` | **Integrasi penuh**: `index.js` asli + mock ST di browser — event flow, dadu, profil global, migrasi tipe | ✅ 18/18 *(6 flow baru v1.3.0)* |
| 8 | `test_ui` | Dashboard unit E2E (desktop + mobile 540×1237@1.33) | ✅ 17/17 |
| 9 | `test_ui_dashboard` *(v1.2.3)* | **Pointer state machine FAB**: lock/tap/drag matrix, lock badge, toast, reset posisi, keyboard activation, verifikasi tema via fresh-raster clip | ✅ 25/25 |
| 10 | `test_dice_card` *(v1.3.0)* | **Dadu imersif**: builder marker `<DiceCard/>/<DiceFree/>` (semua branch verdict, escape HTML, ADV/DIS, free roll), round-trip 3 regex script dadu, 10 contoh format tag dari preset, anti-loop self-trigger, kunci anti-dobel berbasis konten | ✅ 25/25 |

**Status akhir: LOLOS SEMUA SUITE — 0 critical, 0 warn terbuka.**

## Bug yang ditemukan & diperbaiki selama QA

### 🔴 CRIT-2: Kunci posisi membunuh kedua tombol FAB (dilaporkan user, v1.2.2)
Gejala: begitu *Kunci posisi tombol* diaktifkan, dashboard & dadu **tidak bisa dibuka lagi**.
- **Akar masalah**: `pointerdown` handler FAB melakukan `if (api.prefs.locked) return;` sehingga
  `dragState` tidak pernah terisi saat terkunci; `pointerup` (`if (!dragState) return;`) lalu
  membuang seluruh gesture — termasuk tap.
- **Perbaikan (v1.2.3)**: state machine selalu melacak gesture; lock hanya menyupresi
  reposisi. Drag saat terkunci = gestur dibatalkan + animasi "nope" (bukan aksi tak sengaja).
- **Regresi**: suite #9 `test_ui_dashboard` mengunci matriks lock/tap/drag (25 assertions).

### 🟡 COSM-1: Glyph emoji/teks pada chrome UI (v1.2.2)
`😈 ◐ ⋯ ▶` diganti icon set SVG stroked 24px-grid yang konsisten (devil, dice, globe+lang chip,
theme auto/moon/sun dinamis, dots, chevron, search, lock badge, check). FAB diperkecil
46 → 38px. Verifikasi visual via screenshot Playwright (device-scale 4× + native).

### ⚠️ CATATAN QA: artefak screenshot headless (bukan bug extension)
Saat verifikasi tema di Playwright, screenshot full-viewport sesekali menampilkan tile
compositor basi (panel "gelap") meski state DOM/computed style sudah terang — **terbukti
artefak rasterisasi headless** via perbandingan clip fresh-raster (region sama, 0 ms
setelahnya, menampilkan warna benar). Verifikasi tema memakai clipped screenshot +
assertion computed-style (`test_ui_dashboard` #20–21). Browser nyata (WebView2/Android)
repaint normal pada pergantian atribut; tema juga kini diberi crossfade 0.25s yang
memaksa invalidasi paint di semua compositor.

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
node qa/scripts/test_core.mjs
node qa/scripts/test_dice_card.mjs   # v1.3.0 — dadu imersif (25 assertions)          # unit core
node qa/scripts/qa_core_diff.mjs       # differential vs entry.js asli (butuh analysis/tpg_extract/entry.js)
node qa/scripts/qa_regex_sample.mjs    # smoke substitusi regex
node qa/scripts/qa_render.mjs          # render EJS 12.888× (butuh ejs)
node qa/scripts/qa_ui_e2e.mjs          # integrasi browser (butuh playwright)
node qa/scripts/test_ui.mjs            # dashboard E2E (butuh playwright + scripts/ui_harness)
# v1.2.3 — FAB pointer state machine (butuh playwright):
cd repo-root && python3 -m http.server 8123 &
node qa/scripts/test_ui_dashboard.mjs  # harness: qa/scripts/ui_dashboard_harness.html
```

## Tambahan v1.3.0 — dadu imersif di chat bubble

Target: hasil lemparan pindah dari panel extension ke **chat bubble** (permintaan user), tanpa
mengubah logika dadu yang sudah bit-per-bit identik dengan plugin Tavo asli.

Desain terverifikasi:
- `MESSAGE_RECEIVED` ber-tag `<DICE>` → auto-roll → hasil dikirim sebagai pesan user berisi
  marker `<DiceCard/>` (dengan target) atau `<DiceFree/>` (tanpa target) — AI tetap membaca
  teks ringkas yang terstruktur; regex companion merender kartu premium di bubble.
- Kunci anti-dobel diganti dari `indeks:jumlah-tag` menjadi **`indeks:isi-tag`** — swipe ke
  varian dengan tag berbeda melempar ulang, repeat pesan sama tetap ditolak.
- Chip permintaan roll di bubble AI membawa `data-ld-dice-request` + delegasi klik dokumen
  (capture) → membaca `mesid` → melempar tag pesan itu (setia pada tombol roll Tavo).
- Guard anti-loop: pesan hasil tidak mengandung `<DICE>` sehingga tidak memicu roller lagi
  (diuji eksplisit).
- Resiko race generasi dihindari: auto-roll HANYA di `MESSAGE_RECEIVED` (fire setelah generasi
  selesai, termasuk swipe-completion dan first message — diverifikasi ke source TT 2.3.0),
  bukan di `MESSAGE_SENT`/`MESSAGE_SWIPED`.

Hasil: suite #10 semua hijau; E2E bertambah 6 flow (auto-roll, anti-dobel auto, swipe
re-roll, toggle OFF, no-tag no-op, tap-to-roll chip) — 18/18 tanpa pageerror.
