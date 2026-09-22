// ============================================================================
// Little Devil Companion — v1.3.0 dice card & regex suite (test_dice_card.mjs)
// Covers: buildDiceMarker / buildDiceResultMessage (all verdict branches,
// escaping, ADV/DIS, free rolls), the three new regex scripts (request chip,
// result card, free roll) applied to real markers and to every <DICE> example
// format documented in the preset, plus negative/false-match guards.
// Run: node scripts/test_dice_card.mjs
// ============================================================================
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '..', 'build', 'LittleDevilCompanionTT');

const core = await import(join(EXT, 'core.js'));
const { buildDiceMarker, buildDiceResultMessage, resolveCheck, parseDiceRequest } = core;

let pass = 0;
let fail = 0;
const failures = [];
function test(name, fn) {
    try { fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; failures.push({ name, e }); console.error(`  ✗ ${name}\n    ${e.message}`); }
}

// ---- regex script loader (straight from the shipping import file) -----------
const regexPath = join(HERE, '..', 'download', 'Little_Devil_Regex_Scripts_TT_Import.json');
const scripts = JSON.parse(readFileSync(regexPath, 'utf-8'));
function parseFind(spec) {
    const m = spec.match(/^\/(.*)\/([a-z]*)$/s);
    if (!m) throw new Error('bad regex spec: ' + spec);
    return new RegExp(m[1], m[2]);
}
const chipScript = scripts.find(s => s.scriptName === 'Little Devil — Dice Request Chip');
const cardScript = scripts.find(s => s.scriptName === 'Little Devil — Dice Result Card');
const freeScript = scripts.find(s => s.scriptName === 'Little Devil — Dice Free Roll');
const CHIP_RE = parseFind(chipScript.findRegex);
const CARD_RE = parseFind(cardScript.findRegex);
const FREE_RE = parseFind(freeScript.findRegex);

function substitute(re, replacement, text) {
    return text.replace(re, (...args) => {
        const groups = args.slice(1, -2); // capture groups only (skip full match, offset, string)
        let out = replacement;
        for (let i = 0; i < groups.length; i++) {
            out = out.replaceAll('$' + (i + 1), groups[i] ?? '');
        }
        return out;
    });
}

// ---- fixtures ---------------------------------------------------------------
const cocTarget = resolveCheck(parseDiceRequest('1d100:Psychoanalysis:60:LOW:ADV'));
const dndTarget = resolveCheck(parseDiceRequest('1d20+5:Strength:DC15'));
const dndAdv = resolveCheck(parseDiceRequest('1d20+3:Dexterity:DC12:ADV'));
const dndDis = resolveCheck(parseDiceRequest('1d20-1:Wisdom:DC14:DIS'));
const freeMulti = resolveCheck(parseDiceRequest('2d6+3:Damage'));
const freeSingle = resolveCheck(parseDiceRequest('1d100:Luck'));

// force a deterministic-ish suite: monkey-run resolveCheck until branches hit
function untilBranch(fn, pred, tries = 5000) {
    for (let i = 0; i < tries; i++) {
        const r = fn();
        if (pred(r)) return r;
    }
    throw new Error('branch not reached within ' + tries + ' tries');
}

console.log('\n== buildDiceMarker: structure & escaping ==');

test('marker with target → <DiceCard> with all 8 attrs, fixed order', () => {
    const m = buildDiceMarker(cocTarget);
    assert.match(m, /^<DiceCard label="[^"]*" sys="[^"]*" chip="[^"]*" formula="[^"]*" rolled="[^"]*" total="[^"]*" tone="[^"]*" verdict="[^"]*"\/>$/);
    assert.match(m, /sys="CoC · ADV"/);
    assert.match(m, /chip="#f0abfc"/);
    assert.match(m, /formula="1d100"/);
    assert.match(m, /rolled="Rolled \d+ \/ \d+ · kept #[12]"/);
    assert.match(m, /total="\d+"/);
});

