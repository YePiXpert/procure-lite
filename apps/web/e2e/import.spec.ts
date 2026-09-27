import { test, expect } from '@playwright/test';

test('服务器已配置密钥时可直接选择模型，列表故障保留手工入口', async ({ page, request }) => {
  const password = 'browser-test-password';
  await request.post('/api/auth/setup', { data: { password } });
  await page.goto('/login');
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page).toHaveURL(/workbench/);
  await page.request.put('/api/ai/config', {
    data: {
      enabled: false,
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'synthetic',
      model: 'saved-gpt',
      semanticSearch: false,
      autoImport: false,
    },
  });
  await page.route('**/api/ai/config', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), keySource: 'server' } });
  });
  await page.route('**/api/ai/models', (route) =>
    route.fulfill({ json: { models: ['listed-gpt'] } }),
  );
  await page.goto('/settings');
  await expect(page.getByText('服务已配置 · 修改连接', { exact: true })).toBeVisible();
  await expect(page.getByLabel('接口地址', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('combobox', { name: '单据识别模型', exact: true })).not.toBeVisible();
  await page.getByText('服务已配置 · 修改连接', { exact: true }).click();
  await expect(page.getByText('服务器已配置 Key，无需填写')).toBeVisible();
  await page.getByText('服务已配置 · 修改连接', { exact: true }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveCount(0);
  const model = page.getByRole('combobox', { name: '主模型', exact: true });
  await expect(model).toContainText('saved-gpt（当前配置）');
  await model.click();
  await page.getByRole('option', { name: 'listed-gpt', exact: true }).click();
  await expect(model).toContainText('listed-gpt');
  // Retrieval failure must keep the selected value and manual editing usable.
  await page.route('**/api/ai/models', (route) =>
    route.fulfill({ status: 503, json: { message: '无法获取模型列表' } }),
  );
  await page.getByRole('button', { name: '获取模型列表', exact: true }).click();
  await expect(page.getByText('无法获取模型列表', { exact: true })).toBeVisible();
  await expect(page.getByLabel('主模型', { exact: true })).toHaveValue('listed-gpt');
});

for (const scenario of ['local', 'gpt', 'timeout']) {
  const ai = scenario !== 'local';
  const timeout = scenario === 'timeout';
  test(`${timeout ? 'GPT 超时后人工核对' : ai ? '自动 GPT' : '关闭 AI'}：导入、恢复草稿、采购与${ai ? '发放' : '入库'}`, async ({
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
      model: timeout ? 'synthetic-timeout' : 'synthetic',
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
    await page.locator('input[type=file]').setInputFiles({
      name: `${scenario}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(`${scenario}-synthetic`),
    });
    const qty = page.getByPlaceholder('数量：待确认');
    await expect(qty).toBeVisible();
    await expect(qty).toHaveValue('');
    await expect(page.locator('input[type=date]')).toHaveValue('');
    const taskUrl = page.url();
    if (ai && !timeout) {
      await expect(page.getByText('GPT：已完成', { exact: false })).toBeVisible();
      await page.getByText('识别依据与 GPT 建议', { exact: true }).click();
      await page.getByRole('button', { name: '已核对，采用建议' }).click();
      await expect(qty).toHaveValue('8');
      await page.getByRole('button', { name: '采用 GPT：2026-09-27' }).click();
    } else {
      await qty.fill('8');
      await page.locator('input[type=date]').fill('2026-09-27');
    }
    if (timeout) {
      await expect(page.getByText('GPT：部分失败', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: '确认全部内容并导入' }).click();
      await expect(page.getByRole('alert')).toContainText('第 1 页未完成核对');
      await page.getByRole('checkbox', { name: /GPT 复核未完成/ }).check();
    }
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible();
    await page.reload();
    await expect(qty).toHaveValue('8');
    if (timeout) await expect(page.getByRole('checkbox', { name: /GPT 复核未完成/ })).toBeChecked();
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
}
