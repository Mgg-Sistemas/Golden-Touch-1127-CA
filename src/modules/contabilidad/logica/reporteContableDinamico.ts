/* ============================================================
   Golden Touch · Contabilidad · Motor del Reporte Dinámico
   (18/11/2026)

   Motor de datos PURO, DETERMINISTA y SÍNCRONO para el reporte
   dinámico del módulo de Contabilidad. Sigue el estándar de los
   reportes dinámicos del sistema (Compras, Administración):
     - Múltiples dimensiones de agrupación (por comprobante, por
       cuenta contable, por centro de costo, por auxiliar/tercero,
       por tipo de comprobante, detallado asiento por asiento).
     - Valuación bimoneda transparente (VES y USD) con cuadre de
       partida doble en ambas divisas.
     - Presets de fechas (Mes actual, Mes anterior, Ejercicio fiscal,
       Año actual, Todo el historial, Personalizado).
     - Filtros multicriterio: Rango de cuentas, tipo de comprobante,
       centro de costo, auxiliar, estado del comprobante.
     - Selección dinámica de columnas visibles para PDF y Excel.
     - Formatos de salida: Resumen analítico, Detallado o Híbrido.

   REGLA ARQUITECTÓNICA: Aquí NO se hacen llamadas a Supabase ni
   efectos colaterales. Recibe la fuente y devuelve los datos listos.
   ============================================================ */

import type {
  ContAuxiliar, ContCentroCosto, ContComprobante, ContComprobanteLinea,
  ContCuenta, ContTipoComprobante, Moneda,
} from '../tipos';

/* ───────────── Modos de agrupación y presets ───────────── */

export type ModoAgrupacionContable =
  | 'comprobante'
  | 'cuenta'
  | 'centro'
  | 'auxiliar'
  | 'tipo'
  | 'detallado';

export const MODOS_AGRUPACION_CONTABLE: { id: ModoAgrupacionContable; icon: string; label: string }[] = [
  { id: 'comprobante', icon: '📑', label: 'Por Comprobante' },
  { id: 'cuenta', icon: '📒', label: 'Por Cuenta Contable' },
  { id: 'centro', icon: '🏢', label: 'Por Centro de Costo' },
  { id: 'auxiliar', icon: '👥', label: 'Por Tercero / Auxiliar' },
  { id: 'tipo', icon: '🏷️', label: 'Por Tipo de Comprobante' },
  { id: 'detallado', icon: '📋', label: 'Detallado (Asiento por Asiento)' },
];

export const ETIQUETA_MODO_CONTABLE: Record<ModoAgrupacionContable, string> = {
  comprobante: 'Comprobante',
  cuenta: 'Cuenta Contable',
  centro: 'Centro de Costo',
  auxiliar: 'Tercero / Auxiliar',
  tipo: 'Tipo de Comprobante',
  detallado: 'Detallado',
};

export type PresetPeriodoContable =
  | 'mes_actual'
  | 'mes_anterior'
  | 'ejercicio'
  | 'este_ano'
  | 'todos'
  | 'personalizado';

/* ───────────── Catálogo de columnas seleccionables ───────────── */

export interface CampoColumnaContable {
  clave: string;
  etiqueta: string;
  descripcion?: string;
  anchoPdf: number;
  anchoExcel: number;
  alineacion: 'left' | 'right' | 'center';
  formato?: 'texto' | 'numero' | 'moneda' | 'moneda_bs';
}