test('D&D target marker: sys pill + DC verdict text', () => {
    const m = buildDiceMarker(dndTarget);
    assert.match(m, /^<DiceCard /);
    assert.match(m, /sys="D&amp;D"/); // & is HTML-escaped in attributes
    assert.match(m, /chip="#fbbf24"/);
    assert.match(m, /verdict="(SUCCESS|FAILURE|CRITICAL SUCCESS|FUMBLE) · DC 15"/);
});

test('ADV/DIS pills present on D&D markers', () => {
    assert.match(buildDiceMarker(dndAdv), /sys="D&amp;D · ADV"/);
    assert.match(buildDiceMarker(dndDis), /sys="D&amp;D · DIS"/);
});

test('free roll (no target) → <DiceFree> with 7 attrs, no verdict', () => {
    const m = buildDiceMarker(freeSingle);
    assert.match(m, /^<DiceFree label="Luck" sys="[^"]*" chip="[^"]*" formula="1d100" rolled="Rolled \d+" total="\d+" tone="[^"]*"\/>$/);
    assert.doesNotMatch(m, /verdict=/);
});

test('multi-dice free roll detail shows dice faces and modifier', () => {
    const m = buildDiceMarker(freeMulti);
    assert.match(m, /rolled="Rolled \d+\+\d+ · mod \+3"/);
});

test('label with hostile characters is HTML-escaped in the marker', () => {
    const r = resolveCheck(parseDiceRequest('1d20:Jack`s "Big" <Deal> & Co:DC10'));
    const m = buildDiceMarker(r);
    assert.ok(m.includes('&quot;Big&quot;'), 'double quotes escaped');
    assert.ok(m.includes('&lt;Deal&gt;'), 'angle brackets escaped');
    assert.ok(m.includes('&amp; Co'), 'ampersand escaped');
    const lm = m.match(/label="([^"]*)"/);
    assert.ok(lm, 'label attribute parseable');
    assert.ok(!/[<>"']/.test(lm[1]), 'no raw hostile chars survive inside the attr value');
});

test('no-target critical (CoC) → DiceCard with CRITICAL! badge', () => {
    const r = untilBranch(
        () => resolveCheck(parseDiceRequest('1d100:Luck:LOW')),
        x => x.critical === true && x.target === null,
    );
    const m = buildDiceMarker(r);
    assert.match(m, /^<DiceCard /);
    assert.match(m, /verdict="CRITICAL!"/);
});

console.log('\n== buildDiceResultMessage ==');

test('single ok entry → exactly one marker line', () => {
    const msg = buildDiceResultMessage([{ ok: true, card: dndTarget }]);
    assert.equal(msg.split('\n').length, 1);
    assert.match(msg, /^<DiceCard /);
});

test('mixed ok + error entries → markers plus ⚠️ line', () => {
    const msg = buildDiceResultMessage([
        { ok: true, card: dndTarget },
        { ok: false, text: 'garbage — Invalid dice notation: garbage' },
    ]);
    const lines = msg.split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^<DiceCard /);
    assert.match(lines[1], /^⚠️ garbage — Invalid dice notation/);
});

test('empty / null entries safe', () => {
    assert.equal(buildDiceResultMessage([]), '');
    assert.equal(buildDiceResultMessage(null), '');
    assert.match(buildDiceResultMessage([null]), /⚠️ invalid roll/);
});

test('multiple tags in one AI message → one marker per line (card stacking)', () => {
    const entries = ['1d20+5:Strength:DC15', '2d6+3:Damage'].map(raw => ({ ok: true, card: resolveCheck(parseDiceRequest(raw)) }));
    const msg = buildDiceResultMessage(entries);
    const lines = msg.split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^<DiceCard /);
    assert.match(lines[1], /^<DiceFree /);
});

console.log('\n== regex: Dice Request Chip ==');

