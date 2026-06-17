/* ============================================================
   Golden Touch · Centro de Acopio · Cálculo de movimientos
   Construye las filas de la tabla de movimientos y el resumen de
   las tarjetas, SCOPEADO a una caja (cierre). Lo usan tanto la vista
   (`MovimientosAcopioView`) como el cierre de caja (`cerrarYAbrirCaja`),
   para que ambos vean exactamente lo mismo.

   Reglas de scope por caja:
   · Movimientos: los de la caja (`caja_id === caja.id`). En la caja ABIERTA
     se incluyen además los sin asignar (`caja_id == null`, legado).
   · Contratos: por ventana de fecha de la caja (desde `fecha_inicio`; en una
     caja cerrada, hasta `fecha_fin`).
   · El saldo en Kg arranca en `caja.saldo_inicial_kg` (saldo viejo arrastrado).
   · El saldo en USD arranca en 0: lo arrastrado viene como un movimiento de
     «USD entregados» (la fila «Saldo anterior») dentro de la caja nueva.
   ============================================================ */
import type { CajaCierre, CajaMovimiento, ContratoAcopio } from '@/shared/lib/types';

export interface FilaMov {
  id: string;
  contratoId?: string;
  fecha: string;
  descripcion: string;
  usdEntregado: number | null;
  kgCerrados: number;
  precioUsdKg: number | null;
  usdFacturados: number;
  gastosGt: number | null;
  nominasGt: number | null;
  trasladoCaja: number | null;
  saldoUsd: number;
  kgRecibidosMgg: number | null;
  saldoKgCasiterita: number;
}

export interface ResumenAcopio {
  saldoKg: number;
  tasa: number;
  usdEntregado: number;
  saldoUsd: number;
  gastos: number;
  nominas: number;
  facturado: number;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** ¿El movimiento entra en el scope de la caja? */
function movEnScope(m: CajaMovimiento, caja: CajaCierre | null, esHistorico: boolean): boolean {
  if (!caja) return true;                                  // sin caja → comportamiento legado (todo)
  if (esHistorico) return m.caja_id === caja.id;           // caja cerrada → solo lo congelado en ella
  return m.caja_id === caja.id || m.caja_id == null;       // caja abierta → lo suyo + lo sin asignar
}

/** ¿El contrato (por fecha) entra en la ventana de la caja? */
function contratoEnScope(c: ContratoAcopio, caja: CajaCierre | null, esHistorico: boolean): boolean {
  if (!caja) return true;
  const f = c.fecha ?? '';
  if (caja.fecha_inicio && f < caja.fecha_inicio) return false;
  if (esHistorico && caja.fecha_fin && f > caja.fecha_fin) return false;
  return true;
}

/**
 * Construye las filas de movimientos (orden cronológico, con saldos corridos) y
 * el resumen de las tarjetas, scopeado a `caja`. `esHistorico=true` para ver una
 * caja ya cerrada (no incluye movimientos sin asignar).
 */
export function construirMovimientosAcopio(args: {
  contratos: ContratoAcopio[];
  cajaMovs: CajaMovimiento[];
  caja: CajaCierre | null;
  esHistorico?: boolean;
}): { filas: FilaMov[]; resumen: ResumenAcopio } {
  const { contratos, cajaMovs, caja, esHistorico = false } = args;

  type Evt = { t: 'c'; c: ContratoAcopio } | { t: 'm'; m: CajaMovimiento };
  const evts: Evt[] = [
    ...contratos.filter((c) => c.estado === 'cerrado' && contratoEnScope(c, caja, esHistorico)).map((c) => ({ t: 'c' as const, c })),
    ...cajaMovs.filter((m) => movEnScope(m, caja, esHistorico)).map((m) => ({ t: 'm' as const, m })),
  ];
  const fechaDe = (e: Evt) => (e.t === 'c' ? e.c.fecha : e.m.fecha) ?? '';
  const seqDe = (e: Evt) => (e.t === 'c' ? e.c.seq : 0);
  evts.sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)) || (seqDe(a) - seqDe(b)));

  // Saldo Kg arranca en el saldo de apertura arrastrado; saldo USD arranca en 0
  // (lo arrastrado entra como movimiento de «USD entregados»).
  let saldoKg = n(caja?.saldo_inicial_kg);
  let saldoUsd = 0;
  const filas = evts.map((e): FilaMov => {
    if (e.t === 'c') {
      const kg = n(e.c.kg_seco_limpio);
      saldoKg = saldoKg + kg;
      return {
        id: `c-${e.c.id}`, contratoId: e.c.id, fecha: e.c.fecha,
        descripcion: `CONTRATO PRODUCCIÓN GT - #${e.c.seq}`,
        usdEntregado: null, kgCerrados: kg, precioUsdKg: null, usdFacturados: 0,
        gastosGt: null, nominasGt: null, trasladoCaja: null,
        saldoUsd, kgRecibidosMgg: null, saldoKgCasiterita: saldoKg,
      };
    }
    const m = e.m;
    const entregado = n(m.usd_entregado);
    const facturados = n(m.facturados);
    const gastos = n(m.gastos);
    const nominas = n(m.nominas);
    const traslado = n(m.traslado);
    const kgc = n(m.kg_cerrados);
    const mgg = n(m.kg_recibidos);
    saldoUsd = saldoUsd + entregado - facturados - gastos - nominas - traslado;
    saldoKg = saldoKg + kgc - mgg;
    return {
      id: `m-${m.id}`, fecha: m.fecha, descripcion: m.descripcion || 'Movimiento de caja',
      usdEntregado: entregado || null, kgCerrados: kgc, precioUsdKg: null, usdFacturados: facturados,
      gastosGt: gastos || null, nominasGt: nominas || null, trasladoCaja: traslado || null,
      saldoUsd, kgRecibidosMgg: mgg || null, saldoKgCasiterita: saldoKg,
    };
  });

  const totalKg = filas.reduce((a, f) => a + f.kgCerrados, 0);
  const totalFacturado = filas.reduce((a, f) => a + (f.usdFacturados ?? 0), 0);
  const totalGastos = filas.reduce((a, f) => a + (f.gastosGt ?? 0), 0);
  const totalNominas = filas.reduce((a, f) => a + (f.nominasGt ?? 0), 0);
  const totalUsdEntregado = filas.reduce((a, f) => a + (f.usdEntregado ?? 0), 0);
  const saldoKgFinal = filas.length ? filas[filas.length - 1].saldoKgCasiterita : saldoKg;
  const saldoUsdFinal = filas.length ? filas[filas.length - 1].saldoUsd : 0;
  const tasa = totalKg !== 0 ? (totalFacturado + totalGastos + totalNominas) / totalKg : 0;

  return {
    filas,
    resumen: {
      saldoKg: saldoKgFinal, tasa, usdEntregado: totalUsdEntregado, saldoUsd: saldoUsdFinal,
      gastos: totalGastos, nominas: totalNominas, facturado: totalFacturado,
    },
  };
}
