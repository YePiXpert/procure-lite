import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp, closeApp, type TestApp } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';
let ctx: TestApp, prisma: PrismaService;
beforeAll(async () => {
  ctx = await createApp();
  prisma = ctx.app.get(PrismaService);
});
afterAll(() => closeApp(ctx));
function post(url: string, payload: object, id = randomUUID()) {
  return ctx.inject({
    method: 'POST',
    url,
    headers: { cookie: ctx.cookie, 'idempotency-key': id },
    payload,
  });
}
async function item(name: string, unit: string, status = 'PENDING_DISTRIBUTION') {
  return prisma.item.create({
    data: {
      serialNumber: randomUUID(),
      itemName: name,
      quantity: 10,
      unit,
      status,
      department: '行政',
      handler: '测试',
      requestDate: '2026-09-27',
    },
  });
}
it('concurrent purchase requests with one ID create one purchase history', async () => {
  const row = await item('并发采购', '件', 'PENDING_PURCHASE'),
    id = randomUUID();
  const body = {
    supplierId: null,
    lines: [{ id: row.id, unitPrice: 4 }],
    markOrdered: true,
    rememberPrice: false,
  };
  const replies = await Promise.all([
    post('/api/items/purchase', body, id),
    post('/api/items/purchase', body, id),
  ]);
  expect(replies.map((r) => r.statusCode)).toEqual([200, 200]);
  expect(replies[0].json()).toEqual(replies[1].json());
  expect(await prisma.operationReceipt.count({ where: { id } })).toBe(1);
  expect(await prisma.itemHistory.count({ where: { itemId: row.id } })).toBe(1);
});
it('stock-in retries create exactly one stock movement', async () => {
  const row = await item('并发入库', '件'),
    id = randomUUID(),
    body = { itemIds: [row.id] };
  const replies = await Promise.all([
    post('/api/inventory/stock-in', body, id),
    post('/api/inventory/stock-in', body, id),
  ]);
  expect(replies.map((r) => r.statusCode)).toEqual([200, 200]);
  expect((await prisma.product.findUniqueOrThrow({ where: { name: row.itemName } })).stockQty).toBe(
    10,
  );
  expect(await prisma.inventoryMovement.count({ where: { relatedItemId: row.id } })).toBe(1);
});
it('rejects known and unknown stock unit conflicts atomically', async () => {
  for (const unit of ['包', null]) {
    const name = `单位冲突-${unit}`,
      row = await item(name, '盒');
    await prisma.product.create({ data: { name, unit, stockQty: 3 } });
    const reply = await post('/api/inventory/stock-in', { itemIds: [row.id] });
    expect(reply.statusCode).toBe(400);
    expect((await prisma.product.findUniqueOrThrow({ where: { name } })).stockQty).toBe(3);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'PENDING_DISTRIBUTION',
    );
  }
});
it('inventory distribution and manual movement retries change stock only once', async () => {
  const product = await prisma.product.create({
    data: { name: '库存防重', unit: '件', stockQty: 10 },
  });
  const key = randomUUID(),
    body = {
      date: '2026-09-27',
      source: 'STOCK',
      lines: [{ productId: product.id, itemName: product.name, recipient: '测试', quantity: 2 }],
    };
  const first = await post('/api/distributions', body, key),
    retry = await post('/api/distributions', body, key);
  expect(first.statusCode).toBe(201);
  expect(retry.json()).toEqual(first.json());
  const movement = { productId: product.id, quantity: 3, type: 'INBOUND', note: '手工补充' },
    moveKey = randomUUID();
  const a = await post('/api/inventory/movements', movement, moveKey),
    b = await post('/api/inventory/movements', movement, moveKey);
  expect(a.statusCode).toBe(201);
  expect(b.json()).toEqual(a.json());
  expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty).toBe(11);
});
