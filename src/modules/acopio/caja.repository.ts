/* ============================================================
   Golden Touch · Centro de Acopio · CAJA PERAMANAL (Supabase)
   Libro de caja (réplica de la hoja "CAJA PERAMANAL - GOLDEN TOUCH").
   · Cada movimiento se clasifica en uno de los 5 grupos (CLASIFICACIONES).
   · La TASA del material se deriva de los agregados:
       tasa = (Σ facturados + Σ gastos + Σ nominas) / Σ kg_cerrados
   · Los saldos corrientes (K y M del Excel) se calculan acá al listar.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { crearRecepcionDesdeCierre } from '@/modules/recepciones/recepciones.repository';
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

/** Lista TODAS las clasificaciones (incluidas las inactivas), opcionalmente filtradas por grupo.
 *  Para los gestores de categorías, donde se debe ver y reactivar lo desactivado. */
export async function listClasificacionesAll(grupo?: GrupoClasificacion): Promise<ClasificacionAcopio[]> {
  let q = supabase.from('acopio_clasificaciones').select('*')
    .order('grupo', { ascending: true }).order('orden', { ascending: true }).order('valor', { ascending: true });
  if (grupo) q = q.eq('grupo', grupo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ClasificacionAcopio[];
}

export async function updateClasificacion(id: string, valor: string): Promise<void> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor de la categoría.');
  const { error } = await supabase.from('acopio_clasificaciones').update({ valor: v }).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Esa categoría ya existe en el grupo.');
    throw error;
  }
}

export async function setClasificacionActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('acopio_clasificaciones').update({ activo }).eq('id', id);
  if (error) throw error;
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
  equipo?: string | null;
  caja_id?: string | null;
}

/** Las categorías de gasto "atadas a un vehículo/equipo" terminan en
 *  "REPUESTOS - REPARACIONES - SERVICIOS" (VEHÍCULO, MAQ. LIVIANA/PESADA, MOTO…).
 *  En esos gastos el formulario despliega la lista buscable de equipos de combustible. */
export function esCategoriaVehiculo(valor?: string | null): boolean {
  return /REPUESTOS\s*-\s*REPARACIONES\s*-\s*SERVICIOS/i.test(valor ?? '');
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

/**
 * TASA actual del material en acopio = (Σ facturados + Σ gastos + Σ nóminas) / Σ kg_cerrados.
 * Es la que usa la casiterita como costo al cerrarse un contrato desde Producción.
 */
export async function tasaActualAcopio(): Promise<number> {
  const movs = await listCajaMovimientos();
  const kg = movs.reduce((a, m) => a + num(m.kg_cerrados), 0);
  if (kg <= 0) return 0;
  const base = movs.reduce((a, m) => a + num(m.facturados) + num(m.gastos) + num(m.nominas), 0);
  return base / kg;
}

/* ───────────── Resumen de caja (réplica de la hoja «RESUMEN CAJA PERAMANAL GT») ───────────── */

export interface CategoriaResumen { valor: string; monto: number; pct: number }
export interface ResumenCajaAcopio {
  centro: string;
  fechaInicio: string | null;     // primera fecha de movimiento
  fechaActualizacion: string;     // hoy (fecha del sistema)
  dias: number;                   // días transcurridos desde el inicio
  movimientos: number;
  totalEntregado: number;
  totalFacturado: number;
  totalGastos: number;
  totalNominas: number;
  totalTraslado: number;
  totalGastado: number;           // gastos + nóminas
  saldoUsd: number;               // entregado − facturados − gastos − nóminas − traslado
  pctGastos: number;              // gastos / total gastado
  pctNomina: number;              // nóminas / total gastado
  gastosPorCategoria: CategoriaResumen[];
  nominaPorCategoria: CategoriaResumen[];
  kgProduccion: number;           // Σ kg_cerrados (casiterita que entra)
  kgEnviados: number;             // Σ kg_recibidos (enviado a MGG)
  diferenciaKg: number;           // enviados − producción
  tasaMaterial: number;           // (facturados + gastos + nóminas) / kg producción
}

/** Hoy en zona Venezuela (YYYY-MM-DD). */
function hoyVE(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 10);
}

