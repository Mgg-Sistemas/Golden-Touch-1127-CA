/* ============================================================
   Golden Touch · RRHH · Resumen de nómina (09/10/2026)

   Funciones PURAS (sin Supabase) del reporte «📑 Resumen de nómina»: el
   usuario marca con casillas qué columnas salen (como en «Descargar datos
   del personal») y elige el alcance:
     · un PERÍODO de nómina (los de la papelera no se listan), o
     · GENERAL: todas las nóminas, con filtro de fechas y de empresa.
   En el modo general se puede agrupar con SUBTOTAL por período (lo normal:
   cuánto costó cada quincena) o por trabajador (cuánto se le pagó a cada uno
   en el rango), o no agrupar.

   Bono neto = bono $ + asignaciones − préstamos − anticipos: los préstamos y
   anticipos se descuentan del bono en dólares (ver `descontarDelBono`).
   ============================================================ */
import type { EmpresaRrhh, NominaRenglon, NominaPeriodo } from '@/shared/lib/types';
import { date } from '@/shared/lib/format';
import { r2 } from './nominaCalculo';
import { letraQueEntra, type OrientacionHoja } from './exportarPersonal';

export { letraQueEntra };
export type { OrientacionHoja };

/** El período de un renglón, con lo que el resumen necesita. */
export type PeriodoRef = Pick<NominaPeriodo, 'id' | 'codigo' | 'nombre' | 'empresa' | 'tipo' | 'periodo_desde' | 'periodo_hasta' | 'tasa_bcv' | 'created_at'>
  & { eliminado_en?: string | null };

/** Un renglón listo para el resumen: con su período, la cédula y el nombre de la caja. */
export type FilaResumen = Omit<NominaRenglon, 'periodo'> & {
  periodo: PeriodoRef;
  cedula?: string | null;
  caja_nombre?: string | null;
};

/** Cómo se muestra (y se formatea) cada columna. */
export type TipoCampo = 'texto' | 'usd' | 'bs' | 'num' | 'tasa' | 'monto';

export interface CampoResumen {
  clave: string;
  etiqueta: string;
  /** Ancho relativo (Excel en caracteres; el PDF lo reparte). */
  ancho: number;
  tipo: TipoCampo;
  /**
   * Si se suma en subtotales y total: `true` siempre; `'periodo'` solo dentro
   * de un mismo período (el total acordado al mes sumado entre quincenas no
   * dice nada); `false` nunca (tasas, montos en monedas mezcladas, textos).
   */
  suma: boolean | 'periodo';
  valor: (f: FilaResumen) => string | number;
}

const txt = (v: string | null | undefined) => (v ?? '').trim();
const n = (v: number | null | undefined) => Number(v) || 0;
const dia = (iso: string | null | undefined) => (iso ? date(iso) : '');

export const EMPRESA_LABEL: Record<string, string> = { GT: 'GT', MTO: 'MTO' };

/** Bono neto del renglón: bono $ + asignaciones − préstamos − anticipos. */
export function bonoNeto(f: Pick<NominaRenglon, 'bono_quincena_usd' | 'asignaciones' | 'deduc_prestamos' | 'deduc_anticipos'>): number {
  return r2(n(f.bono_quincena_usd) + n(f.asignaciones) - n(f.deduc_prestamos) - n(f.deduc_anticipos));
}

/** «01-09-2026 al 15-09-2026» (o la que haya). */
export function fechasPeriodo(p: Pick<NominaPeriodo, 'periodo_desde' | 'periodo_hasta'>): string {
  const d = dia(p.periodo_desde), h = dia(p.periodo_hasta);
  if (d && h) return `${d} al ${h}`;
  return d || h;
}

