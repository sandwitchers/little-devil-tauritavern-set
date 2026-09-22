#!/usr/bin/env node
// Verifikasi import extension LittleDevilCompanionTT terhadap pohon source
// TauriTavern 2.3.0 (src/ = pohon yang diserve di tauri.localhost).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

const EXT = '/home/z/my-project/build/LittleDevilCompanionTT';
const TT = '/home/z/my-project/TauriTavern/src';
// URL tempat index.js diload di runtime:
// /scripts/extensions/third-party/LittleDevilCompanionTT/index.js
const RUNTIME_DIR = '/scripts/extensions/third-party/LittleDevilCompanionTT';

const files = ['index.js', 'core.js', 'ui.js', 'styles.js', 'data_schema.js', 'data_i18n.js'];
let fail = 0;

function ttPath(urlPath) {
    // /script.js -> src/script.js ; /scripts/foo.js -> src/scripts/foo.js
    const p = urlPath.replace(/^\//, '');
    return join(TT, p);
}

for (const f of files) {
    const src = readFileSync(join(EXT, f), 'utf8');
    // static + dynamic import: from '...' / import('...')
    const re = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const spec = m[1];
        if (!spec.startsWith('.')) { console.log(`SKIP (bare/external): ${f} -> ${spec}`); continue; }
        // resolve terhadap URL modul di runtime
        const resolvedURL = new URL(spec, `https://x${RUNTIME_DIR}/${f}`).pathname;
        if (resolvedURL.startsWith('/scripts/extensions/third-party/LittleDevilCompanionTT/')) {
            const local = resolvedURL.split('/').pop();
            const ok = existsSync(join(EXT, local));
            console.log(`${ok ? 'OK  ' : 'FAIL'} ${f} -> ${spec}  [local: ${local}]`);
            if (!ok) { fail++; continue; }
            // verifikasi NAMED EXPORTS modul lokal (kelas bug: import nama yang
            // tidak di-export oleh sibling module — tidak tertangkap node --check)
            const before = src.slice(0, m.index);
            const braces = before.lastIndexOf('{');
            const seg = src.slice(braces + 1, src.indexOf('}', braces));
            const names = seg.split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean).filter(n => /^[A-Za-z_$][\w$]*$/.test(n));
            if (names.length) {
                const target = readFileSync(join(EXT, local), 'utf8');
                const exported = new Set();
                for (const em of target.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) exported.add(em[1]);
                for (const em of target.matchAll(/export\s*\{([^}]*)\}/g)) {
                    for (const item of em[1].split(',')) {
                        const t = item.trim(); if (!t) continue;
                        const asMatch = t.match(/^(\S+)\s+as\s+(\S+)$/);
                        exported.add(asMatch ? asMatch[2] : t);
                    }
                }
                const missing = names.filter(n => !exported.has(n));
                if (missing.length) { console.log(`     MISSING EXPORTS in ${local}: ${missing.join(', ')}`); fail++; }
                else console.log(`     exports OK: ${names.join(', ')}`);
            }
            continue;
        }
        const abs = ttPath(resolvedURL);
        const ok = existsSync(abs);
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${f} -> ${spec}  [TT: ${resolvedURL}]`);
        if (!ok) { fail++; continue; }
        // cek named exports yang diminta
        const before = src.slice(0, m.index);
        const braces = before.lastIndexOf('{');
        const fromIdx = before.lastIndexOf(' from'); // bukan named (e.g. default) abaikan
        const seg = src.slice(braces + 1, src.indexOf('}', braces));
        const names = seg.split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean).filter(n => /^[A-Za-z_$][\w$]*$/.test(n));
        if (names.length) {
            const target = readFileSync(abs, 'utf8');
            const missing = names.filter(n => {
                const patterns = [
                    new RegExp(`export\\s+(?:async\\s+)?(?:let|const|var|function|class)\\s+${n}\\b`),
                    new RegExp(`export\\s*\\{[^}]*\\b${n}\\b`),
                    new RegExp(`\\b(?:let|const|var|function|class)\\s+${n}\\b[\\s\\S]*?export\\s*\\{[^}]*\\b${n}\\b`),
                ];
                return !patterns.some(p => p.test(target));
            });
            if (missing.length) { console.log(`     MISSING EXPORTS in ${resolvedURL}: ${missing.join(', ')}`); fail++; }
            else console.log(`     exports OK: ${names.join(', ')}`);
        }
    }
}
console.log(fail === 0 ? '\nALL IMPORTS VERIFIED ✓' : `\n${fail} PROBLEM(S) ✗`);
process.exit(fail === 0 ? 0 : 1);
