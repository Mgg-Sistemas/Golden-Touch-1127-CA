/* ============================================================
   Golden Touch · Combustible · Motor del Reporte Moldeable
   (29/10/2026)

   Estructura y reglas de negocio para el reporte flexible de combustible:
   - Cruce entre movimientos de combustible y fichas de maquinaria (empresa,
     tipo de máquina, ubicación, clase).
   - Agrupación por: Equipo · Empresa · Tipo de Máquina · Ubicación · Tanque ·
     Mes · Detallado (movimiento a movimiento).
   - Valuación en USD configurable: Tasa histórica del movimiento vs Tasa actual
     del tanque.
   - Suma de horas trabajadas por máquina en el rango (horas_utilizadas o delta
     de horómetro fin - horómetro ini).
   - Filtros de inclusión/exclusión por casillas (checks).
   - Cálculo de totales, promedios (L/h, $/L) y Top Consumidores (KPIs).
   ============================================================ */

import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import type { MaquinariaEquipo } from '@/modules/maquinaria/maquinariaEquipos.repository';
import { aliasesDeEquipo, claseEquipo } from '@/modules/maquinaria/flota';
import { normalizarUbicacion } from '@/modules/maquinaria/exportarEquipos';
import { norm } from '@/shared/lib/texto';

export type ModoAgrupacionCombustible =
  | 'equipo'
  | 'dia'
  | 'empresa'
  | 'tipo'
  | 'ubicacion'
  | 'tanque'
  | 'mes'
  | 'detallado';

export type BaseTasaUsd = 'historica' | 'actual';

export interface OpcionesReporteCombustible {
  desde: string; // 'YYYY-MM-DD'
  hasta: string; // 'YYYY-MM-DD'
  agrupacion: ModoAgrupacionCombustible;
  baseTasa: BaseTasaUsd;
  columnas: string[];
  empresasSel?: string[];
  tiposSel?: string[];
  tanquesSel?: string[];
  ubicacionesSel?: string[];
  equiposSel?: string[];
  incluirResumen: boolean;
  soloResumen?: boolean;
}

export interface FilaReporteCombustible {
  id: string;
  equipo: string;
  empresa: string;
  tipo: string;
  clase?: string;
  ubicacion: string;
  tanque: string;
  tanque_id?: string;
  mes?: string;
  fecha?: string;
  hora?: string;
  autorizado?: string;
  observacion?: string;

  // Métricas
  litros: number;
  usd: number;
  surtidos: number;
  horas: number;
  rendimiento: number | null; // Litros / Hora
  horometro_ini: number | null;
  horometro_fin: number | null;
  kilometraje: number | null;
  tasa_promedio: number;
  pct_total: number;
  pct_tanque: number;
  pct_capacidad: number;
  capacidad_tanque?: number | null;
  total_salidas_tanque?: number;
  es_traslado?: boolean;
}

export interface TopConsumidorItem {
  nombre: string;
  litros: number;
  usd: number;
  porcentaje: number;
}

export interface ResumenReporteCombustible {
  totalLitros: number;
  totalUsd: number;
  totalHoras: number;
  totalSurtidos: number;
  rendimientoPromedio: number; // totalLitros / totalHoras
  tasaPromedio: number; // totalUsd / totalLitros
  totalFilas: number;
  totalEquipos: number;
  topConsumidores: TopConsumidorItem[];
}

export interface CampoColumnaCombustible {
  clave: string;
  etiqueta: string;
  descripcion?: string;
  anchoPdf: number;
  anchoExcel: number;
  alineacion: 'left' | 'right' | 'center';
  formato?: 'texto' | 'numero' | 'moneda' | 'porcentaje';
}

