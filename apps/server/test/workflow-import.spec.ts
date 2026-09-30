import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp, closeApp, type TestApp } from './utils';
import { PrismaService } from '../src/prisma/prisma.service';
import { ImportsService } from '../src/imports/imports.service';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { config } from '../src/config';

let ctx: TestApp, prisma: PrismaService, imports: ImportsService;
beforeAll(async () => {
  ctx = await createApp();
  prisma = ctx.app.get(PrismaService);
  imports = ctx.app.get(ImportsService);
});
afterAll(() => closeApp(ctx));
const post = (payload: object, key = randomUUID()) => ctx.inject({ method: 'POST', url: '/api/workflow/imports/confirm', payload, headers: { cookie: ctx.cookie, 'idempotency-key': key } });
async function source(failed = false) {
  const id = randomUUID(), storagePath = `imports/${id}.png`;
  fs.mkdirSync(path.join(config.uploadsDir, 'imports'), { recursive: true });
  fs.writeFileSync(path.join(config.uploadsDir, storagePath), 'original evidence');
  await prisma.importTask.create({ data: {
    id, filename: 'OA原件.png', storagePath, status: 'DONE',
    result: JSON.stringify({ schemaVersion: 2, parserVersion: 'test', mode: 'AI_IMAGE', pageCount: 1,
      pages: [{ page: 1, status: failed ? 'FAILED' : 'DONE', mode: 'AI_IMAGE' }], warnings: [],
      serialNumber: `OA-${id}`, department: '行政部', handler: '管理员', requestDate: '2026-09-30',
      items: [
        { lineId: 'p1-r1', itemName: '纸', spec: 'A4', quantity: 2, unit: '盒', source: { page: 1, method: 'AI_IMAGE' } },
        { lineId: 'p1-r2', itemName: '纸', spec: 'A4', quantity: 3, unit: '盒', source: { page: 1, method: 'AI_IMAGE' } },
        { lineId: 'p1-r3', itemName: '纸', spec: 'A3', quantity: 1, unit: '包', source: { page: 1, method: 'AI_IMAGE' } },
      ],
    }),
  } });
  const task = await imports.task(id);
  return { id, storagePath, body: { ...task.draft!, taskId: id, version: task.version } };
}

describe('reviewed originals become workflow requests', () => {
  it('preserves repeated physical rows, distinct product identities and a downloadable original', async () => {
    const { id, body } = await source();
    const key = randomUUID();
    const first = await post(body, key);
    expect(first.statusCode, first.body).toBe(201);
    const result = first.json();
    expect(result).toMatchObject({ created: 3, merged: 0, attached: 1 });
    expect((await post(body, key)).json()).toEqual(result);
    expect((await post(body)).statusCode).toBe(409);
    const request = await prisma.procurementRequest.findUniqueOrThrow({ where: { id: result.requestId }, include: { lines: true, attachments: true } });
    expect(request.lines).toHaveLength(3);
    expect(request.lines[0].productId).toBe(request.lines[1].productId);
    expect(request.lines[2].productId).not.toBe(request.lines[0].productId);
    expect(request.attachments).toHaveLength(1);
    expect((await imports.task(id)).requestId).toBe(request.id);
    const download = await ctx.inject({ method: 'GET', url: `/api/attachments/${request.attachments[0].id}/download`, headers: { cookie: ctx.cookie } });
    expect(download.statusCode).toBe(200);
    expect(download.body).toBe('original evidence');
    expect((await ctx.inject({ method: 'DELETE', url: `/api/attachments/${request.attachments[0].id}`, headers: { cookie: ctx.cookie } })).statusCode).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: 'REQUEST_IMPORT_CONFIRM', entityId: request.id } })).toBe(1);
  });
  it('rejects missing unit, impossible date and stale drafts without creating facts', async () => {
    const { id, body } = await source();
    expect((await post({ ...body, items: [{ ...body.items[0], unit: '' }] })).statusCode).toBe(400);
    expect((await post({ ...body, requestDate: '2026-02-30' })).statusCode).toBe(400);
    await imports.saveDraft(id, body.version, { ...body, handler: '已修改' });
    expect((await post(body)).statusCode).toBe(409);
    expect(await prisma.procurementRequest.count({ where: { sourceTaskId: id } })).toBe(0);
  });
  it('requires review for failed pages and the retained original before posting', async () => {
    const { id, body, storagePath } = await source(true);
    expect((await post(body)).statusCode).toBe(400);
    const reviewed = { ...body, reviewedPages: [{ page: 1, note: '逐行核对原件' }] };
    const saved = await imports.saveDraft(id, body.version, reviewed);
    const full = path.join(config.uploadsDir, storagePath);
    fs.rmSync(full);
    expect((await post({ ...reviewed, version: saved.version })).statusCode).toBe(400);
    expect(await prisma.procurementRequest.count({ where: { sourceTaskId: id } })).toBe(0);
    fs.writeFileSync(full, 'original evidence');
    const result = await post({ ...reviewed, version: saved.version });
    expect(result.statusCode, result.body).toBe(201);
  });
  it('prevents bypassing source verification through manual request creation', async () => {
    const { id, body } = await source();
    const response = await ctx.inject({ method: 'POST', url: '/api/workflow/requests', headers: { cookie: ctx.cookie, 'idempotency-key': randomUUID() }, payload: {
      serialNumber: body.serialNumber, department: body.department, handler: body.handler, requestDate: body.requestDate,
      sourceTaskId: id, lines: [{ itemName: '纸', specification: 'A4', quantity: '5', unit: '盒' }],
    } });
    expect(response.statusCode).toBe(400);
    expect(await prisma.procurementRequest.count({ where: { sourceTaskId: id } })).toBe(0);
  });
  it('links invoices to purchases and signoff to distributions, and releases removed files', async () => {
    const { body } = await source();
    const confirmed = await post(body);
    const request = await prisma.procurementRequest.findUniqueOrThrow({ where: { id: confirmed.json().requestId }, include: { lines: true } });
    const supplier = await prisma.supplier.create({ data: { name: `附件供应商-${randomUUID()}` } });
    const purchase = await ctx.inject({ method: 'POST', url: '/api/workflow/purchases', headers: { cookie: ctx.cookie, 'idempotency-key': randomUUID() }, payload: {
      date: '2026-09-30', supplierId: supplier.id, lines: [{ requestLineId: request.lines[0].id, quantity: '1', unitPrice: '20' }],
    } });
    expect(purchase.statusCode, purchase.body).toBe(201);
    const service = ctx.app.get(AttachmentsService);
    const file = { buffer: Buffer.from('invoice'), filename: '发票.pdf', size: 7, mimetype: 'application/pdf' };
    await expect(service.save({ file, businessDocumentId: purchase.json().id, kind: 'SIGNOFF' })).rejects.toThrow('发票须关联');
    const invoice = await service.save({ file, businessDocumentId: purchase.json().id, kind: 'INVOICE' });
    const saved = await service.get(invoice.id);
    expect(fs.existsSync(saved.filePath)).toBe(true);
    await service.remove(invoice.id);
    expect(fs.existsSync(saved.filePath)).toBe(false);
    expect(await prisma.businessDocument.count({ where: { id: purchase.json().id } })).toBe(1);
  });
});
