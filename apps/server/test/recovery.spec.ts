import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { execFileSync } from 'node:child_process';
import { createApp, closeApp, type TestApp } from './utils';
import { BackupService } from '../src/system/backup.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { config } from '../src/config';
import { recoverRestore, writeRestoreJournal } from '../src/system/restore-files';
let ctx: TestApp, backup: BackupService, prisma: PrismaService;
beforeAll(async () => {
  ctx = await createApp();
  backup = ctx.app.get(BackupService);
  prisma = ctx.app.get(PrismaService);
});
afterAll(() => closeApp(ctx));
it('restores a coherent snapshot and invalidates old sessions', async () => {
  await prisma.product.create({ data: { name: '恢复样本', unit: '件', stockQty: 5 } });
  fs.writeFileSync(path.join(config.uploadsDir, 'evidence.txt'), 'original');
  const saved = await backup.create();
  await prisma.product.update({ where: { name: '恢复样本' }, data: { stockQty: 9 } });
  fs.writeFileSync(path.join(config.uploadsDir, 'evidence.txt'), 'changed');
  await backup.restore(saved.name);
  expect((await prisma.product.findUniqueOrThrow({ where: { name: '恢复样本' } })).stockQty).toBe(
    5,
  );
  expect(fs.readFileSync(path.join(config.uploadsDir, 'evidence.txt'), 'utf8')).toBe('original');
  expect(
    (await ctx.inject({ method: 'GET', url: '/api/items', headers: { cookie: ctx.cookie } }))
      .statusCode,
  ).toBe(401);
});
it('rejects corrupt manifest before changing live data', async () => {
  const saved = await backup.create(),
    zip = new AdmZip(backup.path(saved.name));
  zip.updateFile('uploads/evidence.txt', Buffer.from('tampered'));
  zip.writeZip(backup.path(saved.name));
  await expect(backup.restore(saved.name)).rejects.toThrow('校验');
  expect(fs.readFileSync(path.join(config.uploadsDir, 'evidence.txt'), 'utf8')).toBe('original');
});
it('rolls back an interrupted file replacement', async () => {
  const saved = await backup.create();
  await prisma.product.update({ where: { name: '恢复样本' }, data: { stockQty: 12 } });
  const real = fs.renameSync;
  let failed = false;
  const mock = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (!failed && String(from).includes('/new/uploads')) {
      failed = true;
      throw new Error('simulated disk failure');
    }
    return real(from, to);
  });
  await expect(backup.restore(saved.name)).rejects.toThrow('simulated');
  mock.mockRestore();
  expect((await prisma.product.findUniqueOrThrow({ where: { name: '恢复样本' } })).stockQty).toBe(
    12,
  );
  expect(fs.readFileSync(path.join(config.uploadsDir, 'evidence.txt'), 'utf8')).toBe('original');
});
it('startup recovery restores files from a crash journal', () => {
  const root = fs.mkdtempSync('/tmp/procure-recovery-'),
    dir = '.restore-test';
  fs.mkdirSync(path.join(root, dir, 'old', 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(root, dir, 'old', 'procure.db'), 'old');
  fs.writeFileSync(path.join(root, 'procure.db'), 'partial');
  writeRestoreJournal(root, dir, 'SWAPPING');
  recoverRestore(root);
  expect(fs.readFileSync(path.join(root, 'procure.db'), 'utf8')).toBe('old');
  expect(fs.existsSync(path.join(root, 'restore-journal.json'))).toBe(false);
  fs.rmSync(root, { recursive: true });
});
it('migrates a legacy backup in an isolated copy before replacing the live database', async () => {
  const root = fs.mkdtempSync('/tmp/procure-legacy-');
  try {
    fs.mkdirSync(path.join(root, 'migrations'));
    const source = path.resolve(__dirname, '../prisma');
    fs.copyFileSync(path.join(source, 'schema.prisma'), path.join(root, 'schema.prisma'));
    for (const name of fs.readdirSync(path.join(source, 'migrations')))
      if (!name.startsWith('20260927'))
        fs.cpSync(path.join(source, 'migrations', name), path.join(root, 'migrations', name), {
          recursive: true,
        });
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        path.join(root, 'schema.prisma'),
      ],
      { env: { ...process.env, DATABASE_URL: `file:${root}/procure.db` }, stdio: 'pipe' },
    );
    const zip = new AdmZip();
    zip.addLocalFile(path.join(root, 'procure.db'));
    zip.writeZip(path.join(config.backupsDir, 'backup-legacy.zip'));
    await backup.restore('backup-legacy.zip');
    expect(await prisma.importRevision.count()).toBe(0);
    const migrations = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      'SELECT migration_name FROM _prisma_migrations',
    );
    expect(migrations.some((m) => m.migration_name === '20260927000000_trusted_import')).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
