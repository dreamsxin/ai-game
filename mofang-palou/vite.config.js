import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 相对路径：以后要塞进 Capacitor 的 APK（file:// 加载）时不用再改一遍。
  base: './',
});
