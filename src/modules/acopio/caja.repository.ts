/* ============================================================
   Golden Touch · Centro de Acopio · CAJA PERAMANAL (Supabase)
   Libro de caja (réplica de la hoja "CAJA PERAMANAL - GOLDEN TOUCH").
   · Cada movimiento se clasifica en uno de los 5 grupos (CLASIFICACIONES).
   · La TASA del material se deriva de los agregados:
       tasa = (Σ facturados + Σ gastos + Σ nominas) / Σ kg_cerrados
   · Los saldos corrientes (K y M del Excel) se calculan acá al listar.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { CajaCierre, CajaMovimiento, CajaResumen, ClasificacionAcopio, CostoClase, GrupoClasificacion, TransferenciaInter } from '@/shared/lib/types';

export const GRUPOS: { key: GrupoClasificacion; label: string; color: string }[] = [
  { key: 'movimientos_caja', label: 'Movimientos de Caja', color: '#3b82f6' },
  { key: 'contratos',        label: 'Contratos',           color: '#22c55e' },
  { key: 'gastos_caja',      label: 'Gastos Caja',         color: '#ef4444' },
  { key: 'nomina',           label: 'Nómina',              color: '#a855f7' },
  { key: 'traslado',         label: 'Traslado',            color: '#f59e0b' },
];
export const grupoLabel = (g?: string | null) => GRUPOS.find((x) => x.key === g)?.label ?? '—';
export const grupoColor = (g?: string | null) => GRUPOS.find((x) => x.key === g)?.color ?? 'var(--border-strong)';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ───────────── Clasificaciones ───────────── */

export async function listClasificaciones(): Promise<ClasificacionAcopio[]> {
  const { data, error } = await supabase
    .from('acopio_clasificaciones')
    .select('*')
    .eq('activo', true)
    .order('grupo', { ascending: true })
    .order('orden', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClasificacionAcopio[];
}

export async function addClasificacion(grupo: GrupoClasificacion, valor: string): Promise<ClasificacionAcopio> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor de la clasificación.');
  const { data, error } = await supabase
    .from('acopio_clasificaciones')
    .insert({ grupo, valor: v, orden: 999 })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Esa clasificación ya existe en el grupo.');
    throw error;
  }
  return data as ClasificacionAcopio;
}

/* ───────────── Movimientos ───────────── */

export interface CajaMovimientoInput {
  fecha: string;
  descripcion?: string | null;
  usd_entregado?: number;
  kg_cerrados?: number;
  facturados?: number;
  gastos?: number;
  nominas?: number;
  traslado?: number;
  kg_recibidos?: number;
  clasif_grupo?: GrupoClasificacion | null;
  clasif_valor?: string | null;
  costo_clasificacion?: string | null;
  costo_subclasificacion?: string | null;
  caja_id?: string | null;
}

/**
 * Lista los movimientos en orden cronológico y calcula los saldos corrientes
 * (K = saldo $ y M = saldo Kg) acumulando fila a fila, como en el Excel.
 * Si se pasa `cajaId`, filtra a ese cierre.
 */
export async function listCajaMovimientos(cajaId?: string): Promise<CajaMovimiento[]> {
  let q = supabase
    .from('acopio_caja_movimientos')
    .select('*')
    .order('fecha', { ascending: true })
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (cajaId) q = q.eq('caja_id', cajaId);
  const { data, error } = await q;
  if (error) throw error;
  let saldoUsd = 0;
  let saldoKg = 0;
  return (data ?? []).map((row) => {
    const m = row as CajaMovimiento;
    saldoUsd += num(m.usd_entregado) - num(m.facturados) - num(m.gastos) - num(m.nominas) - num(m.traslado);
    saldoKg += num(m.kg_cerrados) - num(m.kg_recibidos);
    return { ...m, saldo_usd: saldoUsd, saldo_kg: saldoKg };
  });
}

/** Agregados de cabecera + tasa del material. */
export function resumirCaja(movs: CajaMovimiento[]): CajaResumen {
  const r = movs.reduce(
    (a, m) => ({
      usdEntregado: a.usdEntregado + num(m.usd_entregado),
      kgCerrados: a.kgCerrados + num(m.kg_cerrados),
      facturados: a.facturados + num(m.facturados),
      gastos: a.gastos + num(m.gastos),
      nominas: a.nominas + num(m.nominas),
      traslado: a.traslado + num(m.traslado),
      kgRecibidos: a.kgRecibidos + num(m.kg_recibidos),
    }),
    { usdEntregado: 0, kgCerrados: 0, facturados: 0, gastos: 0, nominas: 0, traslado: 0, kgRecibidos: 0 },
  );
  const saldoUsd = r.usdEntregado - r.facturados - r.gastos - r.nominas - r.traslado;
  const saldoKg = r.kgCerrados - r.kgRecibidos;
  // F3 = (G3 + H3 + I3) / E3
  const tasa = r.kgCerrados > 0 ? (r.facturados + r.gastos + r.nominas) / r.kgCerrados : 0;
  return { ...r, saldoUsd, saldoKg, tasa };
}

