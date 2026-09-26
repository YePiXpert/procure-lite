import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OcrClient } from './ocr.client';
import { config } from '../config';
import { isFinalStatus, type ImportConfirmInput, type ParseResult } from '@procure-lite/shared';

const ALLOWED_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.bmp'];

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

export interface ImportTaskView {
  id: string;
  filename: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  result?: ParseResult;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

@Injectable()
export class ImportsService implements OnModuleInit {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocr: OcrClient,
    private readonly audit: AuditService,
  ) {}

  /** 进程重启后，把停留在 RUNNING 的僵尸任务标记为失败（任务态只在内存推进） */
  async onModuleInit(): Promise<void> {
    await this.prisma.importTask
      .updateMany({
        where: { status: 'RUNNING' },
        data: { status: 'FAILED', error: '服务重启导致解析中断，请重新上传', finishedAt: new Date() },
      })
      .catch(() => undefined);
  }

  /** 保存文件 → 建任务 → 异步解析（任务状态落库，重启后仍可查询） */
  async upload(file: { buffer: Buffer; filename: string; size: number }, ip?: string) {
    const filename = path.basename(file.filename || 'upload');
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      throw new BadRequestException(`不支持的文件类型 ${ext}（支持 PDF 与常见图片格式）`);
    }
    if (file.size > config.maxUploadBytes) {
      throw new BadRequestException(`文件超过 ${Math.floor(config.maxUploadBytes / 1024 / 1024)}MB 限制`);
    }

    await this.sweepStaleTasks();

    const id = randomUUID();
    const relative = path.join('imports', `${id}${ext}`);
    const stored = path.join(config.uploadsDir, relative);
    fs.mkdirSync(path.dirname(stored), { recursive: true });
    fs.writeFileSync(stored, file.buffer);

    await this.prisma.importTask.create({
      data: { id, filename, status: 'RUNNING', storagePath: relative },
    });
    await this.audit.log('IMPORT_UPLOAD', { entity: 'importTask', entityId: undefined, detail: { id, filename }, ip });

    // 异步执行，不阻塞响应
    void this.runParse(id, stored, filename);

