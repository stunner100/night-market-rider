import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CallDirector, CALL_GAP } from './calls';

const ctx = { nickname: 'Kojo' };

test('texts arrive at once; calls queue until the rider is free', () => {
  const d = new CallDirector();
  assert.equal(d.notify('shiftStart', ctx).length, 0);
  assert.equal(d.next(0, 'offer', false), null, 'never rings over an offer');
  const call = d.next(0, 'offline', false);
  assert.equal(call?.name, 'Auntie Dede');
  assert.match(call!.lines[0], /Kojo/);
  assert.ok(call?.missed, 'a declined intro leaves a text');
  const texts = d.notify('online', ctx);
  assert.equal(texts[0].script.kind, 'text');
});

test('one-off scripts fire once; repeatable ones keep firing', () => {
  const d = new CallDirector();
  assert.equal(d.notify('online', ctx).length, 1);
  assert.equal(d.notify('online', ctx).length, 0);
  const first = d.notify('delivered', { ...ctx, payout: 9.5, earnings: 9.5, deliveries: 1 });
  assert.deepEqual(first.map(t => t.script.id), ['momo-payout', 'dede-first']);
  assert.match(first[0].lines[0], /GHS 9\.50/);
  assert.deepEqual(d.notify('delivered', { ...ctx, deliveries: 2 }).map(t => t.script.id), ['momo-payout']);
});

test('calls are spaced out and conditional scripts wait for their moment', () => {
  const d = new CallDirector();
  d.notify('crash', { ...ctx, crashes: 1 });
  assert.equal(d.next(0, 'offline', false), null, 'first knock is forgiven');
  d.notify('crash', { ...ctx, crashes: 2 });
  d.notify('fuelLow', ctx);
  assert.equal(d.next(100, 'ridePickup', false)?.name, 'Kofi Mechanic');
  assert.equal(d.next(105, 'ridePickup', false), null, 'needs a gap between calls');
  assert.equal(d.next(105 + CALL_GAP, 'ridePickup', true), null, 'never rings over another call');
  assert.match(d.next(105 + CALL_GAP, 'ridePickup', false)!.lines[0], /fuel/);
});

test('late texts come from the order customer', () => {
  const d = new CallDirector();
  const [late] = d.notify('late', { ...ctx, customer: 'Akosua' });
  assert.equal(late.name, 'Akosua');
});
