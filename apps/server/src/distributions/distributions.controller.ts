import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DistributionsService } from './distributions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientIp, operationId } from '../common/request.util';
import {
  distributionCreateSchema,
  distributionQuerySchema,
  reportQuerySchema,
  type DistributionCreateInput,
  type DistributionQuery,
} from '@procure-lite/shared';

@Controller('distributions')
export class DistributionsController {
  constructor(private readonly distributions: DistributionsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(distributionQuerySchema)) query: DistributionQuery) {
    return this.distributions.list(query);
  }

  @Get('recipients')
  recipients(
    @Query(new ZodValidationPipe(reportQuerySchema)) query: { dateFrom?: string; dateTo?: string },
  ) {
    return this.distributions.recipientStats(query.dateFrom, query.dateTo);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(distributionCreateSchema)) body: DistributionCreateInput,
    @Req() req: FastifyRequest,
  ) {
    return this.distributions.create(body, clientIp(req), operationId(req));
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.distributions.get(id);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: FastifyRequest) {
    return this.distributions.remove(id, clientIp(req));
  }
}
