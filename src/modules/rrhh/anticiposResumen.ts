/* ============================================================
   Golden Touch · RRHH · Préstamos y anticipos: filtros, totales y reglas

   Lógica pura (sin red ni pantalla) para que la pestaña, los modales y el
   PDF cuenten lo mismo: qué se ve con cada filtro, cuánto se prestó, cuánto
   se pagó y cuánto se debe, por préstamo y por trabajador.
   ============================================================ */
import type { AnticipoPago, AnticipoPrestamo, Personal } from '@/shared/lib/types';
import { date, money } from '@/shared/lib/format';

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
  if (!a.personal_id) return 'Elige el trabajador.';
  if (!esFecha(a.fecha)) return 'Indica la fecha del préstamo.';
  if (a.monto_total == null || !(a.monto_total > 0)) return 'Indica el monto.';
  if (a.cuota_sugerida != null && a.cuota_sugerida < 0) return 'La cuota no puede ser negativa.';
  if (a.cuota_sugerida != null && a.cuota_sugerida > a.monto_total) return 'La cuota no puede superar el monto del préstamo.';
  if (a.historico) {
    if (a.abonado != null && a.abonado < 0) return 'Lo abonado no puede ser negativo.';
    if (a.abonado != null && r2(a.abonado) > r2(a.monto_total)) return 'Lo abonado no puede superar el monto del préstamo.';
    if (a.abonado != null && a.abonado > 0 && !esFecha(a.fecha_abono)) return 'Indica hasta qué fecha va lo abonado.';
    if (a.abonado != null && a.abonado > 0 && a.fecha_abono < a.fecha) return 'Lo abonado no puede ser anterior al préstamo.';
  }
  return null;
}

/** Qué le falta a un abono manual; null si está bien. */
export function errorAbono(saldo: number, monto: number | null, fecha: string, fechaPrestamo?: string | null): string | null {
  if (monto == null || !(monto > 0)) return 'Indica el monto del abono.';
  if (r2(monto) > r2(saldo)) return `El abono supera lo que falta por pagar (${r2(saldo).toFixed(2)} $).`;
  if (!esFecha(fecha)) return 'Indica la fecha del abono.';
  if (fechaPrestamo && fecha < String(fechaPrestamo).slice(0, 10)) return 'El abono no puede ser anterior al préstamo.';
  return null;
}

