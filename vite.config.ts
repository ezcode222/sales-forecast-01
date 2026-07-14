import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const appBasePath = `/${(env.APP_BASE_PATH || '/ugt-sales-forecast/nylon').replace(/^\/+|\/+$/g, '')}/`;
  const proxyBasePath = appBasePath.replace(/\/$/g, '');
  return {
    base: appBasePath,
    plugins: [
      {
        name: 'sales-forecast-base-path-redirect',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const rawUrl = req.url || '';
            const qIndex = rawUrl.indexOf('?');
            const pathname = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl;
            const query = qIndex >= 0 ? rawUrl.slice(qIndex) : '';

            // Keep browser URL without trailing slash.
            if (pathname === appBasePath) {
              res.statusCode = 301;
              res.setHeader('Location', `${proxyBasePath}${query}`);
              res.end(`Redirecting to ${proxyBasePath}`);
              return;
            }

            // Rewrite no-slash app root so Vite can serve index with base ending in /.
            if (pathname === proxyBasePath) {
              req.url = `${appBasePath}${query}`;
            }
            next();
          });
        },
      },
      react(),
      tailwindcss(),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      strictPort: true,
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        [`${proxyBasePath}/api`]: {
          target: `http://127.0.0.1:${env.API_PORT || process.env.API_PORT || 3001}`,
          changeOrigin: true,
        },
        [`${proxyBasePath}/auth`]: {
          target: `http://127.0.0.1:${env.API_PORT || process.env.API_PORT || 3001}`,
          changeOrigin: true,
        },
        '/api': {
          target: `http://127.0.0.1:${env.API_PORT || process.env.API_PORT || 3001}`,
          changeOrigin: true,
        },
        '/auth': {
          target: `http://127.0.0.1:${env.API_PORT || process.env.API_PORT || 3001}`,
          changeOrigin: true,
        },
      },
    },
  };
});
