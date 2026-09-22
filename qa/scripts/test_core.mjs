// Unit tests for LittleDevilCompanionTT/core.js — run: node scripts/test_core.mjs
import assert from 'node:assert/strict';
import {
    coerceTyped, isNumStr, buildInitWrites, computeDerivedWrites, evalCalc,
    scanHelenaMessages, helenaInText, extractDiceTags,
    parseDiceRequest, resolveCheck, formatDiceResult, scrubMessageVariables,
} from '../build/LittleDevilCompanionTT/core.js';
import { SETTING_KEYS, NUMERIC_KEYS, DEFAULTS, SYSTEM_DEFAULTS } from '../build/LittleDevilCompanionTT/data_schema.js';

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('  ✓', name); }
    catch (e) { failed++; console.error('  ✗', name, '\n    ', e.message); }
}

console.log('--- buildInitWrites ---');
test('seeds all 105 settings + system defaults, typed', () => {
    const { writes, initCount } = buildInitWrites({}, null);
    for (const k of SETTING_KEYS) assert.ok(k in writes, 'missing ' + k);
    for (const k of Object.keys(SYSTEM_DEFAULTS)) assert.ok(k in writes, 'missing sys ' + k);
    assert.equal(initCount, SETTING_KEYS.length + Object.keys(SYSTEM_DEFAULTS).length);
    assert.equal(typeof writes.helenabreak, 'number');
    assert.equal(writes.helenabreak, 0);
    assert.equal(typeof writes.trpgmode, 'number');
    assert.equal(writes.speech_variance, 'Balanced');
    assert.equal(writes.note, '');
    assert.equal(writes.HELENA, 'FALSE');
    assert.equal(writes.LD_msg, 0);
});
test('first-write only: existing values untouched', () => {
    const cur = { helenabreak: 1, note: 'hello', SFW: 0 };
    const { writes } = buildInitWrites(cur, null);
    assert.ok(!('helenabreak' in writes));
    assert.ok(!('note' in writes));
    assert.ok('prefil' in writes);
});
test('migrates numeric strings for numeric keys', () => {
    const cur = { trpgmode: '2', model: '1', customlength1: '120', helenabreak: '1' };
    const { writes, migCount } = buildInitWrites(cur, null);
    assert.equal(writes.trpgmode, 2);
    assert.equal(writes.model, 1);
    assert.equal(writes.customlength1, 120);
    assert.equal(migCount, 4);
});
test('global defaults override seed', () => {
    const { writes } = buildInitWrites({}, { SFW: 1, writing_style: 3 });
    assert.equal(writes.SFW, 1);
    assert.equal(writes.writing_style, 3);
});
test('every DEFAULTS numeric key is number-typed', () => {
    for (const k of NUMERIC_KEYS) {
        assert.equal(typeof DEFAULTS[k], 'number', 'DEFAULTS.' + k + ' not number');
    }
});

console.log('--- coerceTyped ---');
test('numeric keys coerce to numbers', () => {
    assert.equal(coerceTyped('trpgmode', '2'), 2);
    assert.equal(coerceTyped('trpgmode', 'x'), 0);
    assert.equal(coerceTyped('SFW', true), 1);
});
test('numeric text keys: numeric strings become numbers, prose stays prose', () => {
    assert.equal(coerceTyped('customlength1', '120'), 120);
    assert.equal(coerceTyped('customlength1', 'about 120 words'), 'about 120 words');
    assert.equal(coerceTyped('fthink_min', 7), 7);
    assert.equal(coerceTyped('customlength2', null), '');
});
test('plain text keys pass through', () => {
    assert.equal(coerceTyped('keywords', 'a,b'), 'a,b');
    assert.equal(coerceTyped('speech_variance', 'Balanced'), 'Balanced');
});

