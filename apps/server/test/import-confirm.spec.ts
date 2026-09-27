import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp, closeApp, type TestApp } from './utils';

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createApp();
});
afterAll(() => closeApp(ctx));

function auth(payload: Record<string, unknown> = {}): Record<string, unknown> {
  return { headers: { cookie: ctx.cookie, 'idempotency-key': crypto.randomUUID() }, ...payload };
}

describe('导入确认（去重）', () => {
  it('check-duplicates 报告已有记录；confirm 跳过重复创建新行', async () => {
    const base = {
      serialNumber: 'OA-2026-777',
      department: '行政部',
      handler: '刘洋',
      requestDate: '2026-08-10',
    };

    // 已存在一条「签字笔」
    await ctx.inject({
      method: 'POST',
      url: '/api/items',
      ...auth({ payload: { ...base, itemName: '签字笔', quantity: 5 } }),
    });

    const check = await ctx.inject({
      method: 'POST',
      url: '/api/imports/check-duplicates',
      ...auth({
        payload: {
          serialNumber: base.serialNumber,
          handler: base.handler,
          itemNames: ['签字笔', '荧光笔'],
        },
      }),
    });
    expect(check.statusCode).toBe(201);
    const dups = check.json();
    expect(dups).toHaveLength(1);
    expect(dups[0].itemName).toBe('签字笔');
    expect(dups[0].matchedQuantity).toBe(5);

    const confirm = await ctx.inject({
      method: 'POST',
      url: '/api/imports/confirm',
      ...auth({
        payload: {
          ...base,
          items: [
            { itemName: '签字笔', quantity: 5 }, // 重复 → 默认跳过
            { itemName: '荧光笔', quantity: 8, unitPrice: 2.0 },
          ],
        },
      }),
    });
    expect(confirm.statusCode).toBe(201);
    expect(confirm.json()).toMatchObject({ created: 1, merged: 0, skipped: 1 });

    const list = await ctx.inject({
      method: 'GET',
      url: '/api/items?search=OA-2026-777',
      ...auth(),
    });
    expect(list.json().total).toBe(2); // 只有原来两条
  });

  it('confirm 指定 merge 时累加数量', async () => {
    const confirm = await ctx.inject({
      method: 'POST',
      url: '/api/imports/confirm',
      ...auth({
        payload: {
          serialNumber: 'OA-2026-777',
          department: '行政部',
          handler: '刘洋',
          requestDate: '2026-08-10',
          items: [{ itemName: '签字笔', quantity: 3, duplicateAction: 'merge' }],
        },
      }),
    });
    expect(confirm.statusCode).toBe(201);
    expect(confirm.json()).toMatchObject({ created: 0, merged: 1, skipped: 0 });

    const list = await ctx.inject({
      method: 'GET',
      url: '/api/items?search=签字笔&handler=刘洋',
      ...auth(),
    });
    expect(list.json().items[0].quantity).toBe(8);
  });

  it('空明细 400', async () => {
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/imports/confirm',
      ...auth({
        payload: {
          serialNumber: 'OA-X',
          department: 'A',
          handler: 'B',
          requestDate: '2026-08-10',
          items: [],
        },
      }),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('审计日志', () => {
  it('操作被记录且可查询', async () => {
    const res = await ctx.inject({
      method: 'GET',
      url: '/api/audit-logs?search=ITEM_CREATE',
      ...auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });
});

describe('报表', () => {
  it('dashboard 返回结构与分组统计', async () => {
    const res = await ctx.inject({ method: 'GET', url: '/api/reports/dashboard', ...auth() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('statusSlices');
    expect(body).toHaveProperty('kanbanCounts');
    expect(body).toHaveProperty('trend');
    expect(body.trend).toHaveLength(7);
  });

  it('amount 按月份分组', async () => {
    const res = await ctx.inject({
      method: 'GET',
      url: '/api/reports/amount?groupBy=month',
      ...auth(),
    });
    expect(res.statusCode).toBe(200);
    const points = res.json();
    expect(Array.isArray(points)).toBe(true);
    expect(points.some((p: { label: string }) => p.label === '2026-08')).toBe(true);
  });
});

describe('备份', () => {
  it('创建备份并列出', async () => {
    const create = await ctx.inject({ method: 'POST', url: '/api/system/backups', ...auth() });
    expect(create.statusCode).toBe(201);
    expect(create.json().name).toMatch(/^backup-/);

    const list = await ctx.inject({ method: 'GET', url: '/api/system/backups', ...auth() });
    expect(list.json().length).toBeGreaterThanOrEqual(1);

    // 下载可读回 zip 魔数
    const dl = await ctx.inject({
      method: 'GET',
      url: `/api/system/backups/${create.json().name}/download`,
      ...auth(),
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);
  });

  it('非法备份名被拒绝', async () => {
    const res = await ctx.inject({
      method: 'GET',
      url: '/api/system/backups/..%2F..%2Fetc%2Fpasswd/download',
      ...auth(),
    });
    expect(res.statusCode).toBe(400);
  });
});
