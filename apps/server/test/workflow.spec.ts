import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp, closeApp, type TestApp } from './utils';

/**
 * 状态机与工作台整单操作：
 * 终态（已发放/已入库）只能由发放单/入库产生，手工改状态只在执行中三态之间。
 */

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createApp();
});
afterAll(() => closeApp(ctx));

function auth(payload: Record<string, unknown> = {}): Record<string, unknown> {
  return { headers: { cookie: ctx.cookie, 'idempotency-key': crypto.randomUUID() }, ...payload };
}

let serialSeq = 0;
async function seedForm(names: string[], status = 'PENDING_PURCHASE'): Promise<number[]> {
  const serialNumber = `OA-WF-${++serialSeq}`;
  const ids: number[] = [];
  for (const itemName of names) {
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items',
      ...auth({
        payload: {
          serialNumber,
          department: '行政部',
          handler: '陈静',
          requestDate: '2026-09-01',
          itemName,
          quantity: 10,
          status,
        },
      }),
    });
    expect(res.statusCode).toBe(201);
    ids.push(res.json().id);
  }
  return ids;
}

async function getItem(id: number) {
  return (await ctx.inject({ method: 'GET', url: `/api/items/${id}`, ...auth() })).json();
}

async function distribute(itemId: number, itemName: string) {
  const res = await ctx.inject({
    method: 'POST',
    url: '/api/distributions',
    ...auth({
      payload: {
        date: '2026-09-05',
        source: 'DIRECT',
        lines: [{ itemId, itemName, recipient: '陈静', quantity: 10 }],
      },
    }),
  });
  expect(res.statusCode).toBe(201);
}

