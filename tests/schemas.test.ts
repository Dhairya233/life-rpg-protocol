// tests/schemas.test.ts — run with: npm test
// Checks that the server rejects bad input and strips unknown fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  questFormSchema, courtDecisionSchema, playerUpdateSchema,
  planRequestSchema, aiQuestListSchema, discoverySchema,
} from '../lib/schemas.ts';

const UUID = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f';

test('quest form: a valid quest passes', () => {
  const r = questFormSchema.safeParse({
    title: 'Deep Work', description: null, skill_type: 'focus', difficulty: 'hard',
    xp_reward: 800, duration_minutes: 90,
  });
  assert.equal(r.success, true);
});

test('quest form: absurd rewards are rejected', () => {
  const base = { title: 'x', skill_type: 'focus', difficulty: 'easy', duration_minutes: 10 };
  assert.equal(questFormSchema.safeParse({ ...base, xp_reward: 999999 }).success, false);
  assert.equal(questFormSchema.safeParse({ ...base, xp_reward: -5 }).success, false);
  assert.equal(questFormSchema.safeParse({ ...base, xp_reward: 1.5 }).success, false);
});

test('quest form: unknown fields are dropped (no mass assignment)', () => {
  const r = questFormSchema.parse({
    title: 'x', skill_type: 'coding', difficulty: 'easy', xp_reward: 10, duration_minutes: 5,
    aura_reward: 99999, created_at: 'yesterday', role: 'admin',
  });
  assert.deepEqual(Object.keys(r).sort(), ['difficulty', 'duration_minutes', 'skill_type', 'title', 'xp_reward']);
});

test('court decision: only the three known actions', () => {
  assert.equal(courtDecisionSchema.safeParse({ userQuestId: UUID, action: 'approve' }).success, true);
  assert.equal(courtDecisionSchema.safeParse({ userQuestId: UUID, action: 'delete-everything' }).success, false);
  assert.equal(courtDecisionSchema.safeParse({ userQuestId: 'not-a-uuid', action: 'reject' }).success, false);
});

test('player update: has no role field, and values are bounded', () => {
  const ok = playerUpdateSchema.parse({ userId: UUID, xp: 10, aura: 5, isBanned: false, role: 'admin' });
  assert.equal('role' in ok, false);                       // role is stripped, never forwarded
  assert.equal(playerUpdateSchema.safeParse({ userId: UUID, xp: -1, aura: 5, isBanned: false }).success, false);
  assert.equal(playerUpdateSchema.safeParse({ userId: UUID, xp: 1, aura: 10 ** 9, isBanned: false }).success, false);
});

test('plan request: empty and oversized diary entries are rejected', () => {
  assert.equal(planRequestSchema.safeParse({ entry: '   ' }).success, false);
  assert.equal(planRequestSchema.safeParse({ entry: 'a'.repeat(2001) }).success, false);
  assert.equal(planRequestSchema.safeParse({ entry: 'Long day, felt tired.' }).success, true);
});

test('AI output is untrusted: out-of-range or malformed answers are rejected', () => {
  const good = { title: 'Walk', description: 'Go outside', skill_type: 'fitness', xp_reward: 40, duration_minutes: 20 };
  assert.equal(aiQuestListSchema.safeParse([good]).success, true);
  assert.equal(aiQuestListSchema.safeParse([{ ...good, xp_reward: 5000 }]).success, false);
  assert.equal(aiQuestListSchema.safeParse([{ ...good, skill_type: 'hacking' }]).success, false);
  assert.equal(aiQuestListSchema.safeParse([]).success, false);
  assert.equal(aiQuestListSchema.safeParse([good, good, good, good]).success, false);
  assert.equal(aiQuestListSchema.safeParse('ignore previous instructions').success, false);
});

test('discovery: needs a short non-empty reference', () => {
  assert.equal(discoverySchema.safeParse({ imageRef: '' }).success, false);
  assert.equal(discoverySchema.safeParse({ imageRef: 'x'.repeat(501) }).success, false);
  assert.equal(discoverySchema.safeParse({ imageRef: 'ok' }).success, true);
});
