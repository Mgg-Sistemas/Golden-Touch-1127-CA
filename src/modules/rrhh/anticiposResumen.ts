/* ============================================================
   Golden Touch · RRHH · Préstamos y anticipos: filtros, totales y reglas

   Lógica pura (sin red ni pantalla) para que la pestaña, los modales y el
   PDF cuenten lo mismo: qué se ve con cada filtro, cuánto se prestó, cuánto
   se pagó y cuánto se debe, por préstamo y por trabajador.
   ============================================================ */
import type { AnticipoPago, AnticipoPrestamo, Personal } from '@/shared/lib/types';

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface FiltrosAnticipos {
  /** Busca en nombre, apellido, cédula, ficha, cargo y motivo. */
  texto: string;
  personalId: string;
  tipo: 'todos' | 'anticipo' | 'prestamo';
  estado: 'activos' | 'saldados' | 'todos';
  origen: 'todos' | 'historico' | 'sistema';
  departamento: string;
  /** Rango por FECHA del préstamo (YYYY-MM-DD); vacío = sin tope. */
  desde: string;
  hasta: string;
  /** Rango por monto total; vacío = sin tope. */
  montoMin: string;
  montoMax: string;
}

export const FILTROS_VACIOS: FiltrosAnticipos = {
  texto: '', personalId: '', tipo: 'todos', estado: 'activos', origen: 'todos',
  departamento: '', desde: '', hasta: '', montoMin: '', montoMax: '',
};

/** Cuántos filtros están puestos, para el botón «✕ Limpiar (n)». */
export function filtrosActivos(f: FiltrosAnticipos): number {
  return (Object.keys(FILTROS_VACIOS) as (keyof FiltrosAnticipos)[])
    .filter((k) => k !== 'estado' && String(f[k] ?? '').trim() !== String(FILTROS_VACIOS[k]))
    .length + (f.estado !== FILTROS_VACIOS.estado ? 1 : 0);
}

