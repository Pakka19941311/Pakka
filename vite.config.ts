import { defineConfig } from 'vite';

export default defineConfig({
  define: { __QA_BUILD__: JSON.stringify(process.env.VARENDOR_QA === '1') },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 6_000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@babylonjs/')) return 'babylon';
          return undefined;
        },
      },
    },
  },
});
