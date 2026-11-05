/* ============================================================
   Golden Touch · Combustible · Motor de Existencias y Saldos al Corte
   (04/11/2026)

   Lógica pura y determinista para calcular existencias de combustible
   a cualquier fecha de corte histórica o rango de fechas:
     · Saldo de apertura al inicio del periodo (litros y USD).
     · Entradas, surtidos a equipos y traslados dentro del periodo.
     · Saldo al cierre exacto a la fecha de corte (con cuánto cerró el tanque).
     · Valuación monetaria en USD al cierre.
     · Totales consolidados de cabecera que reaccionan a los checks y al rango.
   ============================================================ */

import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import { compararMovimientos } from './horaMovimiento';

export type PresetPeriodoCombustible =
  | 'mes_actual'
  | 'mes_anterior'
  | '7dias'
  | '15dias'
  | '30dias'
  | 'este_ano'
  | 'todos'
  | 'personalizado';

export interface SaldoCorteTanque {
  tanque: TanqueCombustible;
  // Apertura al inicio del rango
  saldoInicialLitros: number;
  saldoInicialUsd: number;
  // Movimientos en el rango
  movimientos: MovimientoTanque[];
  entradasLitros: number;
  entradasUsd: number;
  entradasCount: number;
  surtidosLitros: number;
  surtidosUsd: number;
  surtidosCount: number;
  trasladosLitros: number;
  trasladosUsd: number;
  trasladosCount: number;
  // Cierre al corte final del rango
  saldoCierreLitros: number;
  saldoCierreUsd: number;
  tasaCierre: number;
  porcentajeLleno: number; // % capacidad nominal
  variacionPeriodoLitros: number; // Cierre - Apertura
  esHistorico: boolean;
}

export interface TotalesCorteCombustible {
  // Existencias al corte
  totalLitrosCierre: number;
  totalValorCierre: number;
  tasaPromedioCierre: number;
  // Apertura
  totalLitrosApertura: number;
  totalValorApertura: number;
  // Flujo en el periodo
  totalEntradasLitros: number;
  totalEntradasUsd: number;
  totalSurtidosLitros: number;
  totalSurtidosUsd: number;
  totalSurtidosCount: number;
  totalTrasladosLitros: number;
  totalTrasladosUsd: number;
  totalTrasladosCount: number;
  variacionNetaLitros: number;
  // Conteo
  tanquesSeleccionadosCount: number;
  totalTanquesCatalogo: number;
  esHistorico: boolean;
  cierreFechaLabel: string;
}

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function nombreMesEs(numeroMes: number): string {
  return MESES_ES[(numeroMes - 1 + 12) % 12] || '';
}