/** Qué le falta a la edición de un abono existente; null si está bien. */
export function errorEdicionAbono(
  montoTotalPrestamo: number,
  otrosAbonos: number,
  monto: number | null,
  fecha: string,
  fechaPrestamo?: string | null,
): string | null {
  if (monto == null || !(monto > 0)) return 'Indica el monto del abono (debe ser mayor que 0).';
  const maxPermitido = Math.max(0, r2(montoTotalPrestamo - otrosAbonos));
  if (r2(monto) > maxPermitido) {
    return `El monto supera el total disponible del préstamo (máximo posible para este abono: ${maxPermitido.toFixed(2)} $).`;
  }
  if (!esFecha(fecha)) return 'Indica la fecha del abono.';
  if (fechaPrestamo && fecha < String(fechaPrestamo).slice(0, 10)) {
    return 'El abono no puede ser anterior a la fecha del préstamo.';
  }
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

/* ───────────── Historial de entregas / préstamos acumulados ───────────── */

export interface EntregaPrestamo {
  fecha: string;
  monto: number;
  motivo?: string | null;
}

export function normalizarFechaIso(f: string): string {
  const s = f.trim();
  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(s)) return s.replace(/\//g, '-');
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

export function parsearMontoTexto(s: string | undefined): number {
  if (!s) return 0;
  const limpio = s.replace(/[$USDT\s]/gi, '').trim();
  if (limpio.includes(',') && limpio.includes('.')) {
    if (limpio.indexOf('.') < limpio.indexOf(',')) {
      return Number(limpio.replace(/\./g, '').replace(',', '.')) || 0;
    } else {
      return Number(limpio.replace(/,/g, '')) || 0;
    }
  }
  if (limpio.includes(',')) {
    return Number(limpio.replace(',', '.')) || 0;
  }
  return Number(limpio) || 0;
}

/**
 * Extrae todas las entregas individuales de un préstamo (fecha, monto y motivo).
 * Si no tiene desglose de entregas en el motivo, devuelve una sola entrega con los datos base.
 */
export function extraerEntregasPrestamo(anticipo: AnticipoPrestamo): EntregaPrestamo[] {
  const texto = (anticipo.motivo ?? '').trim();
  if (!texto) {
    return [{
      fecha: String(anticipo.fecha ?? '').slice(0, 10),
      monto: Number(anticipo.monto_total) || 0,
      motivo: null,
    }];
  }

  // Coincide con líneas del tipo:
  // [Entrega 23-08-2026 · $ 550,00]: Motivo
  // [23/08/2026 · $ 550,00]: Motivo
  // [23-08-2026]: Motivo
  const patron = /\[(?:Entrega\s+)?(\d{2}[-/]\d{2}[-/]\d{4}|\d{4}[-/]\d{2}[-/]\d{2})(?:\s*·\s*\$?\s*([\d.,]+))?\](?::\s*|\s*-\s*)([^\n\r]*)/gi;
  const entregas: EntregaPrestamo[] = [];
  let match: RegExpExecArray | null;

  while ((match = patron.exec(texto)) !== null) {
    const rawFecha = match[1];
    const rawMonto = match[2];
    const rawMotivo = match[3]?.trim() || null;
    const fecha = normalizarFechaIso(rawFecha);
    const monto = rawMonto ? parsearMontoTexto(rawMonto) : 0;
    entregas.push({ fecha, monto: r2(monto), motivo: rawMotivo });
  }

  if (!entregas.length) {
    return [{
      fecha: String(anticipo.fecha ?? '').slice(0, 10),
      monto: Number(anticipo.monto_total) || 0,
      motivo: anticipo.motivo ?? null,
    }];
  }

  // Ordenar por fecha cronológica (la más antigua primero)
  entregas.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const totalCalculado = entregas.reduce((acc, e) => acc + e.monto, 0);
  if (totalCalculado <= 0 && anticipo.monto_total) {
    entregas[0].monto = Number(anticipo.monto_total) || 0;
  }

  return entregas;
}

/**
 * Agrega una nueva entrega al campo motivo preservando o iniciando el formato estructurado.
 */
export function agregarEntregaAMotivo(
  motivoActual: string | null | undefined,
  fechaBase: string,
  montoBase: number,
  nuevaEntrega: EntregaPrestamo,
): string {
  const actual = (motivoActual ?? '').trim();
  const lineaNueva = `[Entrega ${date(nuevaEntrega.fecha)} · ${money(nuevaEntrega.monto)}]: ${nuevaEntrega.motivo?.trim() || 'Préstamo adicional'}`;

  // Si ya tiene el formato estructurado de entregas:
  if (/\[(?:Entrega\s+)?(?:\d{2}[-/]\d{2}[-/]\d{4}|\d{4}[-/]\d{2}[-/]\d{2})/i.test(actual)) {
    return `${actual}\n${lineaNueva}`;
  }

  // Si era un motivo tradicional simple, convertimos el inicial a entrega 1 y agregamos la nueva:
  const lineaInicial = `[Entrega ${date(fechaBase)} · ${money(montoBase)}]: ${actual || 'Préstamo inicial'}`;
  return `${lineaInicial}\n${lineaNueva}`;
}

export interface PrestamosMultiplesDetectados {
  personalId: string;
  tipo: AnticipoPrestamo['tipo'];
  nombre: string;
  cantidad: number;
  total: number;
  saldo: number;
  ids: string[];
}

/**
 * Encuentra trabajadores que tengan más de un préstamo activo de un mismo tipo.
 */
export function detectarPrestamosMultiples(
  lista: AnticipoPrestamo[],
  personas: Map<string, Personal>,
): PrestamosMultiplesDetectados[] {
  const activos = lista.filter((a) => a.estado === 'activo' && Number(a.saldo) > 0);
  const grupos = new Map<string, AnticipoPrestamo[]>();

  for (const a of activos) {
    const clave = `${a.personal_id}__${a.tipo}`;
    const arr = grupos.get(clave) ?? [];
    arr.push(a);
    grupos.set(clave, arr);
  }

  const resultado: PrestamosMultiplesDetectados[] = [];
  for (const [clave, items] of grupos.entries()) {
    if (items.length > 1) {
      const [personalId, tipo] = clave.split('__') as [string, AnticipoPrestamo['tipo']];
      const persona = personas.get(personalId);
      const total = r2(items.reduce((acc, a) => acc + (Number(a.monto_total) || 0), 0));
      const saldo = r2(items.reduce((acc, a) => acc + (Number(a.saldo) || 0), 0));
      resultado.push({
        personalId,
        tipo,
        nombre: nombreCompleto(persona),
        cantidad: items.length,
        total,
        saldo,
        ids: items.map((a) => a.id),
      });
    }
  }

  return resultado;
}

export interface PrestamoItemEntrega {
  numero: number;
  fecha: string;
  monto: number;
  motivo?: string | null;
}

export interface AnticipoUnificado extends AnticipoPrestamo {
  ids: string[];
  fechaInicial: string;
  todasLasFechas: string[];
  pagado: number;
  entregas: PrestamoItemEntrega[];
}

/**
 * Unifica la lista de anticipos por trabajador y tipo.
 * Si un trabajador tiene varios préstamos (ej. Préstamo 1 de 50$ día 10/10/26 y Préstamo 2 de 100$ día 10/11/26),
 * los consolida en un solo registro con la deuda total acumulada y el desglose de fechas y montos de cada préstamo.
 */
export function unificarAnticipos(lista: AnticipoPrestamo[]): AnticipoUnificado[] {
  const grupos = new Map<string, AnticipoPrestamo[]>();

  for (const a of lista) {
    const clave = `${a.personal_id}__${a.tipo}`;
    const arr = grupos.get(clave) ?? [];
    arr.push(a);
    grupos.set(clave, arr);
  }

  const resultado: AnticipoUnificado[] = [];

  for (const [, items] of grupos.entries()) {
    if (items.length === 1) {
      const a = items[0];
      const rawEntregas = extraerEntregasPrestamo(a);
      const entregas: PrestamoItemEntrega[] = rawEntregas.map((e, idx) => ({
        numero: idx + 1,
        fecha: e.fecha,
        monto: e.monto,
        motivo: e.motivo,
      }));
      const fechaInicial = entregas[0]?.fecha || String(a.fecha ?? '').slice(0, 10);
      const fechaReciente = entregas[entregas.length - 1]?.fecha || String(a.fecha ?? '').slice(0, 10);
      const todasLasFechas = [...new Set(entregas.map((e) => e.fecha))].sort();

      resultado.push({
        ...a,
        ids: [a.id],
        fecha: fechaReciente,
        fechaInicial,
        todasLasFechas,
        pagado: pagadoDe(a),
        entregas,
      });
      continue;
    }

    // Múltiples préstamos: ordenar por fecha ascendente (el más antiguo primero)
    const ordenados = [...items].sort((x, y) =>
      String(x.fecha).localeCompare(String(y.fecha)) || String(x.created_at).localeCompare(String(y.created_at))
    );

    const entregas: PrestamoItemEntrega[] = [];
    let montoTotal = 0;
    let saldoTotal = 0;
    let cuotaTotal = 0;
    let tieneCuota = false;
    const ids: string[] = [];

    for (const item of ordenados) {
      ids.push(item.id);
      const rawEntregas = extraerEntregasPrestamo(item);
      for (const e of rawEntregas) {
        entregas.push({
          numero: entregas.length + 1,
          fecha: e.fecha,
          monto: e.monto,
          motivo: e.motivo,
        });
      }
      montoTotal = r2(montoTotal + (Number(item.monto_total) || 0));
      saldoTotal = r2(saldoTotal + (Number(item.saldo) || 0));
      if (item.cuota_sugerida != null && Number(item.cuota_sugerida) > 0) {
        cuotaTotal = r2(cuotaTotal + Number(item.cuota_sugerida));
        tieneCuota = true;
      }
    }

    const fechaInicial = entregas[0]?.fecha || ordenados[0].fecha;
    const fechaReciente = entregas[entregas.length - 1]?.fecha || ordenados[ordenados.length - 1].fecha;
    const todasLasFechas = [...new Set(entregas.map((e) => e.fecha))].sort();
    const pagadoTotal = Math.max(0, r2(montoTotal - saldoTotal));

    // Formatear motivo indicando cada préstamo por número, monto y fecha
    const lineasMotivo = entregas.map((e) => {
      const desc = e.motivo ? ` · ${e.motivo}` : '';
      return `Préstamo ${e.numero}: ${money(e.monto)} (Día ${date(e.fecha)})${desc}`;
    });

    const principal = ordenados[ordenados.length - 1];

    resultado.push({
      id: principal.id,
      ids,
      personal_id: principal.personal_id,
      tipo: principal.tipo,
      fecha: fechaReciente,
      fechaInicial,
      todasLasFechas,
      monto_total: montoTotal,
      saldo: saldoTotal,
      pagado: pagadoTotal,
      cuota_sugerida: tieneCuota ? cuotaTotal : principal.cuota_sugerida,
      estado: saldoTotal <= 0 ? 'saldado' : 'activo',
      motivo: lineasMotivo.join('\n'),
      historico: ordenados.some((x) => x.historico),
      creado_por: principal.creado_por,
      actor_name: principal.actor_name,
      created_at: principal.created_at,
      entregas,
    });
  }

  return resultado.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}
