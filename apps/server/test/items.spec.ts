import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp, closeApp, type TestApp } from './utils';

let ctx: TestApp;

const sampleItem = {
  serialNumber: 'OA-2026-001',
  department: '综合管理部',
  handler: '张伟',
  requestDate: '2026-08-01',
  itemName: '签字笔（黑）',
  quantity: 20,
  unitPrice: 1.5,
};

beforeAll(async () => {
  ctx = await createApp();
});
afterAll(() => closeApp(ctx));

function auth(payload: Record<string, unknown> = {}): Record<string, unknown> {
  return { headers: { cookie: ctx.cookie, 'idempotency-key': crypto.randomUUID() }, ...payload };
}

describe('台账 CRUD', () => {
  let itemId = 0;

  it('创建记录', async () => {
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items',
      ...auth({ payload: sampleItem }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    itemId = body.id;
    expect(body.status).toBe('PENDING_PURCHASE');
    expect(body.itemName).toBe('签字笔（黑）');
  });

  it('重复三元组被拒绝（409）', async () => {
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items',
      ...auth({ payload: sampleItem }),
    });
    expect(res.statusCode).toBe(409);
  });

  it('字段校验：缺必填 400', async () => {
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items',
      ...auth({
        payload: {
          serialNumber: '',
          department: '',
          handler: '',
          requestDate: '',
          itemName: '',
          quantity: 0,
        },
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('列表与筛选', async () => {
    await ctx.inject({
      method: 'POST',
      url: '/api/items',
      ...auth({
        payload: {
          ...sampleItem,
          serialNumber: 'OA-2026-002',
          itemName: 'A4 复印纸',
          quantity: 10,
        },
      }),
    });

    const all = await ctx.inject({ method: 'GET', url: '/api/items', ...auth() });
    expect(all.statusCode).toBe(200);
    expect(all.json().total).toBe(2);

    const filtered = await ctx.inject({
      method: 'GET',
      url: '/api/items?search=A4',
      ...auth(),
    });
    expect(filtered.json().total).toBe(1);
    expect(filtered.json().items[0].itemName).toBe('A4 复印纸');
  });

  it('修改记录生成历史，可回滚', async () => {
    const update = await ctx.inject({
      method: 'PATCH',
      url: `/api/items/${itemId}`,
      ...auth({ payload: { quantity: 30, status: 'PENDING_ARRIVAL' } }),
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().quantity).toBe(30);

    const history = await ctx.inject({
      method: 'GET',
      url: `/api/items/${itemId}/history`,
      ...auth(),
    });
    const records = history.json();
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0].action).toBe('UPDATE');

    const rollback = await ctx.inject({
      method: 'POST',
      url: `/api/items/${itemId}/rollback`,
      ...auth({ payload: { historyId: records[1].id } }), // 回滚到创建时
    });
    expect(rollback.statusCode).toBe(200);
    expect(rollback.json().quantity).toBe(20);
  });

  it('批量修改', async () => {
    const list = await ctx.inject({ method: 'GET', url: '/api/items', ...auth() });
    const ids = list.json().items.map((i: { id: number }) => i.id);
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-update',
      ...auth({ payload: { ids, patch: { status: 'PENDING_ARRIVAL' } } }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(2);
  });

  it('软删除 → 回收站 → 恢复 → 彻底删除', async () => {
    const del = await ctx.inject({ method: 'DELETE', url: `/api/items/${itemId}`, ...auth() });
    expect(del.statusCode).toBe(200);

    const active = await ctx.inject({ method: 'GET', url: '/api/items', ...auth() });
    expect(active.json().total).toBe(1);

    const bin = await ctx.inject({ method: 'GET', url: '/api/items?deleted=only', ...auth() });
    expect(bin.json().total).toBe(1);

    await ctx.inject({ method: 'POST', url: `/api/items/${itemId}/restore`, ...auth() });
    const restored = await ctx.inject({ method: 'GET', url: '/api/items', ...auth() });
    expect(restored.json().total).toBe(2);

    // 在线记录不允许直接彻底删除
    const onlinePurge = await ctx.inject({
      method: 'DELETE',
      url: `/api/items/${itemId}?permanent=true`,
      ...auth(),
    });
    expect(onlinePurge.statusCode).toBe(400);

    // 再入回收站后可彻底删除
    await ctx.inject({ method: 'DELETE', url: `/api/items/${itemId}`, ...auth() });
    const purge = await ctx.inject({
      method: 'DELETE',
      url: `/api/items/${itemId}?permanent=true`,
      ...auth(),
    });
    expect(purge.statusCode).toBe(200);
    const after = await ctx.inject({ method: 'GET', url: '/api/items?deleted=include', ...auth() });
    expect(after.json().total).toBe(1);
  });

  it('导出返回 xlsx', async () => {
    const res = await ctx.inject({ method: 'GET', url: '/api/items/export', ...auth() });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    // xlsx 是 zip，魔数 PK
    expect(res.rawPayload[0]).toBe(0x50);
    expect(res.rawPayload[1]).toBe(0x4b);
  });
});
