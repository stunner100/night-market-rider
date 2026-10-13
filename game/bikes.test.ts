import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKES, DRIFT, bikeFor, inSlipstream, initialFeel, statBars, stepDrift, stepSlip } from './bikes';
import { buyBike, selectBike, useGame } from './store';

test('drift needs speed, hard steer and the key; a good slide pays a kick on release', () => {
  let f = initialFeel();
  assert.equal(stepDrift(f, { drift: true, steer: 1, speed: 5 }, 0.1).feel.drift, 0, 'too slow');
  assert.equal(stepDrift(f, { drift: true, steer: 0.2, speed: 20 }, 0.1).feel.drift, 0, 'not steering');
  for (let i = 0; i < 12; i++) f = stepDrift(f, { drift: true, steer: 1, speed: 20 }, 0.1).feel;
  assert.ok(f.drift > 1 && f.slide > 0.3, 'drifting with the tail out');
  const release = stepDrift(f, { drift: false, steer: 0, speed: 18 }, 0.1);
  assert.ok(release.bonus > 0 && release.bonus <= DRIFT.maxBonus);
  assert.equal(release.feel.drift, 0);
  const flick = stepDrift({ ...initialFeel(), drift: 0.2 }, { drift: false, steer: 0, speed: 18 }, 0.1);
  assert.equal(flick.bonus, 0, 'a flick is not a drift');
});

test('slipstream only directly behind a vehicle going the same way', () => {
  const trotro = { x: 0, z: 0, yaw: 0 }; // facing +z
  const rider = (x: number, z: number, heading = 0, speed = 15) => ({ x, z, heading, speed });
  assert.ok(inSlipstream(rider(0.5, -8), trotro));
  assert.ok(!inSlipstream(rider(0, 8), trotro), 'in front');
  assert.ok(!inSlipstream(rider(3, -8), trotro), 'beside');
  assert.ok(!inSlipstream(rider(0, -30), trotro), 'too far back');
  assert.ok(!inSlipstream(rider(0, -8, Math.PI), trotro), 'opposite direction');
  assert.ok(!inSlipstream(rider(0, -8, 0, 4), trotro), 'too slow');
  let f = initialFeel();
  for (let i = 0; i < 10; i++) f = stepSlip(f, true, 0.1);
  assert.equal(f.slip, 1);
  for (let i = 0; i < 3; i++) f = stepSlip(f, false, 0.1);
  assert.ok(f.slip < 0.5);
});

test('garage: stats are 1–5, first bike is free, buying spends earnings and selects', () => {
  for (const b of BIKES) for (const n of Object.values(statBars(b))) assert.ok(n >= 1 && n <= 5);
  assert.equal(BIKES[0].price, 0);
  assert.equal(bikeFor(null).id, 'ace');
  useGame.getState().set({ earnings: 200, ownedBikes: ['ace'], bike: 'ace' });
  assert.equal(buyBike('apsonic'), false, 'too expensive');
  assert.equal(buyBike('haojue'), true);
  assert.equal(useGame.getState().earnings, 50);
  assert.equal(useGame.getState().bike, 'haojue');
  assert.equal(buyBike('haojue'), false, 'already owned');
  selectBike('apsonic');
  assert.equal(useGame.getState().bike, 'haojue', 'cannot ride a bike you do not own');
  selectBike('ace');
  assert.equal(useGame.getState().bike, 'ace');
});