export async function crearMovimientoCaja(input: CajaMovimientoInput, actor: string, actorName?: string | null): Promise<CajaMovimiento> {
  if (!input.fecha) throw new Error('Indicá la fecha del movimiento.');
  const payload = {
    fecha: input.fecha,
    descripcion: input.descripcion?.trim() || null,
    usd_entregado: num(input.usd_entregado),
    kg_cerrados: num(input.kg_cerrados),
    facturados: num(input.facturados),
    gastos: num(input.gastos),
    nominas: num(input.nominas),
    traslado: num(input.traslado),
    kg_recibidos: num(input.kg_recibidos),
    clasif_grupo: input.clasif_grupo ?? null,
    clasif_valor: input.clasif_valor?.trim() || null,
    costo_clasificacion: input.costo_clasificacion?.trim() || null,
    costo_subclasificacion: input.costo_subclasificacion?.trim() || null,
    caja_id: input.caja_id ?? null,
    created_by: actor,
    actor_name: actorName ?? null,
  };
  const { data, error } = await supabase.from('acopio_caja_movimientos').insert(payload).select('*').single();
  if (error) throw error;
  return data as CajaMovimiento;
}

export async function actualizarMovimientoCaja(id: string, input: CajaMovimientoInput): Promise<CajaMovimiento> {
  const { data, error } = await supabase
    .from('acopio_caja_movimientos')
    .update({
      fecha: input.fecha,
      descripcion: input.descripcion?.trim() || null,
      usd_entregado: num(input.usd_entregado),
      kg_cerrados: num(input.kg_cerrados),
      facturados: num(input.facturados),
      gastos: num(input.gastos),
      nominas: num(input.nominas),
      traslado: num(input.traslado),
      kg_recibidos: num(input.kg_recibidos),
      clasif_grupo: input.clasif_grupo ?? null,
      clasif_valor: input.clasif_valor?.trim() || null,
      costo_clasificacion: input.costo_clasificacion?.trim() || null,
      costo_subclasificacion: input.costo_subclasificacion?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as CajaMovimiento;
}

/* ───────────── Cierres (cajas) + taxonomía de costos + resumen ───────────── */

export async function listCajas(): Promise<CajaCierre[]> {
  const { data, error } = await supabase
    .from('acopio_cajas')
    .select('*')
    .order('fecha_inicio', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CajaCierre[];
}

export async function crearCaja(input: { numero: string; nombre?: string | null; recepcion?: string | null; fecha_inicio: string }, actor: string): Promise<CajaCierre> {
  const { data, error } = await supabase
    .from('acopio_cajas')
    .insert({
      numero: input.numero.trim() || 'Caja',
      nombre: input.nombre?.trim() || null,
      recepcion: input.recepcion?.trim() || null,
      fecha_inicio: input.fecha_inicio,
      estado: 'abierta',
      created_by: actor,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as CajaCierre;
}

/**
 * Acepta una transferencia ENTRANTE del otro sistema acreditándola en una caja
 * de Acopio: registra un movimiento (usd_entregado ↑ saldo, clasificado en
 * "Movimientos de Caja"), marca la transferencia como recibida y avisa al
 * origen (ACK). El id global de la transferencia evita doble acreditación.
 */
export async function aceptarEntradaEnCajaAcopio(input: {
  row: TransferenciaInter;
  cajaId: string;              // acopio_cajas.id (caja de Acopio que recibe)
  cajaNombre?: string | null;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const { row, cajaId } = input;
  if (row.estado !== 'por_confirmar') throw new Error('Esta transferencia ya fue procesada.');
  if (!cajaId) throw new Error('Elegí la caja que recibe el dinero.');
  const legs = (row.legs ?? []).filter((l) => Number(l.monto) > 0);
  if (!legs.length) throw new Error('La transferencia no tiene montos.');
  const montoUsd = legs.reduce((a, l) => a + num(l.monto), 0);
  const detalleMonedas = legs.map((l) => `${l.moneda} ${num(l.monto)}`).join(' · ');

  // 1) Entra a la caja como movimiento (sube el saldo USD), grupo Movimientos de Caja.
  await crearMovimientoCaja({
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: `Entrada desde ${row.empresa_origen}${row.motivo ? ' · ' + row.motivo : ''} (${detalleMonedas})`,
    usd_entregado: montoUsd,
    clasif_grupo: 'movimientos_caja',
    caja_id: cajaId,
  }, input.actor, input.actorName ?? null);

  // 2) Marca la transferencia como recibida (la caja destino va en destino_caja_*).
  const { error } = await supabase.from('transferencias_inter').update({
    estado: 'recibida',
    destino_caja_id: cajaId,
    destino_caja_nombre: input.cajaNombre ?? null,
    caja_nombre: input.cajaNombre ?? null,
    confirmada_at: new Date().toISOString(),
  }).eq('id', row.id);
  if (error) throw error;

  // 3) ACK al origen (best-effort: si falla, el origen reconcilia luego).
  if (row.callback_base) {
    await supabase.functions.invoke('transfer-enviar', {
      body: { tipo: 'ack', transf_id: row.transf_id, callback_base: row.callback_base },
    }).catch(() => { /* el ACK no bloquea */ });
  }
}

/** Cierra una caja: fija fecha de cierre, saldo final y estado. */
export async function cerrarCaja(id: string, saldoFinal: number, actor: string, fechaFin?: string): Promise<void> {
  const { error } = await supabase
    .from('acopio_cajas')
    .update({
      estado: 'cerrada',
      fecha_fin: fechaFin || new Date().toISOString().slice(0, 10),
      saldo_final: saldoFinal,
      cerrada_por: actor,
      cerrada_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function reabrirCaja(id: string): Promise<void> {
  const { error } = await supabase
    .from('acopio_cajas')
    .update({ estado: 'abierta', fecha_fin: null, cerrada_por: null, cerrada_en: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function listCostoClases(): Promise<CostoClase[]> {
  const { data, error } = await supabase
    .from('acopio_costo_clases')
    .select('*')
    .eq('activo', true)
    .order('clasificacion', { ascending: true })
    .order('orden', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CostoClase[];
}

export async function addCostoClase(clasificacion: string, subclasificacion: string): Promise<CostoClase> {
  const cl = clasificacion.trim(), sub = subclasificacion.trim();
  if (!cl || !sub) throw new Error('Indicá clasificación y sub-clasificación.');
  const { data, error } = await supabase
    .from('acopio_costo_clases')
    .insert({ clasificacion: cl, subclasificacion: sub, orden: 999 })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Esa sub-clasificación ya existe.');
    throw error;
  }
  return data as CostoClase;
}

/** Reporte de cierre calculado (réplica del RESUMEN del Excel). */
export interface CierreResumen extends CajaResumen {
  dias: number;
  totalGastado: number;
  /** Distribución del gasto por categoría (los 5 grupos), en % del total gastado. */
  porGrupo: { grupo: GrupoClasificacion; label: string; color: string; monto: number; pct: number }[];
  /** Distribución del gasto por clasificación de costo (2 niveles). */
  porCosto: { clasificacion: string; subclasificacion: string; monto: number; pct: number }[];
}

export function resumirCierre(caja: CajaCierre | null, movs: CajaMovimiento[]): CierreResumen {
  const base = resumirCaja(movs);
  const totalGastado = base.facturados + base.gastos + base.nominas + base.traslado;
  // Salidas por grupo de clasificación (suma de gastos+nominas+traslado+facturados de cada fila).
  const salida = (m: CajaMovimiento) => num(m.gastos) + num(m.nominas) + num(m.traslado) + num(m.facturados);
  const grupAcc = new Map<string, number>();
  const costoAcc = new Map<string, number>();
  for (const m of movs) {
    const s = salida(m);
    if (s > 0 && m.clasif_grupo) grupAcc.set(m.clasif_grupo, (grupAcc.get(m.clasif_grupo) ?? 0) + s);
    if (s > 0 && m.costo_clasificacion) {
      const k = `${m.costo_clasificacion}||${m.costo_subclasificacion ?? ''}`;
      costoAcc.set(k, (costoAcc.get(k) ?? 0) + s);
    }
  }
  const porGrupo = GRUPOS.map((g) => ({
    grupo: g.key, label: g.label, color: g.color,
    monto: grupAcc.get(g.key) ?? 0,
    pct: totalGastado > 0 ? ((grupAcc.get(g.key) ?? 0) / totalGastado) * 100 : 0,
  })).filter((x) => x.monto > 0).sort((a, b) => b.monto - a.monto);
  const porCosto = [...costoAcc.entries()].map(([k, monto]) => {
    const [clasificacion, subclasificacion] = k.split('||');
    return { clasificacion, subclasificacion, monto, pct: totalGastado > 0 ? (monto / totalGastado) * 100 : 0 };
  }).sort((a, b) => b.monto - a.monto);
  // Días transcurridos del cierre.
  let dias = 0;
  if (caja?.fecha_inicio) {
    const fin = caja.fecha_fin || new Date().toISOString().slice(0, 10);
    dias = Math.max(0, Math.round((Date.parse(fin) - Date.parse(caja.fecha_inicio)) / 86400000));
  }
  return { ...base, dias, totalGastado, porGrupo, porCosto };
}

export async function eliminarMovimientoCaja(id: string): Promise<void> {
  const { error } = await supabase.from('acopio_caja_movimientos').delete().eq('id', id);
  if (error) throw error;
}
