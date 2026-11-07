import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 发布后的分享链接往往挂在子路径上。用相对 base，dist/ 整个目录丢到哪儿都能跑，
  // 不用为托管平台单独改配置；本地 vite dev / preview 的根路径也照常工作。
  base: './',
  // 万一以后改用 dev/preview server 托管（而不是静态 dist），别让反向代理的域名被 Vite 挡掉。
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
});
