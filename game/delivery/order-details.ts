/**
 * Deterministic per-order details for pickup and handoff: the ticket items,
 * what the vendor actually packed, and how the customer pays.
 */
export interface TicketItem {
  name: string;
  qty: number;
}

export interface OrderDetails {
  code: string;
  /** Person behind the counter, e.g. "Auntie Esi". */
  vendorPerson: string;
  items: TicketItem[];
  /** Index into `items` the vendor forgets to pack, or -1 when the bag is complete. */
  missingIndex: number;
  /** Food bill the customer owes the vendor (cash orders are collected by the rider). */
  foodTotal: number;
  payment: "momo" | "cash";
  /** Note the customer hands over for cash orders. */
  cashNote: number;
  change: number;
  /** Three change amounts to choose from, one correct, in a stable order. */
  changeOptions: number[];
}

const MENU: Record<string, { items: TicketItem[]; price: number }> = {
  "Jollof, chicken & shito": {
    items: [{ name: "Jollof rice", qty: 1 }, { name: "Grilled chicken", qty: 1 }, { name: "Shito sachet", qty: 2 }],
    price: 58,
  },
  Waakye: {
    items: [{ name: "Waakye", qty: 1 }, { name: "Boiled egg", qty: 2 }, { name: "Wele", qty: 1 }, { name: "Gari & shito", qty: 1 }],
    price: 42.5,
  },
  "Party Jollof": {
    items: [{ name: "Party jollof", qty: 2 }, { name: "Fried plantain", qty: 1 }, { name: "Coleslaw", qty: 1 }],
    price: 74,
  },
  "Chicken Wings": {
    items: [{ name: "Spicy wings (8 pcs)", qty: 1 }, { name: "Fries", qty: 1 }, { name: "Malta Guinness", qty: 1 }],
    price: 66.5,
  },
  "Fufu & Light Soup": {
    items: [{ name: "Fufu", qty: 1 }, { name: "Light soup with goat", qty: 1 }, { name: "Sachet water", qty: 2 }],
    price: 47,
  },
  "Beef Burger": {
    items: [{ name: "Beef burger", qty: 1 }, { name: "Fries", qty: 1 }, { name: "Sobolo", qty: 1 }],
    price: 61,
  },
  "Pepperoni Pizza": {
    items: [{ name: "Pepperoni pizza (L)", qty: 1 }, { name: "Garlic dip", qty: 2 }, { name: "Coke 1.5L", qty: 1 }],
    price: 112,
  },
  "Chilled Drinks": {
    items: [{ name: "Alvaro", qty: 2 }, { name: "Sobolo", qty: 2 }, { name: "Voltic water", qty: 3 }],
    price: 39.5,
  },
};

const NOTES = [20, 50, 100, 200];

function vendorPerson(vendor: string) {
  const possessive = vendor.match(/^(\w+)[’']s\b/);
  if (possessive) return `Auntie ${possessive[1]}`;
  const names = ["Auntie Akos", "Brother Kwesi", "Sister Adwoa", "Uncle Fiifi"];
  let h = 0;
  for (const ch of vendor) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return names[h % names.length];
}

export function orderDetails(order: { id: number; vendor: string; food: string }): OrderDetails {
  const menu = MENU[order.food] ?? { items: [{ name: order.food, qty: 1 }], price: 50 };
  const id = Math.max(1, order.id);
  // From the third order on, roughly every fourth bag is short an item.
  const missingIndex = id >= 3 && id % 4 === 3 ? id % menu.items.length : -1;
  const payment = id >= 2 && id % 3 === 2 ? "cash" : "momo";
  const foodTotal = menu.price;
  const cashNote = NOTES.find(note => note > foodTotal) ?? 200;
  const change = Math.round((cashNote - foodTotal) * 100) / 100;
  // Plausible wrong answers: off by a common note/coin amount.
  const wrongA = Math.round((change + (id % 2 ? 5 : 10)) * 100) / 100;
  const wrongB = Math.max(0.5, Math.round((change - (id % 2 ? 10 : 5)) * 100) / 100);
  const options = [change, wrongA, wrongB];
  const rotate = id % 3;
  return {
    code: `NM-${(1040 + id * 7).toString()}`,
    vendorPerson: vendorPerson(order.vendor),
    items: menu.items,
    missingIndex,
    foodTotal,
    payment,
    cashNote,
    change,
    changeOptions: [...options.slice(rotate), ...options.slice(0, rotate)],
  };
}

/** Items actually inside the bag as packed by the vendor. */
export function packedItems(details: OrderDetails, fixed: boolean): TicketItem[] {
  const packed = details.items
    .map((item, i) => {
      if (fixed || i !== details.missingIndex) return item;
      // A multi-pack comes up one short; a single item is left out entirely.
      return item.qty > 1 ? { ...item, qty: item.qty - 1 } : null;
    })
    .filter((item): item is TicketItem => item !== null);
  // The bag is listed in packing order, not ticket order, so it has to be checked.
  return [...packed.slice(1), ...packed.slice(0, 1)];
}

export const itemCount = (items: TicketItem[]) => items.reduce((sum, item) => sum + item.qty, 0);

/** Kitchen time once the rider confirms; every fourth order is still cooking. */
export const prepSeconds = (orderIndex: number) => (orderIndex % 4 === 2 ? 12 : 3);

export const cedis = (n: number) => `GH₵${n.toFixed(2)}`;