    return { taskId: id };
  }

  /** 清理 30 天前的任务记录及其未被确认导入的原件，防止 uploads 无限增长 */
  private async sweepStaleTasks(): Promise<void> {
    try {
      const stale = await this.prisma.importTask.findMany({
        where: { createdAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
        select: { id: true, storagePath: true },
      });
      if (stale.length === 0) return;
      await this.prisma.importTask.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } });
      for (const task of stale) {
        if (!task.storagePath) continue;
        // 已转为附件的原件由附件表接管，不能在这里删
        const referenced = await this.prisma.attachment.count({
          where: { storagePath: task.storagePath },
        });
        if (referenced === 0) {
          fs.rm(path.join(config.uploadsDir, task.storagePath), { force: true }, () => undefined);
        }
      }
    } catch {
      // 清理失败不应阻塞上传
    }
  }

  private async runParse(taskId: string, filePath: string, filename: string): Promise<void> {
    try {
      const result = await this.ocr.parse(fs.readFileSync(filePath), filename);
      await this.prisma.importTask.update({
        where: { id: taskId },
        data: { status: 'DONE', result: JSON.stringify(result), finishedAt: new Date() },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`解析任务 ${taskId} 失败: ${message}`);
      await this.prisma.importTask
        .update({
          where: { id: taskId },
          data: { status: 'FAILED', error: message, finishedAt: new Date() },
        })
        .catch(() => undefined);
      // 解析失败的原件立即回收，成功的留到确认导入时转为附件
      fs.rm(filePath, { force: true }, () => undefined);
      await this.prisma.importTask
        .update({ where: { id: taskId }, data: { storagePath: null } })
        .catch(() => undefined);
    }
  }

  async task(id: string): Promise<ImportTaskView> {
    const row = await this.prisma.importTask.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('任务不存在');
    return {
      id: row.id,
      filename: row.filename,
      status: row.status as ImportTaskView['status'],
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString(),
    };
  }

  /** 确认前检查：逐条返回与现有台账重复的明细 */
  async checkDuplicates(body: {
    serialNumber: string;
    handler: string;
    itemNames: string[];
  }) {
    const found = await this.prisma.item.findMany({
      where: {
        serialNumber: body.serialNumber,
        handler: body.handler,
        deletedAt: null,
        itemName: { in: body.itemNames },
      },
      select: { id: true, itemName: true, quantity: true, status: true },
    });
    const byName = new Map(found.map((f) => [f.itemName, f]));
    return body.itemNames
      .filter((name) => byName.has(name))
      .map((name) => {
        const f = byName.get(name)!;
        return { itemName: name, matchedId: f.id, matchedQuantity: f.quantity, matchedStatus: f.status };
      });
  }

  /** 确认导入：逐条创建/合并/跳过（同一事务） */
  async confirm(input: ImportConfirmInput, ip?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      let created = 0;
      let merged = 0;
      let skipped = 0;
      const ids: number[] = [];

      for (const line of input.items) {
        const existing = await tx.item.findFirst({
          where: {
            serialNumber: input.serialNumber,
            handler: input.handler,
            itemName: line.itemName,
            deletedAt: null,
          },
        });

        if (existing) {
          if (line.duplicateAction === 'merge') {
            // 已发放/已入库的数量已落到发放记录与库存，再累加只会让台账凭空多出一截
            if (isFinalStatus(existing.status)) {
              throw new BadRequestException(`「${existing.itemName}」已发放或已入库，不能合并数量；请选择跳过`);
            }
            const newQty = existing.quantity + line.quantity;
            const after = await tx.item.update({
              where: { id: existing.id },
              data: { quantity: newQty },
            });
            await tx.itemHistory.create({
              data: {
                itemId: existing.id,
                action: 'IMPORT_MERGE',
                changedFields: JSON.stringify({ quantity: [existing.quantity, newQty] }),
                beforeData: JSON.stringify(existing),
                afterData: JSON.stringify(after),
              },
            });
            merged += 1;
            ids.push(existing.id);
          } else {
            skipped += 1;
          }
          continue;
        }

        const item = await tx.item.create({
          data: {
            serialNumber: input.serialNumber,
            department: input.department,
            handler: input.handler,
            requestDate: input.requestDate,
            itemName: line.itemName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            purchaseLink: line.purchaseLink,
            supplierId: input.supplierId ?? null,
          },
        });
        await tx.itemHistory.create({
          data: { itemId: item.id, action: 'IMPORT_CREATE', afterData: JSON.stringify(item) },
        });
        created += 1;
        ids.push(item.id);
      }
      return { created, merged, skipped, ids };
    });

    const attached = await this.attachOriginal(input.taskId, result.ids);

    await this.audit.log('IMPORT_CONFIRM', {
      entity: 'import',
      detail: {
        serialNumber: input.serialNumber,
        created: result.created,
        merged: result.merged,
        skipped: result.skipped,
      },
      ip,
    });
    return { ...result, attached };
  }

  /**
   * 把解析用的 OA 原件挂到本次入库的每条台账上（kind = OA_DOC）。
   * 多条记录共用同一个物理文件，删除时由附件服务按引用计数回收。
   */
  private async attachOriginal(taskId: string | undefined, itemIds: number[]): Promise<number> {
    if (!taskId || itemIds.length === 0) return 0;
    const task = await this.prisma.importTask.findUnique({ where: { id: taskId } });
    if (!task?.storagePath) return 0;

    const absolute = path.join(config.uploadsDir, task.storagePath);
    if (!fs.existsSync(absolute)) return 0;

    const size = fs.statSync(absolute).size;
    const ext = path.extname(task.storagePath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream';

    try {
      await this.prisma.attachment.createMany({
        data: itemIds.map((itemId) => ({
          kind: 'OA_DOC',
          itemId,
          filename: task.filename,
          storagePath: task.storagePath!,
          mimeType,
          sizeBytes: size,
        })),
      });
      // 原件已由附件表接管，任务不再持有它
      await this.prisma.importTask.update({ where: { id: taskId }, data: { storagePath: null } });
      return itemIds.length;
    } catch (e) {
      this.logger.warn(`OA 原件转附件失败: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  }
}