export const CAMPOS_REPORTE_COMBUSTIBLE: CampoColumnaCombustible[] = [
  { clave: 'equipo', etiqueta: 'Equipo / Máquina', anchoPdf: 26, anchoExcel: 24, alineacion: 'left', formato: 'texto' },
  { clave: 'horas', etiqueta: 'Horas Trab. (h)', anchoPdf: 15, anchoExcel: 14, alineacion: 'right', formato: 'numero', descripcion: 'Horas de operación calculadas en el período' },
  { clave: 'litros', etiqueta: 'Consumo (L)', anchoPdf: 16, anchoExcel: 15, alineacion: 'right', formato: 'numero', descripcion: 'Litros despachados o trasladados' },
  { clave: 'pct_tanque', etiqueta: '% con respecto al Tanque', anchoPdf: 18, anchoExcel: 16, alineacion: 'right', formato: 'porcentaje', descripcion: '% de consumo con respecto al total de salidas del tanque' },
  { clave: 'pct_capacidad', etiqueta: '% Cap. Física Tanque', anchoPdf: 16, anchoExcel: 15, alineacion: 'right', formato: 'porcentaje', descripcion: '% de consumo respecto a la capacidad física nominal del tanque' },
  { clave: 'rendimiento', etiqueta: 'Rend. (L/h)', anchoPdf: 14, anchoExcel: 13, alineacion: 'right', formato: 'numero', descripcion: 'Consumo horario promedio (L/h)' },
  { clave: 'tanque', etiqueta: 'Tanque Origen', anchoPdf: 18, anchoExcel: 18, alineacion: 'left', formato: 'texto' },
  { clave: 'empresa', etiqueta: 'Empresa / Propietario', anchoPdf: 22, anchoExcel: 22, alineacion: 'left', formato: 'texto' },
  { clave: 'tipo', etiqueta: 'Tipo de Máquina', anchoPdf: 18, anchoExcel: 18, alineacion: 'left', formato: 'texto' },
  { clave: 'usd', etiqueta: 'Consumo ($ USD)', anchoPdf: 16, anchoExcel: 16, alineacion: 'right', formato: 'moneda' },
  { clave: 'pct_total', etiqueta: '% Total Período', anchoPdf: 14, anchoExcel: 12, alineacion: 'right', formato: 'porcentaje', descripcion: '% respecto al consumo total de todos los tanques en el período' },
  { clave: 'surtidos', etiqueta: 'Nº Surtidos', anchoPdf: 12, anchoExcel: 12, alineacion: 'center', formato: 'numero' },
  { clave: 'horometro_ini', etiqueta: 'Horóm. Inicial', anchoPdf: 14, anchoExcel: 14, alineacion: 'right', formato: 'numero' },
  { clave: 'horometro_fin', etiqueta: 'Horóm. Final', anchoPdf: 14, anchoExcel: 14, alineacion: 'right', formato: 'numero' },
  { clave: 'tasa_promedio', etiqueta: 'Tasa Prom. ($/L)', anchoPdf: 15, anchoExcel: 14, alineacion: 'right', formato: 'moneda' },
  { clave: 'ubicacion', etiqueta: 'Ubicación / Mina', anchoPdf: 20, anchoExcel: 20, alineacion: 'left', formato: 'texto' },
  { clave: 'fecha', etiqueta: 'Fecha', anchoPdf: 13, anchoExcel: 13, alineacion: 'center', formato: 'texto' },
  { clave: 'hora', etiqueta: 'Hora', anchoPdf: 11, anchoExcel: 11, alineacion: 'center', formato: 'texto' },
  { clave: 'autorizado', etiqueta: 'Autorizado Por', anchoPdf: 18, anchoExcel: 20, alineacion: 'left', formato: 'texto' },
  { clave: 'observacion', etiqueta: 'Observación', anchoPdf: 24, anchoExcel: 28, alineacion: 'left', formato: 'texto' },
];