/**
 * Resumen financiero de la caja del Centro de Acopio (como la hoja del Excel):
 * período + días, saldo actual, total entregado/gastado, % gastos vs % nómina,
 * distribución de gastos y nómina por categoría, y bloque de Kg de casiterita.
 */
export async function resumenCajaAcopio(
  cajaId?: string,
  rango?: { desde?: string | null; hasta?: string | null },
): Promise<ResumenCajaAcopio> {
  const todos = await listCajaMovimientos(cajaId);
  // Filtro opcional por rango de fechas (inclusive). Las fechas son 'YYYY-MM-DD',
  // así que la comparación lexicográfica equivale a la cronológica.
  const movs = todos.filter((m) => {
    const f = m.fecha ?? '';
    if (rango?.desde && f < rango.desde) return false;
    if (rango?.hasta && f > rango.hasta) return false;
    return true;
  });
  const sum = (f: (m: CajaMovimiento) => unknown) => movs.reduce((a, m) => a + num(f(m)), 0);
  const totalEntregado = sum((m) => m.usd_entregado);
  const totalFacturado = sum((m) => m.facturados);
  const totalGastos = sum((m) => m.gastos);
  const totalNominas = sum((m) => m.nominas);
  const totalTraslado = sum((m) => m.traslado);
  const totalGastado = totalGastos + totalNominas;
  // Redondeo a centavos y normalización del «-0» (evita mostrar «$ -0,00»).
  const round2 = (n: number) => { const v = Math.round(n * 100) / 100; return v === 0 ? 0 : v; };
  const saldoUsd = round2(totalEntregado - totalFacturado - totalGastos - totalNominas - totalTraslado);
  const kgProduccion = sum((m) => m.kg_cerrados);
  const kgEnviados = sum((m) => m.kg_recibidos);

  // Distribución por categoría. La base del % es el total de ESA tabla, así cada
  // tabla (gastos / nómina) cierra en 100% por sí sola.
  const porCategoria = (grupo: GrupoClasificacion, campo: (m: CajaMovimiento) => unknown, base: number): CategoriaResumen[] => {
    const map = new Map<string, number>();
    for (const m of movs) {
      if (m.clasif_grupo !== grupo) continue;
      const k = (m.clasif_valor ?? '').trim() || 'Sin categoría';
      map.set(k, (map.get(k) ?? 0) + num(campo(m)));
    }
    return Array.from(map.entries())
      .map(([valor, monto]) => ({ valor, monto, pct: base > 0 ? monto / base : 0 }))
      .sort((a, b) => b.monto - a.monto);
  };

  const fechas = movs.map((m) => m.fecha).filter(Boolean).sort();
  const fechaInicio = fechas[0] ?? null;
  const fechaActualizacion = hoyVE();
  const dias = fechaInicio ? Math.max(0, Math.round((Date.parse(fechaActualizacion) - Date.parse(fechaInicio)) / 86400000)) : 0;

  return {
    centro: 'PERAMANAL GT',
    fechaInicio, fechaActualizacion, dias, movimientos: movs.length,
    totalEntregado, totalFacturado, totalGastos, totalNominas, totalTraslado, totalGastado, saldoUsd,
    pctGastos: totalGastado > 0 ? totalGastos / totalGastado : 0,
    pctNomina: totalGastado > 0 ? totalNominas / totalGastado : 0,
    // La nómina entra como una categoría más dentro de los gastos: una sola tabla
    // cuyo total es el total gastado y cuyos porcentajes suman 100%.
    gastosPorCategoria: [
      ...porCategoria('gastos_caja', (m) => m.gastos, totalGastado),
      ...porCategoria('nomina', (m) => m.nominas, totalGastado),
    ].sort((a, b) => b.monto - a.monto),
    nominaPorCategoria: [],
    kgProduccion, kgEnviados, diferenciaKg: kgEnviados - kgProduccion,
    tasaMaterial: kgProduccion > 0 ? (totalFacturado + totalGastos + totalNominas) / kgProduccion : 0,
  };
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

export async function crearMovimientoCaja(input: CajaMovimientoInput, actor: string, actorName?: string | null, opts?: { skipDeudaMgg?: boolean }): Promise<CajaMovimiento> {
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
    equipo: input.equipo?.trim() || null,
    caja_id: input.caja_id ?? null,
    created_by: actor,
    actor_name: actorName ?? null,
  };
  const { data, error } = await supabase.from('acopio_caja_movimientos').insert(payload).select('*').single();
  if (error) throw error;

  // La deuda a MGG por "USD entregados" la mantiene SINCRONIZADA un trigger en la
  // base (sync_deuda_mgg_acopio): la cuenta por pagar a MGG siempre vale el total
  // de USD entregados (= la tarjeta), sin importar inserciones/ediciones/bajas. Por
  // eso aquí ya NO se crea/acumula manualmente (evita duplicar el monto).
  const entregado = num(input.usd_entregado);
  if (entregado > 0 && !opts?.skipDeudaMgg) {
    // ESPEJO en el sistema MGG: la misma deuda como CUENTA POR COBRAR (GT como
    // cliente), incremental, vía el puente inter-sistema. Gateado por env: solo se
    // emite cuando MGG ya corre el receptor nuevo (si no, crearía un movimiento
    // basura allá). `transf_id` = id del movimiento → idempotente.
    if ((import.meta.env.VITE_PUENTE_CXC_MGG as string | undefined) === 'on') {
      try {
        await supabase.functions.invoke('transfer-enviar', {
          body: {
            tipo: 'transferencia', recurso: 'cuenta_por_cobrar', transf_id: (data as CajaMovimiento).id,
            empresa_origen: (import.meta.env.VITE_EMPRESA_CODIGO as string | undefined)?.trim() || 'golden-touch',
            empresa_destino: 'mgg', monto: entregado, moneda: 'USD',
            cliente_nombre: 'GOLDEN TOUCH 1127 C.A.',
            motivo: 'USD entregados (centro de costo)', actor, actor_name: actorName ?? null,
          },
        });
      } catch { /* puente best-effort: no bloquea el registro local */ }
    }
  }
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
      equipo: input.equipo?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as CajaMovimiento;
}

