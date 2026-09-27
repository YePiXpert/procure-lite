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
import { InventoryService } from './inventory.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { clientIp, operationId } from '../common/request.util';
import {
  movementCreateSchema,
  movementQuerySchema,
  productUpsertSchema,
  stockInBatchSchema,
  type MovementCreateInput,
  type MovementQuery,
  type ProductUpsertInput,
  type StockInBatchInput,
} from '@procure-lite/shared';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('products')
  products(
    @Query(
      new ZodValidationPipe(
        z.object({
          search: z.string().trim().max(100).optional(),
          low: z.enum(['1', '0']).optional(),
        }),
      ),
    )
    query: {
      search?: string;
      low?: '1' | '0';
    },
  ) {
    return this.inventory.products(query.search, query.low === '1');
  }

  @Get('movements')
  movements(@Query(new ZodValidationPipe(movementQuerySchema)) query: MovementQuery) {
    return this.inventory.movements(query);
  }

  @Post('products')
  upsertProduct(
    @Body(new ZodValidationPipe(productUpsertSchema)) body: ProductUpsertInput,
    @Req() req: FastifyRequest,
  ) {
    return this.inventory.upsertProduct(body, clientIp(req));
  }

  @Post('movements')
  createMovement(
    @Body(new ZodValidationPipe(movementCreateSchema)) body: MovementCreateInput,
    @Req() req: FastifyRequest,
  ) {
    return this.inventory.createMovement(body, clientIp(req), operationId(req));
  }

  /** 台账记录整单入库 */
  @Post('stock-in')
  @HttpCode(200)
  stockInMany(
    @Body(new ZodValidationPipe(stockInBatchSchema)) body: StockInBatchInput,
    @Req() req: FastifyRequest,
  ) {
    return this.inventory.stockInMany(body.itemIds, clientIp(req), operationId(req));
  }

  @Post('stock-in/:itemId')
  stockIn(@Param('itemId', ParseIntPipe) itemId: number, @Req() req: FastifyRequest) {
    return this.inventory.stockIn(itemId, clientIp(req), operationId(req));
  }

  @Delete('products/:id')
  deleteProduct(@Param('id', ParseIntPipe) id: number, @Req() req: FastifyRequest) {
    return this.inventory.deleteProduct(id, clientIp(req));
  }

  @Delete('movements/:id')
  removeMovement(@Param('id', ParseIntPipe) id: number, @Req() req: FastifyRequest) {
    return this.inventory.removeMovement(id, clientIp(req));
  }
}