/** Todas las columnas posibles, en el orden en que salen. */
export const CAMPOS_RESUMEN: CampoResumen[] = [
  { clave: 'trabajador', etiqueta: 'Trabajador', ancho: 24, tipo: 'texto', suma: false, valor: (f) => txt(f.nombre) },
  { clave: 'cedula', etiqueta: 'Cédula', ancho: 12, tipo: 'texto', suma: false, valor: (f) => txt(f.cedula) },
  { clave: 'cargo', etiqueta: 'Cargo', ancho: 18, tipo: 'texto', suma: false, valor: (f) => txt(f.cargo) },
  { clave: 'departamento', etiqueta: 'Departamento', ancho: 16, tipo: 'texto', suma: false, valor: (f) => txt(f.departamento) },
  { clave: 'empresa', etiqueta: 'Nómina', ancho: 7, tipo: 'texto', suma: false, valor: (f) => EMPRESA_LABEL[f.periodo.empresa] ?? f.periodo.empresa },
  { clave: 'periodo', etiqueta: 'Período', ancho: 15, tipo: 'texto', suma: false, valor: (f) => txt(f.periodo.codigo) },
  { clave: 'fechas', etiqueta: 'Desde - hasta', ancho: 20, tipo: 'texto', suma: false, valor: (f) => fechasPeriodo(f.periodo) },
  { clave: 'dias_trabajados', etiqueta: 'Días trab.', ancho: 6, tipo: 'num', suma: true, valor: (f) => n(f.dias_trabajados) },
  { clave: 'dias_descanso', etiqueta: 'Días desc.', ancho: 6, tipo: 'num', suma: true, valor: (f) => n(f.dias_descanso) },
  { clave: 'total_mes', etiqueta: 'Acordado/mes $', ancho: 10, tipo: 'usd', suma: 'periodo', valor: (f) => n(f.sueldo_base_mensual) },
  { clave: 'sueldo_usd', etiqueta: 'Sueldo quincena $', ancho: 10, tipo: 'usd', suma: true, valor: (f) => n(f.sueldo_quincena_usd) },
  { clave: 'sueldo_bs', etiqueta: 'Recibo Bs', ancho: 12, tipo: 'bs', suma: true, valor: (f) => n(f.sueldo_quincena_bs) },
  { clave: 'tasa', etiqueta: 'Tasa Bs/$', ancho: 8, tipo: 'tasa', suma: false, valor: (f) => n(f.tasa_bs ?? f.periodo.tasa_bcv) },
  { clave: 'bono', etiqueta: 'Bono $', ancho: 9, tipo: 'usd', suma: true, valor: (f) => n(f.bono_quincena_usd) },
  { clave: 'asignaciones', etiqueta: 'Asignaciones $', ancho: 9, tipo: 'usd', suma: true, valor: (f) => n(f.asignaciones) },
  { clave: 'prestamos', etiqueta: 'Préstamos $', ancho: 9, tipo: 'usd', suma: true, valor: (f) => n(f.deduc_prestamos) },
  { clave: 'anticipos', etiqueta: 'Anticipos $', ancho: 9, tipo: 'usd', suma: true, valor: (f) => n(f.deduc_anticipos) },
  { clave: 'bono_neto', etiqueta: 'Bono neto $', ancho: 9, tipo: 'usd', suma: true, valor: (f) => bonoNeto(f) },
  { clave: 'neto', etiqueta: 'Neto $', ancho: 10, tipo: 'usd', suma: true, valor: (f) => n(f.neto_usd) },
  { clave: 'estado', etiqueta: 'Estado', ancho: 9, tipo: 'texto', suma: false, valor: (f) => (f.estado === 'pagada' ? 'Pagada' : 'Por pagar') },
  { clave: 'fecha_pago', etiqueta: 'Fecha de pago', ancho: 10, tipo: 'texto', suma: false, valor: (f) => (f.estado === 'pagada' ? dia(f.pagada_en) : '') },
  { clave: 'caja', etiqueta: 'Caja', ancho: 14, tipo: 'texto', suma: false, valor: (f) => txt(f.caja_nombre) },
  { clave: 'moneda_pago', etiqueta: 'Moneda', ancho: 7, tipo: 'texto', suma: false, valor: (f) => txt(f.moneda_pago) },
  // Cada renglón se paga en SU moneda: no se suma aquí; el bloque de totales lo da por moneda.
  { clave: 'monto_pagado', etiqueta: 'Monto pagado', ancho: 11, tipo: 'monto', suma: false, valor: (f) => (f.monto_pagado == null ? '' : n(f.monto_pagado)) },
];

/** Atajo «Lo básico»: quién, de qué quincena, cuánto y si ya se pagó. */
export const CAMPOS_BASICOS = ['trabajador', 'cedula', 'cargo', 'periodo', 'sueldo_usd', 'bono', 'bono_neto', 'neto', 'estado'];

/** Las columnas elegidas, en el orden del catálogo. */
export function camposResumen(claves: string[]): CampoResumen[] {
  const set = new Set(claves);
  return CAMPOS_RESUMEN.filter((c) => set.has(c.clave));
}

export function orientacionResumen(claves: string[], elegida: OrientacionHoja = 'auto'): 'portrait' | 'landscape' {
  if (elegida === 'vertical') return 'portrait';
  if (elegida === 'horizontal') return 'landscape';
  return camposResumen(claves).reduce((a, c) => a + c.ancho, 0) > 90 ? 'landscape' : 'portrait';
}

/* ───────────── Filtro y orden ───────────── */

export interface FiltroGeneral {
  /** YYYY-MM-DD; el período entra si se cruza con el rango. */
  desde?: string | null;
  hasta?: string | null;
  empresa?: EmpresaRrhh | 'ambas';
}

const diaIso = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');