export function hoyIsoVE(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function restarDiasIso(iso: string, dias: number): string {
  const [y, m, d] = (iso || '').split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() - dias);
  const resY = date.getFullYear();
  const resM = String(date.getMonth() + 1).padStart(2, '0');
  const resD = String(date.getDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

/**
 * Calcula las fechas «desde» y «hasta» y la etiqueta para un preset de rango.
 */
export function obtenerPresetRango(
  preset: PresetPeriodoCombustible,
  hoyRef?: string,
): { desde: string; hasta: string; label: string } {
  const hoy = hoyRef || hoyIsoVE();
  const [aStr, mStr] = hoy.split('-');
  const anio = Number(aStr) || new Date().getFullYear();
  const mes = Number(mStr) || new Date().getMonth() + 1; // 1-12

  if (preset === 'mes_actual') {
    const desde = `${aStr}-${mStr}-01`;
    return { desde, hasta: hoy, label: `Mes actual (${nombreMesEs(mes)})` };
  }

  if (preset === 'mes_anterior') {
    const anioAnt = mes === 1 ? anio - 1 : anio;
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const mesAntStr = String(mesAnt).padStart(2, '0');
    // Último día del mes anterior
    const ultimoDia = new Date(anioAnt, mesAnt, 0).getDate();
    const desde = `${anioAnt}-${mesAntStr}-01`;
    const hasta = `${anioAnt}-${mesAntStr}-${String(ultimoDia).padStart(2, '0')}`;
    return { desde, hasta, label: `Mes anterior (${nombreMesEs(mesAnt)} ${anioAnt})` };
  }

  if (preset === '7dias') {
    return { desde: restarDiasIso(hoy, 7), hasta: hoy, label: 'Últimos 7 días' };
  }

  if (preset === '15dias') {
    return { desde: restarDiasIso(hoy, 15), hasta: hoy, label: 'Últimos 15 días' };
  }

  if (preset === '30dias') {
    return { desde: restarDiasIso(hoy, 30), hasta: hoy, label: 'Últimos 30 días' };
  }

  if (preset === 'este_ano') {
    return { desde: `${aStr}-01-01`, hasta: hoy, label: `Año ${aStr}` };
  }

  if (preset === 'personalizado') {
    return { desde: '', hasta: '', label: 'Personalizado' };
  }

  return { desde: '', hasta: '', label: 'Historial completo' };
}

/**
 * Genera el título formal y explícito para la cabecera del reporte (p. ej. "Reporte del 01 al 31 de Octubre 2026").
 */
export function obtenerTituloRangoReporte(
  desde?: string | null,
  hasta?: string | null,
  preset?: PresetPeriodoCombustible,
): string {
  if (preset === 'todos') {
    return 'Reporte Histórico Completo de Combustible';
  }

  const d = (desde || '').trim();
  const h = (hasta || '').trim();

  if (d && h) {
    const [yD, mD, diaD] = d.split('-').map(Number);
    const [yH, mH, diaH] = h.split('-').map(Number);
    const padD = String(diaD).padStart(2, '0');
    const padH = String(diaH).padStart(2, '0');

    if (yD === yH && mD === mH) {
      // Mismo mes y año: "Reporte del 01 al 31 de Octubre 2026"
      return `Reporte del ${padD} al ${padH} de ${nombreMesEs(mD)} ${yH}`;
    }
    if (yD === yH) {
      // Mismo año, distinto mes: "Reporte del 25 de Octubre al 04 de Noviembre 2026"
      return `Reporte del ${padD} de ${nombreMesEs(mD)} al ${padH} de ${nombreMesEs(mH)} ${yH}`;
    }
    // Distinto año
    return `Reporte del ${padD} de ${nombreMesEs(mD)} ${yD} al ${padH} de ${nombreMesEs(mH)} ${yH}`;
  }

  if (h) {
    const [yH, mH, diaH] = h.split('-').map(Number);
    const padH = String(diaH).padStart(2, '0');
    return `Reporte de Combustible al ${padH} de ${nombreMesEs(mH)} ${yH}`;
  }

  if (d) {
    const [yD, mD, diaD] = d.split('-').map(Number);
    const padD = String(diaD).padStart(2, '0');
    return `Reporte de Combustible desde el ${padD} de ${nombreMesEs(mD)} ${yD}`;
  }

  return 'Reporte de Existencias y Movimientos de Combustible';
}

/**
 * Calcula para un tanque sus saldos de apertura, movimientos del periodo y saldo al corte/cierre.
 */
export function calcularCorteTanque(
  tanque: TanqueCombustible,
  todosMovs: MovimientoTanque[],
  fechaDesde?: string | null,
  fechaHasta?: string | null,
  hoyRef?: string,
): SaldoCorteTanque {
  const hoy = hoyRef || hoyIsoVE();
  const todosOrdenados = [...todosMovs].sort(compararMovimientos);

  const aperturaTanqueL = Number(tanque.saldo_inicial_litros) || 0;
  const tasaTanque = Number(tanque.tasa_usd_litro) || 0;
  const aperturaTanqueU =
    tanque.saldo_inicial_usd != null
      ? Number(tanque.saldo_inicial_usd)
      : Math.round(aperturaTanqueL * tasaTanque * 100) / 100;

  // 1. Saldo Inicial al comienzo del periodo (justo antes de fechaDesde)
  let saldoInicialLitros = aperturaTanqueL;
  let saldoInicialUsd = aperturaTanqueU;

  if (fechaDesde) {
    const movsAntes = todosOrdenados.filter((m) => (m.fecha ?? '') < fechaDesde);
    if (movsAntes.length > 0) {
      const ultimoAntes = movsAntes[movsAntes.length - 1];
      if (ultimoAntes.saldo_litros != null) {
        saldoInicialLitros = ultimoAntes.saldo_litros;
        saldoInicialUsd = ultimoAntes.saldo_usd != null ? ultimoAntes.saldo_usd : saldoInicialLitros * tasaTanque;
      } else {
        // Reconstrucción si no viniera precalculado
        let sL = aperturaTanqueL;
        let sU = aperturaTanqueU;
        for (const m of movsAntes) {
          if (m.tipo === 'entrada' || m.tipo === 'retorno') {
            sL += Number(m.litros) || 0;
            sU += Number(m.monto_usd) || 0;
          } else {
            sL -= Number(m.litros) || 0;
            sU -= Number(m.monto_usd) || 0;
          }
        }
        saldoInicialLitros = Math.round(sL * 100) / 100;
        saldoInicialUsd = Math.round(sU * 100) / 100;
      }
    }
  }

  // 2. Movimientos dentro del periodo [fechaDesde, fechaHasta]
  const movimientos = todosOrdenados.filter((m) => {
    const f = m.fecha ?? '';
    if (fechaDesde && f < fechaDesde) return false;
    if (fechaHasta && f > fechaHasta) return false;
    return true;
  });

  let entradasLitros = 0;
  let entradasUsd = 0;
  let entradasCount = 0;
  let surtidosLitros = 0;
  let surtidosUsd = 0;
  let surtidosCount = 0;
  let trasladosLitros = 0;
  let trasladosUsd = 0;
  let trasladosCount = 0;

  for (const m of movimientos) {
    const l = Number(m.litros) || 0;
    const u = Number(m.monto_usd) || 0;
    if (m.tipo === 'entrada' || m.tipo === 'retorno') {
      entradasLitros += l;
      entradasUsd += u;
      entradasCount++;
    } else if (m.tipo === 'uso') {
      surtidosLitros += l;
      surtidosUsd += u;
      surtidosCount++;
    } else if (m.tipo === 'traslado') {
      trasladosLitros += l;
      trasladosUsd += u;
      trasladosCount++;
    }
  }

  // 3. Saldo al Cierre al final de fechaHasta
  let saldoCierreLitros = saldoInicialLitros + entradasLitros - surtidosLitros - trasladosLitros;
  let saldoCierreUsd = saldoInicialUsd + entradasUsd - surtidosUsd - trasladosUsd;

  if (fechaHasta) {
    const movsHasta = todosOrdenados.filter((m) => (m.fecha ?? '') <= fechaHasta);
    if (movsHasta.length > 0) {
      const ultimoHasta = movsHasta[movsHasta.length - 1];
      if (ultimoHasta.saldo_litros != null) {
        saldoCierreLitros = ultimoHasta.saldo_litros;
        if (ultimoHasta.saldo_usd != null) {
          saldoCierreUsd = ultimoHasta.saldo_usd;
        }
      }
    } else {
      // No hubo movimientos en ni antes de fechaHasta: el saldo era la apertura inicial
      saldoCierreLitros = aperturaTanqueL;
      saldoCierreUsd = aperturaTanqueU;
    }
  } else if (!fechaDesde && !fechaHasta) {
    // Si no hay límites, es el saldo vivo actual
    if (todosOrdenados.length > 0) {
      const ultimo = todosOrdenados[todosOrdenados.length - 1];
      if (ultimo.saldo_litros != null) {
        saldoCierreLitros = ultimo.saldo_litros;
        saldoCierreUsd = ultimo.saldo_usd != null ? ultimo.saldo_usd : saldoCierreLitros * tasaTanque;
      }
    } else {
      saldoCierreLitros = Number(tanque.saldo_litros) || aperturaTanqueL;
      saldoCierreUsd = Number(tanque.saldo_usd) || aperturaTanqueU;
    }
  }

  saldoCierreLitros = Math.round(saldoCierreLitros * 100) / 100;
  saldoCierreUsd = Math.round(saldoCierreUsd * 100) / 100;

  const cap = Number(tanque.capacidad_litros) || 0;
  const porcentajeLleno = cap > 0 ? Math.min(100, Math.max(0, (saldoCierreLitros / cap) * 100)) : 0;
  const tasaCierre = saldoCierreLitros > 0 ? saldoCierreUsd / saldoCierreLitros : tasaTanque;
  const esHistorico = Boolean(fechaHasta && fechaHasta < hoy);

  return {
    tanque,
    saldoInicialLitros: Math.round(saldoInicialLitros * 100) / 100,
    saldoInicialUsd: Math.round(saldoInicialUsd * 100) / 100,
    movimientos,
    entradasLitros: Math.round(entradasLitros * 100) / 100,
    entradasUsd: Math.round(entradasUsd * 100) / 100,
    entradasCount,
    surtidosLitros: Math.round(surtidosLitros * 100) / 100,
    surtidosUsd: Math.round(surtidosUsd * 100) / 100,
    surtidosCount,
    trasladosLitros: Math.round(trasladosLitros * 100) / 100,
    trasladosUsd: Math.round(trasladosUsd * 100) / 100,
    trasladosCount,
    saldoCierreLitros,
    saldoCierreUsd,
    tasaCierre: Math.round(tasaCierre * 1000) / 1000,
    porcentajeLleno: Math.round(porcentajeLleno * 10) / 10,
    variacionPeriodoLitros: Math.round((saldoCierreLitros - saldoInicialLitros) * 100) / 100,
    esHistorico,
  };
}

/**
 * Calcula los totales y KPIs consolidados de la cabecera sobre el conjunto de tanques seleccionados.
 */
export function calcularTotalesCierre(
  itemsCorte: SaldoCorteTanque[],
  totalTanquesCatalogo: number,
  fechaHasta?: string | null,
  hoyRef?: string,
): TotalesCorteCombustible {
  const hoy = hoyRef || hoyIsoVE();
  const esHistorico = Boolean(fechaHasta && fechaHasta < hoy);

  let totalLitrosCierre = 0;
  let totalValorCierre = 0;
  let totalLitrosApertura = 0;
  let totalValorApertura = 0;
  let totalEntradasLitros = 0;
  let totalEntradasUsd = 0;
  let totalSurtidosLitros = 0;
  let totalSurtidosUsd = 0;
  let totalSurtidosCount = 0;
  let totalTrasladosLitros = 0;
  let totalTrasladosUsd = 0;
  let totalTrasladosCount = 0;

  for (const it of itemsCorte) {
    totalLitrosCierre += it.saldoCierreLitros;
    totalValorCierre += it.saldoCierreUsd;
    totalLitrosApertura += it.saldoInicialLitros;
    totalValorApertura += it.saldoInicialUsd;
    totalEntradasLitros += it.entradasLitros;
    totalEntradasUsd += it.entradasUsd;
    totalSurtidosLitros += it.surtidosLitros;
    totalSurtidosUsd += it.surtidosUsd;
    totalSurtidosCount += it.surtidosCount;
    totalTrasladosLitros += it.trasladosLitros;
    totalTrasladosUsd += it.trasladosUsd;
    totalTrasladosCount += it.trasladosCount;
  }

  const tasaPromedioCierre =
    totalLitrosCierre > 0 ? totalValorCierre / totalLitrosCierre : 0;

  const cierreFechaLabel = fechaHasta
    ? (esHistorico ? `Cierre al ${fechaHasta}` : 'Cierre al corte actual')
    : 'Saldo actual disponible';

  return {
    totalLitrosCierre: Math.round(totalLitrosCierre * 100) / 100,
    totalValorCierre: Math.round(totalValorCierre * 100) / 100,
    tasaPromedioCierre: Math.round(tasaPromedioCierre * 1000) / 1000,
    totalLitrosApertura: Math.round(totalLitrosApertura * 100) / 100,
    totalValorApertura: Math.round(totalValorApertura * 100) / 100,
    totalEntradasLitros: Math.round(totalEntradasLitros * 100) / 100,
    totalEntradasUsd: Math.round(totalEntradasUsd * 100) / 100,
    totalSurtidosLitros: Math.round(totalSurtidosLitros * 100) / 100,
    totalSurtidosUsd: Math.round(totalSurtidosUsd * 100) / 100,
    totalSurtidosCount,
    totalTrasladosLitros: Math.round(totalTrasladosLitros * 100) / 100,
    totalTrasladosUsd: Math.round(totalTrasladosUsd * 100) / 100,
    totalTrasladosCount,
    variacionNetaLitros: Math.round((totalLitrosCierre - totalLitrosApertura) * 100) / 100,
    tanquesSeleccionadosCount: itemsCorte.length,
    totalTanquesCatalogo,
    esHistorico,
    cierreFechaLabel,
  };
}

