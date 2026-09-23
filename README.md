# Little Devil × TauriTavern Set

Porting lengkap **Little Devil v16 (Hotfix Tavo Port)** + **Companion plugin** (dari `.tpg` Tavo) ke **TauriTavern**, juga kompatibel dengan SillyTavern standar.

```
Preset JSON ────────→ TT Prompt Manager (apa adanya, 38 prompt + 5 marker TT)
ST-Prompt-Template ─→ mengeksekusi 3.435 blok EJS (getvar + if/else)
Companion Extension ─→ init 105 variabel typed + derived vars + dice + dashboard
Regex Scripts ──────→ Regex extension (53 script, sekali import)
```

Variabel preset (`LD_*` + 105 toggle) disimpan di `chat_metadata.variables` — terbaca
sekaligus oleh `getvar()` EJS (ST-Prompt-Template, scope local) **dan** macro native `{{getvar}}`.

---

## Isi repo

| Path | Isi |
|---|---|
| `dist/LittleDevilCompanionTT-1.3.0.zip` | **Paket siap install** (import ZIP dari panel Extensions) |
| `extension/LittleDevilCompanionTT/` | Source code companion extension (unminified, bisa dimodifikasi) |
| `preset/Little_Devil_Hotfix_Tavo_preset.json` | Preset 38 prompt + 5 marker bawaan TT (hotfix-2) — import ke Prompt Manager |
| `regex/Little_Devil_Regex_Scripts_TT_Import.json` | 53 regex script — import ke extension Regex |
| `qa/QA-REPORT.md` | Laporan QA lengkap (8 suite, differential testing vs plugin asli) |
| `qa/scripts/` | Script QA yang bisa direproduksi |

## Requirement

- **TauriTavern** 2.3.0+ (atau SillyTavern 1.12+)
- **ST-Prompt-Template** extension — enabled (eksekutor EJS `<% %>` di preset)
- Tidak terikat model tertentu — preset bersifat universal (Gemini, Claude, dll.)

## Instalasi (urut dari atas)

### 1. Extension Companion
1. Buka panel **Extensions** (ikon puzzle) → **Import extension** (from ZIP).
2. Pilih `dist/LittleDevilCompanionTT-1.3.1.zip`.
3. Aktifkan **Little Devil Companion (TT)**.

> **Upgrade dari versi lama / pernah gagal load?** Import ZIP baru akan menimpa file lama.
> Kalau masih error: **hapus folder `LittleDevilCompanionTT` lama sampai bersih** → import ulang
> ZIP → reload app. Sejak v1.3.0 kamu tidak perlu lagi mem-patch `core.js` secara manual —
> patch re-export `SETTING_KEYS/DEFAULTS` sudah diadopsi ke upstream.

### 2. Preset
1. Buka **AI Response Configuration** → **Preset Manager**.
2. **Import** → `preset/Little_Devil_Hotfix_Tavo_preset.json`.
3. Aktifkan preset **Little Devil (Hotfix Tavo Port)**. Set parameter model (temp, max tokens) sesuai selera.

### 3. Regex Scripts
1. Panel **Extensions** → **Regex** → **Import Script**.
2. Pilih `regex/Little_Devil_Regex_Scripts_TT_Import.json` (53 script masuk sekaligus) — scope **Global**.
   Termasuk 3 script dadu: *Request Chip*, *Result Card*, *Free Roll*.

> **Sejak v1.3.2 langkah ini opsional** — extension otomatis meng-install & memperbarui 3 script
> dadu itu sendiri saat boot (tidak ada lagi bubble kosong karena pack regex belum di-import;
> fallback renderer internal menjamin marker dadu selalu tampil sebagai kartu). Import manual
> tetap berguna kalau kamu ingin menyesuaikan tampilan kartu lewat UI Regex.

### 4. Cek ST-Prompt-Template
Pastikan statusnya **enabled** di panel Extensions.

---

## Cara pakai

- **Dashboard melayang** — tombol 😈 kanan-bawah. Bisa digeser (drag), posisi diingat.
- **104 toggle + 1 catatan dalam 12 seksi** — perubahan **tersimpan otomatis** (pulse
  "✓ trpgmode = 1" menampilkan variabel & nilai yang baru di-commit). Angka kecil di tiap
  seksi = jumlah toggle yang berbeda dari default. Mau tetap pakai tombol simpan?
  **Menu ⋯ → Simpan sekarang** melakukan flush langsung (`saveMetadata`).
