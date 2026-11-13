/** 截图脚本：渲染各视图并保存 PNG */
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/shots/01-questions.png', fullPage: true });

// 打开题目抽屉（点击 Q08 所在行）
await page.locator('table.data tbody tr', { hasText: 'Q08' }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/shots/02-drawer.png', fullPage: true });

// 切到 B 卷范围看规则修订视图
await page.locator('.drawer .chip', { hasText: 'B 卷' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/shots/03-drawer-v2.png', fullPage: true });
await page.keyboard.press('Escape');
await page.locator('.drawer-close').click();
await page.waitForTimeout(200);

// 版本比较
await page.locator('.tab', { hasText: '版本比较' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/shots/04-versions.png', fullPage: true });

// 数据质量与补录（先应用补录看审计）
await page.locator('.tab', { hasText: '数据质量与补录' }).click();
await page.waitForTimeout(300);
await page.locator('button', { hasText: '应用示例补录批次' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/shots/05-quality-backfill.png', fullPage: true });

// 数据与导出
await page.locator('.tab', { hasText: '数据与导出' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/shots/06-io.png', fullPage: true });

// 深色模式：题目分析
await page.locator('.theme-toggle').click();
await page.locator('.tab', { hasText: '题目分析' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/shots/07-dark.png', fullPage: true });

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
