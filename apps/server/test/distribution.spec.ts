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

async function seedItem(
  itemName: string,
  quantity: number,
  status = 'PENDING_DISTRIBUTION',
): Promise<number> {
  const res = await ctx.inject({
    method: 'POST',
    url: '/api/items',
    ...auth({
      payload: {
        serialNumber: 'OA-2026-1',
        department: '综合管理部',
        handler: '张伟',
        requestDate: '2026-08-20',
        itemName,
        quantity,
        status,
      },
    }),
  });
  return res.json().id;
}

describe('发放与库存联动', () => {
  it('直发：多领用人分摊，结余自动入库', async () => {
    const itemId = await seedItem('笔记本（B5）', 30);

    const res = await ctx.inject({
      method: 'POST',
      url: '/api/distributions',
      ...auth({
        payload: {
          date: '2026-08-25',
          source: 'DIRECT',
          department: '综合管理部',
          lines: [
            { itemId, itemName: '笔记本（B5）', recipient: '李娜', quantity: 10 },
            { itemId, itemName: '笔记本（B5）', recipient: '王强', quantity: 5 },
          ],
        },
      }),
    });
    expect(res.statusCode).toBe(201);

    // 台账关闭
    const item = await ctx.inject({ method: 'GET', url: `/api/items/${itemId}`, ...auth() });
    expect(item.json().status).toBe('DISTRIBUTED');
    expect(item.json().distributionDate).toBe('2026-08-25');
    expect(item.json().signoffNote).toContain('李娜×10');

    // 结余 15 自动入库
    const products = await ctx.inject({ method: 'GET', url: '/api/inventory/products', ...auth() });
    const note = products.json().find((p: { name: string }) => p.name === '笔记本（B5）');
    expect(note).toBeTruthy();
    expect(note.stockQty).toBe(15);
  });

  it('直发：超过台账数量被拒绝', async () => {
    const itemId = await seedItem('订书机', 3);
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/distributions',
      ...auth({
        payload: {
          date: '2026-08-25',
          source: 'DIRECT',
          lines: [{ itemId, itemName: '订书机', recipient: '李娜', quantity: 5 }],
        },
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('库存发放：扣库存，作废回冲', async () => {
    // 先通过盘点入库 100
    const products0 = await ctx.inject({
      method: 'POST',
      url: '/api/inventory/products',
      ...auth({ payload: { name: '胶棒' } }),
    });
    const productId = products0.json().id;
    await ctx.inject({
      method: 'POST',
      url: '/api/inventory/movements',
      ...auth({ payload: { productId, type: 'INBOUND', quantity: 100, note: '期初' } }),
    });

    // 库存发放 40
    const create = await ctx.inject({
      method: 'POST',
      url: '/api/distributions',
      ...auth({
        payload: {
          date: '2026-08-26',
          source: 'STOCK',
          department: '财务部',
          lines: [{ productId, itemName: '胶棒', recipient: '赵敏', quantity: 40 }],
        },
      }),
    });
    expect(create.statusCode).toBe(201);
    const distributionId = create.json().id;

    let products = await ctx.inject({ method: 'GET', url: '/api/inventory/products', ...auth() });
    expect(products.json().find((p: { name: string }) => p.name === '胶棒').stockQty).toBe(60);

    // 领用统计
    const stats = await ctx.inject({
      method: 'GET',
      url: '/api/distributions/recipients',
      ...auth(),
    });
    const zhao = stats.json().find((s: { recipient: string }) => s.recipient === '赵敏');
    expect(zhao.quantity).toBe(40);

    // 作废 → 库存回冲到 100
    const revoke = await ctx.inject({
      method: 'DELETE',
      url: `/api/distributions/${distributionId}`,
      ...auth(),
    });
    expect(revoke.statusCode).toBe(200);
    products = await ctx.inject({ method: 'GET', url: '/api/inventory/products', ...auth() });
    expect(products.json().find((p: { name: string }) => p.name === '胶棒').stockQty).toBe(100);
  });

  it('库存发放：库存不足 409', async () => {
    const products = await ctx.inject({ method: 'GET', url: '/api/inventory/products', ...auth() });
    const glue = products.json().find((p: { name: string }) => p.name === '胶棒');
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/distributions',
      ...auth({
        payload: {
          date: '2026-08-26',
          source: 'STOCK',
          lines: [{ productId: glue.id, itemName: '胶棒', recipient: '超发', quantity: 9999 }],
        },
      }),
    });
    expect(res.statusCode).toBe(409);
  });

  it('台账整单入库：状态转 STOCKED，生成流水', async () => {
    const itemId = await seedItem('文件夹', 12, 'PENDING_DISTRIBUTION');
    const res = await ctx.inject({
      method: 'POST',
      url: `/api/inventory/stock-in/${itemId}`,
      ...auth(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('STOCKED');

    const products = await ctx.inject({ method: 'GET', url: '/api/inventory/products', ...auth() });
    expect(products.json().find((p: { name: string }) => p.name === '文件夹').stockQty).toBe(12);

    // 非待分发状态不能入库
    const again = await ctx.inject({
      method: 'POST',
      url: `/api/inventory/stock-in/${itemId}`,
      ...auth(),
    });
    expect(again.statusCode).toBe(400);
  });

  it('手动出库被拒绝（必须走发放）', async () => {
    const products = await ctx.inject({ method: 'GET', url: '/api/inventory/products', ...auth() });
    const glue = products.json().find((p: { name: string }) => p.name === '胶棒');
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/inventory/movements',
      ...auth({ payload: { productId: glue.id, type: 'OUTBOUND', quantity: 1 } }),
    });
    expect(res.statusCode).toBe(400);
  });
});