/** Inicio y fin del período (si le falta una fecha se usa la otra, y si no, la de carga). */
function rangoPeriodo(p: PeriodoRef): { ini: string; fin: string } {
  const ini = diaIso(p.periodo_desde) || diaIso(p.periodo_hasta) || diaIso(p.created_at);
  const fin = diaIso(p.periodo_hasta) || ini;
  return { ini, fin };
}

/** Deja las filas del modo general: sin papelera, de la empresa y que se crucen con las fechas. */
export function filtrarGeneral(filas: FilaResumen[], f: FiltroGeneral): FilaResumen[] {
  const desde = diaIso(f.desde), hasta = diaIso(f.hasta);
  return filas.filter((x) => {
    if (x.periodo.eliminado_en) return false;
    if (f.empresa && f.empresa !== 'ambas' && x.periodo.empresa !== f.empresa) return false;
    const { ini, fin } = rangoPeriodo(x.periodo);
    if (desde && fin && fin < desde) return false;
    if (hasta && ini && ini > hasta) return false;
    return true;
  });
}

const cmpTexto = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });

/** Orden de los períodos: el más viejo primero (se lee como un histórico). */
function cmpPeriodo(a: PeriodoRef, b: PeriodoRef): number {
  const ra = rangoPeriodo(a).ini, rb = rangoPeriodo(b).ini;
  if (ra !== rb) return ra < rb ? -1 : 1;
  return cmpTexto(a.codigo ?? '', b.codigo ?? '');
}

/* ───────────── Armado del resumen ───────────── */

export type Agrupacion = 'periodo' | 'trabajador' | 'ninguno';

export interface BloqueResumen {
  /** Título del grupo (null cuando no se agrupa). */
  titulo: string | null;
  filas: (string | number)[][];
  /** Una celda por columna: número sumado o null si esa columna no se suma. */
  subtotal: (number | null)[] | null;
}

export interface TotalesResumen {
  renglones: number;
  trabajadores: number;
  periodos: number;
  pagados: number;
  porPagar: number;
  netoUsd: number;
  netoPagadoUsd: number;
  netoPorPagarUsd: number;
  bonoNetoUsd: number;
  reciboBs: number;
  prestamosUsd: number;
  anticiposUsd: number;
  /** Lo que salió de caja, por moneda de pago (cada uno en su moneda). */
  pagadoPorMoneda: { moneda: string; monto: number }[];
}

export interface ResumenArmado {
  campos: CampoResumen[];
  bloques: BloqueResumen[];
  /** Fila de TOTAL por columna (null si no se pidió el bloque de totales). */
  total: (number | null)[] | null;
  totales: TotalesResumen | null;
}

export interface OpcionesResumen {
  /** 'periodo' = un solo período (no se agrupa); 'general' = varias nóminas. */
  alcance: 'periodo' | 'general';
  agrupar?: Agrupacion;
  totales?: boolean;
}

const claveTrabajador = (f: FilaResumen) => f.personal_id || `nombre:${f.nombre.trim().toUpperCase()}`;

function sumar(campos: CampoResumen[], filas: FilaResumen[], mismoPeriodo: boolean): (number | null)[] {
  return campos.map((c) => {
    if (c.suma === false || (c.suma === 'periodo' && !mismoPeriodo)) return null;
    return r2(filas.reduce((a, f) => a + (Number(c.valor(f)) || 0), 0));
  });
}

export function calcularTotales(filas: FilaResumen[]): TotalesResumen {
  const pagadas = filas.filter((f) => f.estado === 'pagada');
  const porMoneda = new Map<string, number>();
  for (const f of pagadas) {
    if (f.monto_pagado == null) continue;
    const m = txt(f.moneda_pago) || 'USD';
    porMoneda.set(m, r2((porMoneda.get(m) ?? 0) + n(f.monto_pagado)));
  }
  const sum = (xs: FilaResumen[], k: (f: FilaResumen) => number) => r2(xs.reduce((a, f) => a + k(f), 0));
  return {
    renglones: filas.length,
    trabajadores: new Set(filas.map(claveTrabajador)).size,
    periodos: new Set(filas.map((f) => f.periodo.id)).size,
    pagados: pagadas.length,
    porPagar: filas.length - pagadas.length,
    netoUsd: sum(filas, (f) => n(f.neto_usd)),
    netoPagadoUsd: sum(pagadas, (f) => n(f.neto_usd)),
    netoPorPagarUsd: sum(filas.filter((f) => f.estado !== 'pagada'), (f) => n(f.neto_usd)),
    bonoNetoUsd: sum(filas, bonoNeto),
    reciboBs: sum(filas, (f) => n(f.sueldo_quincena_bs)),
    prestamosUsd: sum(filas, (f) => n(f.deduc_prestamos)),
    anticiposUsd: sum(filas, (f) => n(f.deduc_anticipos)),
    pagadoPorMoneda: [...porMoneda.entries()].sort(([a], [b]) => cmpTexto(a, b)).map(([moneda, monto]) => ({ moneda, monto })),
  };
}

