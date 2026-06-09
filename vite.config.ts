import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ command }) => ({
  // Servir desde la raíz del dominio (Droplet/Nginx). Si algún despliegue necesitara
  // un subpath, se pasa VITE_BASE_PATH (ej. '/proyecto/') al hacer el build.
  base: command === 'build' ? (process.env.VITE_BASE_PATH ?? '/') : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Vendors estables en chunks separados: se cachean entre deploys y
        // se descargan en paralelo, en vez de re-bajar ~400kB ante cada cambio.
        manualChunks(id) {
          // El helper de precarga de Vite (__vitePreload) lo usa el entry; si cae
          // en el chunk 'pdf', el entry lo importa estático y precarga ~200kB de
          // jsPDF en el arranque. Lo fijamos en 'react' (siempre presente).
          if (id.includes('preload-helper') || id.includes('modulepreload')) return 'react';
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('react-router') || id.includes('/history/')) return 'router';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('/scheduler/')) return 'react';
          // Librerías pesadas que solo se cargan bajo demanda (PDF/Excel/captura):
          // nombre de chunk estable → el navegador conserva la caché entre deploys.
          if (id.includes('jspdf') || id.includes('/canvg/') || id.includes('dompurify')) return 'pdf';
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('html2canvas')) return 'html2canvas';
        },
      },
    },
  },
}));
