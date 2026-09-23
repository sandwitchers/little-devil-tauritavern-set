// ============================================================================
// test_dice_fallback_133.mjs — v1.3.3 formatting-preserving DOM fallback tests
// Reproduces the user-reported scenario: an AI roll-REQUEST bubble (rich
// narrative: <font> color styling, §effects§, code blocks) ALSO holds a
// <DICE> tag. The v1.3.2 fallback rebuilt that bubble from raw text and
// escaped everything → raw markup shown in chat. v1.3.3 patches surgically.
// Part A runs in node (pure core); Part B runs real DOM via playwright,
// loading the REAL core.js as an ES module over http (its ./data_schema.js
// relative import resolves the same way as in TauriTavern).
// ============================================================================
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const BUILD = '/home/z/my-project/build/LittleDevilCompanionTT';
const CORE = join(BUILD, 'core.js');
const core = await import(pathToFileURL(CORE).href);

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  ok  ${name}`); }
    else { fail++; console.error(`FAIL  ${name}${extra ? ' — ' : ''}${extra}`); }
}

// The EXACT message shape from the user's screenshot (Screenshot_2026-09-22-
// 18-53-08: raw <font> tags, §Srak! Srak!§, ``` code block, GM asking to roll).
const GM_RAW = [
    '<font color="#FF4500" style="font-size:0.9em;font-style:italic">"Wah, wah! Lihat ukuran tulang itu!"</font>',
    '<font color="#FF4500" style="font-weight:bold">"Zack-kun, terima kasih banyak!"</font>',
    '',
    '§Srak! Srak!§',
    '',
    'Pasukan kerajaan kini benar-benar berada dalam kondisi euforia total.',
    '',
    '```',
    'Morale: Sangat Tinggi (Euforia Maksimal)',
    'Warriors: 1000',
    '```',
    '',
    '【GM: Wah, Zack-kun! Silakan lempar dadu untuk melihat seberapa efektif peningkatan pasukanmu kali ini!】',
    '<DICE>1d100:Peningkatan Pasukan</DICE>',
].join('\n');

// TT-formatted DOM end state when the regex path is unavailable: unknown-tag
// wrappers stripped, narrative markup survived as elements, marker reduced to
// its bare `formula:label` residue text in the last paragraph.
const GM_FORMATTED_A = `
<div class="mes_text">
<p><font color="#FF4500" style="font-size:0.9em;font-style:italic">"Wah, wah! Lihat ukuran tulang itu!"</font>
<font color="#FF4500" style="font-weight:bold">"Zack-kun, terima kasih banyak!"</font></p>
<p>§Srak! Srak!§</p>
<p>Pasukan kerajaan kini benar-benar berada dalam kondisi euforia total.</p>
<pre><code>Morale: Sangat Tinggi (Euforia Maksimal)
Warriors: 1000</code></pre>
<p>【GM: Wah, Zack-kun! Silakan lempar dadu untuk melihat seberapa efektif peningkatan pasukanmu kali ini!】</p>
<p>1d100:Peningkatan Pasukan</p>
</div>`;

// ---- Part A: pure core (node) ------------------------------------------------
console.log('Part A — isMarkersOnlyBody (node)');

check('markers-only: single card', core.isMarkersOnlyBody('<DiceCard label="Arcana" sys="D&amp;D" chip="#fbbf24" formula="1d20+5" rolled="Rolled 18" total="23" tone="#34d399" verdict="SUCCESS"/>') === true);
check('markers-only: two cards + whitespace', core.isMarkersOnlyBody('\n<DiceCard label="A" sys="s" chip="#fff" formula="1d6" rolled="r" total="3" tone="#fff" verdict="v"/>\n\n<DiceFree label="B" sys="s" chip="#fff" formula="1d6" rolled="r" total="4" tone="#fff"/>') === true);
check('markers-only: single chip', core.isMarkersOnlyBody('<DICE>1d100:Peningkatan Pasukan</DICE>\n') === true);
check('mixed: narrative + chip → false', core.isMarkersOnlyBody(GM_RAW) === false);
check('mixed: card + warning line → false', core.isMarkersOnlyBody('<DiceCard label="A" sys="s" chip="#fff" formula="1d6" rolled="r" total="3" tone="#fff" verdict="v"/>\n⚠️ broken — invalid') === false);
check('no markers: whitespace only → true (caller guards, safe)', core.isMarkersOnlyBody('   \n ') === true);

