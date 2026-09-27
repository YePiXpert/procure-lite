import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { createApp, closeApp, type TestApp } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';
import { ImportsService } from '../src/imports/imports.service';
import { AiConfigService } from '../src/ai/ai-config.service';
import { OcrClient } from '../src/imports/ocr.client';
import { LlmClient } from '../src/ai/llm.client';
import { config } from '../src/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
let ctx: TestApp, prisma: PrismaService, imports: ImportsService;
const local = {
  schemaVersion: 2 as const,
  parserVersion: '3',
  mode: 'IMAGE_OCR' as const,
  pageCount: 1,
  pages: [{ page: 1, status: 'DONE' as const, mode: 'IMAGE_OCR' }],
  warnings: [],
  serialNumber: 'OA-NEW',
  department: '行政部',
  handler: '张三',
  requestDate: '2026-09-27',
  items: [
    {
      lineId: 'p1-r1',
      itemName: '笔',
      quantity: null,
      unit: '支',
      source: { page: 1, method: 'IMAGE_OCR' },
    },
  ],
};
const ocr = {
  inspect: vi.fn(async () => ({ pageCount: 1 })),
  parse: vi.fn(async () => local),
  page: vi.fn(async () => Buffer.from('image')),
};
const llm = {
  chat: vi.fn(async () => ({
    content: JSON.stringify({
      serialNumber: null,
      department: null,
      handler: null,
      requestDate: null,
      items: [
        {
          lineId: 'p1-r1',
          itemName: '笔',
          quantity: 8,
          unit: '支',
          unitPrice: null,
          purchaseLink: null,
          reason: '原件数量为8',
        },
      ],
      warnings: [],
    }),
    toolCalls: [],
    usage: { input: 20, output: 30 },
  })),
  ping: vi.fn(async () => true),
};
beforeAll(async () => {
  ctx = await createApp({
    override: (b) =>
      b.overrideProvider(OcrClient).useValue(ocr).overrideProvider(LlmClient).useValue(llm),
  });
  prisma = ctx.app.get(PrismaService);
  imports = ctx.app.get(ImportsService);
});
afterAll(() => closeApp(ctx));
const base = {
  serialNumber: 'OA-IDEM',
  department: '行政部',
  handler: '王芳',
  requestDate: '2026-09-27',
  items: [{ itemName: '纸', quantity: 2, unit: '包' }],
};
function post(url: string, payload: unknown, key = randomUUID()) {
  return ctx.inject({
    method: 'POST',
    url,
    headers: { cookie: ctx.cookie, 'idempotency-key': key },
    payload: payload as object,
  });
}
async function seedTask() {
  const id = randomUUID(),
    storagePath = `imports/${id}.png`;
  fs.mkdirSync(path.join(config.uploadsDir, 'imports'), { recursive: true });
  fs.writeFileSync(path.join(config.uploadsDir, storagePath), 'original');
  await prisma.importTask.create({
    data: {
      id,
      filename: 'sample.png',
      storagePath,
      status: 'DONE',
      result: JSON.stringify(local),
    },
  });
  return id;
}
async function settle(id: string) {
  for (let i = 0; i < 100; i++) {
    const t = await imports.task(id);
    if (!['PENDING', 'RUNNING'].includes(t.status) && !['PENDING', 'RUNNING'].includes(t.aiStatus))
      return t;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('task did not settle');
}

describe('trusted import', () => {
  it('rejects missing quantities and duplicate names', async () => {
    expect(
      (await post('/api/imports/confirm', { ...base, items: [{ itemName: '纸', quantity: null }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post('/api/imports/confirm', { ...base, items: [...base.items, ...base.items] }))
        .statusCode,
    ).toBe(400);
  });
  it('requires operation identity', async () => {
    expect(
      (
        await ctx.inject({
          method: 'POST',
          url: '/api/imports/confirm',
          headers: { cookie: ctx.cookie },
          payload: base,
        })
      ).statusCode,
    ).toBe(400);
  });
  it('replays a completed merge, rejects reuse with different content', async () => {
    await post('/api/imports/confirm', base);
    const key = randomUUID(),
      body = { ...base, items: [{ ...base.items[0], quantity: 3, duplicateAction: 'merge' }] };
    const first = await post('/api/imports/confirm', body, key),
      second = await post('/api/imports/confirm', body, key);
    expect(first.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(
      (await prisma.item.findFirstOrThrow({ where: { serialNumber: base.serialNumber } })).quantity,
    ).toBe(5);
    expect((await post('/api/imports/confirm', { ...body, handler: '不同' }, key)).statusCode).toBe(
      409,
    );
  });
  it('preserves source files, enforces draft version and confirms once', async () => {
    const id = await seedTask(),
      t = await imports.task(id);
    expect(t.draft!.items[0].quantity).toBeNull();
    const draft = { ...t.draft!, items: [{ ...t.draft!.items[0], quantity: 8 }] };
    await imports.saveDraft(id, 0, draft);
    await expect(imports.saveDraft(id, 0, draft)).rejects.toThrow('更新');
    expect(
      (await post('/api/imports/confirm', { ...draft, taskId: id, version: 0 })).statusCode,
    ).toBe(409);
    const key = randomUUID(),
      body = { ...draft, taskId: id, version: 1 };
    const a = await post('/api/imports/confirm', body, key);
    expect(a.statusCode).toBe(201);
    expect(a.json().attached).toBe(1);
    expect((await post('/api/imports/confirm', body, key)).json()).toEqual(a.json());
    expect((await post('/api/imports/confirm', body)).statusCode).toBe(409);
    expect((await imports.task(id)).originalAvailable).toBe(true);
  });
  it('blocks missing original and unresolved pages without writing rows', async () => {
    const id = await seedTask();
    await prisma.importTask.update({
      where: { id },
      data: {
        result: JSON.stringify({
          ...local,
          pages: [{ page: 1, status: 'FAILED', mode: 'IMAGE_OCR' }],
        }),
      },
    });
    const t = await imports.task(id),
      draft = {
        ...t.draft!,
        serialNumber: 'OA-FAIL',
        items: [{ ...t.draft!.items[0], quantity: 4 }],
      };
    await imports.saveDraft(id, 0, draft);
    expect(
      (await post('/api/imports/confirm', { ...draft, taskId: id, version: 1 })).statusCode,
    ).toBe(400);
    draft.reviewedPages = [{ page: 1, note: '人工核对完成' }];
    await imports.saveDraft(id, 1, draft);
    const source = await imports.original(id);
    fs.rmSync(source.full);
    expect(
      (await post('/api/imports/confirm', { ...draft, taskId: id, version: 2 })).statusCode,
    ).toBe(400);
    expect(await prisma.item.count({ where: { serialNumber: 'OA-FAIL' } })).toBe(0);
    // leave an intact fixture for backup tests in the separate suite
    fs.writeFileSync(source.full, 'original');
  });
  it('automatically proposes GPT quantities without changing the editable draft', async () => {
    const cfgService = ctx.app.get(AiConfigService);
    let cfg = await cfgService.updateConfig({
      enabled: true,
      baseUrl: 'https://example.com/v1',
      model: 'test-gpt',
      apiKey: 'test-key',
      semanticSearch: false,
      autoImport: false,
    });
    await cfgService.saveCapabilities(cfg, {
      checkedAt: new Date().toISOString(),
      text: true,
      image: true,
      structured: true,
      tools: true,
    });
    await cfgService.updateConfig({ ...cfg, autoImport: true });
    const { taskId } = await imports.upload({
      buffer: Buffer.from('img'),
      filename: 'auto.png',
      size: 3,
    });
    const t = await settle(taskId);
    expect(t.aiStatus).toBe('DONE');
    expect(t.aiResult[0].items[0].quantity).toBe(8);
    expect(t.draft!.items[0].quantity).toBeNull();
    const changed = { ...t.draft!, items: [{ ...t.draft!.items[0], quantity: 11 }] };
    await imports.saveDraft(taskId, 0, changed);
    await imports.retry(taskId, 'ai', [1]);
    const after = await settle(taskId);
    expect(after.draft!.items[0].quantity).toBe(11);
    expect(after.calls.every((c) => c.inputTokens === 20 && c.outputTokens === 30)).toBe(true);
  });
  it('invalidates capability results when model changes', async () => {
    const service = ctx.app.get(AiConfigService),
      cfg = await service.getConfig();
    await expect(
      service.updateConfig({ ...cfg, model: 'other', autoImport: true }),
    ).rejects.toThrow('能力检测');
  });
  it('requires explicit continuation for identical uploaded content', async () => {
    const file = { buffer: Buffer.from('duplicate-fixture'), filename: 'duplicate.png', size: 17 };
    const first = await imports.upload(file);
    await settle(first.taskId!);
    const duplicate = await imports.upload(file);
    expect(duplicate.taskId).toBeUndefined();
    expect(duplicate.duplicateTaskId).toBe(first.taskId);
    const continued = await imports.upload(file, undefined, true);
    expect(continued.taskId).not.toBe(first.taskId);
    await settle(continued.taskId!);
  });
  it('retains a shared original after either ledger attachment is removed', async () => {
    const id = await seedTask(),
      t = await imports.task(id);
    const draft = {
      ...t.draft!,
      serialNumber: 'OA-SHARED',
      items: [
        { ...t.draft!.items[0], quantity: 2 },
        { itemName: '第二个物品', quantity: 3, lineId: randomUUID() },
      ],
    };
    await imports.saveDraft(id, 0, draft);
    const confirmed = await post('/api/imports/confirm', { ...draft, taskId: id, version: 1 });
    expect(confirmed.json().attached).toBe(2);
    const source = await imports.original(id),
      attachments = await prisma.attachment.findMany({
        where: { storagePath: source.storagePath },
      });
    for (const attachment of attachments) {
      expect(
        (
          await ctx.inject({
            method: 'DELETE',
            url: `/api/attachments/${attachment.id}`,
            headers: { cookie: ctx.cookie },
          })
        ).statusCode,
      ).toBe(200);
      expect(fs.existsSync(source.full)).toBe(true);
    }
  });
  it('resumes only remote pages never attempted after restart', async () => {
    const id = await seedTask();
    await prisma.importTask.update({
      where: { id },
      data: {
        aiStatus: 'RUNNING',
        result: JSON.stringify({
          ...local,
          pageCount: 2,
          pages: [...local.pages, { page: 2, status: 'DONE', mode: 'IMAGE_OCR' }],
        }),
      },
    });
    await prisma.aiCall.create({
      data: {
        id: randomUUID(),
        taskId: id,
        page: 1,
        generation: 0,
        model: 'test-gpt',
        status: 'RUNNING',
      },
    });
    const before = llm.chat.mock.calls.length;
    await closeApp(ctx);
    ocr.inspect.mockResolvedValue({ pageCount: 2 });
    ctx = await createApp({
      override: (b) =>
        b.overrideProvider(OcrClient).useValue(ocr).overrideProvider(LlmClient).useValue(llm),
    });
    prisma = ctx.app.get(PrismaService);
    imports = ctx.app.get(ImportsService);
    const t = await settle(id);
    expect(t.calls.find((c) => c.page === 1)?.status).toBe('UNKNOWN');
    expect(t.calls.find((c) => c.page === 2)?.status).toBe('DONE');
    expect(t.aiStatus).toBe('FAILED');
    expect(llm.chat.mock.calls.length - before).toBe(1);
    ocr.inspect.mockResolvedValue({ pageCount: 1 });
  });
});
