/* ============================================================
   Golden Touch · Tesorería · Filtros del registro de movimientos

   Los filtros de la pestaña "Movimientos" (billetera, moneda, tipo y rango de
   fechas) los resolvía el servidor: cada cambio volvía a consultar y, de paso,
   arrastraba la recarga entera de la pantalla (una veintena de pedidos) mientras
   la tabla quedaba en "Cargando…".

   Como la pantalla YA tiene en memoria todos los movimientos vigentes, filtrar
   acá da el mismo resultado sin red. La equivalencia con el filtro anterior es
   exacta porque la base trabaja en UTC y la fecha ISO que llega al navegador
   también: comparar el día recortado (AAAA-MM-DD) equivale al
   `at >= desdeT00:00:00` / `at <= hastaT23:59:59` que hacía Postgres.
   ============================================================ */
import type { MovimientoCaja } from '@/shared/lib/types';

export interface FiltrosMovimientos {
  /** Id de la billetera/caja. */
  caja?: string;
  moneda?: string;
  tipo?: string;
  /** Día inclusive, AAAA-MM-DD. */
  desde?: string;
  /** Día inclusive, AAAA-MM-DD. */
  hasta?: string;
}

/** ¿Hay algún filtro puesto? Sin ninguno se devuelve la lista tal cual. */
export function hayFiltros(f: FiltrosMovimientos): boolean {
  return Boolean(f.caja || f.moneda || f.tipo || f.desde || f.hasta);
}

/** Aplica los filtros del registro sobre los movimientos ya cargados. */
export function filtrarMovimientos<T extends Pick<MovimientoCaja, 'caja_id' | 'moneda' | 'tipo' | 'at'>>(
  movimientos: T[],
  f: FiltrosMovimientos,
): T[] {
  if (!hayFiltros(f)) return movimientos;
  return movimientos.filter((m) => {
    if (f.caja && m.caja_id !== f.caja) return false;
    if (f.moneda && m.moneda !== f.moneda) return false;
    if (f.tipo && m.tipo !== f.tipo) return false;
    const dia = (m.at ?? '').slice(0, 10);
    if (f.desde && dia < f.desde) return false;
    if (f.hasta && dia > f.hasta) return false;
    return true;
  });
}