/** Minúsculas y sin acentos: «Pérez» encuentra «perez» y al revés. */
export function normalizarTexto(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function nombreCompleto(p: Personal | undefined | null): string {
  return p ? `${p.nombre} ${p.apellido ?? ''}`.trim() : '—';
}

const numOrNull = (s: string): number | null => {
  const t = String(s ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Aplica TODOS los filtros. `personas` es el personal de la nómina en pantalla:
 *  un préstamo de alguien que no está ahí (otra nómina) no se muestra. */
export function filtrarAnticipos(
  lista: AnticipoPrestamo[], f: FiltrosAnticipos, personas: Map<string, Personal>,
): AnticipoPrestamo[] {
  const q = normalizarTexto(f.texto);
  const min = numOrNull(f.montoMin);
  const max = numOrNull(f.montoMax);
  return lista.filter((a) => {
    const p = personas.get(a.personal_id);
    if (!p) return false;
    if (f.personalId && a.personal_id !== f.personalId) return false;
    if (f.tipo !== 'todos' && a.tipo !== f.tipo) return false;
    if (f.estado === 'activos' && a.estado !== 'activo') return false;
    if (f.estado === 'saldados' && a.estado !== 'saldado') return false;
    if (f.origen === 'historico' && !a.historico) return false;
    if (f.origen === 'sistema' && a.historico) return false;
    if (f.departamento && (p.departamento ?? '') !== f.departamento) return false;
    const fecha = String(a.fecha ?? a.created_at ?? '').slice(0, 10);
    if (f.desde && fecha < f.desde) return false;
    if (f.hasta && fecha > f.hasta) return false;
    const total = Number(a.monto_total) || 0;
    if (min != null && total < min) return false;
    if (max != null && total > max) return false;
    if (q) {
      const pajar = normalizarTexto([p.nombre, p.apellido, p.cedula, p.ficha_nro, p.cargo, p.departamento, a.motivo].join(' '));
      if (!pajar.includes(q)) return false;
    }
    return true;
  });
}

export const pagadoDe = (a: AnticipoPrestamo) => r2((Number(a.monto_total) || 0) - (Number(a.saldo) || 0));
export const pendiente = (a: AnticipoPrestamo) => (Number(a.saldo) || 0) > 0;

export interface ResumenAnticipos {
  totalPrestado: number;
  totalPagado: number;
  totalPendiente: number;
  /** Préstamos con saldo > 0. */
  pendientes: number;
  /** Personas distintas con al menos un préstamo con saldo. */
  trabajadoresConPendiente: number;
}

export function resumenAnticipos(lista: AnticipoPrestamo[]): ResumenAnticipos {
  let totalPrestado = 0, totalPagado = 0, totalPendiente = 0, pendientes = 0;
  const personas = new Set<string>();
  for (const a of lista) {
    totalPrestado += Number(a.monto_total) || 0;
    totalPagado += pagadoDe(a);
    if (pendiente(a)) {
      totalPendiente += Number(a.saldo) || 0;
      pendientes++;
      personas.add(a.personal_id);
    }
  }
  return {
    totalPrestado: r2(totalPrestado), totalPagado: r2(totalPagado), totalPendiente: r2(totalPendiente),
    pendientes, trabajadoresConPendiente: personas.size,
  };
}

export interface TrabajadorConPrestamos {
  persona: Personal;
  anticipos: AnticipoPrestamo[];
  totalPrestado: number;
  totalPagado: number;
  saldo: number;
  /** Cuántos siguen con saldo. */
  pendientes: number;
}

/** Agrupa por trabajador, ordenado por saldo (el que más debe, primero). */
export function agruparPorTrabajador(
  lista: AnticipoPrestamo[], personas: Map<string, Personal>,
): TrabajadorConPrestamos[] {
  const grupos = new Map<string, TrabajadorConPrestamos>();
  for (const a of lista) {
    const persona = personas.get(a.personal_id);
    if (!persona) continue;
    let g = grupos.get(a.personal_id);
    if (!g) {
      g = { persona, anticipos: [], totalPrestado: 0, totalPagado: 0, saldo: 0, pendientes: 0 };
      grupos.set(a.personal_id, g);
    }
    g.anticipos.push(a);
    g.totalPrestado = r2(g.totalPrestado + (Number(a.monto_total) || 0));
    g.totalPagado = r2(g.totalPagado + pagadoDe(a));
    g.saldo = r2(g.saldo + (Number(a.saldo) || 0));
    if (pendiente(a)) g.pendientes++;
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, anticipos: [...g.anticipos].sort((x, y) => String(y.fecha).localeCompare(String(x.fecha))) }))
    .sort((x, y) => y.saldo - x.saldo || nombreCompleto(x.persona).localeCompare(nombreCompleto(y.persona)));
}

/** Solo los que deben algo, para la tarjeta «trabajadores con préstamos pendientes». */
export function trabajadoresConPendiente(
  lista: AnticipoPrestamo[], personas: Map<string, Personal>,
): TrabajadorConPrestamos[] {
  return agruparPorTrabajador(lista.filter(pendiente), personas);
}

/** Busca dentro de la lista de trabajadores (nombre, cédula, ficha, cargo, departamento). */
export function buscarTrabajadores(grupos: TrabajadorConPrestamos[], texto: string): TrabajadorConPrestamos[] {
  const q = normalizarTexto(texto);
  if (!q) return grupos;
  return grupos.filter((g) => {
    const p = g.persona;
    return normalizarTexto([p.nombre, p.apellido, p.cedula, p.ficha_nro, p.cargo, p.departamento].join(' ')).includes(q);
  });
}

/* ───────────── Reglas de carga ───────────── */

export interface AltaAnticipo {
  personal_id: string;
  tipo: 'anticipo' | 'prestamo';
  fecha: string;
  monto_total: number | null;
  cuota_sugerida: number | null;
  motivo: string;
  /** Modo histórico: ya existía antes del sistema. */
  historico: boolean;
  /** Solo en histórico: lo que ya se había abonado y cuándo. */
  abonado: number | null;
  fecha_abono: string;
}

const HOY = () => new Date().toISOString().slice(0, 10);

export const ALTA_VACIA: AltaAnticipo = {
  personal_id: '', tipo: 'prestamo', fecha: HOY(), monto_total: null, cuota_sugerida: null, motivo: '',
  historico: false, abonado: null, fecha_abono: HOY(),
};

const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Qué le falta al alta para poder guardarse; null si está bien. */
export function errorAlta(a: AltaAnticipo): string | null {
  if (!a.personal_id) return 'Elegí el trabajador.';
  if (!esFecha(a.fecha)) return 'Indicá la fecha del préstamo.';
  if (a.monto_total == null || !(a.monto_total > 0)) return 'Indicá el monto.';
  if (a.cuota_sugerida != null && a.cuota_sugerida < 0) return 'La cuota no puede ser negativa.';
  if (a.cuota_sugerida != null && a.cuota_sugerida > a.monto_total) return 'La cuota no puede superar el monto del préstamo.';
  if (a.historico) {
    if (a.abonado != null && a.abonado < 0) return 'Lo abonado no puede ser negativo.';
    if (a.abonado != null && r2(a.abonado) > r2(a.monto_total)) return 'Lo abonado no puede superar el monto del préstamo.';
    if (a.abonado != null && a.abonado > 0 && !esFecha(a.fecha_abono)) return 'Indicá hasta qué fecha va lo abonado.';
    if (a.abonado != null && a.abonado > 0 && a.fecha_abono < a.fecha) return 'Lo abonado no puede ser anterior al préstamo.';
  }
  return null;
}

/** Qué le falta a un abono manual; null si está bien. */
export function errorAbono(saldo: number, monto: number | null, fecha: string, fechaPrestamo?: string | null): string | null {
  if (monto == null || !(monto > 0)) return 'Indicá el monto del abono.';
  if (r2(monto) > r2(saldo)) return `El abono supera lo que falta por pagar (${r2(saldo).toFixed(2)} $).`;
  if (!esFecha(fecha)) return 'Indicá la fecha del abono.';
  if (fechaPrestamo && fecha < String(fechaPrestamo).slice(0, 10)) return 'El abono no puede ser anterior al préstamo.';
  return null;
}

export const ETIQUETA_TIPO: Record<AnticipoPrestamo['tipo'], string> = { anticipo: 'Anticipo', prestamo: 'Préstamo' };
export const ETIQUETA_ORIGEN: Record<AnticipoPago['origen'], string> = {
  nomina: 'Nómina', manual: 'Abono manual', historico: 'Histórico',
};

/** Ordena abonos del más viejo al más nuevo (un estado de cuenta se lee hacia adelante). */
export function ordenarPagos(pagos: AnticipoPago[]): AnticipoPago[] {
  return [...pagos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.created_at).localeCompare(String(b.created_at)));
}
