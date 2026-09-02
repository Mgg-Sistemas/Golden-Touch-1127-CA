/* ============================================================
   Golden Touch · Tesorería (Supabase)
   Maneja el flujo de dinero sobre las mismas cajas/movimientos_caja
   del módulo Salidas (una sola fuente). Agrega: gastos (etiquetados
   por moneda), pago a personal (multipagos), pago de OC, libro mayor,
   disponibilidad financiera (USD + equivalente Bs) y retenciones.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { Caja, MovimientoCaja, Retencion, TipoRetencion, CuentaCaja } from '@/shared/lib/types';
import { getTasaHoy, round2 } from './tasas.repository';
import { categoriaLlevaCorrelativo } from './categoriasGasto.repository';

const TABLE = 'cajas';
const LIBRO = 'movimientos_caja';
const SALDOS = 'caja_saldos';

// Reutilizamos la infraestructura de cajas ya existente del módulo Salidas.
export {
  listCajas, listCajasActivas, listCentrosAcopio, crearCaja, renombrarCaja,
  deshabilitarCaja, habilitarCaja, ajustarSaldo, ingresarDinero, trasladoDinero, listMovimientosCaja,
} from '@/modules/salidas/cajas.repository';

async function getCaja(id: string): Promise<Caja> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Caja no encontrada');
  return data as Caja;
}

/* ───────────── Gasto (egreso simple, etiquetado por moneda) ───────────── */

/** Clave del contador de numeración fiscal de una categoría de gasto. */
const claveCorrelativo = (categoria: string) => `gasto-${categoria.trim().toLowerCase()}`;

/**
 * Último correlativo usado para una categoría (RECEPCIÓN/EXPORTACIÓN).
 * Devuelve el número más alto registrado, o null si todavía no hay ninguno.
 *
 * Manda el CONTADOR (`correlativos`), que es de donde sale el número real al guardar
 * (ver `registrarGasto`). Si un gasto se borró, el máximo de la tabla baja pero el
 * contador no: mostrar el máximo haría prometer un número que después no toca.
 * El máximo de la tabla queda como respaldo para categorías anteriores al contador.
 */
