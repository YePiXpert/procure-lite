import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import fs from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AttachmentsService } from './attachments.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientIp } from '../common/request.util';
import { readUpload } from '../common/multipart.util';

const kindQuery = z.object({
  kind: z.enum(['INVOICE', 'SIGNOFF']).default('INVOICE'),
});

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('items/:id')
  async uploadForItem(
    @Param('id', ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(kindQuery)) query: { kind: 'INVOICE' | 'SIGNOFF' },
    @Req() req: FastifyRequest,
  ) {
    const file = await readUpload(req);
    return this.attachments.save({ file, kind: query.kind, itemId: id, ip: clientIp(req) });
  }

  @Post('distributions/:id')
  async uploadForDistribution(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    const file = await readUpload(req);
    return this.attachments.save({ file, kind: 'SIGNOFF', distributionId: id, ip: clientIp(req) });
  }

  @Post('requests/:id')
  async uploadForRequest(@Param('id', ParseIntPipe) id: number, @Req() req: FastifyRequest) {
    return this.attachments.save({ file: await readUpload(req), kind: 'OA_DOC', procurementRequestId: id, ip: clientIp(req) });
  }

  @Post('documents/:id')
  async uploadForDocument(
    @Param('id', ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(kindQuery)) query: { kind: 'INVOICE' | 'SIGNOFF' },
    @Req() req: FastifyRequest,
  ) {
    return this.attachments.save({ file: await readUpload(req), kind: query.kind, businessDocumentId: id, ip: clientIp(req) });
  }

  @Get()
  list(
    @Query(
      new ZodValidationPipe(
        z.object({
          itemId: z.coerce.number().int().positive().optional(),
          distributionId: z.coerce.number().int().positive().optional(),
          procurementRequestId: z.coerce.number().int().positive().optional(),
          businessDocumentId: z.coerce.number().int().positive().optional(),
        }),
      ),
    )
    query: { itemId?: number; distributionId?: number; procurementRequestId?: number; businessDocumentId?: number },
  ) {
    return this.attachments.list(query);
  }

  @Get(':id/download')
  async download(@Param('id', ParseIntPipe) id: number, @Res() res: FastifyReply) {
    const { record, filePath } = await this.attachments.get(id);
    const size = fs.statSync(filePath).size;
    res.status(200);
    res.header('content-type', record.mimeType);
    res.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
    );
    res.header('content-length', String(size));
    fs.createReadStream(filePath).pipe(res.raw);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: FastifyRequest) {
    return this.attachments.remove(id, clientIp(req));
  }
}
