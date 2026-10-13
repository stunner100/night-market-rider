import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressFor, gateFor, pickSites, type DeliverySites, type DropSite } from '../world/delivery-sites';
import { customerDetails } from './customer';

const drop = (x: number, z: number, extra: Partial<DropSite> = {}): DropSite =>
  ({ x, z, gx: x + 4, gz: z, yaw: 0, kind: 'home', name: null, road: 'Boundary Road', near: 'Adom Pharmacy', ...extra });

test('sites: vendor a short ride from the rider, drop a sensible distance from the vendor', () => {
  const sites: DeliverySites = {
    vendors: [{ x: 50, z: 0, yaw: 0, kind: 'restaurant', near: null, road: null }, { x: 600, z: 0, yaw: 0, kind: 'fast_food', near: null, road: 'Okponglo Road' }],
    drops: [drop(650, 100), drop(1600, 0)],
  };
  for (let seed = 0; seed < 20; seed++) {
    const pick = pickSites(sites, { x: 0, z: 0 }, seed)!;
    assert.equal(pick.vendor.x, 600, 'too-close vendor is skipped');
    assert.equal(pick.drop.x, 1600, 'too-close drop is skipped');
  }
  assert.equal(pickSites({ vendors: [], drops: [] }, { x: 0, z: 0 }, 1), null);
});

test('addresses read like Ghanaian directions and match the gate in the world', () => {
  const site = drop(10, 20);
  const gate = gateFor(7, site);
  assert.deepEqual(gateFor(7, site), gate, 'stable per order');
  const address = addressFor(site, 7);
  assert.match(address, new RegExp(`H/No\\. ${gate.number}, Boundary Road — ${gate.name} gate · near Adom Pharmacy`));
  assert.match(addressFor(drop(0, 0, { kind: 'hostel', name: 'Volta Hall' }), 3), /Volta Hall · porter's lodge/);
});

test('customer notes describe the real meeting place', () => {
  const d = customerDetails(4, 'the blue gate, H/No. 14');
  assert.match(d.note + d.reply, /blue gate, H\/No\. 14/);
  assert.match(customerDetails(2).note, /MoMo kiosk/, 'falls back to the kiosk without a site');
});
