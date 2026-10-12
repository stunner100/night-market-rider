import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialDelivery,
  reduceDelivery,
  type DeliveryContext,
  type DeliveryEvent,
} from "./machine";
const context: DeliveryContext = {
  mounted: true,
  speed: 0,
  vendorDistance: 100,
  customerDistance: 100,
  destinationDistance: 100,
  bikeDistance: 0,
  delay: 3,
  customer: "Ama",
};
test("complete shift requires acceptance, walking, collection, contact and handoff", () => {
  let s = initialDelivery();
  let c = { ...context };
  const event = (type: Exclude<DeliveryEvent["type"], "giveChange">, dt = 1) => {
    s = reduceDelivery(s, type === "tick" ? { type, dt } : { type }, c);
  };
  const tick = (n: number) => {
    for (let i = 0; i < n; i++) event("tick");
  };
  event("online");
  tick(4);
  event("offer");
  event("accept");
  assert.equal(s.stage, "ridePickup");
  c.vendorDistance = 2;
  tick(1);
  assert.equal(s.stage, "vendor");
  event("confirm");
  assert.equal(s.stage, "vendor");
  c.mounted = false;
  event("confirm");
  assert.equal(s.stage, "preparing");
  tick(3);
  assert.equal(s.stage, "collect");
  c.vendorDistance = 20;
  event("collect");
  assert.equal(s.stage, "collect");
  c.vendorDistance = 2;
  event("collect");
  assert.equal(s.stage, "checkBag");
  event("approveBag");
  assert.equal(s.stage, "returnBike");
  assert.equal(s.missingAccepted, false);
  tick(1);
  assert.equal(s.stage, "returnBike");
  c.mounted = true;
  tick(1);
  assert.equal(s.stage, "rideCustomer");
  c.destinationDistance = 30;
  tick(1);
  assert.equal(s.stage, "contact");
  c.speed = 10;
  event("call");
  assert.equal(s.stage, "contact");
  c.speed = 0;
  event("call");
  tick(3);
  assert.equal(s.stage, "findCustomer");
  c.customerDistance = 2;
  event("handoff");
  assert.equal(s.stage, "findCustomer");
  c.mounted = false;
  event("handoff");
  tick(2);
  assert.equal(s.stage, "completed");
  event("handoff");
  assert.equal(s.stage, "completed");
  tick(5);
  assert.equal(s.stage, "waiting");
  assert.equal(s.accepted, 1);
  assert.equal(s.offered, 1);
});
test("expired offers cannot be accepted", () => {
  let s = reduceDelivery(initialDelivery(), { type: "online" }, context);
  s = reduceDelivery(s, { type: "offer" }, context);
  for (let i = 0; i < 25; i++)
    s = reduceDelivery(s, { type: "tick", dt: 1 }, context);
  assert.equal(s.stage, "waiting");
  s = reduceDelivery(s, { type: "accept" }, context);
  assert.equal(s.accepted, 0);
});
test("going offline cancels every delivery stage and prevents stale actions", () => {
  for (const stage of [
    "offer",
    "vendor",
    "preparing",
    "collect",
    "calling",
    "handoff",
    "completed",
  ] as const) {
    const s = reduceDelivery(
      { ...initialDelivery(), stage },
      { type: "offline" },
      context,
    );
    assert.equal(s.stage, "offline");
    assert.equal(
      reduceDelivery(s, { type: "collect" }, context).stage,
      "offline",
    );
  }
});
test("declines preserve acceptance accounting and wait before another offer", () => {
  let s = reduceDelivery(initialDelivery(), { type: "online" }, context);
  s = reduceDelivery(s, { type: "offer" }, context);
  s = reduceDelivery(s, { type: "decline" }, context);
  assert.equal(s.stage, "waiting");
  assert.equal(s.remaining, 7);
  assert.equal(s.offered, 1);
  assert.equal(s.accepted, 0);
});

test("reverse stays engaged after it starts and braking wins over throttle", async () => {
  const { movementTarget } = await import("../rider-controls");
  assert.equal(movementTarget(false, true, -2, 26, 5.5), -5.5);
  assert.equal(movementTarget(false, true, 10, 26, 5.5), 0);
  assert.equal(movementTarget(true, true, 10, 26, 5.5), 0);
  assert.equal(movementTarget(false, true, -1, 3.4, 2), -2);
});

test('riding away restores navigation instead of leaving an impossible interaction',()=>{
 const vendor=reduceDelivery({...initialDelivery(),stage:'vendor'},{type:'tick',dt:.1},{...context,vendorDistance:90});
 assert.equal(vendor.stage,'ridePickup');
 const customer=reduceDelivery({...initialDelivery(),stage:'contact'},{type:'tick',dt:.1},{...context,destinationDistance:120});
 assert.equal(customer.stage,'rideCustomer');
});

