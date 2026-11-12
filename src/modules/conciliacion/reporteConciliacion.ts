/* ============================================================
   Conciliación · reporte dinámico (12/11/2026). Lógica pura.

   Igual que el reporte de Tesorería, pero para la conciliación: se eligen
   columnas, se agrupa (sin agrupar / por estatus / por proveedor / por
   retención) y sale la vista previa, el PDF, el Excel y el texto de WhatsApp
   a partir de las MISMAS filas filtradas de la pantalla.
   ============================================================ */

import {
  r2, etiquetaTipo, textoReferencia, textoRetencion, textoFuenteTasa, indicadores, type FilaConciliacion, type FiltrosConciliacion,
} from './conciliacion';

export type ClaveColumna =
  | 'item' | 'codigo' | 'tipo' | 'proveedor' | 'montoUsd' | 'montoBs' | 'tasa'
  | 'referencia' | 'retencion' | 'estado' | 'fechaPago';

export interface ColumnaReporte {
  clave: ClaveColumna;
  titulo: string;
  numerica?: boolean;
}

export const COLUMNAS_REPORTE: ColumnaReporte[] = [
  { clave: 'item', titulo: 'Ítem', numerica: true },
  { clave: 'codigo', titulo: 'Código' },
  { clave: 'tipo', titulo: 'Tipo' },
  { clave: 'proveedor', titulo: 'Proveedor' },
  { clave: 'montoUsd', titulo: 'Monto OC ($)', numerica: true },
  { clave: 'montoBs', titulo: 'Monto OC (Bs)', numerica: true },
  { clave: 'tasa', titulo: 'Tasa', numerica: true },
  { clave: 'referencia', titulo: 'Referencia de pago' },
  { clave: 'retencion', titulo: 'Retención' },
  { clave: 'estado', titulo: 'Estatus' },
  { clave: 'fechaPago', titulo: 'Fecha de pago' },
];

export const COLUMNAS_POR_DEFECTO: ClaveColumna[] = [
  'item', 'codigo', 'tipo', 'proveedor', 'montoUsd', 'montoBs', 'referencia', 'retencion', 'estado',
];

export type Agrupacion = 'ninguna' | 'tipo' | 'estado' | 'proveedor' | 'retencion';

export const AGRUPACIONES: { valor: Agrupacion; etiqueta: string }[] = [
  { valor: 'ninguna', etiqueta: 'Sin agrupar' },
  { valor: 'estado', etiqueta: 'Por estatus' },
  { valor: 'proveedor', etiqueta: 'Por proveedor' },
  { valor: 'retencion', etiqueta: 'Con / sin retención' },
  { valor: 'tipo', etiqueta: 'Por tipo (OC, servicio, directas)' },
];

const GRUPO_TIPO: Record<FilaConciliacion['tipo'], string> = {
  compra: 'Órdenes de compra',
  servicio: 'Órdenes de servicio',
  compra_directa: 'Compras directas',
  servicio_directo: 'Servicios directos',
};

export interface GrupoReporte {
  titulo: string;
  filas: FilaConciliacion[];
  totalUsd: number;
  totalBs: number;
}

export function agrupar(filas: FilaConciliacion[], modo: Agrupacion): GrupoReporte[] {
  const clave = (r: FilaConciliacion): string => {
    if (modo === 'estado') return r.estadoLabel;
    if (modo === 'proveedor') return r.proveedor;
    if (modo === 'retencion') return r.llevaRetencion ? 'Con retención' : 'Sin retención';
    if (modo === 'tipo') return GRUPO_TIPO[r.tipo] ?? 'Órdenes de compra';
    return 'Todas las OC';
  };
  const orden: string[] = [];
  const mapa = new Map<string, FilaConciliacion[]>();
  for (const r of filas) {
    const k = clave(r);
    if (!mapa.has(k)) { mapa.set(k, []); orden.push(k); }
    mapa.get(k)!.push(r);
  }
  if (modo === 'proveedor') orden.sort((a, b) => a.localeCompare(b, 'es'));
  return orden.map((k) => {
    const xs = mapa.get(k)!;
    return {
      titulo: k,
      filas: xs,
      totalUsd: r2(xs.reduce((a, r) => a + (r.totalUsd ?? 0), 0)),
      totalBs: r2(xs.reduce((a, r) => a + (r.totalBs ?? 0), 0)),
    };
  });
}