async function createSupplier(name: string): Promise<number> {
  const res = await ctx.inject({
    method: 'POST',
    url: '/api/suppliers',
    ...auth({ payload: { name } }),
  });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

describe('手工改状态的边界', () => {
  it('执行中三态之间可以自由改（含跳级）', async () => {
    const [id] = await seedForm(['订书钉']);
    const res = await ctx.inject({
      method: 'PATCH',
      url: `/api/items/${id}`,
      ...auth({ payload: { status: 'PENDING_DISTRIBUTION' } }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('PENDING_DISTRIBUTION');
  });

  it('不能直接创建终态记录', async () => {
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items',
      ...auth({
        payload: {
          serialNumber: 'OA-WF-X',
          department: '行政部',
          handler: '陈静',
          requestDate: '2026-09-01',
          itemName: '胶带',
          quantity: 1,
          status: 'DISTRIBUTED',
        },
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('编辑不能把状态改成已发放 / 已入库', async () => {
    const [id] = await seedForm(['回形针'], 'PENDING_DISTRIBUTION');
    for (const status of ['DISTRIBUTED', 'STOCKED']) {
      const res = await ctx.inject({
        method: 'PATCH',
        url: `/api/items/${id}`,
        ...auth({ payload: { status } }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('发放');
    }
    expect((await getItem(id)).status).toBe('PENDING_DISTRIBUTION');
  });

  it('已发放的记录不能改回，也不能改品名数量，但其他字段照常可改', async () => {
    const [id] = await seedForm(['文件夹'], 'PENDING_DISTRIBUTION');
    await distribute(id, '文件夹');

    const back = await ctx.inject({
      method: 'PATCH',
      url: `/api/items/${id}`,
      ...auth({ payload: { status: 'PENDING_PURCHASE' } }),
    });
    expect(back.statusCode).toBe(400);
    expect(back.json().message).toContain('作废');

    const qty = await ctx.inject({
      method: 'PATCH',
      url: `/api/items/${id}`,
      ...auth({ payload: { quantity: 99 } }),
    });
    expect(qty.statusCode).toBe(400);

    // 编辑表单整表提交：状态/数量与原值相同，只改备注与付款 → 允许
    const note = await ctx.inject({
      method: 'PATCH',
      url: `/api/items/${id}`,
      ...auth({
        payload: {
          status: 'DISTRIBUTED',
          quantity: 10,
          itemName: '文件夹',
          note: '已签收',
          paymentStatus: 'PAID',
        },
      }),
    });
    expect(note.statusCode).toBe(200);
    expect(note.json()).toMatchObject({
      status: 'DISTRIBUTED',
      note: '已签收',
      paymentStatus: 'PAID',
    });
  });

  it('批量改状态：终态被 schema 拒绝；混入已发放记录则整批拒绝、一条不改', async () => {
    const [a, b] = await seedForm(['便签纸', '笔筒'], 'PENDING_DISTRIBUTION');
    const final = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-update',
      ...auth({ payload: { ids: [a], patch: { status: 'STOCKED' } } }),
    });
    expect(final.statusCode).toBe(400);

    await distribute(b, '笔筒');
    const mixed = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-update',
      ...auth({ payload: { ids: [a, b], patch: { status: 'PENDING_PURCHASE' } } }),
    });
    expect(mixed.statusCode).toBe(400);
    expect((await getItem(a)).status).toBe('PENDING_DISTRIBUTION');
    expect((await getItem(b)).status).toBe('DISTRIBUTED');
  });

  it('批量推进到货可同时写到货日期，撤销时可清空', async () => {
    const [a, b] = await seedForm(['橡皮', '尺子'], 'PENDING_ARRIVAL');
    const arrive = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-update',
      ...auth({
        payload: {
          ids: [a, b],
          patch: { status: 'PENDING_DISTRIBUTION', arrivalDate: '2026-09-03' },
        },
      }),
    });
    expect(arrive.statusCode).toBe(200);
    expect(await getItem(a)).toMatchObject({
      status: 'PENDING_DISTRIBUTION',
      arrivalDate: '2026-09-03',
    });

    const undo = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-update',
      ...auth({
        payload: { ids: [a, b], patch: { status: 'PENDING_ARRIVAL', arrivalDate: null } },
      }),
    });
    expect(undo.statusCode).toBe(200);
    expect(await getItem(b)).toMatchObject({ status: 'PENDING_ARRIVAL', arrivalDate: null });
  });

  it('批量改供应商会同步供应商名称', async () => {
    const supplierId = await createSupplier('晨光文具店');
    const [id] = await seedForm(['中性笔']);
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items/batch-update',
      ...auth({ payload: { ids: [id], patch: { supplierId } } }),
    });
    expect(res.statusCode).toBe(200);
    expect((await getItem(id)).supplierName).toBe('晨光文具店');
  });
});

describe('整单下单登记', () => {
  it('整单登记：共用供应商、逐条单价、推进待到货并记入比价库', async () => {
    const supplierId = await createSupplier('得力办公');
    const [a, b, c] = await seedForm(['A4 纸', '长尾夹', '白板笔']);
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items/purchase',
      ...auth({
        payload: {
          supplierId,
          lines: [
            { id: a, unitPrice: 25, purchaseLink: 'https://example.com/a4' },
            { id: b, unitPrice: 0.5 },
            { id: c },
          ],
        },
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updated: 3, ordered: 3 });

    expect(await getItem(a)).toMatchObject({
      status: 'PENDING_ARRIVAL',
      supplierId,
      supplierName: '得力办公',
      unitPrice: 25,
      purchaseLink: 'https://example.com/a4',
    });
    expect(await getItem(c)).toMatchObject({ status: 'PENDING_ARRIVAL', unitPrice: null });

    const suggest = await ctx.inject({
      method: 'GET',
      url: '/api/suppliers/suggest?itemName=A4 纸',
      ...auth(),
    });
    expect(suggest.json().some((r: { unitPrice: number }) => r.unitPrice === 25)).toBe(true);

    const history = await ctx.inject({ method: 'GET', url: `/api/items/${a}/history`, ...auth() });
    expect(history.json()[0].action).toBe('PURCHASE');
  });

  it('只保存不推进；部分明细登记只影响所选行', async () => {
    const [a, b] = await seedForm(['信封', '档案盒']);
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items/purchase',
      ...auth({
        payload: { lines: [{ id: a, unitPrice: 1 }], markOrdered: false, rememberPrice: false },
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updated: 1, ordered: 0 });
    expect(await getItem(a)).toMatchObject({ status: 'PENDING_PURCHASE', unitPrice: 1 });
    expect(await getItem(b)).toMatchObject({ status: 'PENDING_PURCHASE', unitPrice: null });
  });

  it('同一供应商同一品名同价同链接重复登记不重复记入比价库，改价或改链接才新增', async () => {
    const supplierId = await createSupplier('齐心文具');
    const [id] = await seedForm(['复写纸']);
    const register = async (unitPrice: number, purchaseLink: string) => {
      const res = await ctx.inject({
        method: 'POST',
        url: '/api/items/purchase',
        ...auth({
          payload: { supplierId, lines: [{ id, unitPrice, purchaseLink }], markOrdered: false },
        }),
      });
      expect(res.statusCode).toBe(200);
    };
    const records = async (): Promise<{ unitPrice: number; purchaseLink: string | null }[]> =>
      (
        await ctx.inject({
          method: 'GET',
          url: `/api/suppliers/price-records?itemName=${encodeURIComponent('复写纸')}&supplierId=${supplierId}`,
          ...auth(),
        })
      ).json();

    await register(12, 'https://example.com/copy-paper');
    await register(12, 'https://example.com/copy-paper');
    expect(await records()).toHaveLength(1);

    await register(13, 'https://example.com/copy-paper');
    expect((await records()).map((r) => r.unitPrice).sort((a, b) => a - b)).toEqual([12, 13]);

    await register(13, 'https://example.com/copy-paper-2');
    expect(await records()).toHaveLength(3);
    expect(await getItem(id)).toMatchObject({ status: 'PENDING_PURCHASE', unitPrice: 13 });
  });

  it('含已发放明细则整批拒绝', async () => {
    const [a, b] = await seedForm(['计算器', '订书机'], 'PENDING_DISTRIBUTION');
    await distribute(b, '订书机');
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/items/purchase',
      ...auth({
        payload: {
          lines: [
            { id: a, unitPrice: 30 },
            { id: b, unitPrice: 20 },
          ],
        },
      }),
    });
    expect(res.statusCode).toBe(400);
    expect((await getItem(a)).unitPrice).toBeNull();
  });
});