- **Status integrasi (v1.3.1)** — **Menu ⋯** membuka kartu status: apakah
  **ST-Prompt-Template terdeteksi & aktif**, berapa variabel preset yang sudah ter-seed
  (`105/105`), dan nilai live `trpgmode / HELENA / LD_msg`. Kalau bridge down, badge
  peringatan amber muncul di tombol 😈 + banner di panel.
- **Pencarian** — kotak cari memfilter semua variabel (nama/label).
- **🎲 Dadu imersif di chat bubble (v1.3.0)** — tidak perlu buka dashboard lagi:
  - AI meminta check dengan tag `<DICE>notation:label:target[:LOW][:ADV|DIS]</DICE>` → tag otomatis
    dirender **kartu permintaan roll** di bubble AI (chip premium, bisa **di-tap untuk melempar**).
  - **Auto-roll aktif secara default**: begitu pesan AI masuk, dadu dilempar otomatis dan hasilnya
    dikirim ke chat sebagai **kartu dadu premium** (label, formula, angka besar, badge verdict
    SUCCESS/HARD SUCCESS/CRITICAL/FUMBLE berwarna, pill CoC/D&D + ADV/DIS) — lalu AI melanjutkan
    narasi berdasarkan hasilnya.
  - Kartu hasil dirender oleh regex script (*Dice Result Card / Free Roll*) — **sejak v1.3.2**
    script-script itu di-install otomatis oleh extension (dan ada fallback renderer internal),
    jadi hasil roll **tidak akan pernah tampil sebagai bubble kosong** walau pack regex belum
    di-import / regex dimatikan. Teks mentah yang dilihat AI tetap ringkas dan terstruktur.
  - Anti dobel berbasis konten: pesan yang sama tidak dilempar ulang; **swipe** ke varian dengan
    tag berbeda otomatis melempar ulang.
  - Matikan lewat **Menu ⋯ → Auto-lempar dadu ke chat** (lempar manual via tombol 🎲 di FAB
    atau tap chip roll di bubble).
- **Menu ⋯** header: **status integrasi + uji sinkronisasi + simpan sekarang (v1.3.1)** ·
  buka/tutup semua seksi · auto-lempar dadu · kunci posisi fab ·
  **simpan/terapkan default global** · reset chat ke default preset.
- **Tema & bahasa** — ikon ◐ (auto/gelap/terang) dan 🌐 (Auto/ID/EN).

## Perilaku otomatis

- **Chat dibuka**: seed 105 variabel bertipe (angka tetap angka — penting untuk `===` ketat di EJS),
  hitung variabel turunan (`LD_roll_*`, `LD_pick_*`, `LD_date/LD_time`, `LD_msg`, `LD_kw_*`, `LD_note_on`, `LD_x1`),
  lalu **HELENA scan** 300 pesan terakhir (sticky, sekali saja).
- **Tiap pesan terkirim/terima**: variabel turunan di-refresh otomatis; pesan AI berisi tag
  `<DICE>` langsung di-roll otomatis (bisa dimatikan) dan hasilnya masuk chat sebagai kartu.

## Changelog

### v1.3.3 — "formatting bubble jadi raw kalau ada dice roll"
- **Laporan user**: di turn yang ada dice roll-nya, render chat bubble **pecah** —
  `<font color=…>`, code block, inline code, dsb. tampil **mentah** (screenshot
  `Screenshot_2026-09-22-18-53-08`); hanya terjadi pada bubble yang memuat marker dadu.
- **Akar masalah**: fallback DOM v1.3.2 (Fix B) menimpa **seluruh** `.mes_text` dengan
  `renderDiceContent(raw)` — teks pesan mentah di-escape semua (`<` → `&lt;` dst). Untuk bubble
  hasil roll (isinya murni marker) ini aman, tapi bubble **roll request** berisi narasi kaya
  format + tag `<DICE>` di ujungnya → seluruh formatting musnah jadi teks mentah. Fallback ini
  aktif ketika jalur regex tidak mengecat signature (mis. extension Regex dimatikan, atau definisi
  belum ter-install).
