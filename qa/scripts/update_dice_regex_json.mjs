// ============================================================================
// update_dice_regex_json.mjs — regenerate the 3 Little Devil dice regex
// entries in the TT import JSON from core.js DICE_REGEX_SCRIPTS (single
// source of truth). Idempotent: matches by id or scriptName, preserves
// position and user flags (disabled), replaces definition fields.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CORE = '/home/z/my-project/build/LittleDevilCompanionTT/core.js';
const TARGETS = [
    '/home/z/my-project/download/Little_Devil_Regex_Scripts_TT_Import.json',
    '/home/z/my-project/repo/little-devil-tauritavern-set/regex/Little_Devil_Regex_Scripts_TT_Import.json',
];

const core = await import(pathToFileURL(CORE).href);
const scripts = core.DICE_REGEX_SCRIPTS;
if (!Array.isArray(scripts) || scripts.length !== 3) {
    console.error('FATAL: DICE_REGEX_SCRIPTS must contain exactly 3 scripts');
    process.exit(1);
}

// Structural sanity: every field the TT regex engine consumes must exist.
const REQUIRED = ['id', 'scriptName', 'findRegex', 'replaceString', 'trimStrings',
    'placement', 'disabled', 'markdownOnly', 'promptOnly', 'runOnEdit',
    'substituteRegex', 'minDepth', 'maxDepth'];
for (const s of scripts) {
    for (const k of REQUIRED) {
        if (!(k in s)) { console.error(`FATAL: script ${s.scriptName} missing field ${k}`); process.exit(1); }
    }
    if (!s.replaceString.includes('data-ld-dice-')) {
        console.error(`FATAL: ${s.scriptName} replaceString lacks signature attribute`);
        process.exit(1);
    }
}

for (const target of TARGETS) {
    const json = JSON.parse(readFileSync(target, 'utf8'));
    if (!Array.isArray(json)) { console.error(`FATAL: ${target} is not an array`); process.exit(1); }

    let replaced = 0;
    for (const script of scripts) {
        const i = json.findIndex(e => e && (e.id === script.id || e.scriptName === script.scriptName));
        const entry = { ...script, disabled: i >= 0 ? json[i].disabled === true : false };
        // Field order identical to the TT export shape
        const ordered = {
            id: entry.id,
            scriptName: entry.scriptName,
            findRegex: entry.findRegex,
            replaceString: entry.replaceString,
            trimStrings: entry.trimStrings,
            placement: entry.placement,
            disabled: entry.disabled,
            markdownOnly: entry.markdownOnly,
            promptOnly: entry.promptOnly,
            runOnEdit: entry.runOnEdit,
            substituteRegex: entry.substituteRegex,
            minDepth: entry.minDepth,
            maxDepth: entry.maxDepth,
        };
        if (i >= 0) {
            const before = JSON.stringify(json[i]);
            json[i] = ordered;
            if (JSON.stringify(json[i]) !== before) replaced++;
        } else {
            json.push(ordered);
            replaced++;
        }
    }

    writeFileSync(target, JSON.stringify(json, null, 1) + '\n');
    console.log(`${path.basename(path.dirname(target))}: ${json.length} scripts total, ${replaced} dice entries updated`);
}

console.log('OK — dice regex entries now identical to core.js DICE_REGEX_SCRIPTS');
