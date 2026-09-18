import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, constants as zlib } from 'node:zlib';

// Identificador de versión del build = COMMIT desplegado. Se hornea en el cliente
// (import.meta.env.VITE_APP_VERSION) y se emite en `version.json`. El cliente compara
// ambos para detectar un despliegue REAL y avisar al usuario.
//
// IMPORTANTE: la versión DEBE ser estable para un mismo commit. Si cambia en cada
// build (p. ej. un timestamp), el aviso «el sistema se actualizó» salta aunque NO
// haya ningún commit nuevo (un rebuild/cron sin cambios). Por eso el fallback nunca
// usa la fecha: si no hay commit identificable, se usa la versión de package.json,
// que solo cambia cuando se decide subirla.
function appVersion(): string {
  // 1) Override explícito del deploy/CI (lo más confiable): el SHA del commit.
  const env = (
    process.env.VITE_APP_VERSION || process.env.APP_VERSION ||
    process.env.GITHUB_SHA || process.env.SOURCE_COMMIT || ''
  ).trim();
  if (env) return env.slice(0, 12);
  // 2) Hash corto del commit (build con git disponible en la carpeta).
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch { /* sin git en el entorno de build */ }
  // 3) Fallback ESTABLE (NO usar Date.now()): versión de package.json. Así un rebuild
  //    del mismo código no cambia la versión y no dispara avisos falsos.
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version?: string };
    return `v${pkg.version ?? '0'}`;
  } catch {
    return 'v0';
  }
}
const APP_VERSION = appVersion();

// Plugin que escribe dist/version.json al construir (lo sirve nginx).
const versionJsonPlugin = {
  name: 'gt-version-json',
  generateBundle() {
    // @ts-expect-error this.emitFile existe en el contexto de Rollup
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
  },
};

// Precompresión: junto a cada JS/CSS/HTML/JSON/SVG del build deja su `.gz` al
// máximo nivel. nginx con `gzip_static on` (deploy/nginx-rendimiento.conf) lo
// entrega tal cual: el navegador baja ~3 veces menos y el servidor no comprime
// en cada pedido. Sin esa línea en nginx los `.gz` se ignoran y no rompen nada.
//
// SE COMPRIME EN `writeBundle`, NUNCA EN `generateBundle`. Motivo (incidente del
// 17/09/2026, el sistema entero en pantalla negra): Vite reemplaza el marcador
// `__VITE_PRELOAD__` —la lista de dependencias de cada `import()` dinámico— en SU
// PROPIO `generateBundle`, que corre DESPUÉS del de los plugins del usuario.
// Comprimiendo ahí, el `.gz` se llevaba el marcador SIN reemplazar mientras el
// `.js` de al lado quedaba correcto. Como nginx sirve el `.gz` a todo navegador
// (todos mandan `Accept-Encoding: gzip`), al abrir cualquier módulo saltaba
// «__VITE_PRELOAD__ is not defined»; sin ErrorBoundary, React desmontaba el árbol
// y quedaba el fondo oscuro: pantalla negra. `writeBundle` corre al final, con el
// build ya escrito en disco, así que comprime exactamente lo que se publica.
const precomprimirPlugin = {
  name: 'gt-precomprimir-gzip',
  writeBundle(opts: { dir?: string }, bundle: Record<string, unknown>) {
    const dir = opts.dir ?? 'dist';
    for (const fileName of Object.keys(bundle)) {
      if (!/\.(js|css|html|json|svg)$/.test(fileName)) continue;
      const ruta = path.resolve(dir, fileName);
      let buf: Buffer;
      try { buf = readFileSync(ruta); } catch { continue; } // emitido pero no escrito: se omite
      if (buf.length < 1024) continue;
      writeFileSync(`${ruta}.gz`, gzipSync(buf, { level: zlib.Z_BEST_COMPRESSION }));
    }
  },
};

export default defineConfig(({ command }) => ({
  // Servir desde la raíz del dominio (Droplet/Nginx). Si algún despliegue necesitara
  // un subpath, se pasa VITE_BASE_PATH (ej. '/proyecto/') al hacer el build.
  base: command === 'build' ? (process.env.VITE_BASE_PATH ?? '/') : '/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
  },
  plugins: [react(), versionJsonPlugin, precomprimirPlugin],
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