const fmt = (n: number, dec = 2) => n.toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const usd = (n: number | null) => (n == null ? '—' : `$ ${fmt(n)}`);
export const bs = (n: number | null) => (n == null ? '—' : `Bs ${fmt(n)}`);

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
}

/** El texto de una celda (lo mismo en vista previa, PDF y Excel de texto). */
export function celda(r: FilaConciliacion, c: ClaveColumna): string {
  switch (c) {
    case 'item': return String(r.item);
    case 'codigo': return r.codigo;
    case 'tipo': return etiquetaTipo(r.tipo);
    case 'proveedor': return r.proveedor;
    case 'montoUsd': return usd(r.totalUsd);
    case 'montoBs': return bs(r.totalBs);
    case 'tasa': return r.tasa ? `${fmt(r.tasa)} (${textoFuenteTasa(r.fuenteTasa)})` : '—';
    case 'referencia': return textoReferencia(r);
    case 'retencion': return textoRetencion(r);
    case 'estado': return r.estadoLabel;
    case 'fechaPago': return fechaCorta(r.fechaPago);
  }
}

/** Valor para Excel: número en las columnas de monto/tasa, texto en el resto. */
export function valorExcel(r: FilaConciliacion, c: ClaveColumna): string | number | null {
  if (c === 'item') return r.item;
  if (c === 'montoUsd') return r.totalUsd;
  if (c === 'montoBs') return r.totalBs;
  if (c === 'tasa') return r.tasa;
  return celda(r, c);
}

export interface MetaReporte {
  titulo: string;
  filtrosTexto: string;
  generado: string;
}

/** Texto de WhatsApp: resumen + una línea por OC (hasta `max`, el resto se cuenta). */
export function textoWhatsappConciliacion(filas: FilaConciliacion[], meta: MetaReporte, max = 40): string {
  const k = indicadores(filas);
  const lineas = [
    `*📒 ${meta.titulo}*`,
    meta.filtrosTexto ? `_${meta.filtrosTexto}_` : '',
    '',
    `• Total de OC: *${k.totalOc.cantidad}* · ${usd(k.totalOc.usd)} · ${bs(k.totalOc.bs)}`,
    `• Total pagado: *${k.pagado.cantidad}* · ${usd(k.pagado.usd)} · ${bs(k.pagado.bs)}`,
    `• OC con retenciones: *${k.conRetencion.cantidad}*`,
    '',
  ];
  for (const r of filas.slice(0, max)) {
    lineas.push(`${r.item}. *${r.codigo}*${r.tipo !== 'compra' ? ` (${etiquetaTipo(r.tipo).toLowerCase()})` : ''} · ${r.proveedor}`);
    lineas.push(`   ${usd(r.totalUsd)} · ${bs(r.totalBs)} · ${r.estadoLabel}`);
    const extra = [
      r.referencias.length ? `Ref: ${r.referencias.join(', ')}` : '',
      r.llevaRetencion ? `Ret: ${textoRetencion(r)}` : '',
    ].filter(Boolean).join(' · ');
    if (extra) lineas.push(`   ${extra}`);
  }
  if (filas.length > max) lineas.push('', `…y ${filas.length - max} OC más (ver el PDF o el Excel).`);
  lineas.push('', `_Generado ${meta.generado}_`);
  return lineas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

/** Los filtros en una línea legible («Estatus: Recibida · Con retención · del 01/11 al 12/11»). */
export function describirFiltros(f: FiltrosConciliacion): string {
  const fecha = (s: string) => s.split('-').reverse().join('/');
  return [
    f.texto.trim() ? `Búsqueda: «${f.texto.trim()}»` : '',
    f.estado ? `Estatus: ${f.estado}` : '',
    f.pago === 'pagadas' ? 'Pagadas' : f.pago === 'sin_pagar' ? 'Sin pagar' : '',
    f.tipo && f.tipo !== 'todas' ? `Solo ${GRUPO_TIPO[f.tipo].toLowerCase()}` : '',
    f.retencion === 'con' ? 'Con retención' : f.retencion === 'sin' ? 'Sin retención' : '',
    (f.desde || f.hasta ? (f.fechaDe === 'pago' ? 'Pagadas ' : 'OC ') : '')
      + (f.desde && f.hasta ? `del ${fecha(f.desde)} al ${fecha(f.hasta)}` : f.desde ? `desde ${fecha(f.desde)}` : f.hasta ? `hasta ${fecha(f.hasta)}` : ''),
    f.incluirAnuladas ? 'incluye canceladas' : '',
  ].filter(Boolean).join(' · ');
}
