import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CityPower } from './world/city-power';
import { RainSchedule } from './weather';
import { CHECKPOINT, initialCheckpoint, reduceCheckpoint } from './checkpoint';
import { radioCaption, STATIONS } from './radio';

const half = () => 0.5;

test('dumsor only starts after dark, covers the rider area and comes back', () => {
  const p = new CityPower(half);
  assert.equal(p.update(0, 0.1, { x: 0, z: 0 }), null, 'no outage in daylight');
  assert.equal(p.update(10, 0.9, { x: 0, z: 0 }), null, 'first cut waits a little after dark');
  let event = null;
  let t = 10;
  while (!event && t < 200) event = p.update(t += 1, 0.9, { x: 0, z: 0 });
  assert.equal(event, 'off');
  assert.equal(p.powered(0, 0), false);
  assert.equal(p.powered(2000, 0), true, 'the rest of the city keeps light');
  while (p.outage && t < 500) event = p.update(t += 1, 0.9, { x: 0, z: 0 });
  assert.equal(event, 'on');
  assert.equal(p.powered(0, 0), true);
});

test('rain builds, slows to a stop and schedules the next shower', () => {
  const r = new RainSchedule(half, 10);
  let t = 0;
  let started = false;
  while (t < 40) { if (r.update(t += 0.5, 0.5) === 'start') started = true; }
  assert.ok(started && r.raining);
  assert.ok(r.intensity > 0.5, 'shower builds up');
  let stopped = false;
  while (t < 200 && !stopped) stopped = r.update(t += 0.5, 0.5) === 'stop';
  assert.ok(stopped && !r.raining);
  for (let i = 0; i < 80; i++) r.update(t += 0.5, 0.5);
  assert.equal(r.intensity, 0, 'clears completely');
});

const tick = (distance: number, speed: number, dt = 0.1) => ({ type: 'tick' as const, dt, distance, speed });

test('checkpoint: warn, stop, show licence and wait to be cleared', () => {
  let s = reduceCheckpoint(initialCheckpoint(), tick(60, 8));
  assert.ok(s.warned);
  s = reduceCheckpoint(s, tick(6, 0.5));
  assert.equal(s.stage, 'stopped');
  s = reduceCheckpoint(s, { type: 'showLicence' });
  assert.equal(s.stage, 'checking');
  for (let i = 0; i < CHECKPOINT.checkSeconds * 10 + 1; i++) s = reduceCheckpoint(s, tick(6, 0));
  assert.equal(s.stage, 'cleared');
});

test('checkpoint: riding through or leaving mid-stop is fined; settling clears at once', () => {
  assert.equal(reduceCheckpoint(initialCheckpoint(), tick(3, 9)).stage, 'fined');
  const stopped = reduceCheckpoint(initialCheckpoint(), tick(6, 0));
  assert.equal(reduceCheckpoint(stopped, tick(20, 5)).stage, 'fined');
  assert.equal(reduceCheckpoint(stopped, { type: 'settle' }).stage, 'cleared');
  assert.equal(reduceCheckpoint(initialCheckpoint(), { type: 'settle' }).stage, 'ahead', 'cannot settle before stopping');
});

test('radio: only real Ghana stations, live first, all over https', () => {
  assert.ok(STATIONS[0].stream, 'default is a live station');
  assert.ok(STATIONS.every(st => st.stream || st.soundcloud), 'no synthesized stations');
  assert.ok(STATIONS.filter(st => st.stream).every(st => st.stream!.startsWith('https://')));
  assert.match(radioCaption(0), /LIVE/);
  assert.equal(radioCaption(STATIONS.findIndex(st => st.soundcloud)), '');
  assert.equal(radioCaption(-1), '');
});