test('chip pattern parses every <DICE> example documented in the preset', () => {
    const examples = [
        '1d20+5:Strength:DC15',
        '1d20+3:Dexterity:DC12:ADV',
        '1d20-1:Wisdom:DC14:DIS',
        '1d100:Psychoanalysis:60:LOW:ADV',
        '1d100:Psychoanalysis:60:LOW:DIS',
        '1d100:Dodge:40:LOW:ADV',
        '2d6+3:Damage',
        '1d100:Luck',
        '1d100:Perception:50:LOW',
        '1d20:Attack:DC10',
    ];
    for (const raw of examples) {
        const html = `<DICE>${raw}</DICE>`;
        const m = CHIP_RE.exec(html);
        CHIP_RE.lastIndex = 0;
        assert.ok(m, 'chip must match: ' + raw);
        assert.equal(m[1].trim(), raw.split(':')[0], 'notation group: ' + raw);
        assert.equal(m[2].trim(), raw.split(':')[1], 'label group: ' + raw);
    }
});

test('chip replacement renders label, notation, tail and ROLL badge + data attr', () => {
    const out = substitute(CHIP_RE, chipScript.replaceString, '<DICE>1d100:Psychoanalysis:60:LOW:ADV</DICE>');
    assert.ok(out.includes('data-ld-dice-request="1"'), 'tappable data attribute');
    assert.ok(out.includes('>Psychoanalysis<'), 'label');
    assert.ok(out.includes('1d100'), 'notation');
    assert.ok(out.includes(':60:LOW:ADV'), 'raw tail preserved');
    assert.ok(out.includes('>ROLL<'), 'roll badge');
});

test('chip handles simple notation with empty tail (no dangling separators)', () => {
    const out = substitute(CHIP_RE, chipScript.replaceString, '<DICE>2d6+3:Damage</DICE>');
    assert.ok(out.includes('2d6+3'));
    assert.ok(!/:\s*<i/.test(out.replace('<DICE>', '')), 'no leading colon artifact');
    assert.ok(out.includes('>Damage<'));
});

test('chip does NOT match result markers (DiceCard/DiceFree are different tags)', () => {
    const marker = buildDiceMarker(dndTarget);
    CHIP_RE.lastIndex = 0;
    assert.equal(CHIP_RE.exec(marker), null);
});

test('chip does NOT fire on prose without DICE tags', () => {
    const prose = 'She looks at you... <DICE> is not written here, and dice? no tags.';
    CHIP_RE.lastIndex = 0;
    assert.equal(CHIP_RE.exec(prose), null);
});

test('uppercase/lowercase <dice> tags both match (gi flags)', () => {
    for (const tag of ['<dice>1d20:Hit:DC10</dice>', '<DICE>1d20:Hit:DC10</DICE>']) {
        CHIP_RE.lastIndex = 0;
        assert.ok(CHIP_RE.exec(tag), 'matches ' + tag);
    }
});

console.log('\n== regex: Dice Result Card / Free Roll (round-trip with builders) ==');

