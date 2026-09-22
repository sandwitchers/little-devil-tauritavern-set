# Little Devil × TauriTavern Set

Porting lengkap **Little Devil v16 (Hotfix Tavo Port)** + **Companion plugin** (dari `.tpg` Tavo) ke **TauriTavern**, juga kompatibel dengan SillyTavern standar.

```
Preset JSON ────────→ TT Prompt Manager (apa adanya, 38 prompt)
ST-Prompt-Template ─→ mengeksekusi 3.435 blok EJS (getvar + if/else)
Companion Extension ─→ init 105 variabel typed + derived vars + dice + dashboard
Regex Scripts ──────→ Regex extension (51 script, sekali import)
```

Variabel preset (`LD_*` + 105 toggle) disimpan di `chat_metadata.variables` — terbaca
sekaligus oleh `getvar()` EJS (ST-Prompt-Template, scope local) **dan** macro native `{{getvar}}`.

---

## Isi repo

| Path | Isi |
|---|---|
| `dist/LittleDevilCompanionTT-1.2.2.zip` | **Paket siap install** (import ZIP dari panel Extensions) |
| `extension/LittleDevilCompanionTT/` | Source code companion extension (unminified, bisa dimodifikasi) |
| `preset/Little_Devil_Hotfix_Tavo_preset.json` | Preset 38 prompt — import ke Prompt Manager |
| `regex/Little_Devil_Regex_Scripts_TT_Import.json` | 51 regex script — import ke extension Regex |
| `qa/QA-REPORT.md` | Laporan QA lengkap (8 suite, differential testing vs plugin asli) |
| `qa/scripts/` | Script QA yang bisa direproduksi |

## Requirement

- **TauriTavern** 2.3.0+ (atau SillyTavern 1.12+)
- **ST-Prompt-Template** extension — enabled (eksekutor EJS `<% %>` di preset)
- Tidak terikat model tertentu — preset bersifat universal (Gemini, Claude, dll.)

## Instalasi (urut dari atas)

### 1. Extension Companion
1. Buka panel **Extensions** (ikon puzzle) → **Import extension** (from ZIP).
2. Pilih `dist/LittleDevilCompanionTT-1.2.2.zip`.
3. Aktifkan **Little Devil Companion (TT)**.

> **Upgrade dari v1.2.0 yang gagal load?** Import ZIP baru ini akan menimpa folder lama.
> Kalau masih error, hapus folder `LittleDevilCompanionTT` lama dulu lalu import ulang dan reload app.

### 2. Preset
1. Buka **AI Response Configuration** → **Preset Manager**.
2. **Import** → `preset/Little_Devil_Hotfix_Tavo_preset.json`.
3. Aktifkan preset **Little Devil (Hotfix Tavo Port)**. Set parameter model (temp, max tokens) sesuai selera.

### 3. Regex Scripts
1. Panel **Extensions** → **Regex** → **Import Script**.
2. Pilih `regex/Little_Devil_Regex_Scripts_TT_Import.json` (51 script masuk sekaligus) — scope **Global**.

### 4. Cek ST-Prompt-Template
Pastikan statusnya **enabled** di panel Extensions.

---

## Cara pakai

- **Dashboard melayang** — tombol 😈 kanan-bawah. Bisa digeser (drag), posisi diingat.
- **104 toggle + 1 catatan dalam 12 seksi** — perubahan **tersimpan otomatis** (pulse "✓ Tersimpan").
  Angka kecil di tiap seksi = jumlah toggle yang berbeda dari default.
- **Pencarian** — kotak cari memfilter semua variabel (nama/label).
- **🎲 Dadu** — memproses tag `<DICE>...</DICE>` di pesan terakhir
  (CoC roll-low / D&D roll-high, ADV/DIS, target DC), hasil dikirim sebagai pesan user.
  Anti dobel: lempar ulang pesan yang sama ditolak.
- **Menu ⋯** header: buka/tutup semua seksi · kunci posisi fab · **simpan/terapkan default global** · reset chat ke default preset.
- **Tema & bahasa** — ikon ◐ (auto/gelap/terang) dan 🌐 (Auto/ID/EN).

## Perilaku otomatis

- **Chat dibuka**: seed 105 variabel bertipe (angka tetap angka — penting untuk `===` ketat di EJS),
  hitung variabel turunan (`LD_roll_*`, `LD_pick_*`, `LD_date/LD_time`, `LD_msg`, `LD_kw_*`, `LD_note_on`, `LD_x1`),
  lalu **HELENA scan** 300 pesan terakhir (sticky, sekali saja).
- **Tiap pesan terkirim/terima**: variabel turunan di-refresh otomatis.

## Changelog

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
| Extension gagal load saat import | Pastikan pakai ZIP **v1.2.1+**; v1.2.0 punya bug import path. Hapus folder lama, import ulang, reload. |
| Tombol melayang tak bisa diklik setelah kunci posisi | Sudah diperbaiki di **v1.2.3** (tap tetap jalan saat terkunci). Darurat versi lama: buka menu ⋯ → matikan *Kunci posisi* lewat keyboard, atau update extension. |
| Seksi preset kosong / toggle tak berpengaruh | Preset Little Devil aktif? ST-Prompt-Template enabled? Companion enabled? |
| Toggle berubah tapi balik sendiri | Chat metadata belum tersimpan — kirim 1 pesan lalu cek lagi |
| `<DICE>` tidak diproses | Tag harus ada dalam 30 pesan terakhir; format `NdM:Label` |
| Status panel/HTML tidak tampil | Regex script belum di-import (langkah 3) |
