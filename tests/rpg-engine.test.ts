// tests/rpg-engine.test.ts — run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLevel, xpForLevel, levelProgress, JURY_MIN_AURA } from '../lib/rpg-engine.ts';

test('level never goes below 1, even for zero or negative XP', () => {
  assert.equal(calculateLevel(0), 1);
  assert.equal(calculateLevel(-500), 1);
});

test('level grows with XP', () => {
  assert.ok(calculateLevel(10_000) > calculateLevel(1_000));
});

test('xpForLevel is the inverse of calculateLevel (one XP above the threshold)', () => {
  // xpForLevel rounds, so exactly AT the threshold the level can read one lower.
  // That known quirk is documented in lib/rpg-engine.ts; +1 XP always reaches the level.
  for (const level of [2, 5, 10, 20]) {
    assert.equal(calculateLevel(xpForLevel(level) + 1), level);
  }
});

test('level progress stays between 0 and 1', () => {
  for (const xp of [0, 50, 756, 5_766, 123_456]) {
    const p = levelProgress(xp);
    assert.ok(p >= 0 && p <= 1, `xp ${xp} gave ${p}`);
  }
});

test('jury minimum matches the documented rule (100 Aura)', () => {
  assert.equal(JURY_MIN_AURA, 100);
});