export const CAMPOS_REPORTE_CONTABLE: CampoColumnaContable[] = [
  { clave: 'fecha', etiqueta: 'Fecha', anchoPdf: 14, anchoExcel: 13, alineacion: 'center', formato: 'texto', descripcion: 'Fecha del comprobante' },
  { clave: 'comprobante', etiqueta: 'Comprobante', anchoPdf: 16, anchoExcel: 15, alineacion: 'center', formato: 'texto', descripcion: 'Código correlativo oficial (Mes-Consecutivo)' },
  { clave: 'tipo', etiqueta: 'Tipo', anchoPdf: 16, anchoExcel: 16, alineacion: 'center', formato: 'texto', descripcion: 'Tipo de comprobante oficial' },
  { clave: 'origen', etiqueta: 'Generado Por', anchoPdf: 16, anchoExcel: 16, alineacion: 'center', formato: 'texto', descripcion: 'Módulo de origen o Usuario' },
  { clave: 'referencia', etiqueta: 'N° Doc. Origen', anchoPdf: 16, anchoExcel: 16, alineacion: 'center', formato: 'texto', descripcion: 'Documento o soporte de origen' },
  { clave: 'descripcion', etiqueta: 'Descripción', anchoPdf: 32, anchoExcel: 30, alineacion: 'left', formato: 'texto', descripcion: 'Concepto del comprobante o renglón' },
  { clave: 'cuenta_codigo', etiqueta: 'Código Cuenta', anchoPdf: 18, anchoExcel: 18, alineacion: 'left', formato: 'texto', descripcion: 'Código contable estructurado' },
  { clave: 'cuenta_nombre', etiqueta: 'Nombre Cuenta', anchoPdf: 28, anchoExcel: 26, alineacion: 'left', formato: 'texto', descripcion: 'Descripción de la cuenta contable' },
  { clave: 'centro', etiqueta: 'Centro de Costo', anchoPdf: 20, anchoExcel: 20, alineacion: 'left', formato: 'texto', descripcion: 'Centro o faena operativa asignada' },
  { clave: 'auxiliar', etiqueta: 'Tercero / Auxiliar', anchoPdf: 22, anchoExcel: 22, alineacion: 'left', formato: 'texto', descripcion: 'Tercero, proveedor o beneficiario' },
  { clave: 'moneda', etiqueta: 'Moneda Doc.', anchoPdf: 12, anchoExcel: 12, alineacion: 'center', formato: 'texto', descripcion: 'Moneda de la transacción' },
  { clave: 'debe_ves', etiqueta: 'Debe (Bs)', anchoPdf: 18, anchoExcel: 17, alineacion: 'right', formato: 'moneda_bs', descripcion: 'Cargos en moneda funcional (VES)' },
  { clave: 'haber_ves', etiqueta: 'Haber (Bs)', anchoPdf: 18, anchoExcel: 17, alineacion: 'right', formato: 'moneda_bs', descripcion: 'Abonos en moneda funcional (VES)' },
  { clave: 'debe_usd', etiqueta: 'Debe ($)', anchoPdf: 18, anchoExcel: 17, alineacion: 'right', formato: 'moneda', descripcion: 'Cargos en moneda referencial (USD)' },
  { clave: 'haber_usd', etiqueta: 'Haber ($)', anchoPdf: 18, anchoExcel: 17, alineacion: 'right', formato: 'moneda', descripcion: 'Abonos en moneda referencial (USD)' },
  { clave: 'saldo_ves', etiqueta: 'Saldo (Bs)', anchoPdf: 18, anchoExcel: 17, alineacion: 'right', formato: 'moneda_bs', descripcion: 'Saldo acumulado en VES (Debe - Haber)' },
  { clave: 'saldo_usd', etiqueta: 'Saldo ($)', anchoPdf: 18, anchoExcel: 17, alineacion: 'right', formato: 'moneda', descripcion: 'Saldo acumulado en USD (Debe - Haber)' },
];

export const CLAVES_COLUMNAS_DEFECTO: string[] = [
  'fecha',
  'comprobante',
  'cuenta_codigo',
  'cuenta_nombre',
  'descripcion',
  'debe_ves',
  'haber_ves',
  'debe_usd',
  'haber_usd',
];

/* ───────────── Estructura de filas del reporte ───────────── */

