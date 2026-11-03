// Exercise the actual scalar HLSL join block without Unreal or generated assets.
// This checks coverage arithmetic, not GPU derivatives or rendered appearance.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const recipe = fs.readFileSync(new URL('./terrain-ground-blend.py', import.meta.url), 'utf8');
const literal = recipe.match(/\bcode=library\+'''([\s\S]*?)'''/);
assert.ok(literal, 'ground recipe contains its literal HLSL coverage block');
const hlsl = literal[1];
const dominantStart = hlsl.indexOf('float dominant=');
const derivativeStart = hlsl.indexOf('float footprint=');
const joinStart = hlsl.indexOf('float join=');
const colorStart = hlsl.indexOf('float3 color=');
assert.ok(dominantStart >= 0 && dominantStart < derivativeStart &&
    derivativeStart < joinStart && joinStart < colorStart, 'complete join block found');

// Translate only scalar declarations and the unroll annotation. Use the exact
// production equations; supply footprint directly instead of emulating ddx/ddy.
const scalar = (hlsl.slice(dominantStart, derivativeStart) + hlsl.slice(joinStart, colorStart))
    .replace(/\[unroll\]/g, '').replace(/\b(?:float|int)\s+/g, 'let ');
const evaluate = new Function('w', 'paved', 'footprint', `
    const min = Math.min, max = Math.max, lerp = (a, b, t) => a + (b - a) * t;
    ${scalar}
    return w;
`);
let cases = 0;
function blend(weights, paved, footprint) {
    const result = evaluate([...weights], paved, footprint);
    assert.ok(result.every(x => Number.isFinite(x) && x >= 0), 'finite nonnegative coverage');
    assert.ok(Math.abs(result.reduce((a, b) => a + b, 0) - 1) < 1e-12, 'normalized coverage');
    for (let i = 0; i < 7; i++) {
        if (weights[i] === 0) assert.equal(result[i], 0, `absent biome ${i} remains absent`);
    }
    const dominant = Math.max(...weights);
    weights.forEach((weight, i) => {
        if (weight === dominant) assert.ok(result[i] > 0, 'dominant biome survives');
    });
    cases++;
    return result;
}
function near(actual, expected) {
    actual.forEach((x, i) => assert.ok(Math.abs(x - expected[i]) < 1e-12,
        `coverage ${i}: expected ${expected[i]}, got ${x}`));
}

// The review's three-way, wide-footprint reproducer must never invent asphalt,
// wetland, sand or snow, including the snow weight used by specular shading.
const thirds = [1 / 3, 0, 1 / 3, 0, 1 / 3, 0, 0];
near(blend(thirds, 0, 1), thirds);
// A nonuniform mix with dominant < join should retain the supplied proportions.
const broad = [.4, 0, .35, 0, .25, 0, 0];
near(blend(broad, 0, 1), broad);
// Nearby two-way joins retain their existing competitive transition profile.
near(blend([.6, 0, .4, 0, 0, 0, 0], 0, 0), [.34 / .48, 0, .14 / .48, 0, 0, 0, 0]);
near(blend([.9, .1, 0, 0, 0, 0, 0], 1, 0), [1, 0, 0, 0, 0, 0, 0]);

// Every nonempty combination of seven biomes, including pure interiors, ties
// and skewed mixtures, at close, intermediate and capped-distant joins.
for (let mask = 1; mask < 128; mask++) {
    for (const shape of ['equal', 'rising', 'falling']) {
        const raw = Array.from({length: 7}, (_, i) => (mask & (1 << i)) ?
            (shape === 'equal' ? 1 : shape === 'rising' ? (i + 1) ** 2 : (7 - i) ** 2) : 0);
        const total = raw.reduce((a, b) => a + b, 0);
        const weights = raw.map(x => x / total);
        for (const paved of [0, .5, 1]) {
            for (const footprint of [0, .25, 2]) {
                const result = blend(weights, paved, footprint);
                if (shape === 'equal') near(result, weights);
                // Relabeling all biomes must not affect their coverage.
                near(blend([...weights].reverse(), paved, footprint), [...result].reverse());
            }
        }
    }
}
console.log(JSON.stringify({pass: true, cases, supportCombinations: 127,
    scope: 'Production scalar HLSL translated to JavaScript; no GPU/render acceptance.'}));
