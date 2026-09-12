import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Capacitor 把 dist 塞进 APK 后是用 file:// 加载的，绝对路径 /assets/... 会 404，
  // 所以打包产物必须走相对路径。浏览器里跑相对路径也一样正常。
  base: './',
});