test('unanswered call blocks immediate retry but the second call succeeds', () => {
  const c = { ...context, destinationDistance: 20, missesFirstCall: true, customerReply: 'I am wearing blue.' };
  let s = { ...initialDelivery(), stage: 'contact' as const } as ReturnType<typeof initialDelivery>;
  s = reduceDelivery(s, { type: 'call' }, c);
  for (let i=0;i<3;i++) s=reduceDelivery(s,{type:'tick',dt:1},c);
  assert.equal(s.stage, 'contact');
  assert.equal(s.callAttempts, 1);
  assert.equal(reduceDelivery(s,{type:'call'},c).stage,'contact');
  for (let i=0;i<5;i++) s=reduceDelivery(s,{type:'tick',dt:1},c);
  s=reduceDelivery(s,{type:'call'},c);
  for (let i=0;i<3;i++) s=reduceDelivery(s,{type:'tick',dt:1},c);
  assert.equal(s.stage,'findCustomer');
  assert.match(s.message,/wearing blue/);
});

test('arrival text recovers a missed call, but a moving or distant rider cannot confirm', () => {
  const c={...context,destinationDistance:20,customerReply:'Meet outside.'};
  const s={...initialDelivery(),stage:'contact' as const,callAttempts:1,remaining:5};
  assert.equal(reduceDelivery(s,{type:'message'},{...c,speed:-2}).stage,'contact');
  assert.equal(reduceDelivery(s,{type:'message'},{...c,destinationDistance:200}).stage,'contact');
  const replied=reduceDelivery(s,{type:'message'},c);
  assert.equal(replied.stage,'findCustomer');
  assert.equal(replied.messageSent,true);
  assert.match(replied.message,/Meet outside/);
});

test('messages cannot skip pickup and do not leak into the next order', () => {
  const s={...initialDelivery(),stage:'vendor' as const};
  assert.equal(reduceDelivery(s,{type:'message'},context),s);
  const next=reduceDelivery({...s,stage:'waiting',messageSent:true,callAttempts:2},{type:'offer'},context);
  assert.equal(next.messageSent,false);
  assert.equal(next.callAttempts,0);
});

test("bag check: catching a missing item gets it fixed, missing it is remembered", () => {
  const base = { ...context, mounted: false, vendorDistance: 2, bagMissing: true, vendorPerson: "Auntie Esi" };
  const atCheck = { ...initialDelivery(), stage: "collect" as const };
  let s = reduceDelivery(atCheck, { type: "collect" }, base);
  assert.equal(s.stage, "checkBag");

  // Leaving with the short bag is recorded for the customer to notice.
  const left = reduceDelivery(s, { type: "approveBag" }, base);
  assert.equal(left.stage, "returnBike");
  assert.equal(left.missingAccepted, true);

  // Reporting it sends the vendor to fix it, then the bag is complete.
  s = reduceDelivery(s, { type: "reportMissing" }, base);
  assert.equal(s.stage, "fixingBag");
  for (let i = 0; i < 3; i++) s = reduceDelivery(s, { type: "tick", dt: 1 }, base);
  assert.equal(s.stage, "checkBag");
  assert.equal(s.itemFixed, true);
  s = reduceDelivery(s, { type: "approveBag" }, base);
  assert.equal(s.missingAccepted, false);

  // A false report on a complete bag just costs a moment.
  let full = reduceDelivery(atCheck, { type: "collect" }, { ...base, bagMissing: false });
  full = reduceDelivery(full, { type: "reportMissing" }, { ...base, bagMissing: false });
  assert.equal(full.stage, "checkBag");
  assert.equal(full.falseReports, 1);
});

test("cash orders need change before the handoff", () => {
  const c = { ...context, mounted: false, customerDistance: 2, cashOrder: true, correctChange: 7.5 };
  let s = reduceDelivery({ ...initialDelivery(), stage: "findCustomer" }, { type: "handoff" }, c);
  assert.equal(s.stage, "payment");
  assert.equal(reduceDelivery(s, { type: "handoff" }, c).stage, "payment");
  const exact = reduceDelivery(s, { type: "giveChange", amount: 7.5 }, c);
  assert.equal(exact.stage, "handoff");
  assert.equal(exact.changeError, 0);
  s = reduceDelivery(s, { type: "giveChange", amount: 17.5 }, c);
  assert.equal(s.changeError, 10);

  const momo = reduceDelivery({ ...initialDelivery(), stage: "findCustomer" }, { type: "handoff" }, { ...c, cashOrder: false });
  assert.equal(momo.stage, "handoff");
});

import { settleDelivery } from "./settlement";

test("settlement rewards care and penalises missing items and wrong change", () => {
  const base = { fare: 10, streakMultiplier: 1, condition: 100, onTime: true, timeLeft: 60, collisions: 0,
    missingAccepted: false, itemFixed: false, changeError: 0 };
  const perfect = settleDelivery(base);
  assert.equal(perfect.tip, 4);
  assert.equal(perfect.payout, 14);
  assert.equal(perfect.rating, 5);

  const missing = settleDelivery({ ...base, missingAccepted: true, missingItem: "Shito sachet" });
  assert.equal(missing.tip, 0);
  assert.equal(missing.rating, 3.8);
  assert.match(missing.comment, /Shito sachet was missing/);

  const overpaid = settleDelivery({ ...base, changeError: 5 });
  assert.equal(overpaid.payout, 9);
  const short = settleDelivery({ ...base, changeError: -5 });
  assert.equal(short.tip, 0);
  assert.equal(short.rating, 4);

  assert.equal(settleDelivery({ ...base, itemFixed: true }).xpBonus, 150);
  assert.equal(settleDelivery({ ...base, streakMultiplier: 1.5 }).payout, 19);
});
