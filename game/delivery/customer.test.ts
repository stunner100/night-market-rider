import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerDetails, customerApproachStep } from './customer';

test('first order is straightforward; later order notes match stable outfits',()=>{
  assert.equal(customerDetails(1).missesFirstCall,false);
  assert.equal(customerDetails(5).missesFirstCall,true);
  assert.equal(customerDetails(3).approaches,true);
  assert.match(customerDetails(2).note,/blue shirt/);
  assert.equal(customerDetails(2).shirt,0x1971c2);
});
test('customer approach stays bounded and rejects obstacles',()=>{
  const home={x:0,z:0},rider={x:8,z:0};
  assert.equal(customerApproachStep(home,rider,home,.1,()=>true),null);
  let p=home;
  for(let i=0;i<100;i++)p=customerApproachStep(p,rider,home,.1,()=>false)??p;
  assert.ok(p.x<=6 && p.x>5.8);
  assert.equal(customerApproachStep(home,{x:20,z:0},home,.1,()=>false),null);
  assert.equal(customerApproachStep(home,{x:1,z:0},home,.1,()=>false),null);
});

import { itemCount, orderDetails, packedItems } from "./order-details";

test("order details are stable and cash change adds up", () => {
  for (let id = 1; id <= 24; id++) {
    const d = orderDetails({ id, vendor: "Esi’s Legon Kitchen", food: "Jollof, chicken & shito" });
    assert.deepEqual(d, orderDetails({ id, vendor: "Esi’s Legon Kitchen", food: "Jollof, chicken & shito" }));
    assert.equal(d.vendorPerson, "Auntie Esi");
    assert.ok(d.cashNote > d.foodTotal);
    assert.equal(Math.round((d.cashNote - d.foodTotal - d.change) * 100), 0);
    assert.equal(new Set(d.changeOptions).size, 3);
    assert.ok(d.changeOptions.includes(d.change));
    if (d.missingIndex >= 0) {
      assert.equal(itemCount(packedItems(d, false)), itemCount(d.items) - 1);
      assert.equal(itemCount(packedItems(d, true)), itemCount(d.items));
    } else {
      assert.equal(itemCount(packedItems(d, false)), itemCount(d.items));
    }
  }
  // The first orders teach the basics: complete bags, prepaid.
  assert.equal(orderDetails({ id: 1, vendor: "Waakye Special", food: "Waakye" }).missingIndex, -1);
  assert.equal(orderDetails({ id: 1, vendor: "Waakye Special", food: "Waakye" }).payment, "momo");
  assert.ok([1, 2, 3, 4, 5, 6, 7, 8].some(id => orderDetails({ id, vendor: "x", food: "Waakye" }).payment === "cash"));
  assert.ok([1, 2, 3, 4, 5, 6, 7, 8].some(id => orderDetails({ id, vendor: "x", food: "Waakye" }).missingIndex >= 0));
});
