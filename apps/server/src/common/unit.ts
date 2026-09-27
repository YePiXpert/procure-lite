import { BadRequestException } from '@nestjs/common';
export function assertCompatibleUnit(
  name: string,
  existing: string | null,
  incoming: string | null | undefined,
): void {
  if (!existing?.trim() || !incoming?.trim() || existing.trim() !== incoming.trim()) {
    throw new BadRequestException(`「${name}」库存单位未知或与本次不一致，请先确认并统一单位`);
  }
}