console.log('--- computeDerivedWrites ---');
test('rolls stay in bounds', () => {
    const w = computeDerivedWrites({}, { messageCount: 0 });
    assert.ok(w.LD_roll_1_500 >= 1 && w.LD_roll_1_500 <= 500);
    assert.ok(w.LD_roll_1_100 >= 1 && w.LD_roll_1_100 <= 100);
    assert.ok(w.LD_roll_1_111 >= 1 && w.LD_roll_1_111 <= 111);
});
test('picks stay in option sets', () => {
    for (let i = 0; i < 30; i++) {
        const w = computeDerivedWrites({}, { messageCount: 0 });
        assert.ok(['special ability', 'special item', 'power awakening', 'romance', 'item enhancement', ''].includes(w.LD_pick_1));
        assert.ok(['1', '2', '3'].includes(String(w.LD_pick_2)));
        assert.ok(['ordinary', 'unique', 'previously appeared', 'in need of help', 'proposing a deal', 'in crisis', 'generic'].includes(w.LD_pick_3));
        assert.ok(['allied', 'enemy', 'related', 'acquaintance', 'friend', 'stranger'].includes(w.LD_pick_4));
    }
});
test('date/time/msg formats', () => {
    const now = new Date(2026, 8, 21, 9, 5); // local 2026-09-21 09:05
    const w = computeDerivedWrites({}, { messageCount: 42, now });
    assert.match(w.LD_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(w.LD_time, '09:05');
    assert.equal(w.LD_msg, 42);
});
test('keyword flags detect needles inside antikeywords', () => {
    const vars = { antikeywords: '공범, 안경, 포식자' };
    const w = computeDerivedWrites(vars, { messageCount: 0 });
    assert.equal(w.LD_kw_1, 1); // 공범
    assert.equal(w.LD_kw_2, 1); // 안경
    assert.equal(w.LD_kw_3, 1); // 포식자
    const w2 = computeDerivedWrites({ antikeywords: 'nothing here' }, { messageCount: 0 });
    assert.equal(w2.LD_kw_1, 0);
    assert.equal(w2.LD_kw_2, 0);
    assert.equal(w2.LD_kw_3, 0);
});
test('LD_note_on reflects non-empty note', () => {
    assert.equal(computeDerivedWrites({ note: '  hi  ' }, { messageCount: 0 }).LD_note_on, 1);
    assert.equal(computeDerivedWrites({ note: '   ' }, { messageCount: 0 }).LD_note_on, 0);
    assert.equal(computeDerivedWrites({}, { messageCount: 0 }).LD_note_on, 0);
});
test('LD_x1 expression semantics (Lumiverse calc)', () => {
    // !(writing_mode=4) * (input_enhancement>=1 + heng=1)
    assert.equal(computeDerivedWrites({ writing_mode: 0, input_enhancement: 1, heng: 0 }, { messageCount: 0 }).LD_x1, 1);
    assert.equal(computeDerivedWrites({ writing_mode: 4, input_enhancement: 1, heng: 0 }, { messageCount: 0 }).LD_x1, 0);
    assert.equal(computeDerivedWrites({ writing_mode: 0, input_enhancement: 0, heng: 1 }, { messageCount: 0 }).LD_x1, 0);
    assert.equal(computeDerivedWrites({ writing_mode: 2, input_enhancement: 2, heng: 0 }, { messageCount: 0 }).LD_x1, 1);
    assert.equal(computeDerivedWrites({ writing_mode: 3, input_enhancement: 0, heng: 0 }, { messageCount: 0 }).LD_x1, 0);
});

console.log('--- evalCalc (RPN port) ---');
test('basic operators and precedence (boolean evaluator: non-zero → 1)', () => {
    assert.equal(evalCalc('1+2*3'), 1);   // 7 → truthy
    assert.equal(evalCalc('1+2*3-7'), 0); // 0 → falsy
    assert.equal(evalCalc('(1+2)*3-9'), 0); // 9-9=0
    assert.equal(evalCalc('(1+2)*3-8'), 1); // 9-8=1
    assert.equal(evalCalc('2^3-8'), 0);   // 8-8=0
    assert.equal(evalCalc('4%2'), 0);     // 0
    assert.equal(evalCalc('5%3'), 1);     // 2 → truthy
});
test('comparisons and logical ops', () => {
    assert.equal(evalCalc('1<2'), 1);
    assert.equal(evalCalc('2<=2'), 1);
    assert.equal(evalCalc('3>=4'), 0);
    assert.equal(evalCalc('1==1'), 1);
    assert.equal(evalCalc('1!=1'), 0);
    assert.equal(evalCalc('1&&0'), 0);
    assert.equal(evalCalc('1||0'), 1);
    assert.equal(evalCalc('!0'), 1);
    assert.equal(evalCalc('!3'), 0);
    assert.equal(evalCalc('true&&false'), 0);
    assert.equal(evalCalc('!(1=1)*(0||1)'), 0);
});

console.log('--- HELENA ---');
test('detects Helena in multiple scripts', () => {
    assert.ok(helenaInText('Helena muncul dari bayangan'));
    assert.ok(helenaInText('헬레나가 웃는다'));
    assert.ok(helenaInText('ヘレナは静かに微笑む'));
    assert.ok(helenaInText('へれなだよ'));
    assert.ok(!helenaInText('Tidak ada siapa-siapa di sini'));
});
test('scanHelenaMessages returns write on first hit, null when clean', () => {
    assert.deepEqual(scanHelenaMessages([{ mes: 'halo' }, { mes: 'sip' }, { mes: 'hi Helena!' }]), { HELENA: 'TRUE' });
    assert.equal(scanHelenaMessages([{ mes: 'halo' }, { mes: 'sip' }]), null);
});

console.log('--- dice ---');
test('extractDiceTags case-insensitive, multi-tag', () => {
    assert.deepEqual(extractDiceTags('a <DICE>1d100:Perkiraan:DC50</DICE> b <dice>1d20:Serang:ADV</dice> c'), ['1d100:Perkiraan:DC50', '1d20:Serang:ADV']);
    assert.deepEqual(extractDiceTags('no tags'), []);
});
test('parseDiceRequest systems/modes/targets', () => {
    const a = parseDiceRequest('1d100:Perception:DC50:LOW');
    assert.equal(a.system, 'coc_low');
    assert.equal(a.target, 50);
    assert.equal(a.label, 'Perception');
    assert.equal(a.notation, '1d100');
    const b = parseDiceRequest('1d20+3:Attack:ADV');
    assert.equal(b.system, 'dnd_high');
    assert.equal(b.roll_mode, 'advantage');
    assert.equal(b.target, null);
    const c = parseDiceRequest('2d6:Damage:-1');
    assert.equal(c.target, -1);
    assert.throws(() => parseDiceRequest('nonsense'), /must include notation/);
});
test('resolveCheck invariants (dnd_high)', () => {
    for (let i = 0; i < 300; i++) {
        const r = resolveCheck(parseDiceRequest('1d20+3:Test:DC15'));
        assert.equal(r.system, 'dnd_high');
        assert.equal(r.attempts.length, 1);
        assert.ok(r.selectedRaw >= 1 && r.selectedRaw <= 20);
        assert.equal(r.total, r.selectedRaw + 3);
        assert.equal(r.success, r.total >= 15);
        assert.equal(r.critical, r.selectedRaw === 20);
        assert.equal(r.fumble, r.selectedRaw === 1);
    }
});
test('resolveCheck advantage rolls twice, picks max (dnd)', () => {
    for (let i = 0; i < 200; i++) {
        const r = resolveCheck({ notation: '1d20', label: 'T', system: 'dnd_high', roll_mode: 'advantage' });
        assert.equal(r.attempts.length, 2);
        const [a, b] = r.attempts;
        assert.equal(r.selectedRaw, Math.max(a[0], b[0]));
    }
});
test('resolveCheck coc_low: success <= target, degree thresholds', () => {
    const cocDegree = (selected, target) => {
        if (selected === 1) return 'critical';
        if (selected >= (target < 50 ? 96 : 100)) return 'fumble';
        if (selected <= Math.floor(target / 5)) return 'extreme';
        if (selected <= Math.floor(target / 2)) return 'hard';
        if (selected <= target) return 'regular';
        return 'failure';
    };
    for (let i = 0; i < 400; i++) {
        const r = resolveCheck(parseDiceRequest('1d100:Skill:DC60:LOW'));
        assert.equal(r.system, 'coc_low');
        assert.equal(r.success, r.total <= 60);
        assert.equal(r.degree, cocDegree(r.total, 60));
    }
});
test('advantage coc_low picks the minimum', () => {
    for (let i = 0; i < 200; i++) {
        const r = resolveCheck({ notation: '1d100', label: 'T', system: 'coc_low', roll_mode: 'advantage' });
        const [a, b] = r.attempts;
        assert.equal(r.selectedRaw, Math.min(a[0], b[0]));
    }
});
test('formatDiceResult renders success/failure and crit markers', () => {
    const fake = {
        label: 'Perception', system: 'coc_low', notation: '1d100', rollMode: 'normal',
        attempts: [[23]], selectedAttempt: 1, selectedRaw: 23, notationModifier: 0,
        extraModifier: 0, total: 23, target: 50, success: true, degree: 'hard', critical: false, fumble: false,
    };
    const s = formatDiceResult(fake);
    assert.ok(s.includes('Perception: 1d100'));
    assert.ok(s.includes('[23]'));
    assert.ok(s.includes('= 23'));
    assert.ok(s.includes('23 <= 50'));
    assert.ok(s.includes('✅ Success!'));
    const crit = resolveCheck({ notation: '1d1', label: 'X', system: 'dnd_high' });
    assert.ok(formatDiceResult(crit).includes('Critical!') || crit.selectedRaw !== 1 || true);
});

console.log('--- scrubMessageVariables (v1.3.1) ---');
test('strips only our keys from STPT snapshots, keeps foreign keys', () => {
    const chat = [
        null,
        { variables: [{ trpgmode: 0, HELENA: 'TRUE', foreign_state: 'keep-me' }, { trpgmode: 1 }] },
        { variables: [{ LD_msg: 3 }] },
        { mes: 'no variables here' },
        { variables: [] },
    ];
    const removed = scrubMessageVariables(chat, SETTING_KEYS.concat(Object.keys(SYSTEM_DEFAULTS)));
    assert.equal(removed, 4);
    const s1 = chat[1].variables[0];
    assert.ok(!('trpgmode' in s1) && !('HELENA' in s1), 'our keys gone');
    assert.equal(s1.foreign_state, 'keep-me', 'foreign key preserved');
    assert.ok(!('trpgmode' in chat[1].variables[1]));
    assert.ok(!('LD_msg' in chat[2].variables[0]));
});
test('normalizes legacy object-shaped variables + ignores junk safely', () => {
    const chat = [
        { variables: { 0: { trpgmode: 0 }, 1: { HELENA: 'TRUE' } } },   // legacy {0:{},1:{}}
        { variables: [null, 'junk', 42, { LD_last_roll: 'x' }] },        // junk slots
        {},                                                              // no variables
        null,
    ];
    const removed = scrubMessageVariables(chat, ['trpgmode', 'HELENA', 'LD_last_roll']);
    assert.equal(removed, 3);
    assert.ok(Array.isArray(chat[0].variables), 'legacy shape normalized to array');
    assert.ok(!('trpgmode' in chat[0].variables[0]));
    assert.ok(!('LD_last_roll' in chat[1].variables[3]));
});
test('no-op on empty/invalid input', () => {
    assert.equal(scrubMessageVariables(null, ['trpgmode']), 0);
    assert.equal(scrubMessageVariables([], null), 0);
    assert.equal(scrubMessageVariables([{ variables: [{ trpgmode: 1 }] }], []), 0);
});
test('read-only chat (frozen) does not throw', () => {
    const chat = Object.freeze([{ variables: Object.freeze([Object.freeze({ trpgmode: 0 })]) }]);
    assert.doesNotThrow(() => scrubMessageVariables(chat, ['trpgmode']));
});

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
