# QA Report — Little Devil × TauriTavern Set (v1.3.2 + preset hotfix-2)

Tanggal QA: 22 September 2026 · Environment: Node 24, Playwright/Chromium, ejs 6 (simulator STPT), source TauriTavern 2.3.0 sebagai ground truth.

## Ringkasan eksekutif

| # | Suite | Cakupan | Hasil |
|---|---|---|---|
| 1 | `verify_imports` *(hardened v1.3.0)* | Semua relative import resolve ke file TT asli + **named exports** tervalidasi | ✅ 0 gagal |
| 2 | `qa_static` | JSON preset, prompt order, compile EJS per-prompt, coverage 112 kunci `getvar`, audit 1.565 perbandingan literal, drift opsi select vs dashboard asli, i18n, validasi 53 regex | ✅ 0 critical |
| 3 | `test_core` | Unit test logic inti (+4 scrub snapshot v1.3.1) | ✅ 29/29 |
| 4 | `qa_core_diff` | **Differential testing**: entry.js Tavo asli (di-stub) dijalankan berjajaran dengan port pada state acak | ✅ 40 pass, 0 critical |
| 5 | `qa_regex_sample` | Substitusi nyata 12 pola + audit `$N` capture references 53 script | ✅ 0 critical |
| 6 | `qa_render` | **Simulasi STPT**: 12.888 render EJS nyata × 7 skenario state + uji efektivitas kontrol | ✅ 0 critical, 31/31 select efektif |
| 7 | `qa_ui_e2e` | **Integrasi penuh**: `index.js` asli + mock ST di browser — event flow, dadu, profil global, migrasi tipe, diagnostik bridge | ✅ 24/24 *(6 flow v1.3.0 + 6 flow v1.3.1)* |
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

---

## Tambahan v1.3.1 — diagnostik bridge preset (TRPG mode)

**Laporan user**: toggle TRPG mode tidak mengubah perilaku model (juga variabel lain), curiga
karena tidak ada tombol save.

### Audit rantai variabel (dilakukan ulang terhadap source STPT asli `zonde306/ST-Prompt-Template` 1.17.9)
- `getvar()` tanpa scope membaca **scope `cache`** — hasil merge `extension_settings.variables.global`
  → `STATE.initialVariables` → **`chat_metadata.variables`** → snapshot per-pesan
  (`precacheVariables`); cache di-rebuild tiap `prepareContext()`. Jembatan extension → preset
  **benar** pada STPT 1.17.9.
- Snapshot per-pesan (`clonePreviousMessage`) hanya membawa kunci yang pernah di-`setvar` —
  preset Little Devil memakai **0× `setvar`** (1.872× `getvar`), jadi tidak ada shadow pada
  versi terbaru. Pada versi lama yang meng-clone variabel chat ke snapshot, shadow mungkin
  terjadi → diantisipasi dengan **scrub** (di bawah).
- Skenario yang menghasilkan gejala persis yang dilaporkan user: **STPT tidak ter-install /
  disabled / `generate_enabled` off** → semua `<% %>` dikirim mentah → semua kondisi gagal →
  "roleplay biasa" apa pun yang di-toggle.

### Perbaikan / fitur v1.3.1
1. **`detectStpt()` + status card integrasi** di menu (terdeteksi / enabled / generate off /
   aktif + seeded count + readout `trpgmode · HELENA · LD_msg`).
2. **Badge FAB amber + banner** saat bridge down.
3. **`syncSelfTest()`**: probe write/read-back/delete + scrub + toast `n/105`.
4. **`saveNow()`**: `saveMetadata()` langsung (import terverifikasi di `script.js` TT 2.3.0,
   line 11175) + fallback debounced.
5. **`scrubMessageVariables(chat, keys)`** (core.js, pure): hapus kunci milik preset dari
   snapshot `chat[i].variables` (normalisasi bentuk legacy, abaikan junk, aman frozen).
   Dipanggil di `setVar` (kunci setting), `applyGlobal`, `resetChat`, `syncSelfTest`.
6. **Boot safety net**: seed + inject UI saat module load bila chat sudah terbuka.
7. i18n +14 kunci ×2 bahasa; pulse commit kini `✓ key = value`.

### Hasil regresi penuh (v1.3.1)
| Suite | Hasil |
|---|---|
| `verify_imports` | ✅ ALL IMPORTS VERIFIED (termasuk `saveMetadata` baru) |
| `test_core` | ✅ 29/29 (+4 scrub: foreign-key preserved, legacy shape, no-op, frozen) |
| `test_dice_card` | ✅ 25/25 |
| `qa_core_diff` | ✅ 40 pass, 0 critical |
| `qa_regex_sample` | ✅ 0 critical |
| `qa_render` | ✅ 0 critical |
| `qa_static` | ✅ 0 critical |
| `test_ui` | ✅ 17/17 |
| `test_ui_dashboard` | ✅ ALL (ekspektasi SVG FAB 3→4: + warn badge) |
| `qa_ui_e2e` | ✅ 24/24 (+6: status ok/down, sync test, save-now, pulse commit, scrub snapshot) |

