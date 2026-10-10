import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          // Vendor code changes rarely; keeping it out of the app chunk lets browsers reuse it across deploys.
          codeSplitting: {
            groups: [
              {name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3},
              {name: 'supabase', test: /node_modules[\\/](@supabase|iceberg-js)[\\/]/, priority: 2},
              {name: 'vendor', test: /node_modules[\\/]/, priority: 1},
            ],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
