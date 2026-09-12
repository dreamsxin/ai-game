import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 打进 APK 后是 file:// 加载的，绝对路径 /assets/... 会 404。
  base: './',
});