export async function ultimoCorrelativo(categoria: string): Promise<number | null> {
  const { data: cnt } = await supabase.rpc('correlativo_actual', { p_clave: claveCorrelativo(categoria) });
  const vc = Number(cnt);
  if (Number.isFinite(vc) && vc > 0) return vc;

  const { data, error } = await supabase.from(LIBRO)
    .select('gasto_correlativo')
    .eq('gasto_categoria', categoria)
    .not('gasto_correlativo', 'is', null)
    .order('gasto_correlativo', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const n = data ? Number((data as { gasto_correlativo: number | null }).gasto_correlativo) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function registrarGasto(input: {
  cajaId: string; monto: number; concepto: string; categoria?: string;
  cuenta?: CuentaCaja | null; moneda?: string | null;
  // Categoría/subcategoría de gasto (catálogo jerárquico) y correlativo opcional.
  gastoCategoria?: string | null; gastoSubcategoria?: string | null; gastoCorrelativo?: number | null;
  /** Marca el gasto como del Centro de Acopio (Peramanal): un trigger crea el movimiento
   *  espejo en la caja de Acopio (Gastos/Nómina según categoría). */
  esPeramanal?: boolean;
  /** Monto en $ para el reflejo en Acopio. Para gastos en Bs es la conversión con la
   *  tasa personalizada (monto / tasa). Para USD/USDT puede omitirse (usa el nominal). */
  acopioMontoUsd?: number | null;
  actor: string; actorName?: string | null;
}): Promise<MovimientoCaja> {
  const monto = round2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  if (!input.concepto.trim()) throw new Error('Indicá el concepto del gasto.');
  const caja = await getCaja(input.cajaId);

  // Correlativo autoincremental para RECEPCIÓN/EXPORTACIÓN: el primero lo ingresa
  // el usuario; a partir de ahí la secuencia sigue sola por categoría.
  //
  // GT-INT-04 · Antes esto era «leer el máximo y sumarle 1», así que dos gastos de la
  // misma categoría al mismo tiempo se llevaban el MISMO número — y es el correlativo
  // del documento fiscal, no un id interno. Ahora el número lo da `next_correlativo`,
  // que incrementa en una sola sentencia en la base: dos llamadas simultáneas nunca
  // reciben lo mismo. El contador viene sembrado con el máximo ya registrado
  // (supabase/seguridad-2026-09-02-parte9.sql), así que la numeración sigue donde estaba.
  let correlativo = input.gastoCorrelativo ?? null;
  if (input.gastoCategoria && categoriaLlevaCorrelativo(input.gastoCategoria)) {
    const clave = claveCorrelativo(input.gastoCategoria);
    // Primer gasto de la categoría: la persona indica desde dónde arranca la numeración
    // (viene de un talonario ya empezado). Se siembra ANTES de pedir el número, y solo
    // hacia arriba, para que sembrar no pueda repetir uno ya emitido.
    const arranque = input.gastoCorrelativo != null ? Math.trunc(input.gastoCorrelativo) : null;
    if (arranque != null && arranque > 1) {
      const { data: actual } = await supabase.rpc('correlativo_actual', { p_clave: clave });
      if (actual == null) {
        await supabase.rpc('correlativo_sembrar', { p_clave: clave, p_valor: arranque - 1 });
      }
    }
    const { data: n, error: cErr } = await supabase.rpc('next_correlativo', { p_clave: clave });
    if (cErr) throw cErr;
    correlativo = Math.trunc(Number(n));
  }

  // Si la caja maneja saldos multimoneda (caja_saldos), se descuenta del saldo
  // elegido (cuenta+moneda); si no, del saldo legado de la caja.
  const monedaPago = (input.moneda ?? caja.moneda) as string;
  const cuentaSel: CuentaCaja = (input.cuenta ?? 'general') as CuentaCaja;
  const { data: saldoRow } = await supabase.from(SALDOS)
    .select('id').eq('caja_id', input.cajaId).eq('cuenta', cuentaSel).eq('moneda', monedaPago).maybeSingle();
  const usaSaldos = !!saldoRow;

  // ── Descuento ATÓMICO (GT-SIN-01) ──────────────────────────────────────────
  // Antes esto leía el saldo, restaba en JavaScript y escribía el resultado.
  // Dos tesoreras registrando un gasto con segundos de diferencia leían el mismo
  // saldo y la segunda PISABA a la primera: quedaban dos salidas en el libro y
  // un saldo que solo descontaba una. Ahora el descuento lo hace la base con
  // lock de la fila, y valida fondos del lado del servidor (no del navegador).
  let saldoAntes: number;
  let saldoDespues: number;
  if (usaSaldos) {
    const { data: r, error: eSaldo } = await supabase.rpc('aplicar_saldo_divisa', {
      p_caja_id: input.cajaId, p_cuenta: cuentaSel, p_moneda: monedaPago,
      p_delta: -monto, p_permitir_negativo: false,
    });
    if (eSaldo) throw new Error(eSaldo.message || `Saldo insuficiente en ${caja.nombre}${cuentaSel !== 'general' ? ` (${cuentaSel})` : ''}.`);
    const res = r as { saldo_antes: number; saldo_despues: number };
    saldoAntes = Number(res.saldo_antes) || 0;
    saldoDespues = Number(res.saldo_despues) || 0;
  } else {
    const { data: r, error: eSaldo } = await supabase.rpc('aplicar_saldo_caja', {
      p_caja_id: input.cajaId, p_delta: -monto, p_permitir_negativo: false,
    });
    if (eSaldo) throw new Error(eSaldo.message || `Saldo insuficiente en ${caja.nombre}.`);
    const res = r as { saldo_antes: number; saldo_despues: number };
    saldoAntes = Number(res.saldo_antes) || 0;
    saldoDespues = Number(res.saldo_despues) || 0;
  }

  /** Devuelve la plata a la caja si el asiento en el libro no se puede escribir. */
  const revertirSaldo = async () => {
    if (usaSaldos) {
      await supabase.rpc('aplicar_saldo_divisa', {
        p_caja_id: input.cajaId, p_cuenta: cuentaSel, p_moneda: monedaPago,
        p_delta: monto, p_permitir_negativo: true,
      });
    } else {
      await supabase.rpc('aplicar_saldo_caja', {
        p_caja_id: input.cajaId, p_delta: monto, p_permitir_negativo: true,
      });
    }
  };

  const { data, error } = await supabase.from(LIBRO).insert({
    caja_id: input.cajaId, tipo: 'salida', monto, moneda: monedaPago,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: input.concepto.trim(), categoria: input.categoria ?? 'gasto',
    gasto_categoria: input.gastoCategoria ?? null,
    gasto_subcategoria: input.gastoSubcategoria ?? null,
    gasto_correlativo: correlativo,
    // Reflejo en la caja de Acopio (Peramanal): monto en $ (conversión Bs→$ o nominal).
    reflejar_acopio: !!input.esPeramanal,
    acopio_monto_usd: input.esPeramanal ? (input.acopioMontoUsd ?? null) : null,
    cuenta: usaSaldos ? cuentaSel : null,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) {
    // La plata ya salió de la caja pero el asiento no se pudo escribir: se
    // devuelve, para no dejar un descuento sin movimiento que lo explique.
    await revertirSaldo();
    throw error;
  }
  return data as MovimientoCaja;
}

/* ───────────── Pago a personal (multipagos a usuarios del sistema) ───────────── */

export async function pagarPersonal(input: {
  cajaId: string; concepto: string;
  pagos: Array<{ usuarioId: string; nombre: string; monto: number }>;
  actor: string; actorName?: string | null;
}): Promise<void> {
  const pagos = input.pagos
    .map((p) => ({ ...p, monto: round2(Number(p.monto) || 0) }))
    .filter((p) => p.monto > 0);
  if (!pagos.length) throw new Error('Indicá al menos un pago con monto.');
  const total = round2(pagos.reduce((a, p) => a + p.monto, 0));

  const caja = await getCaja(input.cajaId);
  let saldo = Number(caja.saldo) || 0;
  if (total > saldo) throw new Error(`Saldo insuficiente en ${caja.nombre}. Disponible: ${saldo} ${caja.moneda}.`);

  const filas = pagos.map((p) => {
    const antes = saldo;
    const despues = round2(saldo - p.monto);
    saldo = despues;
    return {
      caja_id: input.cajaId, tipo: 'salida', monto: p.monto, moneda: caja.moneda,
      saldo_antes: antes, saldo_despues: despues,
      motivo: input.concepto.trim() || 'Pago a personal', categoria: 'pago_personal',
      beneficiario: p.nombre, beneficiario_id: p.usuarioId,
      actor: input.actor, actor_name: input.actorName ?? null,
    };
  });

  const { error } = await supabase.from(LIBRO).insert(filas);
  if (error) throw error;
  const { error: uErr } = await supabase.from(TABLE).update({ saldo, updated_at: new Date().toISOString() }).eq('id', input.cajaId);
  if (uErr) throw uErr;
}

/* ───────────── Pago de una orden (puente Compras → Tesorería) ───────────── */

export async function pagarOrden(input: {
  cajaId: string; ordenId: string; monto: number; concepto?: string;
  // Opcional: anclar el pago a una categoría/subcategoría de GASTO (catálogo jerárquico),
  // para que aparezca etiquetado en el resumen de gastos además de como pago de OC.
  gastoCategoria?: string | null; gastoSubcategoria?: string | null;
  actor: string; actorName?: string | null;
}): Promise<MovimientoCaja> {
  const monto = round2(Number(input.monto) || 0);
  if (monto <= 0) throw new Error('El monto debe ser mayor que 0.');
  const caja = await getCaja(input.cajaId);
  const saldoAntes = Number(caja.saldo) || 0;
  if (monto > saldoAntes) throw new Error(`Saldo insuficiente en ${caja.nombre}. Disponible: ${saldoAntes} ${caja.moneda}.`);
  const saldoDespues = round2(saldoAntes - monto);

  const { data, error } = await supabase.from(LIBRO).insert({
    caja_id: input.cajaId, tipo: 'salida', monto, moneda: caja.moneda,
    saldo_antes: saldoAntes, saldo_despues: saldoDespues,
    motivo: input.concepto?.trim() || 'Pago de compra', categoria: 'pago_oc',
    gasto_categoria: input.gastoCategoria?.trim() || null,
    gasto_subcategoria: input.gastoSubcategoria?.trim() || null,
    ref_orden_id: input.ordenId,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  const { error: uErr } = await supabase.from(TABLE).update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', input.cajaId);
  if (uErr) throw uErr;
  return data as MovimientoCaja;
}

/* ───────────── Disponibilidad financiera ───────────── */

export interface Disponibilidad {
  usd: number;        // total en cajas USD (efectivo dólar)
  usdt: number;       // total en cajas USDT (cripto-dólar)
  bs: number;         // total en cajas Bs
  tasaUsd: number | null;
  usdEnBs: number;    // equivalente en Bs de TODOS los dólares (USD + USDT) × tasa
  totalBs: number;    // bs + usdEnBs
  fecha: string | null;
}

export async function disponibilidadFinanciera(): Promise<Disponibilidad> {
  // Multimoneda: se calcula desde caja_saldos (Bs jurídica/personal, USD, USDT, COP).
  // Cada divisa se valora en Bs con su tasa promedio ponderada (costo real).
  const { data, error } = await supabase.from('caja_saldos').select('moneda, saldo, tasa_prom');
  if (error) throw error;
  const rows = (data ?? []) as Array<{ moneda: string; saldo: number; tasa_prom: number | null }>;
  const equiv = (r: { moneda: string; saldo: number; tasa_prom: number | null }) =>
    r.moneda === 'Bs' ? (Number(r.saldo) || 0) : round2((Number(r.saldo) || 0) * (Number(r.tasa_prom) || 0));
  const esDolar = (m: string) => m === 'USD' || m === 'USDT';
  const bs = round2(rows.filter((r) => r.moneda === 'Bs').reduce((a, r) => a + (Number(r.saldo) || 0), 0));
  // USD y USDT se muestran por separado, pero su equivalente en Bs se agrega junto (dólares).
  const usd = round2(rows.filter((r) => r.moneda === 'USD').reduce((a, r) => a + (Number(r.saldo) || 0), 0));
  const usdt = round2(rows.filter((r) => r.moneda === 'USDT').reduce((a, r) => a + (Number(r.saldo) || 0), 0));
  const usdEnBs = round2(rows.filter((r) => esDolar(r.moneda)).reduce((a, r) => a + equiv(r), 0));
  const totalBs = round2(rows.reduce((a, r) => a + equiv(r), 0));
  const tasa = await getTasaHoy();
  return { usd, usdt, bs, tasaUsd: tasa.usd, usdEnBs, totalBs, fecha: tasa.fecha };
}

/* ───────────── Libro mayor (entradas/salidas con filtros) ───────────── */

export async function listLibroMayor(filtros: {
  cajaId?: string; moneda?: string; tipo?: string; desde?: string; hasta?: string;
  // Por defecto se ocultan los movimientos archivados en un cierre de mes (cierre_id != null):
  // así el mes nuevo arranca limpio. `incluirArchivados` los trae todos; `cierreId` filtra uno.
  incluirArchivados?: boolean; cierreId?: string;
} = {}): Promise<MovimientoCaja[]> {
  let q = supabase.from(LIBRO).select('*, caja:cajas!movimientos_caja_caja_id_fkey(nombre, moneda)').order('at', { ascending: false });
  if (filtros.cajaId) q = q.eq('caja_id', filtros.cajaId);
  if (filtros.moneda) q = q.eq('moneda', filtros.moneda);
  if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
  if (filtros.desde) q = q.gte('at', `${filtros.desde}T00:00:00`);
  if (filtros.hasta) q = q.lte('at', `${filtros.hasta}T23:59:59`);
  if (filtros.cierreId) q = q.eq('cierre_id', filtros.cierreId);
  else if (!filtros.incluirArchivados) q = q.is('cierre_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MovimientoCaja[];
}

/* ───────────── Retenciones e impuestos ───────────── */

export async function crearRetencion(input: {
  tipo: TipoRetencion; base: number; porcentaje: number; moneda: string;
  proveedorId?: string | null; ordenId?: string | null; compraDirectaId?: string | null;
  comprobanteNro?: string | null; fecha?: string; descripcion?: string | null;
  actor: string; actorName?: string | null;
}): Promise<Retencion> {
  const base = round2(Number(input.base) || 0);
  const porcentaje = Number(input.porcentaje) || 0;
  if (base <= 0) throw new Error('Indicá la base imponible.');
  if (porcentaje <= 0) throw new Error('Indicá el porcentaje de retención.');
  const monto = round2(base * (porcentaje / 100));

  const { data, error } = await supabase.from('retenciones').insert({
    tipo: input.tipo, base, porcentaje, monto, moneda: input.moneda || 'Bs',
    proveedor_id: input.proveedorId ?? null, orden_id: input.ordenId ?? null,
    compra_directa_id: input.compraDirectaId ?? null,
    comprobante_nro: input.comprobanteNro?.trim() || null,
    fecha: input.fecha || new Date().toISOString().slice(0, 10),
    descripcion: input.descripcion?.trim() || null,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  return data as Retencion;
}

/** Borra la(s) retención(es) vinculadas a una compra directa (al reabrir/anular su pago). */
export async function borrarRetencionesDeCompra(compraDirectaId: string): Promise<void> {
  if (!compraDirectaId) return;
  await supabase.from('retenciones').delete().eq('compra_directa_id', compraDirectaId);
}

export async function listRetenciones(filtros: {
  tipo?: TipoRetencion; desde?: string; hasta?: string;
} = {}): Promise<Retencion[]> {
  let q = supabase.from('retenciones').select('*').order('fecha', { ascending: false });
  if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
  if (filtros.desde) q = q.gte('fecha', filtros.desde);
  if (filtros.hasta) q = q.lte('fecha', filtros.hasta);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Retencion[];
}
