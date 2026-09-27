import { test, expect } from '@playwright/test';

for (const ai of [false, true])
  test(`${ai ? '自动 GPT' : '关闭 AI'}：导入、恢复草稿、采购与${ai ? '发放' : '入库'}`, async ({
    page,
    request,
  }) => {
    const password = 'browser-test-password';
    await request.post('/api/auth/setup', { data: { password } });
    await page.goto('/login');
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: /^登\s*录$/ }).click();
    await expect(page).toHaveURL(/workbench/);
    const cfg = {
      enabled: ai,
      apiKey: 'synthetic',
      baseUrl: 'https://example.invalid/v1',
      model: 'synthetic',
      semanticSearch: false,
      autoImport: false,
    };
    expect((await page.request.put('/api/ai/config', { data: cfg })).ok()).toBeTruthy();
    if (ai) {
      const caps = await page.request.post('/api/ai/capabilities');
      expect((await caps.json()).image).toBe(true);
      expect(
        (await page.request.put('/api/ai/config', { data: { ...cfg, autoImport: true } })).ok(),
      ).toBeTruthy();
    }
    await page.goto('/import');
    await page
      .locator('input[type=file]')
      .setInputFiles({
        name: `${ai ? 'gpt' : 'local'}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(ai ? 'gpt-synthetic' : 'local-synthetic'),
      });
    const qty = page.getByPlaceholder('数量：待确认');
    await expect(qty).toBeVisible();
    await expect(qty).toHaveValue('');
    await expect(page.locator('input[type=date]')).toHaveValue('');
    const taskUrl = page.url();
    if (ai) {
      await expect(page.getByText('GPT：已完成', { exact: false })).toBeVisible();
      await page.getByText('识别依据与 GPT 建议', { exact: true }).click();
      await page.getByRole('button', { name: '已核对，采用建议' }).click();
      await expect(qty).toHaveValue('8');
      await page.getByRole('button', { name: '采用 GPT：2026-09-27' }).click();
    } else {
      await qty.fill('8');
      await page.locator('input[type=date]').fill('2026-09-27');
    }
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible();
    await page.reload();
    await expect(qty).toHaveValue('8');
    await expect(page.locator('img[alt="单据原件页面"]')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('import-review.png'), fullPage: true });
    const originalUrl = await page.getByRole('link', { name: '打开原件' }).getAttribute('href');
    expect((await page.request.get(originalUrl!)).ok()).toBeTruthy();
    const name = await page.getByPlaceholder('品名（同名不同规格请明确区分）').inputValue();
    await page.getByRole('button', { name: '确认全部内容并导入' }).click();
    await expect(page.getByText(/已创建 1 条/)).toBeVisible();
    await page.goto('/workbench');
    const card = page.locator('article').filter({ hasText: name });
    await card.getByRole('button', { name: '下单登记', exact: true }).click();
    await page
      .getByRole('checkbox', { name: '单价记入比价库（下次采购同一品名时自动提示）' })
      .uncheck();
    await page.getByRole('button', { name: '保存并标记已下单' }).click();
    await card.getByRole('button', { name: '确认到货', exact: true }).click();
    await card.getByRole('button', { name: ai ? '发放' : '入库', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: ai ? '确认发放' : '确认入库', exact: true })
      .click();
    await expect(card).toHaveCount(0);
    await page.goto(taskUrl);
    await expect(page.getByText('此任务已经确认入账，仅供查看。')).toBeVisible();
    await page.goto('/ledger');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  });