## Tambahan v1.3.2 — dice display hardening (bubble kosong)

**Laporan user**: hasil roll tampil **kosong** di bubble user; inspect memperlihatkan marker
`<DiceCard label="Arcana" sys="D&amp;D" … total="23" …/>` mentah. Chip `<DICE>` di pesan GM
juga tampil sebagai teks polos, bukan chip.

### Akar masalah (terverifikasi terhadap source TT 2.3.0)
- Rendering kartu diserahkan ke 3 script regex (`#51–53`, ditambah belakangan). Install yang
  belum meng-import pack regex terbaru tidak punya script itu sama sekali.
- `script.js messageFormatting()` → regex tidak menemukan script → tag `<DiceCard/>` lolos ke
  showdown + DOMPurify → **tag custom self-closing tanpa isi di-strip** → bubble kosong.
  (Pada `<DICE>…</DICE>` isi teksnya selamat → tampil sebagai teks polos. Kedua gejala cocok.)
- Konfirmasi pipeline: pesan user → placement `USER_INPUT (1)` + `isMarkdown:true` — script
  `markdownOnly` memang dijalankan engine (`engine.js isRegexScriptActiveForParams`) — jadi
  begitu script ADA, rendering pasti jalan.

### Perbaikan v1.3.2
1. **Fix A — self-install**: `ensureDiceRegexScripts()` (index.js) meng-upsert 3 script dadu ke
   `extension_settings.regex` saat boot. Id/scriptName identik dengan pack import → tidak pernah
   duplikat; definisi lama diperbarui otomatis; flag `disabled` pilihan user dipertahankan.
2. **Fix B — fallback DOM**: `scanDiceBubbles()` + MutationObserver (debounce 250 ms) pada
   `#chat`; bubble yang raw-nya masih memuat marker tapi TIDAK memuat signature
   `data-ld-dice-request/card/free` dicat ulang via `renderDiceContent()`; fingerprint
   `data-ld-dice-fallback` mencegah loop render.
3. **Single source of truth**: builder `diceChipHtml / diceCardHtml / diceFreeHtml` (core.js)
   menghasilkan HTML untuk replaceString regex (via token `$1`–`$8`) DAN fallback DOM — pack
   import, self-install, dan fallback dijamin identik.
4. `update_dice_regex_json.mjs` meregenerasi 3 entri di `regex/Little_Devil_Regex_Scripts_TT_Import.json`
   langsung dari `core.js` (chip ternyata sudah identik byte-per-byte; card/free +signature).

### Hasil regresi penuh (v1.3.2)
| Suite | Hasil |
|---|---|
| `verify_imports` | ✅ ALL IMPORTS VERIFIED |
| `test_dice_render_132` (baru) | ✅ **54/54** — marker persis dari screenshot user (`&amp;`, `·`), 8 capture group, replacement bertanda tanda, fallback DOM non-kosong, escaping aman, marker rusak tidak meledak, kontrak engine TT lengkap, upsert idempotent (refresh +3 → run ke-2 = 0) |
| `test_core` | ✅ 29/29 |
| `test_dice_card` | ✅ 25/25 |
| `test_ui` | ✅ 17/17 |
| `test_ui_dashboard` | ✅ ALL |
| `qa_core_diff` | ✅ 40 pass, 0 critical |
| `qa_regex_sample` | ✅ 0 critical |
| `qa_render` | ✅ 0 critical |
| `qa_static` | ✅ 0 critical (+regex compile OK) |
| `qa_ui_e2e` | ✅ 24/24 |

Catatan environment: `npm install ejs playwright` + `npx playwright install chromium` +
static server port 8123 diperlukan untuk suite UI (harness `scripts/ui_test_harness.html`).

## Tambahan preset hotfix-2 — duplikasi sheet {{user}}/{{char}} di context log (laporan user)

**Gejala** (context log.txt): sheet persona & deskripsi char muncul dua kali — ber-wrapper di
tengah (entri preset `ld-user`/`ld-char` di dalam `<Lore>`) dan mentah di blok `[system]`
terakhir (urutan: deskripsi char → persona, tanpa wrapper).

**Trace ke source TT 2.3.0 (ground truth):**

