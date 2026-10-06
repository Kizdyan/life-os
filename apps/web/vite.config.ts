import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  const buildSha = process.env.LIFE_OS_BUILD_SHA || process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || 'dev';
  return {
    plugins: [
      react(),
      {
        name: 'life-os-build-identity',
        transformIndexHtml(html: string) {
          return html.replace('</head>', `<meta name="life-os-build" content="${buildSha}"></head>`);
        },
      },
    ],
    build: {
      outDir: '../../dist',
      emptyOutDir: true,
    },
  };
});
