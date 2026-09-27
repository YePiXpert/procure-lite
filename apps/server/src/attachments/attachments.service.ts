import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { config } from '../config';

const ALLOWED_EXTS = ['.pdf', '.png', '.jpg', '.jpeg'];

export interface StoredAttachment {
  record: {
    id: number;
    kind: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  };
  filePath: string;
}

/** 附件存储：发票 / 签收凭证等，落盘到 state/uploads */
@Injectable()
export class AttachmentsService implements OnModuleDestroy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async save(params: {
    file: { buffer: Buffer; filename: string; size: number; mimetype: string };
    kind: string;
    itemId?: number;
    distributionId?: number;
    ip?: string;
  }) {
    const filename = path.basename(params.file.filename || 'attachment');
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      throw new BadRequestException('附件仅支持 PDF / PNG / JPG 格式');
    }
    if (params.file.size > config.maxUploadBytes) {
      throw new BadRequestException('附件超过大小限制');
    }
    if (!params.itemId && !params.distributionId) {
      throw new BadRequestException('缺少关联对象');
    }
    if (params.itemId) {
      const item = await this.prisma.item.findFirst({
        where: { id: params.itemId, deletedAt: null },
      });
      if (!item) throw new NotFoundException('台账记录不存在');
    }
    if (params.distributionId) {
      const dist = await this.prisma.distribution.findUnique({
        where: { id: params.distributionId },
      });
      if (!dist) throw new NotFoundException('发放单不存在');
    }

    const storedName = `${randomUUID()}${ext}`;
    const storagePath = path.join(config.uploadsDir, 'attachments', storedName);
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, params.file.buffer);

    const record = await this.prisma.attachment.create({
      data: {
        kind: params.kind,
        itemId: params.itemId ?? null,
        distributionId: params.distributionId ?? null,
        filename,
        storagePath: `attachments/${storedName}`,
        mimeType: params.file.mimetype || 'application/octet-stream',
        sizeBytes: params.file.size,
      },
    });
    await this.audit.log('ATTACHMENT_UPLOAD', {
      entity: 'attachment',
      entityId: record.id,
      detail: { kind: params.kind, filename },
      ip: params.ip,
    });
    return record;
  }

  async list(params: { itemId?: number; distributionId?: number }) {
    return this.prisma.attachment.findMany({
      where: {
        ...(params.itemId ? { itemId: params.itemId } : {}),
        ...(params.distributionId ? { distributionId: params.distributionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: number): Promise<StoredAttachment> {
    const record = await this.prisma.attachment.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('附件不存在');
    const filePath = path.join(config.uploadsDir, record.storagePath);
    if (!fs.existsSync(filePath)) throw new NotFoundException('附件文件缺失');
    return { record, filePath };
  }

  async remove(id: number, ip?: string) {
    const record = await this.prisma.attachment.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('附件不存在');
    await this.prisma.attachment.delete({ where: { id } });
    await this.releaseFile(record.storagePath);
    await this.audit.log('ATTACHMENT_DELETE', {
      entity: 'attachment',
      entityId: id,
      ip,
    });
    return { ok: true };
  }

  /**
   * 按引用计数回收物理文件：OA 原件会被同一批导入的多条台账共享，
   * 只有最后一条引用消失时才能真正删盘。
   */
  async releaseFile(storagePath: string): Promise<void> {
    const remaining = await this.prisma.attachment.count({ where: { storagePath } });
    if (remaining > 0 || (await this.prisma.importTask.count({ where: { storagePath } }))) return;
    fs.rmSync(path.join(config.uploadsDir, storagePath), { force: true });
  }

  onModuleDestroy(): void {
    // 预留：清理孤儿文件
  }
}
