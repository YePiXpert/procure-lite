import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createApp, closeApp, type TestApp } from './utils';
import { LlmClient, type ChatCallOptions, type ChatCompletionResult } from '../src/ai/llm.client';
import { config } from '../src/config';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * 假 LLM：jsonMode 调用（同义词扩展 / OCR 校对）统一回 json 字段；
 * 其余（问答 tool 循环）按 queue 顺序出队。
 */
class FakeLlm {
  calls: ChatCallOptions[] = [];
  queue: ChatCompletionResult[] = [];
  json = '{"terms":[]}';

  async chat(opts: ChatCallOptions): Promise<ChatCompletionResult> {
    this.calls.push(opts);
    if (opts.jsonMode || opts.schema) return { content: this.json, toolCalls: [] };
    const next = this.queue.shift();
    if (!next) throw new Error('FakeLml 队列为空');
    return next;
  }

  modelCalls: { baseUrl: string; apiKey: string }[] = [];
  async listModels(baseUrl: string, apiKey: string): Promise<string[]> {
    this.modelCalls.push({ baseUrl, apiKey });
    return ['synthetic-gpt'];
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

let ctx: TestApp;
let fake: FakeLlm;

beforeAll(async () => {
  fake = new FakeLlm();
  ctx = await createApp({
    override: (builder) => builder.overrideProvider(LlmClient).useValue(fake),
  });
});
afterAll(() => closeApp(ctx));

function auth(payload: Record<string, unknown> = {}): Record<string, unknown> {
  return { headers: { cookie: ctx.cookie, 'idempotency-key': crypto.randomUUID() }, ...payload };
}

async function seedItem(over: Record<string, unknown> = {}): Promise<void> {
  const res = await ctx.inject({
    method: 'POST',
    url: '/api/items',
    ...auth({
      payload: {
        serialNumber: 'OA-AI-1',
        department: '行政部',
        handler: '刘洋',
        requestDate: '2026-08-20',
        itemName: 'A4复印纸',
        quantity: 10,
        ...over,
      },
    }),
  });
  expect(res.statusCode).toBe(201);
}

describe('AI 配置', () => {
  it('默认未启用且不回传 Key', async () => {
    const res = await ctx.inject({ method: 'GET', url: '/api/ai/config', ...auth() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(false);
    expect(body.apiKeySet).toBe(false);
    expect(body.baseUrl).toMatch(/^https?:\/\//);
    expect(body).not.toHaveProperty('apiKey');
  });

  it('模型列表要求登录和密钥，缺少配置时不访问服务商', async () => {
    const anonymous = await ctx.inject({ method: 'GET', url: '/api/ai/models' });
    expect(anonymous.statusCode).toBe(401);
    const missing = await ctx.inject({ method: 'GET', url: '/api/ai/models', ...auth() });
    expect(missing.statusCode).toBe(400);
    expect(fake.modelCalls).toHaveLength(0);
  });

  it('服务器密钥无需页面填写即可获取模型，且不回传或保存到数据库', async () => {
    const previous = config.llmDefaults.apiKey;
    Object.defineProperty(config.llmDefaults, 'apiKey', { value: 'server-only-secret' });
    try {
      const current = await ctx.inject({ method: 'GET', url: '/api/ai/config', ...auth() });
      expect(current.json()).toMatchObject({
        apiKeySet: true,
        keySource: 'server',
        enabled: false,
      });
      expect(current.body).not.toContain('server-only-secret');
      const models = await ctx.inject({ method: 'GET', url: '/api/ai/models', ...auth() });
      expect(models.json()).toEqual({ models: ['synthetic-gpt'] });
      expect(fake.modelCalls.at(-1)?.apiKey).toBe('server-only-secret');
      const save = await ctx.inject({
        method: 'PUT',
        url: '/api/ai/config',
        ...auth({
          payload: {
            enabled: false,
            baseUrl: config.llmDefaults.baseUrl,
            model: 'synthetic-gpt',
            semanticSearch: true,
          },
        }),
      });
      expect(save.statusCode).toBe(200);
      expect(save.body).not.toContain('server-only-secret');
      const row = await ctx.app
        .get(PrismaService)
        .setting.findUnique({ where: { key: 'aiConfig' } });
      expect(row?.value).not.toContain('server-only-secret');
      expect(JSON.parse(row!.value).apiKey).toBe('');
    } finally {
      Object.defineProperty(config.llmDefaults, 'apiKey', { value: previous });
    }
  });

  it('未启用时 ask / ocr-review 返回 400', async () => {
    const ask = await ctx.inject({
      method: 'POST',
      url: '/api/ai/ask',
      ...auth({ payload: { question: '有多少条台账？' } }),
    });
    expect(ask.statusCode).toBe(400);
    const review = await ctx.inject({
      method: 'POST',
      url: '/api/ai/ocr-review',
      ...auth({ payload: { taskId: 'whatever' } }),
    });
    expect(review.statusCode).toBe(400);
  });

  it('没有 Key 不允许启用', async () => {
    const res = await ctx.inject({
      method: 'PUT',
      url: '/api/ai/config',
      ...auth({
        payload: {
          enabled: true,
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-4.6',
          semanticSearch: true,
        },
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('保存后 Key 只以 apiKeySet 暴露；留空不覆盖', async () => {
    const put = await ctx.inject({
      method: 'PUT',
      url: '/api/ai/config',
      ...auth({
        payload: {
          enabled: true,
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-4.6',
          semanticSearch: true,
          apiKey: 'sk-test-123',
        },
      }),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ enabled: true, apiKeySet: true, model: 'glm-4.6' });

    // 改模型不填 Key
    const put2 = await ctx.inject({
      method: 'PUT',
      url: '/api/ai/config',
      ...auth({
        payload: {
          enabled: true,
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-4.7',
          semanticSearch: false,
          apiKey: '',
        },
      }),
    });
    expect(put2.statusCode).toBe(200);
    expect(put2.json()).toMatchObject({ apiKeySet: true, model: 'glm-4.7', semanticSearch: false });

    // 恢复 semanticSearch，后续用例要用
    await ctx.inject({
      method: 'PUT',
      url: '/api/ai/config',
      ...auth({
        payload: {
          enabled: true,
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          model: 'glm-4.6',
          semanticSearch: true,
        },
      }),
    });
  });

  it('旧的分任务模型不再生效，旧页面提交也只能保存一个模型', async () => {
    const prisma = ctx.app.get(PrismaService);
    const row = await prisma.setting.findUniqueOrThrow({ where: { key: 'aiConfig' } });
    const legacy = {
      ...JSON.parse(row.value),
      importModel: 'old-import',
      askModel: 'old-ask',
      searchModel: 'old-search',
    };
    await prisma.setting.update({
      where: { key: 'aiConfig' },
      data: { value: JSON.stringify(legacy) },
    });
    const loaded = await ctx.inject({ method: 'GET', url: '/api/ai/config', ...auth() });
    for (const field of ['importModel', 'askModel', 'searchModel'])
      expect(loaded.json()).not.toHaveProperty(field);
    const before = fake.calls.length;
    fake.queue = [{ content: '统一模型回答', toolCalls: [] }];
    const answer = await ctx.inject({
      method: 'POST',
      url: '/api/ai/ask',
      ...auth({ payload: { question: '你好' } }),
    });
    expect(answer.statusCode).toBe(201);
    expect(fake.calls[before].model).toBe(legacy.model);
    const saved = await ctx.inject({
      method: 'PUT',
      url: '/api/ai/config',
      ...auth({ payload: legacy }),
    });
    expect(saved.statusCode).toBe(200);
    const stored = await prisma.setting.findUniqueOrThrow({ where: { key: 'aiConfig' } });
    for (const field of ['importModel', 'askModel', 'searchModel'])
      expect(JSON.parse(stored.value)).not.toHaveProperty(field);
  });

  it('health 返回假客户端的连通结果', async () => {
    const res = await ctx.inject({ method: 'GET', url: '/api/ai/health', ...auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe('AI 问答', () => {
  it('tool-calling：先查台账再作答，steps 记录调用轨迹', async () => {
    await seedItem(); // 默认品名 A4复印纸，供语义搜索词表使用
    await seedItem({ itemName: '签字笔', quantity: 5 });

    fake.queue = [
      {
        content: null,
        toolCalls: [{ id: 'call-1', name: 'query_items', args: { search: '签字笔', pageSize: 5 } }],
      },
      { content: '共 1 条签字笔记录。', toolCalls: [] },
    ];
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/ai/ask',
      ...auth({ payload: { question: '台账里有签字笔吗？' } }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.answer).toBe('共 1 条签字笔记录。');
    expect(body.steps).toHaveLength(1);
    expect(body.steps[0]).toMatchObject({ name: 'query_items', count: 1 });
    expect(body.model).toBe('glm-4.6');

    // 第二轮请求里应带有工具结果消息
    const second = fake.calls.find((c) => c.messages.some((m) => m.role === 'tool'));
    expect(second?.messages.some((m) => m.role === 'tool' && m.tool_call_id === 'call-1')).toBe(
      true,
    );
  });

  it('模型直接回答时不产生 steps', async () => {
    fake.queue = [{ content: '不知道', toolCalls: [] }];
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/ai/ask',
      ...auth({ payload: { question: '你好' } }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().steps).toEqual([]);
  });
});

describe('AI 语义搜索', () => {
  it('搜索词经同义词扩展命中近似品名', async () => {
    fake.json = '{"terms":["A4复印纸"]}';
    const res = await ctx.inject({
      method: 'GET',
      url: '/api/items?search=' + encodeURIComponent('打印纸'),
      ...auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
    expect(res.json().items.some((i: { itemName: string }) => i.itemName === 'A4复印纸')).toBe(
      true,
    );
  });

  it('词表外的扩展词被丢弃（结果落地）', async () => {
    fake.json = '{"terms":["激光打印纸（不存在）","签字笔"]}';
    const res = await ctx.inject({
      method: 'GET',
      url: '/api/items?search=' + encodeURIComponent('打印纸2'),
      ...auth(),
    });
    expect(res.statusCode).toBe(200);
    // 「打印纸2」本身不命中，词表外的词也被过滤 → 总数与 A4复印纸 无关
    expect(res.json().items.some((i: { itemName: string }) => i.itemName === 'A4复印纸')).toBe(
      false,
    );
  });
});

describe('AI OCR 校对', () => {
  it('返回与当前值不同的建议；无解析结果的任务报 400', async () => {
    const prisma = ctx.app.get(PrismaService);
    await prisma.importTask.create({
      data: {
        id: 'task-ai-ok',
        filename: 'oa.pdf',
        status: 'DONE',
        result: JSON.stringify({
          serialNumber: 'OA-2026-AI',
          department: '财政部门',
          handler: '刘洋',
          requestDate: '2026-08-01',
          items: [{ itemName: 'a4复印纸', quantity: 2, unitPrice: 15 }],
          warnings: [],
          mode: 'PDF_TEXT',
        }),
      },
    });
    await prisma.importTask.create({
      data: { id: 'task-ai-failed', filename: 'bad.pdf', status: 'FAILED', error: 'x' },
    });

    fake.json = JSON.stringify({
      department: '行政部',
      handler: '刘洋', // 与当前值相同 → 应被差集剔除
      lines: [{ lineId: 'legacy-0', itemName: 'A4复印纸', reason: '对齐已有品名' }],
      warnings: ['流水号格式看起来正常'],
    });
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/ai/ocr-review',
      ...auth({ payload: { taskId: 'task-ai-ok' } }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.department).toBe('行政部');
    expect(body.handler).toBeUndefined();
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toMatchObject({ index: 0, itemName: 'A4复印纸' });

    const failed = await ctx.inject({
      method: 'POST',
      url: '/api/ai/ocr-review',
      ...auth({ payload: { taskId: 'task-ai-failed' } }),
    });
    expect(failed.statusCode).toBe(400);
  });
});