/* ───────────── Consumo de gastos por equipo (drill-down del resumen) ───────────── */

export interface ConsumoEquipoAcopio { id: string; nombre: string; cantidad: number; valor: number }

/**
 * Gasto por EQUIPO de una categoría de vehículo (grupo gastos_caja), en un rango/caja.
 * `cantidad` = cantidad de movimientos; `valor` = suma de gastos $. Alimenta la gráfica
 * de "consumo por equipo" del resumen de caja (réplica de la gráfica de combustible).
 */
export async function consumoGastosPorEquipo(opts: {
  categoria: string; cajaId?: string | null; desde?: string | null; hasta?: string | null;
}): Promise<ConsumoEquipoAcopio[]> {
  let q = supabase.from('acopio_caja_movimientos')
    .select('equipo, gastos')
    .eq('clasif_grupo', 'gastos_caja')
    .eq('clasif_valor', opts.categoria);
  if (opts.cajaId) q = q.eq('caja_id', opts.cajaId);
  if (opts.desde) q = q.gte('fecha', opts.desde);
  if (opts.hasta) q = q.lte('fecha', opts.hasta);
  const { data, error } = await q;
  if (error) throw error;
  const acc = new Map<string, { cantidad: number; valor: number }>();
  for (const row of (data ?? []) as Array<{ equipo: string | null; gastos: number }>) {
    const g = num(row.gastos);
    if (g <= 0) continue;
    const clave = (row.equipo ?? '').trim() || '— sin equipo —';
    const cur = acc.get(clave) ?? { cantidad: 0, valor: 0 };
    cur.cantidad += 1; cur.valor += g;
    acc.set(clave, cur);
  }
  return Array.from(acc.entries())
    .map(([nombre, v]) => ({ id: nombre, nombre, cantidad: v.cantidad, valor: Math.round(v.valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Detalle de gasto de UNA categoría (cualquiera), agrupado por la DESCRIPCIÓN del
 * movimiento. `cantidad` = nº de movimientos con esa descripción; `valor` = suma de
 * gastos $. Alimenta la gráfica/tabla del drill-down de cualquier categoría de gasto
 * (las de vehículo usan `consumoGastosPorEquipo`, que agrupa por equipo).
 */
export async function gastosDetalleCategoria(opts: {
  categoria: string; cajaId?: string | null; desde?: string | null; hasta?: string | null;
}): Promise<ConsumoEquipoAcopio[]> {
  let q = supabase.from('acopio_caja_movimientos')
    .select('descripcion, gastos, fecha')
    .eq('clasif_grupo', 'gastos_caja')
    .eq('clasif_valor', opts.categoria);
  if (opts.cajaId) q = q.eq('caja_id', opts.cajaId);
  if (opts.desde) q = q.gte('fecha', opts.desde);
  if (opts.hasta) q = q.lte('fecha', opts.hasta);
  const { data, error } = await q;
  if (error) throw error;
  const acc = new Map<string, { cantidad: number; valor: number }>();
  for (const row of (data ?? []) as Array<{ descripcion: string | null; gastos: number }>) {
    const g = num(row.gastos);
    if (g <= 0) continue;
    const clave = (row.descripcion ?? '').trim() || '— sin descripción —';
    const cur = acc.get(clave) ?? { cantidad: 0, valor: 0 };
    cur.cantidad += 1; cur.valor += g;
    acc.set(clave, cur);
  }
  return Array.from(acc.entries())
    .map(([nombre, v]) => ({ id: nombre, nombre, cantidad: v.cantidad, valor: Math.round(v.valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor);
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
 * Descripción FIJA con la que se registra todo dinero que llega del sistema
 * externo (Mineral Group). Aparece en la columna «Descripción» de los
 * Movimientos del Centro de Acopio y suma en la tarjeta «$Usd entregados».
 */
export const DESC_ENTRADA_EXTERNA = 'CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL';

/**
 * Acepta una transferencia ENTRANTE del otro sistema acreditándola en los
 * MOVIMIENTOS del Centro de Acopio: registra un movimiento (usd_entregado ↑
 * saldo, clasificado en "Movimientos de Caja", descripción fija de entrada
 * externa), marca la transferencia como recibida y avisa al origen (ACK). El id
 * global de la transferencia evita doble acreditación. No exige caja abierta;
 * si hay una, se asocia, y si no, el movimiento entra igual (caja_id null).
 */
export async function aceptarEntradaEnCajaAcopio(input: {
  row: TransferenciaInter;
  cajaId?: string | null;      // acopio_cajas.id (opcional: caja abierta a la que se asocia)
  cajaNombre?: string | null;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const { row } = input;
  const cajaId = input.cajaId ?? null;
  if (row.estado !== 'por_confirmar') throw new Error('Esta transferencia ya fue procesada.');
  const legs = (row.legs ?? []).filter((l) => Number(l.monto) > 0);
  if (!legs.length) throw new Error('La transferencia no tiene montos.');
  const montoUsd = legs.reduce((a, l) => a + num(l.monto), 0);

  // 1) Entra a los movimientos (sube el saldo USD), grupo Movimientos de Caja,
  //    con la descripción fija de entrada externa.
  await crearMovimientoCaja({
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: DESC_ENTRADA_EXTERNA,
    usd_entregado: montoUsd,
    clasif_grupo: 'movimientos_caja',
    caja_id: cajaId,
  }, input.actor, input.actorName ?? null);
  // La deuda a MGG por este USD entregado la registra crearMovimientoCaja (arriba),
  // que acumula la cuenta por pagar a MGG de forma incremental.

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

/** Próximo número correlativo de caja a partir de los existentes ("Caja N"). */
function siguienteNumeroCaja(cajas: CajaCierre[]): string {
  let max = 0;
  for (const c of cajas) {
    const m = /(\d+)/.exec(c.numero ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Caja ${max + 1}`;
}

/**
 * CIERRE de caja del Centro de Acopio. Congela la caja abierta (sus movimientos y
 * los saldos de las tarjetas quedan en histórico, `resumen_json`) y abre una caja
 * nueva que arranca SOLO con el saldo acumulado:
 *   · Saldo USD → entra a la caja nueva como un movimiento de «USD entregados»
 *     (fila «Saldo anterior»), SIN generar deuda a MGG (es arrastre interno).
 *   · Saldo Kg  → se guarda como saldo de apertura (`saldo_inicial_kg`).
 * Tasa, gastos, nóminas y facturado se REINICIAN: la caja nueva no arrastra esas
 * bases; se recalculan con sus propios movimientos.
 */
export async function cerrarYAbrirCaja(input: {
  cajaActual: CajaCierre | null;
  snapshot: import('@/shared/lib/types').CierreSnapshot;
  actor: string;
  actorName?: string | null;
}): Promise<CajaCierre> {
  const { snapshot, actor, actorName } = input;
  const hoy = hoyVE();
  const cajas = await listCajas();

  // 1) Determinar la caja a cerrar. Si no hay abierta, se crea una para cerrarla
  //    (así los movimientos previos quedan correctamente archivados en ella).
  let cerrando = input.cajaActual ?? cajas.find((c) => c.estado === 'abierta') ?? null;
  if (!cerrando) {
    cerrando = await crearCaja({ numero: siguienteNumeroCaja(cajas), fecha_inicio: snapshot.fechaInicio ?? hoy }, actor);
  }

  // 2) Congelar: los movimientos sin asignar pasan a pertenecer a la caja que se cierra.
  await supabase.from('acopio_caja_movimientos').update({ caja_id: cerrando.id }).is('caja_id', null);

  // 3) Cerrar la caja con la foto del cierre (saldos de las tarjetas + filas).
  const { error: e1 } = await supabase.from('acopio_cajas').update({
    estado: 'cerrada',
    fecha_fin: hoy,
    saldo_final: snapshot.resumen.saldoUsd,
    resumen_json: snapshot,
    cerrada_por: actor,
    cerrada_en: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', cerrando.id);
  if (e1) throw e1;

  // 4) Abrir la caja nueva con los saldos de apertura arrastrados.
  const cajasTrasCerrar = [...cajas.filter((c) => c.id !== cerrando!.id), { ...cerrando }];
  const nueva = await crearCaja({ numero: siguienteNumeroCaja(cajasTrasCerrar), fecha_inicio: hoy }, actor);
  const { error: e2 } = await supabase.from('acopio_cajas').update({
    saldo_inicial_usd: snapshot.resumen.saldoUsd,
    saldo_inicial_kg: snapshot.resumen.saldoKg,
  }).eq('id', nueva.id);
  if (e2) throw e2;

  // 5) El saldo USD entra a la caja nueva como movimiento de «USD entregados»
  //    (fila «Saldo anterior»), sin deuda a MGG. El saldo Kg ya viaja en saldo_inicial_kg.
  if (snapshot.resumen.saldoUsd !== 0) {
    await crearMovimientoCaja({
      fecha: hoy,
      descripcion: `Saldo anterior · ${cerrando.numero} (cierre ${hoy})`,
      usd_entregado: snapshot.resumen.saldoUsd,
      clasif_grupo: 'movimientos_caja',
      caja_id: nueva.id,
    }, actor, actorName ?? null, { skipDeudaMgg: true });
  }

  // 6) RECEPCIÓN: el saldo de KG de casiterita acumulado genera una RECEPCIÓN para el
  //    laboratorio (módulo Recepciones). OJO: NO entra al inventario al cerrar la caja
  //    (el ingreso a inventario es un paso posterior, aún por definir). Best-effort:
  //    si falla, el cierre no se bloquea (la recepción se puede crear a mano).
  try {
    await crearRecepcionDesdeCierre({
      cajaId: cerrando.id,
      cajaNumero: cerrando.numero,
      pesoKg: snapshot.resumen.saldoKg,
      actor,
      actorName: actorName ?? null,
    });
  } catch { /* no bloquea el cierre */ }

  return { ...nueva, saldo_inicial_usd: snapshot.resumen.saldoUsd, saldo_inicial_kg: snapshot.resumen.saldoKg };
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
