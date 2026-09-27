import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp, closeApp, type TestApp } from './utils';

/**
 * 回归：可选字段一旦填过就清不掉。
 *
 * 前端把清空的输入框转成 undefined，JSON 序列化时整个键被丢掉，
 * Prisma 把「键不存在」当成不修改 —— 用户点了保存、看到成功提示，值却纹丝不动。
 * 契约现在区分 undefined（不改）与 null（清空）。
 */
let ctx: TestApp;
let itemId = 0;

const filled = {
  serialNumber: 'OA-CLR-001',
  department: '行政部',
  handler: '李娜',
  requestDate: '2026-08-10',
  itemName: '订书机',
  quantity: 5,
  unit: '个',
  unitPrice: 23.5,
  purchaseLink: 'https://example.com/stapler',
  note: '走年度框架协议',
};

beforeAll(async () => {
  ctx = await createApp();
  const res = await ctx.inject({
    method: 'POST',
    url: '/api/items',
    headers: { cookie: ctx.cookie, 'idempotency-key': crypto.randomUUID() },
    payload: filled,
  });
  itemId = res.json().id;
  await ctx.inject({
    method: 'PATCH',
    url: `/api/items/${itemId}`,
    headers: { cookie: ctx.cookie, 'idempotency-key': crypto.randomUUID() },
    payload: { arrivalDate: '2026-08-12' },
  });
});
afterAll(() => closeApp(ctx));

function patch(payload: Record<string, unknown>) {
  return ctx.inject({
    method: 'PATCH',
    url: `/api/items/${itemId}`,
    headers: { cookie: ctx.cookie, 'idempotency-key': crypto.randomUUID() },
    payload,
  });
}

describe('台账可选字段的清空语义', () => {
  it('字段缺省表示不修改', async () => {
    const res = await patch({ quantity: 6 });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.quantity).toBe(6);
    expect(body.unit).toBe('个');
    expect(body.unitPrice).toBe(23.5);
    expect(body.note).toBe('走年度框架协议');
  });

  it('显式传 null 才真正清空', async () => {
    const res = await patch({
      unit: null,
      unitPrice: null,
      purchaseLink: null,
      note: null,
      arrivalDate: null,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.unit).toBeNull();
    expect(body.unitPrice).toBeNull();
    expect(body.purchaseLink).toBeNull();
    expect(body.note).toBeNull();
    expect(body.arrivalDate).toBeNull();
  });

  it('清空动作会写进修改历史', async () => {
    const history = await ctx.inject({
      method: 'GET',
      url: `/api/items/${itemId}/history`,
      headers: { cookie: ctx.cookie, 'idempotency-key': crypto.randomUUID() },
    });
    const latest = history.json()[0];
    expect(latest.action).toBe('UPDATE');
    const changed = JSON.parse(latest.changedFields) as Record<string, [unknown, unknown]>;
    expect(changed.unitPrice).toEqual([23.5, null]);
    expect(changed.unit).toEqual(['个', null]);
  });

  it('清空后仍可重新填回', async () => {
    const res = await patch({ unitPrice: 19.9, unit: '把' });
    expect(res.json().unitPrice).toBe(19.9);
    expect(res.json().unit).toBe('把');
  });
});
