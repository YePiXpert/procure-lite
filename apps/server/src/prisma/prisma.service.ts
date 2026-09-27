import { recoverRestore } from '../system/restore-files';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // connection_limit=1：SQLite 单写者，池内多连接只会在写事务上互撞
    recoverRestore(config.dataDir);
    super({ datasourceUrl: `${config.databaseUrl}?connection_limit=1` });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.applyPragmas();
  }

  /**
   * WAL：读写不再互斥；busy_timeout：写锁竞争时等待而非立即报 SQLITE_BUSY。
   * WAL 是数据库级持久设置，busy_timeout 是连接级设置（单连接下设一次即可）。
   */
  async applyPragmas(): Promise<void> {
    try {
      // journal_mode 会返回结果行，必须走 queryRaw 而非 executeRaw
      await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
      await this.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
      await this.$queryRawUnsafe('PRAGMA foreign_keys=ON;');
    } catch (e) {
      this.logger.warn(`PRAGMA 应用失败（不影响启动）: ${e instanceof Error ? e.message : e}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch(() => undefined);
  }
}
