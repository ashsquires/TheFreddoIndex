import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      build: {
        assetsInlineLimit: 0,
        rollupOptions: {
          output: {
            // Search engines need a crawlable icon at a stable URL.
            assetFileNames: (asset) => /\.(png|ico)$/.test(asset.name ?? '')
              ? 'assets/[name][extname]'
              : 'assets/[name]-[hash][extname]',
          },
        },
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
