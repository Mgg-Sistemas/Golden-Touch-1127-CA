/* ============================================================
   Conciliación · lectura de datos (12/11/2026). SOLO LECTURA.

   Junta lo que la lógica pura (conciliacion.ts) necesita:
     · las OC de Compras que ya tienen código de OC;
     · el nombre de cada proveedor;
     · los egresos de pago de cada OC (movimientos_caja, pago_oc), de donde
       salen la referencia del pago y la tasa;
     · las retenciones practicadas del libro fiscal ligadas a una OC;
     · la tasa BCV de cada día de pago y la de hoy.

   Los pagos los deja leer la base a quien ve Tesorería (o Pedidos·base). Si el
   usuario no los puede leer, la tabla igual sale, sin referencias.
   ============================================================ */

import { supabase } from '@/shared/lib/supabase';
import { todasLasFilas } from '@/shared/lib/todasLasFilas';
import type { Orden } from '@/shared/lib/types';
import { listProveedores } from '@/modules/pedidos/pedidos.repository';
import { listRetenciones } from '@/modules/libroFiscal/retencionesFiscal.repository';
import { diaVE, getTasaHoy, getTasasUsdDeFechas } from '@/modules/tesoreria/tasas.repository';
import { armarFilas, type FilaConciliacion, type PagoOc, type RetencionLibro } from './conciliacion';

export interface DatosConciliacion {
  filas: FilaConciliacion[];
  /** Las OC tal cual (para abrir la factura con FacturasOcModal). */
  ordenes: Map<string, Orden>;
  /** Avisos de lo que no se pudo leer (permisos o red): la tabla sale igual. */
  avisos: string[];
}

const LOTE_IDS = 150;

async function pagosDeOrdenes(ids: string[]): Promise<PagoOc[]> {
  const out: PagoOc[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS);
    const { data, error } = await supabase.from('movimientos_caja')
      .select('ref_orden_id, monto, moneda, motivo, at')
      .in('ref_orden_id', lote)
      .eq('tipo', 'salida')
      .eq('categoria', 'pago_oc')
      .order('at', { ascending: true });
    if (error) throw error;
    for (const r of (data ?? []) as { ref_orden_id: string; monto: number; moneda: string; motivo: string | null; at: string | null }[]) {
      out.push({ ordenId: r.ref_orden_id, monto: Number(r.monto) || 0, moneda: r.moneda ?? 'USD', motivo: r.motivo, at: r.at });
    }
  }
  return out;
}

function agrupar<T extends { ordenId: string }>(xs: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const l = m.get(x.ordenId);
    if (l) l.push(x); else m.set(x.ordenId, [x]);
  }
  return m;
}

export async function cargarConciliacion(): Promise<DatosConciliacion> {
  const avisos: string[] = [];

  // Las OC (con código de OC), de la más nueva a la más vieja.
  const ordenes = await todasLasFilas<Orden>((desde, hasta) => supabase.from('ordenes')
    .select('*')
    .not('oc_codigo', 'is', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(desde, hasta) as unknown as PromiseLike<{ data: Orden[] | null; error: import('@supabase/supabase-js').PostgrestError | null }>);
  const ids = ordenes.map((o) => o.id);

  const [proveedores, pagos, retenciones, tasaHoy] = await Promise.all([
    listProveedores().catch(() => { avisos.push('No se pudieron leer los proveedores.'); return []; }),
    pagosDeOrdenes(ids).catch(() => {
      avisos.push('No tienes acceso a los pagos de Tesorería: las referencias y la tasa del pago no se muestran.');
      return [] as PagoOc[];
    }),
    listRetenciones({ direccion: 'practicada' }).catch(() => {
      avisos.push('No se pudo leer el libro de retenciones: solo se muestran las retenciones indicadas en Compras.');
      return [];
    }),
    getTasaHoy().catch(() => null),
  ]);

  const libro: RetencionLibro[] = retenciones
    .filter((r) => r.docKind === 'oc' && r.docId)
    .map((r) => ({ ordenId: r.docId as string, tipo: r.tipo, comprobante: r.numeroComprobante, monto: r.montoRetenido, moneda: r.moneda ?? null }));

  const pagosPorOrden = agrupar(pagos);
  const diasPago = ordenes
    .map((o) => o.pagada_en ?? pagosPorOrden.get(o.id)?.[0]?.at ?? null)
    .filter((x): x is string => !!x)
    .map((iso) => diaVE(iso));
  const bcvPorDia = await getTasasUsdDeFechas(diasPago).catch(() => new Map<string, number>());

  const filas = armarFilas(ordenes, {
    proveedores: new Map(proveedores.map((p) => [p.id, p.razon_social])),
    pagos: pagosPorOrden,
    retenciones: agrupar(libro),
    bcvPorDia,
    bcvHoy: tasaHoy?.usd ?? null,
    dia: diaVE,
  });

  return { filas, ordenes: new Map(ordenes.map((o) => [o.id, o])), avisos };
}