// ---- Part B: real DOM (playwright chromium + real core.js module) -------------
console.log('\nPart B — renderDiceMarkersInto (playwright, real DOM)');

const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
const HARNESS_HTML = '<!doctype html><html><body><div id="host"></div></body></html>';
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://x');
        if (url.pathname === '/') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(HARNESS_HTML);
            return;
        }
        const file = join(BUILD, url.pathname);
        const data = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(data);
    } catch (e) {
        res.writeHead(404); res.end('nf');
    }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(base); // same-origin so the relative module import resolves
await page.addScriptTag({ type: 'module', content: "import * as core from './core.js'; window.__ld = core;" });
await page.waitForFunction(() => window.__ld && typeof window.__ld.renderDiceMarkersInto === 'function');

const RESULT = await page.evaluate(({ gmRaw, gmFormattedA }) => {
    const out = {};
    const host = document.getElementById('host');
    const fresh = (html) => {
        host.innerHTML = '';
        host.innerHTML = html;
        return host.querySelector('.mes_text');
    };

    // -- Scenario A: exact screenshot bubble, residue form (tag stripped) -----
    let el = fresh(gmFormattedA);
    const beforeFont = el.querySelectorAll('font').length;
    const beforeCode = el.querySelectorAll('pre code').length;
    out.A_painted = window.__ld.renderDiceMarkersInto(el, gmRaw);
    out.A_chips = el.querySelectorAll('[data-ld-dice-request]').length;
    out.A_fontIntact = el.querySelectorAll('font').length === beforeFont && beforeFont === 2;
    out.A_fontNotEscaped = !el.innerHTML.includes('&lt;font');
    out.A_codeIntact = el.querySelectorAll('pre code').length === beforeCode && beforeCode === 1;
    out.A_codeText = (el.querySelector('pre code') || {}).textContent || '';
    out.A_chipInLastP = !!(el.querySelector('p:last-of-type [data-ld-dice-request]'));

    // -- Scenario B: literal escaped marker visible as text (encode_tags mode)
    el = fresh('<div class="mes_text"><p>Check time!</p><p>&lt;DICE&gt;1d20:Arcana&lt;/DICE&gt;</p></div>');
    out.B_painted = window.__ld.renderDiceMarkersInto(el, '<DICE>1d20:Arcana</DICE>');
    out.B_chips = el.querySelectorAll('[data-ld-dice-request]').length;
    out.B_literalGone = !el.textContent.includes('<DICE>');

    // -- Scenario C: literal marker inside a code block
    el = fresh('<div class="mes_text"><p>Roll below:</p><pre><code>&lt;DICE&gt;2d6:Damage&lt;/DICE&gt;</code></pre></div>');
    out.C_painted = window.__ld.renderDiceMarkersInto(el, '<DICE>2d6:Damage</DICE>');
    out.C_chips = el.querySelectorAll('[data-ld-dice-request]').length;
    out.C_literalGone = !el.textContent.includes('<DICE>');

    // -- Scenario D: card marker in a mixed message leaves NO residue → append
    el = fresh('<div class="mes_text"><p>Nice roll narrative stays here.</p></div>');
    const cardMarker = '<DiceCard label="Arcana" sys="D&amp;D" chip="#fbbf24" formula="1d20+5" rolled="Rolled 18 · mod +5" total="23" tone="#34d399" verdict="SUCCESS · DC 12"/>';
    out.D_painted = window.__ld.renderDiceMarkersInto(el, 'Nice roll narrative stays here.\n' + cardMarker);
    out.D_cards = el.querySelectorAll('[data-ld-dice-card]').length;
    out.D_textIntact = el.textContent.includes('Nice roll narrative stays here.');

    // -- Scenario E: whitespace-flex residue (extra spaces/newline in body) ---
    el = fresh('<div class="mes_text"><p>Verdict:</p><p>1d100:  Peningkatan\nPasukan</p></div>');
    out.E_painted = window.__ld.renderDiceMarkersInto(el, '<DICE>1d100:Peningkatan Pasukan</DICE>');
    out.E_chips = el.querySelectorAll('[data-ld-dice-request]').length;

    // -- Scenario F: multiple markers in one bubble ----------------------------
    el = fresh('<div class="mes_text"><p>First 1d20:Attack then 1d20:Defense done.</p></div>');
    out.F_painted = window.__ld.renderDiceMarkersInto(el, '<DICE>1d20:Attack</DICE> and <DICE>1d20:Defense</DICE>');
    out.F_chips = el.querySelectorAll('[data-ld-dice-request]').length;
    // the bare residues must be gone from plain text nodes (chips carry the
    // label inside their own spans, which is fine)
    const bare = [...el.querySelectorAll('p')].filter(p => !p.querySelector('[data-ld-dice-request]'))
        .map(p => p.textContent).join('');
    out.F_residueGone = !bare.includes('1d20:Attack') && !bare.includes('1d20:Defense');

    // -- Scenario G: entities in the marker body (&amp; written raw) -----------
    el = fresh('<div class="mes_text"><p>Rolled: 1d6:S&amp;M Gimmick</p></div>');
    out.G_painted = window.__ld.renderDiceMarkersInto(el, '<DICE>1d6:S&amp;M Gimmick</DICE>');
    out.G_chips = el.querySelectorAll('[data-ld-dice-request]').length;

    // -- Scenario H: idempotence — second run paints nothing new ---------------
    el = fresh(gmFormattedA);
    window.__ld.renderDiceMarkersInto(el, gmRaw);
    const chipsAfterFirst = el.querySelectorAll('[data-ld-dice-request]').length;
    window.__ld.renderDiceMarkersInto(el, gmRaw);
    out.H_noDouble = el.querySelectorAll('[data-ld-dice-request]').length === chipsAfterFirst;

    // -- Scenario I: painted chip carries the clickable signature ---------------
    el = fresh('<div class="mes_text"><p>1d4:Fate</p></div>');
    window.__ld.renderDiceMarkersInto(el, '<DICE>1d4:Fate</DICE>');
    const chip = el.querySelector('[data-ld-dice-request]');
    out.I_clickable = !!chip && chip.getAttribute('data-ld-dice-request') === '1';

    return out;
}, { gmRaw: GM_RAW, gmFormattedA: GM_FORMATTED_A });

