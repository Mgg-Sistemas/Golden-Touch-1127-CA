/* ============================================================
   Golden Touch · RRHH · Directorio de fotos (14/10/2026, traído de La Cantera)

   En La Cantera es un PDF con una persona por renglón. Acá se pidió distinto:
   en pantalla una ventana con las fotos UNA AL LADO DE LA OTRA (nombre y
   cargo debajo de cada una) y, al imprimir, UNA DEBAJO DE LA OTRA. La hoja
   de impresión se arma aparte (HTML propio en un iframe oculto) para que
   salga completa en varias páginas y sin la interfaz alrededor.
   ============================================================ */
import type { Personal } from '@/shared/lib/types';

export interface PersonaDirectorio {
  id: string;
  nombre: string;
  cargo: string;
  departamento: string | null;
  ficha: string | null;
  cedula: string | null;
  /** Ya recortada con el encuadre de la persona (data URL). Null: sin foto. */
  foto: string | null;
}

/** Alfabético por nombre, como se busca a la gente en un directorio. */
export function personasDirectorio(lista: Personal[]): Omit<PersonaDirectorio, 'foto'>[] {
  return lista
    .map((p) => ({
      id: p.id,
      nombre: `${p.nombre ?? ''} ${p.apellido ?? ''}`.replace(/\s+/g, ' ').trim() || '(sin nombre)',
      cargo: (p.cargo ?? '').trim() || 'Sin cargo',
      departamento: (p.departamento ?? '').trim() || null,
      ficha: p.ficha_nro ?? null,
      cedula: p.cedula ?? null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-VE'));
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Hoja para imprimir: membrete y, debajo, una persona por renglón (foto, nombre y cargo). */
export function htmlDirectorioImpresion(personas: PersonaDirectorio[], o: {
  empresa: string; rif: string; logoUrl: string; filtro?: string | null; fecha: string;
}): string {
  const filas = personas.map((p) => `
    <div class="fila">
      ${p.foto ? `<img class="foto" src="${esc(p.foto)}" alt="">` : '<div class="foto sin">Sin foto</div>'}
      <div class="datos">
        <div class="nombre">${esc(p.nombre)}</div>
        <div class="cargo">${esc(p.cargo)}${p.departamento ? ` · ${esc(p.departamento)}` : ''}</div>
        <div class="extra">${[p.ficha ? `Ficha ${esc(p.ficha)}` : '', p.cedula ? `C.I. ${esc(p.cedula)}` : ''].filter(Boolean).join(' · ')}</div>
      </div>
    </div>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Directorio de fotos</title><style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
    header img { height: 48px; width: auto; }
    header h1 { margin: 0; font-size: 18px; letter-spacing: .04em; }
    header .sub { font-size: 11px; color: #444; margin-top: 2px; }
    .fila { display: flex; align-items: center; gap: 14px; padding: 6px 4px; border-bottom: 1px solid #ddd; break-inside: avoid; page-break-inside: avoid; }
    .fila:nth-child(even) { background: #f5f5f5; }
    .foto { width: 26mm; height: 31mm; object-fit: cover; border: 1px solid #bbb; border-radius: 3px; flex-shrink: 0; }
    .foto.sin { display: flex; align-items: center; justify-content: center; font-size: 10px; color: #888; background: #fafafa; }
    .nombre { font-size: 14px; font-weight: 700; text-transform: uppercase; }
    .cargo { font-size: 12px; color: #333; margin-top: 3px; }
    .extra { font-size: 10px; color: #666; margin-top: 3px; }
    footer { margin-top: 10px; font-size: 9px; color: #777; text-align: right; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style></head><body>
    <header>
      <img src="${esc(o.logoUrl)}" alt="">
      <div>
        <h1>DIRECTORIO DE FOTOS</h1>
        <div class="sub">${esc(o.empresa)}${o.rif ? ` · RIF ${esc(o.rif)}` : ''} · ${personas.length} ${personas.length === 1 ? 'persona' : 'personas'}${o.filtro ? ` · ${esc(o.filtro)}` : ''}</div>
      </div>
    </header>
    <main>${filas}</main>
    <footer>Generado por el sistema · ${esc(o.fecha)}</footer>
  </body></html>`;
}
