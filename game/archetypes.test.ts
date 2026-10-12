import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCHETYPES, QUIZ, perksFor, scoreQuiz } from './archetypes';
import { settleDelivery } from './delivery/settlement';

test('every question offers each archetype exactly once', () => {
  for (const q of QUIZ) {
    assert.deepEqual(q.answers.map(a => a.to).sort(), Object.keys(ARCHETYPES).sort());
  }
});

test('quiz picks the most-chosen archetype; ties go to the first answer', () => {
  assert.equal(scoreQuiz(['campus', 'okada', 'campus', 'burger']), 'campus');
  assert.equal(scoreQuiz(['burger', 'chopbar', 'chopbar', 'burger']), 'burger');
  assert.equal(scoreQuiz(['okada', 'campus', 'burger', 'chopbar']), 'okada');
});

test('perks: no archetype is neutral; campus hustlers earn bigger tips', () => {
  assert.equal(perksFor(null).speed, 1);
  assert.equal(perksFor('burger').startCash, 100);
  const base = { fare: 10, streakMultiplier: 1, condition: 100, onTime: true, timeLeft: 60, collisions: 0, missingAccepted: false, itemFixed: false, changeError: 0 };
  const plain = settleDelivery(base).tip;
  const campus = settleDelivery({ ...base, tipMultiplier: perksFor('campus').tips }).tip;
  assert.ok(campus > plain);
});
