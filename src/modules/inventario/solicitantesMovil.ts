/* ============================================================
   Golden Touch · Inventario Móvil · Solicitantes («Solicitado por»)
   (18/11/2026)

   Utilidades puras para normalizar, combinar y transportar el campo
   «Solicitado por» tanto en salidas móviles como en traslados entre
   almacenes (en tránsito, directos o puente MGG) sin romper esquemas.
   ============================================================ */

const normClave = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function normalizarNombreSolicitante(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Une y ordena alfabéticamente varias listas de nombres sin duplicados (ignorando acentos/mayúsculas). */
export function unirNombresSolicitantes(...listas: Array<readonly string[] | undefined>): string[] {
  const mapa = new Map<string, string>();
  for (const lista of listas) {
    if (!lista) continue;
    for (const item of lista) {
      const limpio = normalizarNombreSolicitante(item);
      if (!limpio) continue;
      const clave = normClave(limpio);
      if (!mapa.has(clave)) {
        mapa.set(clave, limpio);
      }
    }
  }
  return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'es-VE'));
}

const PREFIJO_SOLICITADO = /^Solicitado por:\s*([^·\n]+?)(?:\s*·\s*([\s\S]*))?$/i;

/** Empaqueta «Solicitado por» junto con la nota opcional para traslados. */
export function armarNotaConSolicitadoPor(
  nota: string | null | undefined,
  solicitadoPor: string | null | undefined,
): string | null {
  const sol = normalizarNombreSolicitante(solicitadoPor);
  const n = String(nota ?? '').trim();
  if (sol && n) return `Solicitado por: ${sol} · ${n}`;
  if (sol) return `Solicitado por: ${sol}`;
  return n || null;
}

/** Separa «Solicitado por» y la nota libre cuando vienen juntos en el detalle/nota de un traslado. */
export function extraerSolicitadoPorDeNota(
  nota: string | null | undefined,
): { solicitadoPor: string | null; notaLimpia: string | null } {
  const raw = String(nota ?? '').trim();
  if (!raw) return { solicitadoPor: null, notaLimpia: null };
  const m = PREFIJO_SOLICITADO.exec(raw);
  if (!m) return { solicitadoPor: null, notaLimpia: raw };
  const solicitadoPor = normalizarNombreSolicitante(m[1]) || null;
  const resto = String(m[2] ?? '').trim() || null;
  return { solicitadoPor, notaLimpia: resto };
}
