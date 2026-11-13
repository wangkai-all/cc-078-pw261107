/** jsdom 环境 + 动态导入打包后的 App，验证真实渲染 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const w = dom.window;
globalThis.window = w;
globalThis.document = w.document;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
globalThis.HTMLElement = w.HTMLElement;
globalThis.SVGElement = w.SVGElement;
globalThis.Element = w.Element;
globalThis.Node = w.Node;
globalThis.getComputedStyle = w.getComputedStyle.bind(w);
globalThis.requestAnimationFrame = w.requestAnimationFrame?.bind(w) ?? ((cb) => setTimeout(cb, 16));
globalThis.cancelAnimationFrame = w.cancelAnimationFrame?.bind(w) ?? clearTimeout;
globalThis.URL = w.URL;
globalThis.Blob = w.Blob;
globalThis.MouseEvent = w.MouseEvent;
globalThis.PointerEvent = w.PointerEvent ?? w.MouseEvent;

const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));
const origError = console.error;
console.error = (...args) => { errors.push(args.join(' ')); origError(...args); };

await import('/tmp/smoke.mjs');
await new Promise((r) => setTimeout(r, 300));

const html = w.document.getElementById('root').innerHTML;
const checks = [
  ['标题', html.includes('考试数据分析台')],
  ['虚构声明', html.includes('全部数据为虚构')],
  ['题目表格渲染', html.includes('Q01') && html.includes('正确率')],
  ['筛选栏渲染', html.includes('试卷版本') && html.includes('考生群体')],
  ['质量徽章', html.includes('无效') && html.includes('缺失')],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fail++;
}

// 模拟点击第一行题目 → 抽屉应打开
const row = w.document.querySelector('table.data tbody tr');
row.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
const drawerHtml = w.document.querySelector('.drawer')?.innerHTML ?? '';
const drawerChecks = [
  ['抽屉打开', drawerHtml.length > 0],
  ['KPI 渲染', drawerHtml.includes('有效样本')],
  ['选项分布图', drawerHtml.includes('选项分布')],
  ['群体差异图', drawerHtml.includes('考生群体差异')],
  ['原始记录表', drawerHtml.includes('原始答题记录')],
  ['位置与规则', drawerHtml.includes('题目位置与评分规则')],
];
for (const [name, ok] of drawerChecks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fail++;
}

if (errors.length > 0) {
  console.log('\n控制台错误：');
  errors.slice(0, 5).forEach((e) => console.log('  ', e.slice(0, 300)));
  fail++;
}

// 关闭抽屉 → 切到版本比较
w.document.querySelector('.drawer-close').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 100));
const tabs = [...w.document.querySelectorAll('.tab')];
tabs.find((t) => t.textContent === '版本比较').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
const vHtml = w.document.querySelector('.main').innerHTML;
for (const [name, ok] of [
  ['热力图渲染', vHtml.includes('heatmap') && vHtml.includes('正确率热力图')],
  ['规则变更提示', vHtml.includes('跨版本规则变更') && vHtml.includes('Q08')],
  ['表格孪生视图', vHtml.includes('表格视图')],
]) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fail++;
}

// 切到数据质量 → 应用补录
tabs.find((t) => t.textContent === '数据质量与补录').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
const applyBtn = [...w.document.querySelectorAll('button')].find((b) => b.textContent.includes('应用示例补录批次'));
const before = w.document.querySelector('.main').innerHTML;
for (const [name, ok] of [
  ['质量三分类渲染', before.includes('无效答题') && before.includes('缺失题目') && before.includes('重复提交')],
  ['补录按钮可用', applyBtn && !applyBtn.disabled],
]) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fail++;
}
applyBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
const after = w.document.querySelector('.main').innerHTML;
for (const [name, ok] of [
  ['补录审计出现', after.includes('BF-001') && after.includes('仅更新')],
  ['缺失计数下降', !after.includes('>15</span>')],
]) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fail++;
}

// 切到数据与导出
tabs.find((t) => t.textContent === '数据与导出').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
const ioHtml = w.document.querySelector('.main').innerHTML;
for (const [name, ok] of [
  ['导入面板渲染', ioHtml.includes('导入完整数据集')],
  ['导出面板渲染', ioHtml.includes('导出审阅表') && ioHtml.includes('导出原始样本')],
]) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fail++;
}

console.log(fail === 0 ? '\n渲染冒烟测试通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