export const CAMPOS_POR_DEFECTO_POR_MODO: Record<ModoAgrupacionCombustible, string[]> = {
  equipo: ['equipo', 'horas', 'litros', 'pct_tanque', 'pct_capacidad', 'rendimiento', 'tanque', 'empresa', 'usd'],
  dia: ['fecha', 'horas', 'litros', 'pct_total', 'rendimiento', 'surtidos', 'usd'],
  empresa: ['empresa', 'horas', 'litros', 'pct_total', 'surtidos', 'usd'],
  tipo: ['tipo', 'horas', 'litros', 'pct_total', 'rendimiento', 'surtidos'],
  ubicacion: ['ubicacion', 'horas', 'litros', 'pct_total', 'surtidos'],
  tanque: ['tanque', 'litros', 'pct_total', 'surtidos', 'tasa_promedio', 'usd'],
  mes: ['mes', 'horas', 'litros', 'pct_total', 'surtidos', 'usd'],
  detallado: ['fecha', 'hora', 'equipo', 'horas', 'litros', 'pct_tanque', 'pct_capacidad', 'rendimiento', 'tanque', 'empresa', 'usd'],
};

const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function mesEtiqueta(fechaIso: string): string {
  const [y, m] = (fechaIso || '').split('-');
  const mesIdx = Number(m) - 1;
  if (mesIdx >= 0 && mesIdx < 12 && y) {
    return `${MESES_ES[mesIdx]} ${y}`;
  }
  return fechaIso || 'Sin fecha';
}

/** Calcula las horas trabajadas en un único movimiento de despacho. */
export function horasDeMovimiento(m: MovimientoTanque, esVehiculo = false): number {
  if (esVehiculo) return 0;
  let h = 0;
  if (m.horas_utilizadas != null && Number(m.horas_utilizadas) > 0) {
    h = Number(m.horas_utilizadas);
  } else if (
    m.horometro_fin != null &&
    m.horometro_ini != null &&
    Number(m.horometro_fin) >= Number(m.horometro_ini)
  ) {
    h = Number(m.horometro_fin) - Number(m.horometro_ini);
  }
  // Sanidad: un despacho individual de combustible no supera 500 horas de operación continua.
  // Valores mayores corresponden a lecturas de odómetro o acumuladores absolutos guardados por error.
  if (h > 500) return 0;
  return h;
}

/** Calcula el monto en USD de un movimiento según la base de tasa elegida. */
export function valorUsdDeMovimiento(
  m: MovimientoTanque,
  baseTasa: BaseTasaUsd,
  tasaActualTanque?: number
): number {
  const litros = Number(m.litros) || 0;
  if (litros <= 0) return 0;

  if (baseTasa === 'actual' && tasaActualTanque != null && tasaActualTanque > 0) {
    return litros * tasaActualTanque;
  }
  if (m.monto_usd != null && Number(m.monto_usd) > 0) {
    return Number(m.monto_usd);
  }
  const tasa = Number(m.tasa_usd_litro) || 0;
  return litros * tasa;
}

/**
 * Mapeo rápido de nombres de equipos en combustible a fichas de maquinaria.
 */
export function crearIndiceMaquinaria(fichas: MaquinariaEquipo[]) {
  const porNombre = new Map<string, MaquinariaEquipo>();

  // 1. Vínculo explícito 'combustible_equipo'
  for (const f of fichas) {
    const k = norm(f.combustible_equipo);
    if (k && !porNombre.has(k)) porNombre.set(k, f);
  }
  // 2. Nombre oficial 'equipo'
  for (const f of fichas) {
    const k = norm(f.equipo);
    if (k && !porNombre.has(k)) porNombre.set(k, f);
  }
  // 3. Alias y modelo/placa
  for (const f of fichas) {
    for (const a of aliasesDeEquipo(f)) {
      const k = norm(a);
      if (k && !porNombre.has(k)) porNombre.set(k, f);
    }
  }

  return {
    buscar: (nombreEquipo: string | null | undefined): MaquinariaEquipo | null => {
      const n = norm(nombreEquipo);
      if (!n) return null;
      return porNombre.get(n) ?? null;
    },
  };
}