- **Fix — fallback non-destruktif**:
  - `isMarkersOnlyBody()` (core.js) membedakan bubble **marker murni** (hasil roll → repaint
    penuh, perilaku v1.3.2 dipertahankan) dari bubble **campuran** (narasi + marker).
  - `renderDiceMarkersInto()` (core.js) — mode **bedah presisi**: mem-patch bubble yang SUDAH
    diformat host di tempat, mengganti hanya teks sisa marker (residu `formula:label` setelah
    DOMPurify men-strip tag, atau bentuk literal `<DICE>…</DICE>` saat encode_tags/code block)
    dengan chip/kartu premium. `<font>`, `<pre><code>`, markdown, dan rendering regex/theme
    lain **tidak tersentuh sama sekali**.
  - Marker tanpa residu (kartu self-closing yang lenyap utuh) di-append di akhir bubble.
  - Guard idempoten + fingerprint + deteksi paint via visual-token gradient (tahan bila host
    men-strip `data-*`).
- **Kenapa chip bisa tidak terlukis di device user**: jalur regex hanya jalan bila extension
  **Regex** aktif (`disabledExtensions` tidak memuat `regex` — engine.js:480 TT 2.3.0). Kalau
  dimatikan, sekarang fallback menampilkan chip TANPA merusak formatting; nyalakan kembali
  extension Regex untuk jalur render penuh.
- QA: **+21 test** (`qa/scripts/test_dice_fallback_133.mjs`) — mereplikasi bubble persis dari
  screenshot user di Chromium asli (core.js dimuat sebagai ES module): `<font>`/`<pre><code>`
  utuh, residu terganti chip pada posisinya, literal escaped & entity tetap cocok, multi-marker,
  idempotent, tanpa pageerror. Semua suite lama tetap hijau (verify_imports, core 29, dice_card
  25, dice_render_132 54, UI 17+25, e2e 24, differential 40, regex/render/static 0 critical).

### Preset hotfix-2 — "sheet {{user}} & {{char}} dobel di context log"
- **Laporan user**: di context log, sheet {{user}} (persona) dan {{char}} (deskripsi) muncul
  **dua kali** — versi ber-wrapper (`<Players Character>` / `<NPC setting>`) di tengah konteks
  (posisi entri preset `## {{user}}` / `## {{char}}`), lalu **versi mentah tanpa wrapper lagi
  di blok [system] paling akhir**.
- **Akar masalah** (diverifikasi ke source TT 2.3.0): TT **selalu** menyiapkan prompt mentah
  `charDescription` (openai.js:2298) dan `personaDescription` (openai.js:2359; default
  *persona description position* = *In prompt*, power-user.js:323). Karena prompt order preset
  **tidak memuat marker** `charDescription`/`personaDescription` (juga `charPersonality`,
  `scenario`, `worldInfoAfter`), merge loop openai.js:2408–2409 **meng-append-nya di akhir
  koleksi**, dan `isPromptDisabledForActiveCharacter` (PromptManager.js:1073) mengembalikan
  `false` untuk identifier yang tidak ada di order → prompt mentah itu **ikut terkirim** sebagai
  blok [system] terakhir = duplikat.
- **Fix**: preset kini menyertakan 5 marker bawaan TT di `prompts` + `prompt_order`:
  `worldInfoAfter` (aktif — konvensi ST; kosong = otomatis difilter), dan
  `charDescription` / `charPersonality` / `scenario` / `personaDescription` **nonaktif**
  (sheet memang sudah dirender oleh entri preset `ld-user`/`ld-char`). Dengan entri nonaktif di
  order, `addToChatCompletion` melewati prompt mentah tersebut → tidak ada lagi injeksi di akhir.
- **Validasi**: simulasi semantik TT (skip/append/filter) lolos; urutan 38 entri ld-* tidak
  berubah; definisi marker identik dengan default TT (marker: true, system_prompt: true).
  Re-import preset **hotfix-2** untuk mendapatkan efeknya (toggles/settings tidak berubah).
- File: `scripts/fix_preset_sheet_duplication.mjs` (idempotent).

### v1.3.2 — "bubble-nya kosong!"
- **Laporan user**: hasil roll tampil **kosong** di bubble user (inspect menampilkan marker
  `<DiceCard …/>` mentah), dan chip `<DICE>` di pesan GM juga tampil sebagai teks polos.