| Langkah | Bukti |
|---|---|
| TT selalu membuat prompt mentah `charDescription` | `openai.js:2298` (array `systemPrompts`) |
| `personaDescription` dibuat saat persona position = IN_PROMPT (default) | `openai.js:2352–2361` + `power-user.js:124/323` |
| Marker tak ada di prompt_order → di-append di akhir koleksi | `openai.js:2403–2410` (`else prompts.add(newPrompt)`) |
| Identifier tak ada di order → dianggap AKTIF | `PromptManager.js:1073–1077` (`return false`) |
| Urutan blok akhir (char → persona) cocok dengan log | merge order `systemPrompts` array |
| Prompt kosong difilter (scenario/charPersonality kosong tak terlihat) | `openai.js:5491–5495` (`getChat`) |

**Fix & verifikasi** (`scripts/fix_preset_sheet_duplication.mjs`, idempotent):

- 5 marker bawaan TT ditambahkan ke `prompts` (bentuk identik default TT: `marker: true`,
  `system_prompt: true`) dan ke `prompt_order` (character_id 100001):
  `worldInfoAfter` **aktif** tepat setelah `worldInfoBefore`; `charDescription`,
  `charPersonality`, `scenario`, `personaDescription` **nonaktif**.
- Simulasi semantik TT pada hasil patch: `charDescription/charPersonality/scenario/
  personaDescription → skipped`, `worldInfoAfter → sent` ✅ (sesuai ekspektasi anti-duplikat).
- Urutan & flag 38 entri ld-* tidak berubah (assert head order byte-per-byte) ✅.
- Prompt order tanpa definisi tidak bermasalah; di sini definisi juga ditambahkan sehingga
  marker terlihat di Prompt Manager UI dan tahan terhadap prune ✅.
- JSON final valid; `prompt_order` bebas identifier dobel ✅.

## v1.3.3 — fallback DOM non-destruktif (formatting bubble aman)

**Laporan user**: bubble yang memuat dice roll merender `<font color=…>`, code block, inline
code sebagai teks mentah (`Screenshot_2026-09-22-18-53-08`).

**Trace akar masalah (source TT 2.3.0 + extension v1.3.2)**:

| Fakta | Bukti |
|---|---|
| Fallback v1.3.2 menimpa seluruh `.mes_text` dari teks mentah | `index.js:306` `textEl.innerHTML = renderDiceContent(raw)` |
| `renderDiceContent` meng-escape semua segmen non-marker | `core.js` `escapeDisplayText` (`<` → `&lt;`) |
| Fallback aktif hanya bila regex path tidak melukis signature | guard `querySelector('[data-ld-dice-request]…')` |
| Regex path gagal bila extension Regex dimatikan | `engine.js:480` `disabledExtensions.includes('regex')` → `return` |
| `data-*` lolos DOMPurify (default) — signature valid bila regex jalan | config `messageFormatting` tidak mengubah `ALLOW_DATA_ATTR` |
| Bubble roll-request = narasi kaya format + `<DICE>` di ujung | screenshot user: `<font>` raw, `§…§`, ``` blok |

**Fix (v1.3.3)**:

- `isMarkersOnlyBody()` — bedakan marker murni (repaint penuh, aman) vs campuran.
- `renderDiceMarkersInto()` — bedah presisi pada DOM terformat: residu `formula:label`
  (whitespace-flex) atau bentuk literal `<DICE>…</DICE>` (encode_tags/code block) diganti
  chip/kartu via `Range`; marker tanpa residu di-append; guard idempoten (signature check)
  mencegah dobel.
- `scanDiceBubbles()` — cabang per jenis bubble + deteksi paint visual-token gradient
  (tahan bila `data-*` di-strip host).

**Bukti test** (`qa/scripts/test_dice_fallback_133.mjs`, Chromium asli, core.js ES module):

- Scenario A = bubble persis screenshot user: 1 chip dilukis di paragraf terakhir (posisi
  residu), `<font>` tetap 2 elemen & tidak ter-escape, `<pre><code>` utuh, teks code tak berubah ✅
- B literal `&lt;DICE&gt;` terganti; C literal di dalam `<code>` terganti ✅
- D kartu tanpa residu di-append, narasi utuh; E residu whitespace-flex cocok; F 2 marker →
  2 chip, residu telanjang hilang; G entity (`&amp;`) cocok setelah decode ✅
- H idempotent (panggil ulang tidak mendobel); I chip membawa signature klik ✅
- 21/21 pass; tanpa pageerror ✅

**Regresi penuh**: verify_imports ALL ✓, test_core 29/29, test_dice_card 25/25,
test_dice_render_132 54/54, test_ui 17/17, test_ui_dashboard ALL, qa_ui_e2e 24/24,
qa_core_diff 40/0/0, qa_regex_sample 0 critical, qa_render 8/0/0, qa_static 0 critical ✅
