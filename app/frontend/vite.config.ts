import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      demo && {
        name: 'savemoney-demo-manifest',
        transformIndexHtml: () => [
          { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' } },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/icon-192.png' } },
          { tag: 'meta', attrs: { name: 'theme-color', content: '#059669' } },
        ],
      },
    ],
    server: demo ? undefined : {
      proxy: { '/api/v1': process.env.SAVEMONEY_API_TARGET ?? 'http://127.0.0.1:8000' },
    },
  };
});