export interface FilaReporteContable {
  id: string;
  linea_id: string;
  comprobante_id: string;
  fecha: string;
  comprobante: string;
  tipo: string;
  tipo_id: string;
  origen: string;
  referencia: string;
  descripcion: string;
  cuenta_id: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  cuenta_clase: string;
  centro_id: string | null;
  centro: string;
  auxiliar_id: string | null;
  auxiliar: string;
  auxiliar_rif: string | null;
  moneda: Moneda;
  monto_moneda: number;
  tasa: number;
  debe_ves: number;
  haber_ves: number;
  debe_usd: number;
  haber_usd: number;
  saldo_ves: number;
  saldo_usd: number;
}

export interface GrupoReporteContable {
  clave: string;
  etiqueta: string;
  subetiqueta?: string;
  totalAsientos: number;
  debe_ves: number;
  haber_ves: number;
  debe_usd: number;
  haber_usd: number;
  saldo_ves: number;
  saldo_usd: number;
  filas: FilaReporteContable[];
}

export interface ResumenReporteContable {
  totalComprobantes: number;
  totalAsientos: number;
  totalDebeVes: number;
  totalHaberVes: number;
  totalDebeUsd: number;
  totalHaberUsd: number;
  diferenciaVes: number;
  diferenciaUsd: number;
  cuadra: boolean;
  porTipo: Array<{ tipo: string; cantidad: number; totalVes: number; totalUsd: number }>;
  topCuentas: Array<{ codigo: string; nombre: string; movimientoVes: number; movimientoUsd: number }>;
}

export interface ReporteContableGenerado {
  grupos: GrupoReporteContable[];
  filas: FilaReporteContable[];
  resumen: ResumenReporteContable;
  config: ConfiguracionFiltroContable;
}

export interface ConfiguracionFiltroContable {
  empresaClave: string;
  empresaNombre?: string;
  empresaRif?: string | null;
  desde: string;
  hasta: string;
  agrupacion: ModoAgrupacionContable;
  columnasVisibles: string[];
  soloContabilizados?: boolean;
  tipoComprobanteId?: string;
  cuentaId?: string;
  centroCostoId?: string;
  auxiliarId?: string;
  busqueda?: string;
  monedaVista: 'todas' | 'VES' | 'USD';
}

export interface FuenteReporteContable {
  comprobantes: ContComprobante[];
  lineas: ContComprobanteLinea[];
  cuentas: ContCuenta[];
  centros?: ContCentroCosto[];
  auxiliares?: ContAuxiliar[];
  tipos?: ContTipoComprobante[];
}

/* ───────────── Funciones de cálculo y agregación ───────────── */

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export function calcularRangoPreset(preset: PresetPeriodoContable, fechaInicioEjercicio?: string): { desde: string; hasta: string } {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();

  const toIso = (d: Date) => d.toISOString().slice(0, 10);

  switch (preset) {
    case 'mes_actual': {
      const d1 = new Date(y, m, 1);
      const d2 = new Date(y, m + 1, 0);
      return { desde: toIso(d1), hasta: toIso(d2) };
    }
    case 'mes_anterior': {
      const d1 = new Date(y, m - 1, 1);
      const d2 = new Date(y, m, 0);
      return { desde: toIso(d1), hasta: toIso(d2) };
    }
    case 'este_ano': {
      return { desde: `${y}-01-01`, hasta: toIso(hoy) };
    }
    case 'ejercicio': {
      if (fechaInicioEjercicio) {
        return { desde: fechaInicioEjercicio, hasta: toIso(hoy) };
      }
      return { desde: `${y}-01-01`, hasta: toIso(hoy) };
    }
    case 'todos':
    default:
      return { desde: '2020-01-01', hasta: toIso(hoy) };
  }
}

