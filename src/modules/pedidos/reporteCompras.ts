/* ============================================================
   Golden Touch · Compras · Reporte por estado
   Agrupa las OC del ciclo pendiente en los cuatro renglones que
   se imprimen:
     · Pendiente por Aprobar        (oc_creada)
     · Cuentas a crédito            (cuenta_abierta)
     · Por indicar método de pago   (confirmada_metodo)
     · Por pagar                    (oc_aprobada)
   Cada renglón lleva su código, el motivo de la compra y el
   monto en su moneda ($ o Bs).
   ============================================================ */
import type { EstadoOrden, Orden } from '@/shared/lib/types';

export type EstadoReporteCompras = Extract<
  EstadoOrden,
  'oc_creada' | 'cuenta_abierta' | 'confirmada_metodo' | 'oc_aprobada'
>;

export interface GrupoReporteCompras {
  estado: EstadoReporteCompras;
  titulo: string;
  /** Aclaración corta que se imprime debajo del título. */
  nota: string;
}

/** Orden en que salen los cuatro renglones del reporte. */
export const GRUPOS_REPORTE_COMPRAS: readonly GrupoReporteCompras[] = [
  {
    estado: 'oc_creada',
    titulo: 'PENDIENTE POR APROBAR',
    nota: 'OC creada: espera la aprobación del Gerente General.',
  },
  {
    estado: 'cuenta_abierta',
    titulo: 'CUENTAS A CRÉDITO',
    nota: 'Compra a crédito: se salda por abonos. El monto es el saldo pendiente.',
  },
  {
    estado: 'confirmada_metodo',
    titulo: 'POR INDICAR MÉTODO DE PAGO',
    nota: 'Aprobada por el Gerente General: Compras debe indicar cómo se paga.',
  },
  {
    estado: 'oc_aprobada',
    titulo: 'POR PAGAR',
    nota: 'Método indicado: lista para pagar en Tesorería.',
  },
];

export interface RenglonReporteCompras {
  orden: Orden;
  codigo: string;
  motivo: string;
  /** Monto en la moneda de la orden (en crédito, el saldo pendiente). */
  monto: number;
  moneda: 'USD' | 'Bs';
}

export interface GrupoReporteComprasConFilas extends GrupoReporteCompras {
  filas: RenglonReporteCompras[];
}

const texto = (s: string | null | undefined): string => String(s ?? '').trim();

/** Motivo de la compra. En la práctica el «porqué» vive en `notas` (la descripción
 *  con que se levanta la solicitud): casi ninguna OC trae `motivo`/`finalidad`, así
 *  que se consultan en ese orden y recién después se cae a los renglones. */
export function motivoReporteCompras(o: Orden): string {
  const directos = [texto(o.motivo), texto(o.finalidad)].filter(Boolean);
  if (directos.length) return [...new Set(directos)].join(' · ');

  const notas = texto(o.notas);
  if (notas) return notas;

  const porItem = (o.items ?? []).map((i) => texto(i.finalidad)).filter(Boolean);
  if (porItem.length) return [...new Set(porItem)].join(' · ');

  const nombres = (o.items ?? []).map((i) => texto(i.nombre)).filter(Boolean);
  if (nombres.length) return nombres.join(', ');

  return '—';
}

/** Monto del renglón. En cuentas a crédito se muestra lo que aún se debe. */
export function montoReporteCompras(o: Orden): number {
  const total = Number(o.total) || 0;
  if (o.estado !== 'cuenta_abierta') return total;
  const abonado = Number(o.abonado_total) || 0;
  return Math.max(0, Math.round((total - abonado) * 100) / 100);
}

/** Moneda en la que está expresado el monto de la orden. */
export function monedaReporteCompras(o: Orden): 'USD' | 'Bs' {
  return o.total_moneda === 'Bs' ? 'Bs' : 'USD';
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100;

/** Convierte un monto a su equivalente en $ y Bs con la tasa BCV del día. */
export function aDolaresYBolivares(
  monto: number,
  moneda: 'USD' | 'Bs',
  tasa: number,
): { usd: number; bs: number } {
  const n = Number(monto) || 0;
  const t = Number(tasa) || 0;
  if (moneda === 'Bs') return { usd: t > 0 ? redondear2(n / t) : 0, bs: redondear2(n) };
  return { usd: redondear2(n), bs: t > 0 ? redondear2(n * t) : 0 };
}

/** Arma los cuatro renglones, cada uno con sus órdenes ordenadas por código. */
export function agruparReporteCompras(ordenes: Orden[]): GrupoReporteComprasConFilas[] {
  return GRUPOS_REPORTE_COMPRAS.map((grupo) => ({
    ...grupo,
    filas: ordenes
      .filter((o) => o.estado === grupo.estado)
      .map((o) => ({
        orden: o,
        codigo: texto(o.oc_codigo) || texto(o.codigo) || '—',
        motivo: motivoReporteCompras(o) || '—',
        monto: montoReporteCompras(o),
        moneda: monedaReporteCompras(o),
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true, sensitivity: 'base' })),
  }));
}