describe('整单入库', () => {
  it('多条同时入库，库存累加', async () => {
    const [a, b] = await seedForm(['打印纸', '碳粉'], 'PENDING_DISTRIBUTION');
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/inventory/stock-in',
      ...auth({ payload: { itemIds: [a, b] } }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stocked: 2 });
    expect((await getItem(a)).status).toBe('STOCKED');

    const products = await ctx.inject({
      method: 'GET',
      url: '/api/inventory/products?search=碳粉',
      ...auth(),
    });
    expect(products.json().find((p: { name: string }) => p.name === '碳粉').stockQty).toBe(10);
  });

  it('任一条不在待分发则整批回滚', async () => {
    const [a] = await seedForm(['胶水'], 'PENDING_DISTRIBUTION');
    const [b] = await seedForm(['剪刀'], 'PENDING_ARRIVAL');
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/inventory/stock-in',
      ...auth({ payload: { itemIds: [a, b] } }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('剪刀');
    expect((await getItem(a)).status).toBe('PENDING_DISTRIBUTION');
  });
});

describe('导入合并', () => {
  it('不能把数量合并进已发放的记录', async () => {
    const [id] = await seedForm(['记号笔'], 'PENDING_DISTRIBUTION');
    await distribute(id, '记号笔');
    const item = await getItem(id);
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/imports/confirm',
      ...auth({
        payload: {
          serialNumber: item.serialNumber,
          department: '行政部',
          handler: '陈静',
          requestDate: '2026-09-01',
          items: [{ itemName: '记号笔', quantity: 5, duplicateAction: 'merge' }],
        },
      }),
    });
    expect(res.statusCode).toBe(400);
    expect((await getItem(id)).quantity).toBe(10);
  });
});