export function tituloPeriodo(p: PeriodoRef): string {
  const partes = [p.codigo, txt(p.nombre), fechasPeriodo(p), EMPRESA_LABEL[p.empresa] ?? p.empresa].filter(Boolean);
  return partes.join(' · ');
}

/**
 * Arma el resumen: columnas elegidas, bloques (agrupados con subtotal, o uno
 * solo), la fila TOTAL y el bloque de totales. Filas por trabajador (A→Z);
 * los períodos del más viejo al más nuevo.
 */
export function armarResumen(filas: FilaResumen[], claves: string[], op: OpcionesResumen): ResumenArmado {
  const campos = camposResumen(claves);
  const agrupar: Agrupacion = op.alcance === 'periodo' ? 'ninguno' : (op.agrupar ?? 'periodo');
  const unSoloPeriodo = new Set(filas.map((f) => f.periodo.id)).size <= 1;
  const valores = (xs: FilaResumen[]) => xs.map((f) => campos.map((c) => c.valor(f)));
  const porNombre = (a: FilaResumen, b: FilaResumen) => cmpTexto(a.nombre, b.nombre) || cmpPeriodo(a.periodo, b.periodo);
  const porPeriodo = (a: FilaResumen, b: FilaResumen) => cmpPeriodo(a.periodo, b.periodo) || cmpTexto(a.nombre, b.nombre);

  let bloques: BloqueResumen[];
  if (agrupar === 'periodo') {
    const grupos = new Map<string, FilaResumen[]>();
    for (const f of [...filas].sort(porPeriodo)) {
      const g = grupos.get(f.periodo.id) ?? [];
      g.push(f); grupos.set(f.periodo.id, g);
    }
    bloques = [...grupos.values()].map((g) => ({
      titulo: tituloPeriodo(g[0].periodo), filas: valores(g), subtotal: sumar(campos, g, true),
    }));
  } else if (agrupar === 'trabajador') {
    const grupos = new Map<string, FilaResumen[]>();
    for (const f of [...filas].sort(porNombre)) {
      const k = claveTrabajador(f);
      const g = grupos.get(k) ?? [];
      g.push(f); grupos.set(k, g);
    }
    bloques = [...grupos.values()].map((g) => {
      const ced = g.map((f) => txt(f.cedula)).find(Boolean);
      return {
        titulo: `${g[0].nombre}${ced ? ` · C.I. ${ced}` : ''} · ${g.length} pago(s)`,
        filas: valores(g), subtotal: sumar(campos, g, new Set(g.map((f) => f.periodo.id)).size <= 1),
      };
    });
  } else {
    const orden = [...filas].sort(op.alcance === 'periodo' ? porNombre : porPeriodo);
    bloques = [{ titulo: null, filas: valores(orden), subtotal: null }];
  }

  return {
    campos,
    bloques,
    total: op.totales ? sumar(campos, filas, unSoloPeriodo) : null,
    totales: op.totales ? calcularTotales(filas) : null,
  };
}

/** Texto de una celda según el tipo de su columna (para el PDF). */
export function formatoCelda(tipo: TipoCampo, v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  const num = (d: number) => v.toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
  switch (tipo) {
    case 'usd': return `$ ${num(2)}`;
    case 'bs': return `Bs ${num(2)}`;
    case 'tasa': return v ? num(2) : '';
    case 'monto': return num(2);
    case 'num': return String(v);
    default: return String(v);
  }
}

/** Renglones del bloque de totales, como pares etiqueta/valor (PDF y Excel). */
export function lineasTotales(t: TotalesResumen): [string, string][] {
  const usd = (v: number) => formatoCelda('usd', v);
  const l: [string, string][] = [
    ['Renglones (pagos)', String(t.renglones)],
    ['Trabajadores', String(t.trabajadores)],
    ['Períodos de nómina', String(t.periodos)],
    ['Pagados / por pagar', `${t.pagados} / ${t.porPagar}`],
    ['Neto total', usd(t.netoUsd)],
    ['Neto pagado', usd(t.netoPagadoUsd)],
    ['Neto por pagar', usd(t.netoPorPagarUsd)],
    ['Bono neto', usd(t.bonoNetoUsd)],
    ['Préstamos descontados', usd(t.prestamosUsd)],
    ['Anticipos descontados', usd(t.anticiposUsd)],
    ['Recibos (sueldo en Bs)', formatoCelda('bs', t.reciboBs)],
  ];
  for (const p of t.pagadoPorMoneda) l.push([`Salió de caja en ${p.moneda}`, formatoCelda('monto', p.monto)]);
  return l;
}
