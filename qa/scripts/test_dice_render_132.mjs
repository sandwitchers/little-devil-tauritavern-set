// ============================================================================
// test_dice_render_132.mjs — v1.3.2 dice display hardening tests
// Reproduces the EXACT user-reported scenario: a DiceCard marker stored in a
// user message rendered as an EMPTY bubble because the dice regex scripts
// were never imported. Validates all three rendering paths now agree.
// ============================================================================
import { pathToFileURL } from 'node:url';

const CORE = '/home/z/my-project/build/LittleDevilCompanionTT/core.js';
const core = await import(pathToFileURL(CORE).href);

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  ok  ${name}`); }
    else { fail++; console.error(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}

function regexFromString(find) {
    const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(String(find));
    if (!m) throw new Error('bad findRegex: ' + find);
    return new RegExp(m[1], m[2]);
}

// ---- 1. EXACT marker captured from the user's screenshot --------------------
const SCREENSHOT_MARKER = '<DiceCard label="Arcana" sys="D&amp;D" chip="#fbbf24" formula="1d20+5" rolled="Rolled 18 · mod +5" total="23" tone="#34d399" verdict="SUCCESS · DC 12"/>';

const cardRe = regexFromString(core.DICE_CARD_FIND_REGEX);
const cardMatch = cardRe.exec(SCREENSHOT_MARKER); // exec keeps capture groups even with /g
check('screenshot DiceCard marker matches card regex', !!cardMatch);
check('card regex captures 8 groups', cardMatch && cardMatch.length === 9, `len=${cardMatch && cardMatch.length}`);
check('group6 (total) === "23"', cardMatch && cardMatch[6] === '23');
check('group7 (tone) === "#34d399"', cardMatch && cardMatch[7] === '#34d399');
check('group2 (sys) === "D&amp;D"', cardMatch && cardMatch[2] === 'D&amp;D');

// Regex replacement must produce the signature-attributed card
const replaced = SCREENSHOT_MARKER.replace(cardRe, core.DICE_REGEX_SCRIPTS[1].replaceString);
check('regex replacement carries data-ld-dice-card', replaced.includes('data-ld-dice-card="1"'));
check('replacement shows total 23 with tone color', replaced.includes('>23</span>') && replaced.includes('#34d399'));
check('replacement shows D&amp;D pill (renders as D&D)', replaced.includes('>D&amp;D</span>'));
check('replacement shows verdict text', replaced.includes('>SUCCESS · DC 12</span>'));
check('replacement has no leftover $N tokens', !/\$\d/.test(replaced));

// ---- 2. DiceFree + DICE chip regexes ----------------------------------------
const freeMarker = '<DiceFree label="Luck" sys="D&D" chip="#a78bfa" formula="1d6" rolled="Rolled 4" total="4" tone="#a78bfa"/>';
const freeRe = regexFromString(core.DICE_FREE_FIND_REGEX);
const freeMatch = freeMarker.match(freeRe);
check('DiceFree marker matches free regex', !!freeMatch);
const freeHtml = freeMarker.replace(freeRe, core.DICE_REGEX_SCRIPTS[2].replaceString);
check('free replacement carries data-ld-dice-free', freeHtml.includes('data-ld-dice-free="1"'));
check('free replacement has no verdict pill', !freeHtml.includes('background:#a78bfa;border-radius:999px;padding:5px 12px'));

const chipTag = '<DICE>1d20+5:Arcana:DC12</DICE>';
const chipRe = regexFromString(core.DICE_CHIP_FIND_REGEX);
const chipMatch = chipRe.exec(chipTag); // exec keeps capture groups even with /g
check('DICE request tag matches chip regex', !!chipMatch);
check('chip groups: formula/label/extra', chipMatch && chipMatch[1] === '1d20+5' && chipMatch[2] === 'Arcana' && chipMatch[3] === ':DC12');
const chipHtml = chipTag.replace(chipRe, core.DICE_REGEX_SCRIPTS[0].replaceString);
check('chip replacement carries data-ld-dice-request', chipHtml.includes('data-ld-dice-request="1"'));
check('chip replacement shows ROLL badge', chipHtml.includes('>ROLL</span>'));

// ---- 3. renderDiceContent — DOM fallback path --------------------------------
const rendered = core.renderDiceContent(SCREENSHOT_MARKER);
check('marker-only message renders NON-EMPTY (the empty-bubble bug)', rendered.length > 200, `len=${rendered.length}`);
check('fallback render carries data-ld-dice-card', rendered.includes('data-ld-dice-card="1"'));
check('fallback shows total', rendered.includes('>23</span>'));

const mixed = 'Tebakanmu: <DICE>1d20+5:Arcana:DC12</DICE>\nDadu kamu <b>jangan</b> dilempar <DiceFree label="Luck" sys="D&D" chip="#a78bfa" formula="1d6" rolled="Rolled 4" total="4" tone="#a78bfa"/>';
const mixedHtml = core.renderDiceContent(mixed);
check('mixed content: chip rendered', mixedHtml.includes('data-ld-dice-request="1"'));
check('mixed content: free card rendered', mixedHtml.includes('data-ld-dice-free="1"'));
check('mixed content: plain text escaped', mixedHtml.includes('Dadu kamu &lt;b&gt;jangan&lt;/b&gt; dilempar'));
check('mixed content: newline → <br>', mixedHtml.includes('<br>'));

// Round-trip: escape inside attrs is preserved exactly once (no double decode)
const rt = core.renderDiceContent(SCREENSHOT_MARKER);
check('entity preservation: D&amp;D stays encoded for innerHTML', rt.includes('D&amp;D'));

// Malformed markers must never explode
check('malformed chip → escaped text, no throw', core.renderDiceContent('<DICE>garbage here</DICE>').includes('&lt;DICE&gt;'));
check('malformed card → no throw, non-empty', core.renderDiceContent('<DiceCard label="x"').length > 0);

// ---- 4. hasDiceMarkers --------------------------------------------------------
check('hasDiceMarkers: DiceCard', core.hasDiceMarkers(SCREENSHOT_MARKER) === true);
check('hasDiceMarkers: lowercase <dice>', core.hasDiceMarkers('roll <dice>1d6:X</dice>') === true);
check('hasDiceMarkers: none', core.hasDiceMaterials === undefined && core.hasDiceMarkers('plain text') === false);

// ---- 5. DICE_REGEX_SCRIPTS structural shape (TT engine contract) --------------
const REQUIRED = ['id', 'scriptName', 'findRegex', 'replaceString', 'trimStrings',
    'placement', 'disabled', 'markdownOnly', 'promptOnly', 'runOnEdit',
    'substituteRegex', 'minDepth', 'maxDepth'];
for (const s of core.DICE_REGEX_SCRIPTS) {
    const missing = REQUIRED.filter(k => !(k in s));
    check(`script "${s.scriptName}" has all engine fields`, missing.length === 0, missing.join(','));
    check(`script "${s.scriptName}" placement [1,2] + markdownOnly`, Array.isArray(s.placement) && s.placement.includes(1) && s.placement.includes(2) && s.markdownOnly === true && s.promptOnly === false);
    check(`script "${s.scriptName}" replaceString carries signature`, s.replaceString.includes('data-ld-dice-'));
    check(`script "${s.scriptName}" findRegex parses`, !!regexFromString(s.findRegex));
    check(`script "${s.scriptName}" no literal $0`, !s.replaceString.includes('$0'));
}

// ---- 6. buildDiceResultMessage round-trip --------------------------------------
const card = core.resolveCheck(core.parseDiceRequest('1d20+5:Arcana:DC12'));
const body = core.buildDiceResultMessage([{ ok: true, card }]);
check('buildDiceResultMessage emits a marker', body.startsWith('<Dice') || body.startsWith('<DiceCard'), body.slice(0, 40));
const re = body.startsWith('<DiceFree') ? freeRe : cardRe;
check('generated marker matches its regex', re.test(body));

// ---- 7. Self-install simulation (upsert semantics) -----------------------------
// Simulate extension_settings.regex with an outdated copy + an unrelated user script.
const fakeSettings = { regex: [
    { id: 'user_script_1', scriptName: 'User Favorite Script', findRegex: '/x/g', replaceString: 'y', trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null },
    { id: core.DICE_REGEX_SCRIPTS[1].id, scriptName: core.DICE_REGEX_SCRIPTS[1].scriptName, findRegex: '/OLD-PATTERN/g', replaceString: 'OLD', trimStrings: [], placement: [1, 2], disabled: true, markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null },
] };

// Mirror of index.js ensureDiceRegexScripts() upsert core (kept in sync by review)
function ensureDiceRegexScripts(extension_settings, DICE_REGEX_SCRIPTS) {
    if (!Array.isArray(extension_settings.regex)) extension_settings.regex = [];
    const list = extension_settings.regex;
    let changed = 0;
    for (const script of DICE_REGEX_SCRIPTS) {
        const i = list.findIndex(s => s && typeof s === 'object' &&
            (s.id === script.id || s.scriptName === script.scriptName));
        if (i < 0) { list.push({ ...script }); changed++; }
        else if (list[i].findRegex !== script.findRegex ||
                 list[i].replaceString !== script.replaceString ||
                 list[i].scriptName !== script.scriptName) {
            list[i] = { ...script, disabled: list[i].disabled === true };
            changed++;
        }
    }
    return changed;
}

const changed = ensureDiceRegexScripts(fakeSettings, core.DICE_REGEX_SCRIPTS);
check('upsert refreshes outdated + installs missing (3 changes)', changed === 3, `changed=${changed}`);
check('unrelated user script untouched', fakeSettings.regex[0].scriptName === 'User Favorite Script');
check('no duplicates after upsert', fakeSettings.regex.length === 4, `len=${fakeSettings.regex.length}`);
// Push order chip(2), card refresh in place (1), free(3): card stays at index 1
check('user disabled flag preserved on refresh', fakeSettings.regex[1].disabled === true);
check('refreshed script has new pattern', fakeSettings.regex[1].findRegex === core.DICE_REGEX_SCRIPTS[1].findRegex);
check('fresh installs are enabled', fakeSettings.regex[2].disabled === false && fakeSettings.regex[3].disabled === false);

// Idempotency: second run must be a no-op
const changed2 = ensureDiceRegexScripts(fakeSettings, core.DICE_REGEX_SCRIPTS);
check('upsert is idempotent (0 changes on 2nd run)', changed2 === 0, `changed=${changed2}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