test('result card regex round-trips EVERY marker from the builder (60 samples)', () => {
    for (let i = 0; i < 60; i++) {
        const raw = i % 3 === 0 ? `1d100:Check${i}:60:LOW:ADV`
            : i % 3 === 1 ? `1d20+2:Check${i}:DC15`
                : `2d6+1:Check${i}`;
        const marker = buildDiceMarker(resolveCheck(parseDiceRequest(raw)));
        if (marker.startsWith('<DiceCard')) {
            CARD_RE.lastIndex = 0;
            const m = CARD_RE.exec(marker);
            assert.ok(m, 'CARD_RE must match marker for ' + raw);
            assert.equal(m[8].length > 0, true, 'verdict non-empty for DiceCard');
            assert.doesNotMatch(m[8], /"/, 'verdict contains no raw quotes');
        } else {
            FREE_RE.lastIndex = 0;
            const m = FREE_RE.exec(marker);
            assert.ok(m, 'FREE_RE must match marker for ' + raw);
        }
    }
});

test('card replacement interpolates total, tone color and verdict badge', () => {
    const marker = buildDiceMarker(dndTarget);
    const html = substitute(CARD_RE, cardScript.replaceString, marker);
    assert.ok(html.includes('border-left:3px solid #'), 'accent border from tone');
    const total = marker.match(/total="(\d+)"/)[1];
    assert.ok(html.includes('>' + total + '</span>'), 'big total number rendered');
    assert.ok(html.includes('background:#'), 'badge uses tone background');
    assert.ok(html.includes('<div') && html.includes('</div>'), 'full card HTML');
    assert.ok(!html.includes('$7') && !html.includes('$6'), 'no unreplaced placeholders');
});

test('free roll replacement has no badge row but keeps card frame', () => {
    const marker = buildDiceMarker(freeSingle);
    const html = substitute(FREE_RE, freeScript.replaceString, marker);
    assert.ok(html.includes('<div'), 'card frame present');
    assert.ok(!html.includes('justify-content:flex-end'), 'no badge row in free card');
});

test('markers never match when regex disabled → raw marker stays AI-readable', () => {
    const marker = buildDiceMarker(cocTarget);
    assert.ok(marker.startsWith('<DiceCard'));
    assert.ok(marker.includes('label="Psychoanalysis"'));
    assert.ok(marker.includes('verdict="'));
});

console.log('\n== anti-double & integration contracts ==');

test('roll key content sensitivity (index + full tag text)', () => {
    // mirrors index.js performRoll keying: idx + ':' + tags.join('|')
    const keyOf = (idx, tags) => idx + ':' + tags.join('|');
    assert.notEqual(keyOf(10, ['1d100:A:50:LOW']), keyOf(10, ['1d100:A:50:LOW:ADV']), 'different flags → different key (swipe re-rolls)');
    assert.notEqual(keyOf(10, ['1d100:A:50:LOW']), keyOf(11, ['1d100:A:50:LOW']), 'different index → different key');
    assert.equal(keyOf(10, ['1d100:A:50:LOW']), keyOf(10, ['1d100:A:50:LOW']), 'same content → same key (blocked)');
});

test('dice markers contain no <DICE> tag → no auto-roll self-trigger loop', () => {
    const msg = buildDiceResultMessage([{ ok: true, card: dndTarget }, { ok: false, text: 'x — bad' }]);
    const tags = core.extractDiceTags(msg);
    assert.equal(tags.length, 0, 'result message must not re-trigger the roller');
});

test('shipped regex set = 53 scripts incl. the 3 dice scripts, all valid specs', () => {
    assert.equal(scripts.length, 53);
    for (const s of scripts) {
        assert.ok(s.id && s.scriptName && s.findRegex && typeof s.replaceString === 'string');
        assert.ok(parseFind(s.findRegex), 'findRegex parses: ' + s.scriptName);
        assert.ok(Array.isArray(s.placement) && s.placement.every(p => [0, 1, 2, 3, 5, 6].includes(p)));
    }
    const names = scripts.map(s => s.scriptName);
    assert.ok(names.includes('Little Devil — Dice Request Chip'));
    assert.ok(names.includes('Little Devil — Dice Result Card'));
    assert.ok(names.includes('Little Devil — Dice Free Roll'));
    assert.ok(!names.includes('DICE — Show Pending Roll (Display Only)'), 'old placeholder removed');
});

test('marker message survives JSON round-trip (chat persistence)', () => {
    const msg = buildDiceResultMessage([{ ok: true, card: cocTarget }]);
    const back = JSON.parse(JSON.stringify(msg));
    assert.equal(back, msg);
});

console.log(`\n==========================================`);
console.log(`test_dice_card: ${pass} passed, ${fail} failed`);
console.log(`==========================================`);
if (fail) {
    for (const f of failures) console.error('FAILED:', f.name, '\n', f.e && f.e.stack);
    process.exit(1);
}