- **Akar masalah**: rendering kartu diserahkan ke 3 script regex yang baru ditambahkan belakangan
  (#51–53). Install yang belum meng-import pack regex terbaru membiarkan DOMPurify men-strip tag
  `<DiceCard/>` yang tidak dikenal (self-closing tanpa isi) → **bubble kosong**.
- **Fix A — self-install regex**: extension kini meng-upsert 3 script dadu ke
  `extension_settings.regex` saat boot (id & nama identik dengan pack import → tidak pernah
  duplikat; definisi lama otomatis diperbarui; flag disabled pilihan user dihormati). Rendering
  berjalan native di pipeline regex host tanpa langkah manual apa pun.
- **Fix B — fallback DOM**: MutationObserver pada `#chat` memindai bubble yang masih memuat
  marker mentah dan mengecatnya lewat `renderDiceContent()` (core.js) setiap kali jalur regex
  tidak jalan (mis. regex extension dimatikan). Marker tidak akan pernah lagi collapse jadi
  bubble kosong dalam konfigurasi apa pun.
- **Single source of truth**: HTML kartu/chip sekarang dibangun oleh builder di core.js;
  replaceString regex dihasilkan dari builder yang sama (token `$1`–`$8`), jadi pack import dan
  self-install tidak mungkin beda tampilan.
- QA: **+54 test** (`qa/scripts/test_dice_render_132.mjs`) — mereplikasi marker persis dari
  screenshot user (`&amp;`, `·`), kontrak engine regex TT, upsert idempotent, fallback DOM,
  marker rusak tidak boleh meledak. Semua suite lama tetap hijau.

### v1.3.1 — "kok TRPG mode-nya mati?"
- **Diagnosis**: laporan user — toggle TRPG mode di-dashboard tidak mengubah perilaku model,
  berlaku juga untuk variabel lain. Audit rantai penuh (dashboard → `chat_metadata.variables`
  → STPT `getvar()`) membuktikan: **jembatan variabel benar**, tapi extension buta terhadap
  kondisi eksternal — kalau **ST-Prompt-Template tidak ter-install / dimatikan / pemrosesan
  generate-nya off**, model menerima `<% %>` mentah dan SEMUA toggle tampak mati.
- **Status integrasi (kartu di Menu ⋯)**: deteksi STPT (tidak ada / disabled / generate off /
  aktif), jumlah variabel ter-seed `105/105`, readout live `trpgmode · HELENA · LD_msg`.
- **Badge peringatan amber di FAB + banner** saat bridge preset down — tidak ada lagi
  "toggle yang diam-diam tidak berefek".
- **Uji sinkronisasi** (Menu ⋯): tulis probe → baca balik → hapus; membuktikan jalur tulis
  metadata chat bekerja. Toast menampilkan `n/105 variabel aktif`.
- **Simpan sekarang** (Menu ⋯): flush langsung `saveMetadata()` — auto-save tetap jalan;
  pulse commit kini menampilkan **key = value** ("✓ trpgmode = 1").
- **Scrub snapshot basi STPT (asuransi)**: STPT menyimpan salinan variabel per-pesan
  (`chat[i].variables`) dan pada beberapa versi meng-merge-nya DI ATAS variabel chat. Commit
  setting kini menghapus kunci milik preset dari snapshot-snapshot itu (kunci milik preset
  lain dibiarkan utuh) sehingga nilai baru tidak bisa tertimpa versi lama.
- **Boot safety net**: kalau chat sudah terbuka saat extension dimuat (ekstensi deferred),
  seed + dashboard tetap dijalankan tanpa menunggu APP_READY.
- i18n: +14 kunci (id/en). QA: E2E integrasi diperluas **18 → 24 flow** (status card,
  badge/banner bridge down, sync test, save-now, pulse commit, scrub snapshot),
  test_core +4 (scrub). Semua suite hijau (lihat `qa/QA-REPORT.md`).

### v1.3.0
- **🎲 Dadu pindah ke chat bubble (fitur imersif)** — sesuai kontrak preset ("renders the tag as
  a button and appends its result as the next user message"):
  - **Auto-roll**: `MESSAGE_RECEIVED` yang mengandung tag `<DICE>` langsung dilempar, hasil
    dikirim sebagai pesan user berisi marker `<DiceCard/>` / `<DiceFree/>` — AI membaca marker
    ringkas itu dan melanjutkan narasi. Toggle di menu: *Auto-lempar dadu ke chat* (default ON).
  - **3 regex script premium baru**: *Dice Request Chip* (tag `<DICE>` di bubble AI dirender jadi
    chip "ROLL" yang bisa di-tap — pengganti placeholder lama yang disabled), *Dice Result Card*
    (kartu hasil dengan badge verdict berwarna + DC), *Dice Free Roll* (kartu untuk roll tanpa
    target). Total regex kini **53 script**.
  - **Anti-dobel berbasis konten** (`indeks + isi tag`): pesan sama tak dilempar ulang, tapi
    swipe ke varian berbeda otomatis melempar ulang — memperbaiki kunci lama yang berbasis jumlah tag.
  - **Tap-to-roll**: chip roll di bubble bisa diklik (event delegation + `mesid`) — setia pada
    tombol roll bawaan Tavo; tetap jalan juga tanpa auto-roll.
- **FIX KRITIS (bug import yang berulang)**: `core.js` kini **re-export** `SETTING_KEYS` &
  `DEFAULTS` (patch manual yang selama ini kamu lakukan tiap update — diadopsi upstream).
  Kombinasi file lama/baru apa pun kini tetap bisa di-import; tidak perlu patch lagi.
- `verify_imports.mjs` di-harden (strip komentar sebelum scan — komentar berisi `from '...'`
  tidak lagi memicu false positive).
- QA: **+25 test** `test_dice_card.mjs` (builder/escape/regex round-trip/preset examples),
  E2E integrasi diperluas **12 → 18 flow** (auto-roll, anti-dobel, swipe re-roll, toggle,
  chip tap), seluruh suite hijau (core 25, UI 17+25, differential 40, render 8, static 21).

### v1.2.3
- **FIX KRITIS (bug terkunci di luar extension)**: mengaktifkan *Kunci posisi tombol* (fixed
  position) membuat kedua tombol melayang MATI — `pointerdown` bail-out saat terkunci sehingga
  `pointerup` tidak pernah mendaftarkan tap → dashboard & dadu tak bisa dibuka. State machine
  pointer ditulis ulang: **tap selalu berfungsi**, hanya *drag* yang disupresi saat terkunci
  (usaha drag saat terkunci = gestur dibatalkan + animasi "nope" kecil, bukan lemparan dadu tak sengaja).
- **Ikon lebih kecil**: FAB 46px → **38px** (ikon 22 → 18px), gap & bayangan dirapatkan,
  offset panel disesuaikan (74 → 66px).
- **SVG premium menyeluruh**: semua glyph emoji/teks diganti icon set stroked 24px-grid yang
  konsisten — logo devil (tanduk proper), dadu, globe+kode bahasa (chip pill), ikon tema
  auto/setengah·bulan·matahari sesuai state, dots menu, chevron, kaca pembesar search, gembok
  badge saat posisi terkunci, check pada chip menu aktif.
- **Menu baru**: **Reset posisi tombol** (kalau FAB kegeser ke posisi stuck) + toast
  "Posisi tombol dikunci/bisa digeser lagi" saat toggle kunci.
- **Aksesibilitas**: keyboard activation (Enter/Space) pada tombol FAB, `aria-label` + title
  dinamis, dan theme crossfade halus (0.25s) saat ganti tema.

### v1.2.2
- **FIX KRITIS**: `index.js` meng-import `SETTING_KEYS`/`DEFAULTS` dari `core.js` yang tidak
  mengekspornya → dynamic import tetap gagal meski path v1.2.1 benar. Ditemukan oleh harness
  integrasi baru (modul `index.js` asli dieksekusi dengan mock ST di browser).
- `verify_imports` diperkuat: kini memvalidasi named exports modul lokal juga.
- **Perbaikan bug upstream Tavo**: `LD_note_on` asli membaca dirinya sendiri (fitur author-note
  tak pernah aktif di plugin Tavo asli) — port kini membaca variabel `note` sesuai intent.
- **QA menyeluruh 8 suite**: differential testing vs `entry.js` asli (init/derived/dadu
  bit-per-bit), 12.888 render EJS simulasi STPT (31/31 select efektif), integrasi browser
  12/12, audit 1.565 perbandingan literal + drift opsi 31/31 select, validasi 51 regex.
  Laporan lengkap: `qa/QA-REPORT.md`.

### v1.2.1
- **FIX KRITIS**: `TypeError: Failed to fetch dynamically imported module` saat load extension.
  Penyebab: kedalaman relative import salah satu level (`../../../script.js` → `/scripts/script.js` 404,
  `../../extensions.js` → `/scripts/extensions/extensions.js` 404). Extension third-party berada **4 level**
  di bawah root, jadi path yang benar `../../../../script.js` dan `../../../extensions.js`
  (diverifikasi terhadap source TauriTavern 2.3.0 dan pola Extension-TopInfoBar yang jalan).

### v1.2.0
- Port awal dari `little-devil-companion-1.2.0.tpg` (Tavo) → extension TT/ST.
- Typed init + migrasi tipe, derived vars, HELENA sticky scan, mesin dadu CoC/D&D,
  dashboard premium minimalis Shadow DOM (104 toggle / 12 seksi / search / auto-save),
  profil default global, i18n ID/EN.

## Catatan teknis

- Variabel di **chat metadata** (`chat_metadata.variables`) → bridge tunggal untuk STPT `getvar`
  dan macro `{{getvar}}`.
- Dashboard pakai **Shadow DOM** (style terisolasi) + safe-area (`env(safe-area-inset-*)` /
  `--tt-inset-*` TT) + penanda `data-tt-mobile-surface="free-window"`.
- Event yang dikonsumsi: `APP_READY`, `CHAT_CHANGED`, `MESSAGE_SENT`, `MESSAGE_RECEIVED`,
  `MESSAGE_SWIPED`, `MESSAGE_DELETED`.

## Troubleshooting

| Gejala | Cek |
|---|---|
| **Mode TRPG tidak aktif padahal toggle sudah ON** | 1) Menu ⋯ → **Status integrasi**: ST-Prompt-Template harus **aktif** (kalau tidak terdeteksi → install: Extensions → Install extension → `https://github.com/zonde306/ST-Prompt-Template`, lalu enable). 2) Variabel harus `105/105` ter-seed. 3) **Uji sinkronisasi** harus OK. 4) Kirim pesan baru / regenerate (prompt di-render ulang tiap generate). |
| Toggle berubah tapi preset tidak merasa | Lihat badge amber di FAB — kalau nyala, bridge STPT down (lihat baris di atas). Kalau tidak: Menu ⋯ → **Simpan sekarang**, lalu regenerate. |
| Extension gagal load saat import | Pakai ZIP **v1.3.3**. Hapus folder `LittleDevilCompanionTT` lama **sampai bersih** → import ulang → reload. Sejak v1.3.0 patch manual `core.js` tidak diperlukan lagi (re-export sudah upstream). |
| Tombol melayang tak bisa diklik setelah kunci posisi | Sudah diperbaiki di **v1.2.3** (tap tetap jalan saat terkunci). Darurat versi lama: buka menu ⋯ → matikan *Kunci posisi* lewat keyboard, atau update extension. |
| Seksi preset kosong / toggle tak berpengaruh | Preset Little Devil aktif? ST-Prompt-Template enabled? Companion enabled? |
| Toggle berubah tapi balik sendiri | Chat metadata belum tersimpan — kirim 1 pesan lalu cek lagi |
| Kartu dadu tidak muncul / masih tag mentah | **Sejak v1.3.2 tidak perlu import manual** — extension otomatis meng-install 3 script dadu. Pastikan extension **Regex** tidak dimatikan (menu Extensions); tanpa Regex pun v1.3.3 menampilkan chip/kartu via fallback yang aman. |
| Auto-roll tidak jalan | Menu ⋯ → *Auto-lempar dadu ke chat* harus aktif; tag harus di pesan terbaru (format `NdM:Label:target[:LOW][:ADV\|DIS]`). |
| Dadu dilempar dua kali / tidak mau lempar ulang | Anti-dobel berbasis konten — swipe dengan tag berbeda otomatis melempar ulang; pakai tombol 🎲 atau tap chip untuk force. |
| Status panel/HTML tidak tampil | Regex script belum di-import (langkah 3) |