check('A: painted exactly 1 marker', RESULT.A_painted === 1, `got ${RESULT.A_painted}`);
check('A: exactly 1 chip rendered', RESULT.A_chips === 1, `got ${RESULT.A_chips}`);
check('A: <font> elements intact (not escaped, not removed)', RESULT.A_fontIntact && RESULT.A_fontNotEscaped);
check('A: <pre><code> block intact', RESULT.A_codeIntact);
check('A: code block text untouched', RESULT.A_codeText.includes('Morale: Sangat Tinggi'), JSON.stringify(RESULT.A_codeText));
check('A: chip sits where the residue was (last paragraph)', RESULT.A_chipInLastP);
check('B: literal escaped marker replaced', RESULT.B_painted === 1 && RESULT.B_chips === 1 && RESULT.B_literalGone);
check('C: literal marker inside <code> replaced', RESULT.C_painted === 1 && RESULT.C_chips === 1 && RESULT.C_literalGone);
check('D: residue-less card appended, narrative intact', RESULT.D_painted === 1 && RESULT.D_cards === 1 && RESULT.D_textIntact);
check('E: whitespace-flex residue matched', RESULT.E_painted === 1 && RESULT.E_chips === 1);
check('F: two markers → two chips, bare residue gone', RESULT.F_painted === 2 && RESULT.F_chips === 2 && RESULT.F_residueGone);
check('G: entity-bearing body matched after decode', RESULT.G_painted === 1 && RESULT.G_chips === 1);
check('H: re-run is idempotent (no double paint)', RESULT.H_noDouble);
check('I: painted chip carries clickable signature', RESULT.I_clickable);
check('no page errors during DOM surgery', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
server.close();

console.log(`\n=== test_dice_fallback_133: ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);
