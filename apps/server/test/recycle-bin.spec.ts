import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp, closeApp, type TestApp } from './utils';

/** 回收站的批量恢复 / 批量彻底删除 / 清空 */
let ctx: TestApp;

const base = {
  department: '综合管理部',
  handler: '王芳',
  requestDate: '2026-08-05',
  quantity: 3,
};

beforeAll(async () => {
  ctx = await createApp();
});
afterAll(() => closeApp(ctx));

function auth(payload: Record<string, unknown> = {}): Record<string, unknown> {
  return { headers: { cookie: ctx.cookie, 'idempotency-key': crypto.randomUUID() }, ...payload };
}

async function seed(serial: string, itemName: string): Promise<number> {
  const res = await ctx.inject({
    method: 'POST',
    url: '/api/items',
    ...auth({ payload: { ...base, serialNumber: serial, itemName } }),
  });
  return res.json().id;
}

describe('回收站批量操作', () => {
  it('批量恢复把记录一起放回台账', async () => {
    const ids = [await seed('RB-001', '回形针'), await seed('RB-002', '便利贴')];
    await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-delete',
      ...auth({ payload: { ids } }),
    });

    const bin = await ctx.inject({ method: 'GET', url: '/api/items?deleted=only', ...auth() });
    expect(bin.json().total).toBe(2);

    const restore = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-restore',
      ...auth({ payload: { ids } }),
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().restored).toBe(2);
    expect(restore.json().conflicts).toEqual([]);

    const active = await ctx.inject({ method: 'GET', url: '/api/items', ...auth() });
    expect(active.json().total).toBe(2);
  });

  it('批量彻底删除只作用于回收站里的记录', async () => {
    const list = await ctx.inject({ method: 'GET', url: '/api/items', ...auth() });
    const ids = list.json().items.map((i: { id: number }) => i.id);

    // 在线记录不该被 batch-purge 误删
    const noop = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-purge',
      ...auth({ payload: { ids } }),
    });
    expect(noop.json().purged).toBe(0);
    const stillThere = await ctx.inject({ method: 'GET', url: '/api/items', ...auth() });
    expect(stillThere.json().total).toBe(2);

    await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-delete',
      ...auth({ payload: { ids } }),
    });
    const purge = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-purge',
      ...auth({ payload: { ids } }),
    });
    expect(purge.json().purged).toBe(2);

    const after = await ctx.inject({ method: 'GET', url: '/api/items?deleted=include', ...auth() });
    expect(after.json().total).toBe(0);
  });

  it('不带 ids 表示清空整个回收站', async () => {
    const ids = [await seed('RB-003', '文件夹'), await seed('RB-004', '笔记本')];
    const keep = await seed('RB-005', '胶水');
    await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-delete',
      ...auth({ payload: { ids } }),
    });

    const purge = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-purge',
      ...auth({ payload: {} }),
    });
    expect(purge.json().purged).toBe(2);

    const bin = await ctx.inject({ method: 'GET', url: '/api/items?deleted=only', ...auth() });
    expect(bin.json().total).toBe(0);
    // 在线记录不受影响
    const active = await ctx.inject({ method: 'GET', url: '/api/items', ...auth() });
    expect(active.json().items.map((i: { id: number }) => i.id)).toContain(keep);
  });
});
