import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api-wc': {
        target: 'https://midnightblue-manatee-916938.hostingersite.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-wc/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Proxy error:', err);
          });
        },
      },
      // Dev only: photo search reads product image pixels, which the browser
      // allows only same-origin. In production storefront and WordPress share
      // kayalslifestyle.com; locally this proxy stands in for that.
      '/__img': {
        target: 'https://app.kayalslifestyle.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__img/, ''),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-toast',
            '@radix-ui/react-tabs',
            '@radix-ui/react-accordion',
          ],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 200,
  },
}));
