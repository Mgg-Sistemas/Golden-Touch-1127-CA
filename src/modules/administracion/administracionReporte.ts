/* ============================================================================
   Golden Touch · Administración · reporte del histórico (datos puros)
   El estándar del sistema: UNA lectura → UN armado → varias salidas (WhatsApp,
   PDF, Excel), todas diciendo lo mismo. Toma los movimientos YA filtrados y
   arma el objeto que consumen los tres generadores. Sin React, determinista.
   ============================================================================ */
import { agruparTotales, totalGeneral, type GrupoTotal, type Moneda, type MovimientoCalc } from './administracionCalculo';
import type { Empresa, Movimiento, OpcionRef } from './admin.repository';

export interface ReporteAdminFila {
  fecha: string;
  empresa: string;
  concepto: string;
  categoria: string;
  monto: number;
  moneda: Moneda;
  periodo: string;
  estadoPago: string;
  origen: string;
}
export interface ReporteAdminMeta {
  /** Razón social de la empresa elegida, o null = todas. */
  empresaNombre: string | null;
  /** Alcance del reporte, p. ej. «Octubre 2026» o «Todo el histórico». */
  alcanceLabel: string;
  /** Bs por 1 USD, para los equivalentes. */
  tasa: number;
  /** ISO del momento en que se armó. */
  generadoEn: string;
}
export interface ReporteAdminData {
  meta: ReporteAdminMeta;
  total: Omit<GrupoTotal, 'clave'>;
  porCategoria: GrupoTotal[];
  porEmpresa: GrupoTotal[];
  porMoneda: GrupoTotal[];
  filas: ReporteAdminFila[];
}

const ESTADO_LABEL: Record<string, string> = { pagado: 'Pagado', pendiente: 'Pendiente', anulado: 'Anulado' };
const ORIGEN_LABEL: Record<string, string> = { generado: 'Generado', importado: 'Importado', manual: 'Manual' };
export const estadoPagoLabel = (e: string): string => ESTADO_LABEL[e] ?? e;
export const origenLabel = (o: string): string => ORIGEN_LABEL[o] ?? o;

/** Arma el reporte a partir de los movimientos YA filtrados (período/moneda). */
export function armarReporteAdmin(
  movs: readonly Movimiento[],
  empresas: readonly Empresa[],
  categorias: readonly OpcionRef[],
  o: { empresaNombre: string | null; alcanceLabel: string; tasa: number; generadoEn?: string },
): ReporteAdminData {
  const nombreEmp = new Map(empresas.map((e) => [e.clave, e.nombre]));
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre]));
  const empOf = (m: Movimiento) => nombreEmp.get(m.empresaClave) ?? m.empresaClave;
  const catOf = (m: Movimiento) => (m.categoriaGastoId ? nombreCat.get(m.categoriaGastoId) ?? 'Sin categoría' : 'Sin categoría');
  const calc: MovimientoCalc[] = movs.map((m) => ({ empresaClave: empOf(m), categoria: catOf(m), moneda: m.moneda, monto: m.monto }));
  return {
    meta: { empresaNombre: o.empresaNombre, alcanceLabel: o.alcanceLabel, tasa: o.tasa, generadoEn: o.generadoEn ?? new Date().toISOString() },
    total: totalGeneral(calc, o.tasa),
    porCategoria: agruparTotales(calc, 'categoria', { tasa: o.tasa }),
    porEmpresa: agruparTotales(calc, 'empresa', { tasa: o.tasa }),
    porMoneda: agruparTotales(calc, 'moneda', { tasa: o.tasa }),
    filas: movs.map((m) => ({
      fecha: m.fecha, empresa: empOf(m), concepto: m.concepto, categoria: catOf(m),
      monto: m.monto, moneda: m.moneda, periodo: m.periodo, estadoPago: m.estadoPago, origen: m.origen,
    })),
  };
}

/** Nombre de archivo sugerido (slug del alcance), para PDF/Excel. */
export function nombreArchivoReporteAdmin(alcanceLabel: string, ext: 'pdf' | 'xlsx'): string {
  const slug = alcanceLabel.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'reporte';
  return `reporte-gastos-${slug}.${ext}`;
}
