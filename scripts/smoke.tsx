/** 渲染冒烟测试入口：挂载完整 App（由 esbuild 打包后在 jsdom 中运行） */
import { createRoot } from 'react-dom/client';
import App from '../src/App.tsx';

const el = document.getElementById('root')!;
createRoot(el).render(<App />);