/** Genera la vista completa del reporte dinámico de forma síncrona y pura. */
export function generarReporteContableDinamico(
  fuente: FuenteReporteContable,
  config: ConfiguracionFiltroContable,
): ReporteContableGenerado {
  const mapaCuentas = new Map(fuente.cuentas.map((c) => [c.id, c]));
  const mapaCentros = new Map((fuente.centros ?? []).map((c) => [c.id, c]));
  const mapaAuxiliares = new Map((fuente.auxiliares ?? []).map((a) => [a.id, a]));
  const mapaTipos = new Map((fuente.tipos ?? []).map((t) => [t.id, t.nombre]));

  // 1. Filtrar comprobantes por empresa, rango de fechas y estado
  const comprobantesValidos = fuente.comprobantes.filter((c) => {
    if (config.empresaClave && c.empresa_clave && c.empresa_clave !== config.empresaClave) return false;
    if (config.soloContabilizados !== false && c.estado !== 'contabilizado') return false;
    if (config.tipoComprobanteId && c.tipo_id !== config.tipoComprobanteId) return false;
    if (config.desde && c.fecha < config.desde) return false;
    if (config.hasta && c.fecha > config.hasta) return false;
    return true;
  });

  const mapaComprobantes = new Map(comprobantesValidos.map((c) => [c.id, c]));
  const cbtesIds = new Set(comprobantesValidos.map((c) => c.id));

  // 2. Extraer líneas de comprobantes válidos
  let lineasFiltradas = fuente.lineas.filter((l) => cbtesIds.has(l.comprobante_id));

  if (config.cuentaId) {
    lineasFiltradas = lineasFiltradas.filter((l) => l.cuenta_id === config.cuentaId);
  }
  if (config.centroCostoId) {
    lineasFiltradas = lineasFiltradas.filter((l) => l.centro_costo_id === config.centroCostoId);
  }
  if (config.auxiliarId) {
    lineasFiltradas = lineasFiltradas.filter((l) => l.auxiliar_id === config.auxiliarId);
  }

  const busqueda = (config.busqueda || '').toLowerCase().trim();

  // 3. Transformar a filas completas del reporte
  let saldoCorridoVes = 0;
  let saldoCorridoUsd = 0;

  const filas: FilaReporteContable[] = [];

  // Orden cronológico por fecha, comprobante y renglón
  const lineasOrdenadas = [...lineasFiltradas].sort((a, b) => {
    const cbteA = mapaComprobantes.get(a.comprobante_id);
    const cbteB = mapaComprobantes.get(b.comprobante_id);
    const fA = cbteA?.fecha ?? '';
    const fB = cbteB?.fecha ?? '';
    if (fA !== fB) return fA.localeCompare(fB);
    const cA = cbteA?.codigo ?? '';
    const cB = cbteB?.codigo ?? '';
    if (cA !== cB) return cA.localeCompare(cB);
    return a.renglon - b.renglon;
  });

  for (const l of lineasOrdenadas) {
    const cbte = mapaComprobantes.get(l.comprobante_id);
    if (!cbte) continue;

    const cta = mapaCuentas.get(l.cuenta_id);
    const cen = l.centro_costo_id ? mapaCentros.get(l.centro_costo_id) : undefined;
    const aux = l.auxiliar_id ? mapaAuxiliares.get(l.auxiliar_id) : undefined;
    const tipoNombre = mapaTipos.get(cbte.tipo_id) ?? cbte.tipo_id;

    const fecha = cbte.fecha;
    const cbteCodigo = cbte.codigo;
    const desc = l.descripcion || cbte.concepto || '';
    const ctaCodigo = cta?.codigo ?? '—';
    const ctaNombre = cta?.nombre ?? 'Cuenta no encontrada';
    const cenNombre = cen ? `${cen.codigo} · ${cen.nombre}` : '—';
    const auxNombre = aux ? `${aux.codigo} · ${aux.nombre}` : '—';

    // Búsqueda textual
    if (busqueda) {
      const match =
        cbteCodigo.toLowerCase().includes(busqueda) ||
        desc.toLowerCase().includes(busqueda) ||
        ctaCodigo.toLowerCase().includes(busqueda) ||
        ctaNombre.toLowerCase().includes(busqueda) ||
        cenNombre.toLowerCase().includes(busqueda) ||
        auxNombre.toLowerCase().includes(busqueda) ||
        (l.referencia || '').toLowerCase().includes(busqueda);
      if (!match) continue;
    }

    const dVes = l.debe_ves;
    const hVes = l.haber_ves;
    const dUsd = l.debe_usd;
    const hUsd = l.haber_usd;

    saldoCorridoVes = round2(saldoCorridoVes + (dVes - hVes));
    saldoCorridoUsd = round2(saldoCorridoUsd + (dUsd - hUsd));

    filas.push({
      id: `${l.comprobante_id}-${l.id}`,
      linea_id: l.id,
      comprobante_id: l.comprobante_id,
      fecha,
      comprobante: cbteCodigo,
      tipo: tipoNombre,
      tipo_id: cbte.tipo_id,
      origen: cbte.origen_modulo ? cbte.origen_modulo : (cbte.origen === 'manual' ? 'Manual' : (cbte.origen === 'cierre' ? 'Cierre' : 'Módulo')),
      referencia: l.referencia || cbte.origen_ref || '—',
      descripcion: desc,
      cuenta_id: l.cuenta_id,
      cuenta_codigo: ctaCodigo,
      cuenta_nombre: ctaNombre,
      cuenta_clase: cta?.clase ?? 'activo',
      centro_id: l.centro_costo_id,
      centro: cenNombre,
      auxiliar_id: l.auxiliar_id,
      auxiliar: auxNombre,
      auxiliar_rif: aux?.rif ?? null,
      moneda: l.moneda,
      monto_moneda: l.monto_moneda,
      tasa: l.tasa,
      debe_ves: dVes,
      haber_ves: hVes,
      debe_usd: dUsd,
      haber_usd: hUsd,
      saldo_ves: saldoCorridoVes,
      saldo_usd: saldoCorridoUsd,
    });
  }

  // 4. Agrupación según la dimensión elegida
  const mapaGrupos = new Map<string, GrupoReporteContable>();

  for (const f of filas) {
    let claveGrupo = '';
    let etiquetaGrupo = '';
    let subetiquetaGrupo: string | undefined = undefined;

    switch (config.agrupacion) {
      case 'comprobante':
        claveGrupo = f.comprobante_id;
        etiquetaGrupo = `Comprobante ${f.comprobante} · ${f.tipo}`;
        subetiquetaGrupo = `Fecha: ${f.fecha} | Ref: ${f.referencia}`;
        break;
      case 'cuenta':
        claveGrupo = f.cuenta_codigo;
        etiquetaGrupo = `${f.cuenta_codigo} - ${f.cuenta_nombre}`;
        subetiquetaGrupo = `Clase: ${f.cuenta_clase.toUpperCase()}`;
        break;
      case 'centro':
        claveGrupo = f.centro_id ?? 'sin_centro';
        etiquetaGrupo = f.centro !== '—' ? f.centro : 'Sin Centro de Costo asignado';
        break;
      case 'auxiliar':
        claveGrupo = f.auxiliar_id ?? 'sin_auxiliar';
        etiquetaGrupo = f.auxiliar !== '—' ? f.auxiliar : 'Sin Auxiliar / Tercero asignado';
        if (f.auxiliar_rif) subetiquetaGrupo = `RIF: ${f.auxiliar_rif}`;
        break;
      case 'tipo':
        claveGrupo = f.tipo_id;
        etiquetaGrupo = `Tipo de Comprobante: ${f.tipo}`;
        break;
      case 'detallado':
      default:
        claveGrupo = 'todos';
        etiquetaGrupo = 'Detallado General de Movimientos';
        break;
    }

    let g = mapaGrupos.get(claveGrupo);
    if (!g) {
      g = {
        clave: claveGrupo,
        etiqueta: etiquetaGrupo,
        subetiqueta: subetiquetaGrupo,
        totalAsientos: 0,
        debe_ves: 0,
        haber_ves: 0,
        debe_usd: 0,
        haber_usd: 0,
        saldo_ves: 0,
        saldo_usd: 0,
        filas: [],
      };
      mapaGrupos.set(claveGrupo, g);
    }

    g.totalAsientos += 1;
    g.debe_ves = round2(g.debe_ves + f.debe_ves);
    g.haber_ves = round2(g.haber_ves + f.haber_ves);
    g.debe_usd = round2(g.debe_usd + f.debe_usd);
    g.haber_usd = round2(g.haber_usd + f.haber_usd);
    g.saldo_ves = round2(g.saldo_ves + (f.debe_ves - f.haber_ves));
    g.saldo_usd = round2(g.saldo_usd + (f.debe_usd - f.haber_usd));
    g.filas.push(f);
  }

  const grupos = [...mapaGrupos.values()];

  // 5. Resumen analítico y KPIs ejecutivos
  let tDebeVes = 0;
  let tHaberVes = 0;
  let tDebeUsd = 0;
  let tHaberUsd = 0;

  const porTipoMap = new Map<string, { tipo: string; cantidad: number; totalVes: number; totalUsd: number }>();
  const topCuentasMap = new Map<string, { codigo: string; nombre: string; movimientoVes: number; movimientoUsd: number }>();

  for (const f of filas) {
    tDebeVes = round2(tDebeVes + f.debe_ves);
    tHaberVes = round2(tHaberVes + f.haber_ves);
    tDebeUsd = round2(tDebeUsd + f.debe_usd);
    tHaberUsd = round2(tHaberUsd + f.haber_usd);

    // Desglose por tipo
    const itemTipo = porTipoMap.get(f.tipo) ?? { tipo: f.tipo, cantidad: 0, totalVes: 0, totalUsd: 0 };
    itemTipo.cantidad += 1;
    itemTipo.totalVes = round2(itemTipo.totalVes + f.debe_ves);
    itemTipo.totalUsd = round2(itemTipo.totalUsd + f.debe_usd);
    porTipoMap.set(f.tipo, itemTipo);

    // Top cuentas con mayor movimiento
    const itemCta = topCuentasMap.get(f.cuenta_codigo) ?? { codigo: f.cuenta_codigo, nombre: f.cuenta_nombre, movimientoVes: 0, movimientoUsd: 0 };
    const movV = f.debe_ves + f.haber_ves;
    const movU = f.debe_usd + f.haber_usd;
    itemCta.movimientoVes = round2(itemCta.movimientoVes + movV);
    itemCta.movimientoUsd = round2(itemCta.movimientoUsd + movU);
    topCuentasMap.set(f.cuenta_codigo, itemCta);
  }

  const difVes = round2(tDebeVes - tHaberVes);
  const difUsd = round2(tDebeUsd - tHaberUsd);
  const cbtesUnicos = new Set(filas.map((f) => f.comprobante_id)).size;

  const resumen: ResumenReporteContable = {
    totalComprobantes: cbtesUnicos,
    totalAsientos: filas.length,
    totalDebeVes: tDebeVes,
    totalHaberVes: tHaberVes,
    totalDebeUsd: tDebeUsd,
    totalHaberUsd: tHaberUsd,
    diferenciaVes: difVes,
    diferenciaUsd: difUsd,
    cuadra: Math.abs(difVes) <= 0.05 && Math.abs(difUsd) <= 0.05,
    porTipo: [...porTipoMap.values()].sort((a, b) => b.totalVes - a.totalVes),
    topCuentas: [...topCuentasMap.values()].sort((a, b) => b.movimientoVes - a.movimientoVes).slice(0, 5),
  };

  return {
    grupos,
    filas,
    resumen,
    config,
  };
}