export interface MovimientoEnriquecido {
  mov: MovimientoTanque;
  equipoNombre: string;
  empresa: string;
  tipoMaquina: string;
  claseMaquina: string;
  ubicacionNormalizada: string;
  tanqueNombre: string;
  tanqueCapacidad: number | null;
  esTraslado: boolean;
  litros: number;
  usd: number;
  horas: number;
}

/**
 * Enriquece los movimientos de combustible con los datos de maquinaria y tanques.
 */
export function enriquecerMovimientos(
  movimientos: MovimientoTanque[],
  fichasMaquinaria: MaquinariaEquipo[],
  tanques: TanqueCombustible[],
  baseTasa: BaseTasaUsd
): MovimientoEnriquecido[] {
  const indice = crearIndiceMaquinaria(fichasMaquinaria);
  const mapaTanques = new Map<string, TanqueCombustible>(tanques.map((t) => [t.id, t]));

  return movimientos.map((m) => {
    const t = m.tanque_id ? mapaTanques.get(m.tanque_id) : undefined;
    const tanqueNombre = t ? t.nombre : 'Tanque desconocido';
    const tanqueCapacidad = t?.capacidad_litros != null ? Number(t.capacidad_litros) : null;
    const tasaActual = t ? Number(t.tasa_usd_litro) || 0 : undefined;

    const litros = Number(m.litros) || 0;
    const usd = valorUsdDeMovimiento(m, baseTasa, tasaActual);

    let equipoNombre = (m.equipo ?? '').trim();
    let empresa = 'Sin empresa asignada';
    let tipoMaquina = 'Otros / No clasificado';
    let claseMaquina = 'otro';
    let ubicacion = normalizarUbicacion(m.ubicacion) || (m.ubicacion ?? '').trim() || 'Sin ubicación';
    const esTraslado = m.tipo === 'traslado';

    if (esTraslado) {
      const dest = m.tanque_destino_id ? mapaTanques.get(m.tanque_destino_id) : undefined;
      let destNombre = dest ? dest.nombre : '';
      if (!destNombre) {
        const obs = `${m.observacion || ''} ${m.equipo || ''}`.toUpperCase();
        for (const tk of tanques) {
          const numMatch = tk.nombre.match(/#?\s*(\d+)/);
          if (numMatch && (obs.includes(`TANQUE ${numMatch[1]}`) || obs.includes(`TANQUE #${numMatch[1]}`))) {
            destNombre = tk.nombre;
            break;
          }
        }
      }
      if (!destNombre) {
        destNombre = (m.equipo ?? '').trim() || 'Tanque #3 (Camión de Lubricación)';
      }
      equipoNombre = `Traslado → ${destNombre}`;
      tipoMaquina = 'Traslado entre Tanques';
      empresa = 'Operación Interna';
      claseMaquina = 'traslado';
    } else {
      if (!equipoNombre) equipoNombre = 'Sin equipo asignado';
      const ficha = indice.buscar(equipoNombre);

      if (ficha) {
        empresa = (ficha.propietario ?? '').trim() || 'Sin empresa asignada';
        tipoMaquina = (ficha.tipo ?? '').trim() || 'Sin tipo';
        claseMaquina = claseEquipo(ficha);
        if (ficha.ubicacion && !m.ubicacion) {
          ubicacion = normalizarUbicacion(ficha.ubicacion) || ficha.ubicacion.trim();
        }
      } else {
        if (equipoNombre.toUpperCase().includes('BIDON') || equipoNombre.toUpperCase().includes('BIDONES')) {
          tipoMaquina = 'Bidón / Almacenamiento';
        } else if (equipoNombre.toUpperCase().includes('CUBICACION') || equipoNombre.toUpperCase().includes('MERMA')) {
          tipoMaquina = 'Ajuste / Medición';
        }
      }
    }

    const esVehiculo = claseMaquina === 'vehiculo' || tipoMaquina.toUpperCase().includes('VEHÍCULO') || tipoMaquina.toUpperCase().includes('VEHICULO');
    const horas = horasDeMovimiento(m, esVehiculo);

    return {
      mov: m,
      equipoNombre,
      empresa,
      tipoMaquina,
      claseMaquina,
      ubicacionNormalizada: ubicacion,
      tanqueNombre,
      tanqueCapacidad,
      esTraslado,
      litros,
      usd,
      horas,
    };
  });
}

/**
 * Filtra los movimientos enriquecidos según las opciones seleccionadas por el usuario.
 */
export function filtrarMovimientos(
  movs: MovimientoEnriquecido[],
  opciones: {
    empresasSel?: string[];
    tiposSel?: string[];
    tanquesSel?: string[];
    ubicacionesSel?: string[];
    equiposSel?: string[];
  }
): MovimientoEnriquecido[] {
  const { empresasSel, tiposSel, tanquesSel, ubicacionesSel, equiposSel } = opciones;

  return movs.filter((item) => {
    if (empresasSel && empresasSel.length > 0) {
      if (!empresasSel.includes(item.empresa)) return false;
    }
    if (tiposSel && tiposSel.length > 0) {
      if (!tiposSel.includes(item.tipoMaquina)) return false;
    }
    if (tanquesSel && tanquesSel.length > 0) {
      const matchOrigen = tanquesSel.includes(item.tanqueNombre) || (item.mov.tanque_id && tanquesSel.includes(item.mov.tanque_id));
      const matchDestino = item.esTraslado && tanquesSel.some((tk) => {
        const simple = tk.split('(')[0].trim().toUpperCase();
        return item.equipoNombre.toUpperCase().includes(simple);
      });
      if (!matchOrigen && !matchDestino) {
        return false;
      }
    }
    if (ubicacionesSel && ubicacionesSel.length > 0) {
      if (!ubicacionesSel.includes(item.ubicacionNormalizada)) return false;
    }
    if (equiposSel && equiposSel.length > 0) {
      if (!equiposSel.includes(item.equipoNombre)) return false;
    }
    return true;
  });
}

/**
 * Genera la matriz de filas del reporte según la dimensión de agrupación elegida.
 */
export function procesarFilasReporte(
  movs: MovimientoEnriquecido[],
  agrupacion: ModoAgrupacionCombustible,
  ordenarPor: 'usd' | 'litros' | 'horas' = 'usd'
): { filas: FilaReporteCombustible[]; resumen: ResumenReporteCombustible } {
  const totalLitros = movs.reduce((acc, m) => acc + m.litros, 0);
  const totalUsd = movs.reduce((acc, m) => acc + m.usd, 0);
  const totalHoras = movs.reduce((acc, m) => acc + m.horas, 0);
  const totalSurtidos = movs.length;

  // Acumular litros salidos por tanque de origen y capacidad de cada tanque
  const salidasPorTanque = new Map<string, number>();
  const capacidadPorTanque = new Map<string, number | null>();

  for (const item of movs) {
    salidasPorTanque.set(item.tanqueNombre, (salidasPorTanque.get(item.tanqueNombre) || 0) + item.litros);
    if (!capacidadPorTanque.has(item.tanqueNombre)) {
      capacidadPorTanque.set(item.tanqueNombre, item.tanqueCapacidad);
    }
  }

  if (agrupacion === 'detallado') {
    const filas: FilaReporteCombustible[] = movs.map((item, idx) => {
      const m = item.mov;
      const pct = totalLitros > 0 ? (item.litros / totalLitros) * 100 : 0;
      const totalTanque = salidasPorTanque.get(item.tanqueNombre) || totalLitros;
      const pctTanque = totalTanque > 0 ? (item.litros / totalTanque) * 100 : 0;
      const capTanque = item.tanqueCapacidad ?? capacidadPorTanque.get(item.tanqueNombre) ?? null;
      const pctCap = capTanque && capTanque > 0 ? (item.litros / capTanque) * 100 : 0;
      const tasaProm = item.litros > 0 ? item.usd / item.litros : 0;
      const rend = item.horas > 0 ? item.litros / item.horas : null;

      return {
        id: m.id || String(idx),
        equipo: item.equipoNombre,
        empresa: item.empresa,
        tipo: item.tipoMaquina,
        clase: item.claseMaquina,
        ubicacion: item.ubicacionNormalizada,
        tanque: item.tanqueNombre,
        tanque_id: m.tanque_id,
        capacidad_tanque: capTanque,
        total_salidas_tanque: totalTanque,
        mes: mesEtiqueta(m.fecha),
        fecha: m.fecha,
        hora: m.hora ?? '',
        autorizado: m.autorizado_por ?? '',
        observacion: m.observacion ?? '',
        es_traslado: item.esTraslado,
        litros: Math.round(item.litros * 100) / 100,
        usd: Math.round(item.usd * 100) / 100,
        surtidos: 1,
        horas: Math.round(item.horas * 10) / 10,
        rendimiento: rend != null ? Math.round(rend * 100) / 100 : null,
        horometro_ini: m.horometro_ini ?? null,
        horometro_fin: m.horometro_fin ?? null,
        kilometraje: m.kilometraje ?? null,
        tasa_promedio: Math.round(tasaProm * 1000) / 1000,
        pct_total: Math.round(pct * 10) / 10,
        pct_tanque: Math.round(pctTanque * 10) / 10,
        pct_capacidad: Math.round(pctCap * 10) / 10,
      };
    });

    const resumen: ResumenReporteCombustible = {
      totalLitros: Math.round(totalLitros * 100) / 100,
      totalUsd: Math.round(totalUsd * 100) / 100,
      totalHoras: Math.round(totalHoras * 10) / 10,
      totalSurtidos,
      rendimientoPromedio: totalHoras > 0 ? Math.round((totalLitros / totalHoras) * 100) / 100 : 0,
      tasaPromedio: totalLitros > 0 ? Math.round((totalUsd / totalLitros) * 1000) / 1000 : 0,
      totalFilas: filas.length,
      totalEquipos: new Set(movs.map((m) => m.equipoNombre)).size,
      topConsumidores: calcularTopConsumidores(movs, totalLitros),
    };

    return { filas, resumen };
  }

  // Agrupado
  interface AcumuladorGrupo {
    clave: string;
    equipo: string;
    empresa: string;
    tipo: string;
    clase?: string;
    ubicacion: string;
    tanque: string;
    mes: string;
    fecha?: string;
    litros: number;
    usd: number;
    horas: number;
    surtidos: number;
    horometro_min: number | null;
    horometro_max: number | null;
    kilometraje_max: number | null;
    tanquesUsados: Map<string, number>;
    capacidadTanque: number | null;
    es_traslado: boolean;
  }

  const mapa = new Map<string, AcumuladorGrupo>();

  for (const item of movs) {
    const m = item.mov;
    let clave = '';
    let eqLabel = '';
    let empLabel = '';
    let tipoLabel = '';
    let ubiLabel = '';
    let tkeLabel = '';
    let mesLabel = '';
    let fechaLabel = '';

    switch (agrupacion) {
      case 'equipo':
        clave = norm(item.equipoNombre);
        eqLabel = item.equipoNombre;
        empLabel = item.empresa;
        tipoLabel = item.tipoMaquina;
        ubiLabel = item.ubicacionNormalizada;
        tkeLabel = item.tanqueNombre;
        break;
      case 'dia':
        clave = m.fecha || 'Sin fecha';
        eqLabel = m.fecha || 'Sin fecha';
        fechaLabel = m.fecha || 'Sin fecha';
        mesLabel = mesEtiqueta(m.fecha);
        empLabel = 'Consumo Diario';
        tipoLabel = 'Fecha';
        tkeLabel = item.tanqueNombre;
        break;
      case 'empresa':
        clave = norm(item.empresa);
        eqLabel = item.empresa || 'Sin empresa asignada';
        empLabel = item.empresa || 'Sin empresa asignada';
        tipoLabel = 'Empresa / Propietario';
        tkeLabel = item.tanqueNombre;
        break;
      case 'tipo':
        clave = norm(item.tipoMaquina);
        eqLabel = item.tipoMaquina || 'Otros / No clasificado';
        tipoLabel = item.tipoMaquina || 'Otros / No clasificado';
        empLabel = item.esTraslado ? 'Operación Interna' : 'Flota / Tipo de Máquina';
        tkeLabel = item.tanqueNombre;
        break;
      case 'ubicacion':
        clave = norm(item.ubicacionNormalizada);
        eqLabel = item.ubicacionNormalizada || 'Sin ubicación';
        ubiLabel = item.ubicacionNormalizada || 'Sin ubicación';
        empLabel = 'Frente / Ubicación';
        tipoLabel = 'Ubicación';
        tkeLabel = item.tanqueNombre;
        break;
      case 'tanque':
        clave = norm(item.tanqueNombre);
        eqLabel = item.tanqueNombre || 'Tanque desconocido';
        tkeLabel = item.tanqueNombre || 'Tanque desconocido';
        empLabel = 'Tanque de Suministro';
        tipoLabel = 'Tanque';
        break;
      case 'mes':
        clave = (m.fecha || '').slice(0, 7);
        mesLabel = mesEtiqueta(m.fecha);
        eqLabel = mesLabel || 'Sin fecha';
        empLabel = 'Período Mensual';
        tipoLabel = 'Mes';
        tkeLabel = item.tanqueNombre;
        break;
    }

    let actual = mapa.get(clave);
    if (!actual) {
      actual = {
        clave,
        equipo: eqLabel,
        empresa: empLabel,
        tipo: tipoLabel,
        clase: item.claseMaquina,
        ubicacion: ubiLabel,
        tanque: tkeLabel,
        mes: mesLabel,
        fecha: fechaLabel,
        litros: 0,
        usd: 0,
        horas: 0,
        surtidos: 0,
        horometro_min: null,
        horometro_max: null,
        kilometraje_max: null,
        tanquesUsados: new Map<string, number>(),
        capacidadTanque: item.tanqueCapacidad,
        es_traslado: item.esTraslado,
      };
      mapa.set(clave, actual);
    }

    actual.litros += item.litros;
    actual.usd += item.usd;
    actual.horas += item.horas;
    actual.surtidos += 1;
    actual.tanquesUsados.set(item.tanqueNombre, (actual.tanquesUsados.get(item.tanqueNombre) || 0) + item.litros);

    if (m.horometro_ini != null) {
      const hi = Number(m.horometro_ini);
      actual.horometro_min = actual.horometro_min == null ? hi : Math.min(actual.horometro_min, hi);
    }
    if (m.horometro_fin != null) {
      const hf = Number(m.horometro_fin);
      actual.horometro_max = actual.horometro_max == null ? hf : Math.max(actual.horometro_max, hf);
    }
    if (m.kilometraje != null) {
      const km = Number(m.kilometraje);
      actual.kilometraje_max = actual.kilometraje_max == null ? km : Math.max(actual.kilometraje_max, km);
    }
  }

  const filas: FilaReporteCombustible[] = Array.from(mapa.values()).map((g) => {
    const pct = totalLitros > 0 ? (g.litros / totalLitros) * 100 : 0;
    const tasaProm = g.litros > 0 ? g.usd / g.litros : 0;
    const rend = g.horas > 0 ? g.litros / g.horas : null;

    let tanquePrincipal = g.tanque;
    if (g.tanquesUsados.size > 1) {
      let maxL = -1;
      for (const [tk, l] of g.tanquesUsados.entries()) {
        if (l > maxL) { maxL = l; tanquePrincipal = tk; }
      }
    }
    const totalTanque = salidasPorTanque.get(tanquePrincipal) || totalLitros;
    const pctTanque = totalTanque > 0 ? (g.litros / totalTanque) * 100 : 0;
    const capTanque = capacidadPorTanque.get(tanquePrincipal) ?? g.capacidadTanque ?? null;
    const pctCap = capTanque && capTanque > 0 ? (g.litros / capTanque) * 100 : 0;

    return {
      id: g.clave,
      equipo: g.equipo,
      empresa: g.empresa,
      tipo: g.tipo,
      clase: g.clase,
      ubicacion: g.ubicacion,
      tanque: tanquePrincipal,
      capacidad_tanque: capTanque,
      total_salidas_tanque: totalTanque,
      mes: g.mes,
      fecha: g.fecha,
      litros: Math.round(g.litros * 100) / 100,
      usd: Math.round(g.usd * 100) / 100,
      surtidos: g.surtidos,
      horas: Math.round(g.horas * 10) / 10,
      rendimiento: rend != null ? Math.round(rend * 100) / 100 : null,
      horometro_ini: g.horometro_min,
      horometro_fin: g.horometro_max,
      kilometraje: g.kilometraje_max,
      tasa_promedio: Math.round(tasaProm * 1000) / 1000,
      pct_total: Math.round(pct * 10) / 10,
      pct_tanque: Math.round(pctTanque * 10) / 10,
      pct_capacidad: Math.round(pctCap * 10) / 10,
      es_traslado: g.es_traslado,
    };
  });

  // Ordenar: por mes/día cronológico, o según el criterio principal (costo/USD, consumo/litros, horas)
  if (agrupacion === 'mes' || agrupacion === 'dia') {
    filas.sort((a, b) => a.id.localeCompare(b.id));
  } else if (ordenarPor === 'usd') {
    filas.sort((a, b) => b.usd - a.usd);
  } else if (ordenarPor === 'horas') {
    filas.sort((a, b) => (b.horas ?? 0) - (a.horas ?? 0));
  } else {
    filas.sort((a, b) => b.litros - a.litros);
  }

  const resumen: ResumenReporteCombustible = {
    totalLitros: Math.round(totalLitros * 100) / 100,
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalHoras: Math.round(totalHoras * 10) / 10,
    totalSurtidos,
    rendimientoPromedio: totalHoras > 0 ? Math.round((totalLitros / totalHoras) * 100) / 100 : 0,
    tasaPromedio: totalLitros > 0 ? Math.round((totalUsd / totalLitros) * 1000) / 1000 : 0,
    totalFilas: filas.length,
    totalEquipos: new Set(movs.map((m) => m.equipoNombre)).size,
    topConsumidores: calcularTopConsumidores(movs, totalLitros),
  };

  return { filas, resumen };
}

function calcularTopConsumidores(movs: MovimientoEnriquecido[], totalLitros: number): TopConsumidorItem[] {
  const map = new Map<string, { litros: number; usd: number }>();
  for (const m of movs) {
    const cur = map.get(m.equipoNombre) ?? { litros: 0, usd: 0 };
    cur.litros += m.litros;
    cur.usd += m.usd;
    map.set(m.equipoNombre, cur);
  }

  return Array.from(map.entries())
    .map(([nombre, { litros, usd }]) => ({
      nombre,
      litros: Math.round(litros * 100) / 100,
      usd: Math.round(usd * 100) / 100,
      porcentaje: totalLitros > 0 ? Math.round((litros / totalLitros) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.litros - a.litros)
    .slice(0, 5);
}
