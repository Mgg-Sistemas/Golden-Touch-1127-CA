/* ============================================================
   Golden Touch · Combustible · TANQUES (réplica del Excel)
   Libro mayor de diésel por tanque, carga directa (sin aprobación):
     · ENTRADA  → suma litros y recalcula la tasa (promedio ponderado PMP).
     · USO      → descuenta litros al costo promedio (tasa) del tanque.
     · TRASLADO → descuenta del tanque origen y, si es entre tanques,
                  acredita el destino al costo (tasa) del origen.
   El saldo corriente (litros y USD) se acumula al listar, como en el Excel.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type {
  CatalogoCombustible,
  ConciliacionCombustible,
  TransferenciaCombustibleInter,
  CubicacionCombustible,
  MedidorCombustible,
  MovimientoTanque,
  TanqueCombustible,
  TipoCatalogoCombustible,
  TipoMovTanque,
  TipoTanque,
} from '@/shared/lib/types';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const hoy = () => new Date().toISOString().slice(0, 10);

/** Código de la empresa/sistema propio (para el puente inter-sistema). */
const EMPRESA = (import.meta.env.VITE_EMPRESA_CODIGO as string | undefined)?.trim() || 'mineral-group';
/** Destino fijo del puente de combustible: el otro sistema (MGG) y su tanque. */
export const DESTINO_MGG = '__externo_mgg__';
export const DESTINO_MGG_LABEL = 'MGG';

/* ───────────── Cubicación (altura cm → litros) ─────────────
   Fórmulas reales del Excel «CUBICACIÓN TANQUES»:
     · Cilíndrico horizontal: θ = 2·acos((R−h)/R);
       área = ½·R²·(θ − sen θ);  litros = área · largo · 1000
     · Rectangular:           litros = largo · ancho · h · 1000
   (h en metros = altura_cm / 100). */
export interface GeometriaTanque {
  tipo: TipoTanque;
  radio_m?: number | null;
  largo_m?: number | null;
  ancho_m?: number | null;
  alto_m?: number | null;
}

/** Convierte una altura de líquido (en cm) a litros según la geometría del tanque. */
export function cubicarLitros(g: GeometriaTanque, alturaCm: number): number {
  const h = Math.max(0, num(alturaCm) / 100); // a metros
  if (g.tipo === 'cilindrico_horizontal') {
    const R = num(g.radio_m);
    const L = num(g.largo_m);
    if (R <= 0 || L <= 0) return 0;
    const hh = Math.min(h, 2 * R); // no pasa del diámetro
    const theta = 2 * Math.acos(Math.min(1, Math.max(-1, (R - hh) / R)));
    const area = 0.5 * R * R * (theta - Math.sin(theta));
    return round(area * L * 1000, 2);
  }
  // rectangular
  const L = num(g.largo_m);
  const A = num(g.ancho_m);
  const alto = num(g.alto_m);
  if (L <= 0 || A <= 0) return 0;
  const hh = alto > 0 ? Math.min(h, alto) : h;
  return round(L * A * hh * 1000, 2);
}

/** Capacidad calculada por fórmula al llenar el tanque a su altura total. */
export function capacidadCalculada(g: GeometriaTanque): number {
  if (g.tipo === 'cilindrico_horizontal') {
    const R = num(g.radio_m);
    return cubicarLitros(g, R * 2 * 100); // altura total = diámetro (en cm)
  }
  return cubicarLitros(g, num(g.alto_m) * 100);
}

/* ───────────── Catálogos ───────────── */

export async function listCatalogos(): Promise<CatalogoCombustible[]> {
  const { data, error } = await supabase
    .from('combustible_catalogos')
    .select('*')
    .order('tipo', { ascending: true })
    .order('orden', { ascending: true })
    .order('valor', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CatalogoCombustible[];
}

export async function addCatalogo(tipo: TipoCatalogoCombustible, valor: string): Promise<CatalogoCombustible> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  const { data, error } = await supabase
    .from('combustible_catalogos')
    .insert({ tipo, valor: v, orden: 999 })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
  }
  return data as CatalogoCombustible;
}

export async function setCatalogoActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('combustible_catalogos').update({ activo }).eq('id', id);
  if (error) throw error;
}

/** Columna de los movimientos que corresponde a cada tipo de catálogo (para la cascada al renombrar). */
const COL_MOV_POR_TIPO: Record<string, string | undefined> = {
  equipo: 'equipo',
  autorizado: 'autorizado_por',
  ubicacion: 'ubicacion',
};

export async function updateCatalogo(id: string, valor: string): Promise<void> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  // Traemos el valor viejo + tipo para propagar el cambio a los movimientos que lo usaban.
  const { data: prev } = await supabase.from('combustible_catalogos').select('tipo, valor').eq('id', id).maybeSingle();
  const { error } = await supabase.from('combustible_catalogos').update({ valor: v }).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
  }
  // Cascada: los movimientos guardan el texto (no un FK), así que renombramos también ahí.
  const p = prev as { tipo?: string; valor?: string } | null;
  const col = p?.tipo ? COL_MOV_POR_TIPO[p.tipo] : undefined;
  if (col && p?.valor && p.valor !== v) {
    const { error: e2 } = await supabase.from('combustible_tanque_movimientos').update({ [col]: v }).eq(col, p.valor);
    if (e2) throw e2;
  }
}

export async function eliminarCatalogo(id: string): Promise<void> {
  const { error } = await supabase.from('combustible_catalogos').delete().eq('id', id);
  if (error) throw error;
}

/* ───────────── Tanques ───────────── */

export async function listTanques(): Promise<TanqueCombustible[]> {
  const { data, error } = await supabase
    .from('combustible_tanques')
    .select('*')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TanqueCombustible[];
}

export interface TanqueInput {
  nombre: string;
  tipo?: TipoTanque;
  esMovil?: boolean;
  radioM?: number | null;
  largoM?: number | null;
  anchoM?: number | null;
  altoM?: number | null;
  capacidadLitros?: number;   // rotulada
  saldoLitros?: number;
  tasaUsdLitro?: number;
  ubicacion?: string | null;
}

/** Geometría a partir del input del formulario (para cubicar/capacidad). */
function geomDeInput(input: TanqueInput): GeometriaTanque {
  return {
    tipo: input.tipo ?? 'rectangular',
    radio_m: input.radioM ?? null,
    largo_m: input.largoM ?? null,
    ancho_m: input.anchoM ?? null,
    alto_m: input.altoM ?? null,
  };
}

export async function crearTanque(input: TanqueInput & { actor: string }): Promise<TanqueCombustible> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Indicá el nombre del tanque.');
  const saldoLitros = Math.max(0, num(input.saldoLitros));
  const tasa = Math.max(0, num(input.tasaUsdLitro));
  const geom = geomDeInput(input);
  const { data, error } = await supabase
    .from('combustible_tanques')
    .insert({
      nombre,
      tipo: geom.tipo,
      es_movil: !!input.esMovil,
      radio_m: input.radioM ?? null,
      largo_m: input.largoM ?? null,
      ancho_m: input.anchoM ?? null,
      alto_m: input.altoM ?? null,
      capacidad_litros: Math.max(0, num(input.capacidadLitros)),
      capacidad_calculada_litros: capacidadCalculada(geom) || null,
      saldo_litros: saldoLitros,
      saldo_usd: round(saldoLitros * tasa, 2),
      // Saldo de apertura: el libro arranca su saldo corrido desde aquí.
      saldo_inicial_litros: saldoLitros,
      tasa_usd_litro: tasa,
      ubicacion: input.ubicacion?.trim() || null,
      created_by: input.actor,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as TanqueCombustible;
}

/** Edita nombre, geometría y capacidad rotulada de un tanque (recalcula la calculada). */
export async function actualizarTanque(id: string, input: TanqueInput): Promise<void> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('El nombre no puede estar vacío.');
  const geom = geomDeInput(input);
  const patch: Record<string, unknown> = {
    nombre,
    tipo: geom.tipo,
    es_movil: !!input.esMovil,
    radio_m: input.radioM ?? null,
    largo_m: input.largoM ?? null,
    ancho_m: input.anchoM ?? null,
    alto_m: input.altoM ?? null,
    capacidad_litros: Math.max(0, num(input.capacidadLitros)),
    capacidad_calculada_litros: capacidadCalculada(geom) || null,
    ubicacion: input.ubicacion?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  // Tasa USD/L editable: si viene, la guardamos y recalculamos el saldo en $ (saldo L × tasa).
  const cambiaTasa = input.tasaUsdLitro != null;
  let tasaNueva = 0;
  if (cambiaTasa) {
    tasaNueva = round(Math.max(0, num(input.tasaUsdLitro)), 4);
    const actual = await getTanque(id);
    patch.tasa_usd_litro = tasaNueva;
    patch.saldo_usd = round((Number(actual.saldo_litros) || 0) * tasaNueva, 2);
  }
  const { error } = await supabase.from('combustible_tanques').update(patch).eq('id', id);
  if (error) throw error;
  // TASA FIJA: editar la tasa del tanque es el ÚNICO punto donde cambia. Al hacerlo, se
  // re-valorizan TODOS los movimientos del tanque a la nueva tasa (el monto $ es columna
  // generada = litros × tasa), así "todo queda a esa tasa", no solo el saldo de cabecera.
  if (cambiaTasa) {
    const { error: e2 } = await supabase.from('combustible_tanque_movimientos')
      .update({ tasa_usd_litro: tasaNueva }).eq('tanque_id', id);
    if (e2) throw e2;
  }
}

export async function renombrarTanque(id: string, nombre: string): Promise<void> {
  const n = nombre.trim();
  if (!n) throw new Error('El nombre no puede estar vacío.');
  const { error } = await supabase.from('combustible_tanques').update({ nombre: n, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function setEstadoTanque(id: string, estado: 'activo' | 'inactivo'): Promise<void> {
  const { error } = await supabase.from('combustible_tanques').update({ estado, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/**
 * Borra un tanque y TODOS sus movimientos (FK en cascada). Antes elimina los movimientos
 * «contraparte» que viven en otros tanques (reflejos de traslado vinculados por
 * mov_vinculado_id) y recomputa el saldo de esos tanques para que no queden huérfanos.
 */
export async function eliminarTanque(id: string): Promise<void> {
  if (!id) throw new Error('Tanque no indicado.');
  // 1. Movimientos de este tanque que tienen contraparte en otro tanque.
  const { data: propios, error: e1 } = await supabase
    .from('combustible_tanque_movimientos')
    .select('mov_vinculado_id')
    .eq('tanque_id', id)
    .not('mov_vinculado_id', 'is', null);
  if (e1) throw e1;
  const idsContraparte = (propios ?? [])
    .map((m) => (m as { mov_vinculado_id: string | null }).mov_vinculado_id)
    .filter((v): v is string => !!v);

  // 2. Tanques afectados por esas contrapartes (para recomputarlos luego).
  const tanquesAfectados = new Set<string>();
  if (idsContraparte.length) {
    const { data: contras, error: e2 } = await supabase
      .from('combustible_tanque_movimientos')
      .select('tanque_id')
      .in('id', idsContraparte);
    if (e2) throw e2;
    for (const c of contras ?? []) {
      const tid = (c as { tanque_id: string | null }).tanque_id;
      if (tid && tid !== id) tanquesAfectados.add(tid);
    }
    // 3. Borra las contrapartes en los otros tanques.
    const { error: e3 } = await supabase.from('combustible_tanque_movimientos').delete().in('id', idsContraparte);
    if (e3) throw e3;
  }

  // 4. Borra el tanque (sus propios movimientos caen por la FK en cascada).
  const { error: e4 } = await supabase.from('combustible_tanques').delete().eq('id', id);
  if (e4) throw e4;

  // 5. Recomputa el saldo de los tanques que perdieron una entrada reflejada.
  for (const tid of tanquesAfectados) await recomputarTanque(tid);
}

async function getTanque(id: string): Promise<TanqueCombustible> {
  const { data, error } = await supabase.from('combustible_tanques').select('*').eq('id', id).single();
  if (error || !data) throw error ?? new Error('Tanque no encontrado.');
  return data as TanqueCombustible;
}

async function aplicarSaldoTanque(id: string, saldoLitros: number, saldoUsd: number, tasa: number): Promise<void> {
  const { error } = await supabase
    .from('combustible_tanques')
    .update({ saldo_litros: round(saldoLitros, 2), saldo_usd: round(saldoUsd, 2), tasa_usd_litro: round(tasa, 4), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/* ───────────── Movimientos (libro mayor) ───────────── */

/** Convierte la hora «8:02:00 AM» a segundos desde medianoche, para ordenar cronológicamente.
 *  Sin hora → -1 (queda primero en orden ascendente / más viejo). */
function horaOrden(h: string | null | undefined): number {
  if (!h) return -1;
  const m = h.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
  if (!m) return -1;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] ?? 0);
  const ap = (m[4] ?? '').toUpperCase();
  if (ap === 'PM' && hh < 12) hh += 12;
  if (ap === 'AM' && hh === 12) hh = 0;
  return hh * 3600 + mm * 60 + ss;
}

export async function listMovimientosTanque(tanqueId: string): Promise<MovimientoTanque[]> {
  // El saldo corrido arranca del SALDO DE APERTURA del tanque (los litros con que se
  // creó, que no son un movimiento). Así la última fila iguala el saldo del header.
  const [{ data, error }, { data: tk }] = await Promise.all([
    supabase.from('combustible_tanque_movimientos').select('*').eq('tanque_id', tanqueId),
    supabase.from('combustible_tanques').select('saldo_inicial_litros, tasa_usd_litro').eq('id', tanqueId).maybeSingle(),
  ]);
  if (error) throw error;
  const aperturaL = num((tk as { saldo_inicial_litros?: number | null } | null)?.saldo_inicial_litros);
  const tasaTk = num((tk as { tasa_usd_litro?: number | null } | null)?.tasa_usd_litro);
  // Orden cronológico real por fecha + hora (+ created_at de desempate) para el saldo corrido.
  const rows = ((data ?? []) as MovimientoTanque[]).slice().sort((a, b) => {
    const f = (a.fecha ?? '').localeCompare(b.fecha ?? '');
    if (f !== 0) return f;
    const h = horaOrden(a.hora) - horaOrden(b.hora);
    if (h !== 0) return h;
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  });
  // Saldos corridos (litros y USD), como en el Excel, partiendo de la apertura.
  let saldoL = aperturaL;
  let saldoU = round(aperturaL * tasaTk, 2);
  return rows.map((m) => {
    if (m.tipo === 'entrada' || m.tipo === 'retorno') { saldoL += num(m.litros); saldoU += num(m.monto_usd); }
    else { saldoL -= num(m.litros); saldoU -= num(m.monto_usd); }
    return { ...m, saldo_litros: round(saldoL, 2), saldo_usd: round(saldoU, 2) };
  });
}

/** Campos comunes de una fila del libro (se llenan desde el formulario). */
export interface MovimientoTanqueCampos {
  fecha?: string;
  hora?: string | null;
  equipo?: string | null;
  autorizado_por?: string | null;
  ubicacion?: string | null;
  observacion?: string | null;
  contadorGlobalIni?: number | null;
  contadorGlobalFin?: number | null;
  horometroIni?: number | null;
  horometroFin?: number | null;
  /** Kilometraje (odómetro) del vehículo: lectura absoluta del momento. */
  kilometraje?: number | null;
}

async function insertarMovimiento(payload: Record<string, unknown>): Promise<MovimientoTanque> {
  const { data, error } = await supabase.from('combustible_tanque_movimientos').insert(payload).select('*').single();
  if (error) throw error;
  return data as MovimientoTanque;
}

function campos(c: MovimientoTanqueCampos): Record<string, unknown> {
  return {
    fecha: c.fecha || hoy(),
    hora: c.hora?.trim() || null,
    equipo: c.equipo?.trim() || null,
    autorizado_por: c.autorizado_por?.trim() || null,
    ubicacion: c.ubicacion?.trim() || null,
    observacion: c.observacion?.trim() || null,
    contador_global_ini: c.contadorGlobalIni ?? null,
    contador_global_fin: c.contadorGlobalFin ?? null,
    horometro_ini: c.horometroIni ?? null,
    horometro_fin: c.horometroFin ?? null,
    kilometraje: c.kilometraje ?? null,
  };
}

/** ENTRADA: entra combustible al tanque a un costo; recalcula la tasa PMP. */
export async function registrarEntrada(input: {
  tanqueId: string;
  litros: number;
  costoLitro: number;
  campos?: MovimientoTanqueCampos;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const litros = num(input.litros);
  if (litros === 0) throw new Error('Los litros no pueden ser 0 (se admiten negativos, como en el Excel).');
  const costo = Math.max(0, num(input.costoLitro));
  const t = await getTanque(input.tanqueId);

  // TASA FIJA: la tasa del tanque NO varía sola (sin promedio ponderado). La entrada se
  // valoriza a la tasa vigente del tanque; solo cambia cuando se edita la tasa del tanque (✎).
  // La PRIMERA entrada de un tanque sin tasa fija el valor con el costo informado.
  const tasa = num(t.tasa_usd_litro) > 0 ? num(t.tasa_usd_litro) : costo;
  const saldoL = num(t.saldo_litros) + litros;
  const saldoU = num(t.saldo_usd) + litros * tasa;

  await insertarMovimiento({
    ...campos(input.campos ?? {}),
    tanque_id: input.tanqueId,
    tipo: 'entrada',
    litros,
    tasa_usd_litro: round(tasa, 4),
    created_by: input.actor,
    actor_name: input.actorName ?? null,
  });
  await aplicarSaldoTanque(input.tanqueId, saldoL, saldoU, tasa);
}

/** USO: el equipo consume combustible del tanque (al costo promedio actual). */
export async function registrarUso(input: {
  tanqueId: string;
  litros: number;
  campos?: MovimientoTanqueCampos;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const litros = num(input.litros);
  if (litros === 0) throw new Error('Los litros no pueden ser 0 (se admiten negativos, como en el Excel).');
  const t = await getTanque(input.tanqueId);
  const tasa = num(t.tasa_usd_litro);

  await insertarMovimiento({
    ...campos(input.campos ?? {}),
    tanque_id: input.tanqueId,
    tipo: 'uso',
    litros,
    tasa_usd_litro: round(tasa, 4),
    created_by: input.actor,
    actor_name: input.actorName ?? null,
  });
  await aplicarSaldoTanque(input.tanqueId, num(t.saldo_litros) - litros, num(t.saldo_usd) - litros * tasa, tasa);
}

/** MERMA: pérdida del tanque (evaporación, fuga, descuadre). Descuenta litros
 *  al costo (tasa) vigente, igual que un uso pero clasificado como merma. */
export async function registrarMerma(input: {
  tanqueId: string;
  litros: number;
  campos?: MovimientoTanqueCampos;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const litros = num(input.litros);
  if (litros === 0) throw new Error('Los litros no pueden ser 0 (se admiten negativos, como en el Excel).');
  const t = await getTanque(input.tanqueId);
  const tasa = num(t.tasa_usd_litro);

  await insertarMovimiento({
    ...campos(input.campos ?? {}),
    tanque_id: input.tanqueId,
    tipo: 'merma',
    litros,
    tasa_usd_litro: round(tasa, 4),
    created_by: input.actor,
    actor_name: input.actorName ?? null,
  });
  await aplicarSaldoTanque(input.tanqueId, num(t.saldo_litros) - litros, num(t.saldo_usd) - litros * tasa, tasa);
}

/** RETORNO: combustible que VUELVE al tanque (entra al saldo a la tasa vigente,
 *  sin costo nuevo). No recalcula la tasa PMP. */
export async function registrarRetorno(input: {
  tanqueId: string;
  litros: number;
  campos?: MovimientoTanqueCampos;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const litros = num(input.litros);
  if (litros === 0) throw new Error('Los litros no pueden ser 0 (se admiten negativos, como en el Excel).');
  const t = await getTanque(input.tanqueId);
  const tasa = num(t.tasa_usd_litro);

  await insertarMovimiento({
    ...campos(input.campos ?? {}),
    tanque_id: input.tanqueId,
    tipo: 'retorno',
    litros,
    tasa_usd_litro: round(tasa, 4),
    created_by: input.actor,
    actor_name: input.actorName ?? null,
  });
  await aplicarSaldoTanque(input.tanqueId, num(t.saldo_litros) + litros, num(t.saldo_usd) + litros * tasa, tasa);
}

/**
 * TRASLADO: sale combustible del tanque origen. Si `tanqueDestinoId` está
 * presente, también ENTRA al tanque destino (al costo/tasa del origen).
 */
export async function registrarTraslado(input: {
  tanqueId: string;
  litros: number;
  tanqueDestinoId?: string | null;
  campos?: MovimientoTanqueCampos;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const litros = num(input.litros);
  if (litros === 0) throw new Error('Los litros no pueden ser 0 (se admiten negativos, como en el Excel).');
  if (input.tanqueDestinoId && input.tanqueDestinoId === input.tanqueId) throw new Error('El destino debe ser un tanque distinto.');
  const t = await getTanque(input.tanqueId);
  const tasa = num(t.tasa_usd_litro);

  const movTraslado = await insertarMovimiento({
    ...campos(input.campos ?? {}),
    tanque_id: input.tanqueId,
    tipo: 'traslado',
    litros,
    tanque_destino_id: input.tanqueDestinoId ?? null,
    tasa_usd_litro: round(tasa, 4),
    created_by: input.actor,
    actor_name: input.actorName ?? null,
  });
  await aplicarSaldoTanque(input.tanqueId, num(t.saldo_litros) - litros, num(t.saldo_usd) - litros * tasa, tasa);

  // Si el traslado va a otro tanque, lo acreditamos como ENTRADA en el destino y
  // vinculamos ambas filas (mov_vinculado_id) para que el borrado revierta los dos tanques.
  if (input.tanqueDestinoId) {
    const d = await getTanque(input.tanqueDestinoId);
    const saldoL = num(d.saldo_litros) + litros;
    const saldoU = num(d.saldo_usd) + litros * tasa;
    const tasaDest = saldoL > 0 ? saldoU / saldoL : tasa;
    const movEntrada = await insertarMovimiento({
      ...campos({ ...input.campos, observacion: `Traslado desde ${t.nombre}${input.campos?.observacion ? ' · ' + input.campos.observacion : ''}` }),
      tanque_id: input.tanqueDestinoId,
      tipo: 'entrada',
      litros,
      tasa_usd_litro: round(tasa, 4),
      mov_vinculado_id: movTraslado.id,
      created_by: input.actor,
      actor_name: input.actorName ?? null,
    });
    await aplicarSaldoTanque(input.tanqueDestinoId, saldoL, saldoU, tasaDest);
    await supabase.from('combustible_tanque_movimientos')
      .update({ mov_vinculado_id: movEntrada.id }).eq('id', movTraslado.id);
  }
}

/** TRASLADO INTER-SISTEMA → MGG (TANQUE MGG). Resta del tanque origen de ESTE
 *  sistema y empuja los litros al otro Supabase por el puente (transfer-enviar).
 *  MGG lo recibe como pendiente; al confirmar acredita su tanque y devuelve el ACK
 *  (transfer-recibir 'combustible-ack' → marca esta saliente como 'recibida'). */
export async function registrarTrasladoMGG(input: {
  tanqueId: string;
  litros: number;
  campos?: MovimientoTanqueCampos;
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const litros = num(input.litros);
  if (litros <= 0) throw new Error('Para enviar a MGG los litros deben ser mayores que 0.');
  const t = await getTanque(input.tanqueId);
  const tasa = num(t.tasa_usd_litro);
  const transfId = crypto.randomUUID();
  const obsBase = input.campos?.observacion?.trim();
  const observacion = `→ ${DESTINO_MGG_LABEL} (externo)${obsBase ? ' · ' + obsBase : ''}`;

  // Los tanques de GT no se asocian a un combustible (modelo de cubicación). MGG
  // resuelve el combustible por el combustible_id de SU tanque receptor; el nombre
  // va como respaldo (DIESEL, único combustible de MGG / TANQUE MGG).
  const combustibleNombre = 'DIESEL';
  const resumen = `${num(litros).toLocaleString('es-VE', { maximumFractionDigits: 2 })} L de ${combustibleNombre}`;

  // 1. Sale del tanque origen (queda registrado como traslado externo).
  await insertarMovimiento({
    ...campos({ ...(input.campos ?? {}), observacion }),
    tanque_id: input.tanqueId,
    tipo: 'traslado',
    litros,
    tasa_usd_litro: round(tasa, 4),
    created_by: input.actor,
    actor_name: input.actorName ?? null,
  });
  await aplicarSaldoTanque(input.tanqueId, num(t.saldo_litros) - litros, num(t.saldo_usd) - litros * tasa, tasa);

  // 2. Registra la transferencia saliente (contrato compartido con MGG).
  const { data: row, error: insErr } = await supabase.from('transferencias_combustible_inter').insert({
    transf_id: transfId, direccion: 'saliente', estado: 'enviada',
    empresa_origen: EMPRESA, empresa_destino: 'mgg',
    combustible_nombre: combustibleNombre, litros, costo_litro: round(tasa, 4),
    tanque_id: input.tanqueId, tanque_nombre: t.nombre,
    resumen, motivo: observacion,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('id').single();
  if (insErr) throw insErr;
  const rowId = (row as { id: string }).id;

  // 3. Empuja al otro sistema por el puente (recurso='combustible').
  try {
    const { data: res, error } = await supabase.functions.invoke('transfer-enviar', {
      body: {
        tipo: 'transferencia', recurso: 'combustible', transf_id: transfId,
        empresa_origen: EMPRESA, empresa_destino: 'mgg',
        combustible_nombre: combustibleNombre, litros, costo_litro: round(tasa, 4),
        resumen, motivo: observacion,
        actor: input.actor, actor_name: input.actorName ?? null,
      },
    });
    if (error) throw error;
    if (res && (res as { entregada?: boolean }).entregada === false) {
      throw new Error((res as { error?: string }).error || 'El otro sistema no aceptó la transferencia.');
    }
    await supabase.from('transferencias_combustible_inter')
      .update({ estado: 'enviada', mensaje_error: null }).eq('id', rowId);
  } catch (e) {
    await supabase.from('transferencias_combustible_inter')
      .update({ estado: 'error', mensaje_error: e instanceof Error ? e.message : 'No se pudo entregar' }).eq('id', rowId);
    throw new Error(`El combustible salió del tanque pero no se pudo entregar a MGG (queda para reintentar): ${e instanceof Error ? e.message : ''}`);
  }
}

/** Lista las transferencias de combustible inter-sistema (este sistema). */
export async function listTransferenciasCombustible(): Promise<TransferenciaCombustibleInter[]> {
  const { data, error } = await supabase.from('transferencias_combustible_inter').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransferenciaCombustibleInter[];
}

/** Revierte el efecto de UNA fila en el saldo de su tanque (sin borrarla). */
async function revertirSaldoMovimiento(mov: { tanque_id: string; tipo: string; litros: number | null; monto_usd?: number | null }): Promise<void> {
  const t = await getTanque(mov.tanque_id);
  const litros = num(mov.litros);
  const monto = num(mov.monto_usd);
  let saldoL = num(t.saldo_litros);
  let saldoU = num(t.saldo_usd);
  // entrada/retorno SUMARON al tanque → para revertir se restan; el resto (uso/traslado/merma) restaron → se suman.
  if (mov.tipo === 'entrada' || mov.tipo === 'retorno') { saldoL -= litros; saldoU -= monto; }
  else { saldoL += litros; saldoU += monto; }
  const tasa = saldoL > 0 ? saldoU / saldoL : num(t.tasa_usd_litro);
  await aplicarSaldoTanque(mov.tanque_id, saldoL, saldoU, tasa);
}

/** Recalcula y aplica el saldo (litros, USD, tasa) de un tanque a partir de TODOS sus
 *  movimientos en orden cronológico (fecha + hora). El saldo del último movimiento es
 *  el saldo vigente del tanque. Se usa tras editar un movimiento que afecta el balance. */
export async function recomputarTanque(tanqueId: string): Promise<void> {
  // TASA FIJA: se conserva la tasa vigente del tanque (no se promedia) y el saldo $ se
  // re-valoriza a esa tasa (saldo L × tasa). Así editar/borrar un movimiento nunca mueve la tasa.
  const t = await getTanque(tanqueId);
  const tasa = num(t.tasa_usd_litro);
  const movs = await listMovimientosTanque(tanqueId); // ya ordenado por fecha+hora, con saldo corrido
  const last = movs.length ? movs[movs.length - 1] : null;
  // El saldo corrido ya incluye la apertura. Sin movimientos, el saldo es la pura apertura.
  const saldoL = last ? num(last.saldo_litros) : num(t.saldo_inicial_litros);
  await aplicarSaldoTanque(tanqueId, round(saldoL, 2), round(saldoL * tasa, 2), tasa);
}

/** Fila mínima para re-encadenar un medidor continuo (ini→fin) en orden cronológico. */
interface FilaMedidor {
  id: string;
  fecha: string | null;
  hora: string | null;
  created_at: string | null;
  ini: number | null;
  fin: number | null;
}

/**
 * Re-encadena un medidor CONTINUO (lectura inicial → final) sobre un conjunto de
 * movimientos ya acotado (por tanque para el contador del surtidor, por equipo para
 * el horómetro). El medidor es acumulativo: el INICIAL de cada movimiento = el FINAL
 * del anterior en el tiempo. Conserva el «delta» de cada fila (fin − ini = lo que pasó
 * por el medidor en ese movimiento) y lo re-apila en orden cronológico (fecha + hora)
 * desde la lectura BASE (la más baja, porque el medidor sólo crece). Sólo encadena las
 * filas con par completo (ini y fin). Devuelve cuántas filas cambió.
 */
async function reencadenarMedidor(rows: FilaMedidor[], iniCol: string, finCol: string): Promise<number> {
  const usables = rows
    .filter((r) => r.ini != null && r.fin != null)
    .slice()
    .sort((a, b) => {
      const f = (a.fecha ?? '').localeCompare(b.fecha ?? '');
      if (f !== 0) return f;
      const h = horaOrden(a.hora) - horaOrden(b.hora);
      if (h !== 0) return h;
      return (a.created_at ?? '').localeCompare(b.created_at ?? '');
    });
  if (usables.length === 0) return 0;
  // Base = lectura más baja (el medidor es monótono creciente): es el «saldo previo».
  let cursor = Math.min(...usables.map((r) => num(r.ini)));
  let cambios = 0;
  for (const r of usables) {
    const delta = num(r.fin) - num(r.ini); // lo registrado en este movimiento (se conserva)
    const ini = round(cursor, 2);
    const fin = round(cursor + delta, 2);
    if (ini !== round(num(r.ini), 2) || fin !== round(num(r.fin), 2)) {
      const { error } = await supabase.from('combustible_tanque_movimientos')
        .update({ [iniCol]: ini, [finCol]: fin, updated_at: new Date().toISOString() }).eq('id', r.id);
      if (error) throw error;
      cambios++;
    }
    cursor = fin;
  }
  return cambios;
}

/** Re-encadena el CONTADOR del surtidor (por tanque) en orden cronológico. */
async function reencadenarContadorTanque(tanqueId: string): Promise<number> {
  if (!tanqueId) return 0;
  const { data, error } = await supabase.from('combustible_tanque_movimientos')
    .select('id, fecha, hora, created_at, tipo, mov_vinculado_id, contador_global_ini, contador_global_fin')
    .eq('tanque_id', tanqueId);
  if (error) throw error;
  const rows: FilaMedidor[] = ((data ?? []) as Array<Record<string, unknown>>)
    // El contador es del surtidor de ESTE tanque; las entradas que son reflejo de un
    // traslado traen el contador del tanque de ORIGEN, así que no entran en la cadena.
    .filter((r) => !(r.tipo === 'entrada' && r.mov_vinculado_id))
    .map((r) => ({
      id: r.id as string, fecha: r.fecha as string | null, hora: r.hora as string | null,
      created_at: r.created_at as string | null,
      ini: r.contador_global_ini as number | null, fin: r.contador_global_fin as number | null,
    }));
  return reencadenarMedidor(rows, 'contador_global_ini', 'contador_global_fin');
}

/** Re-encadena el HORÓMETRO (por equipo, puede cruzar tanques) en orden cronológico. */
async function reencadenarHorometroEquipo(equipo: string | null | undefined): Promise<number> {
  const e = (equipo ?? '').trim();
  if (!e) return 0;
  const { data, error } = await supabase.from('combustible_tanque_movimientos')
    .select('id, fecha, hora, created_at, horometro_ini, horometro_fin').eq('equipo', e);
  if (error) throw error;
  const rows: FilaMedidor[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string, fecha: r.fecha as string | null, hora: r.hora as string | null,
    created_at: r.created_at as string | null,
    ini: r.horometro_ini as number | null, fin: r.horometro_fin as number | null,
  }));
  return reencadenarMedidor(rows, 'horometro_ini', 'horometro_fin');
}

/** Edita un movimiento. Acepta metadatos + medidores y, opcionalmente, los campos que
 *  afectan el saldo (tipo, litros, tasa). Si se tocan esos, se recalcula el saldo del tanque.
 *  Como la fecha/hora puede cambiar la posición cronológica del movimiento, tras guardar se
 *  RE-ENCADENAN los medidores continuos: el contador del surtidor (por tanque) y el horómetro
 *  (por equipo) — el inicial de cada movimiento vuelve a colgar del final del anterior. */
export async function actualizarMovimientoTanque(
  id: string,
  patch: MovimientoTanqueCampos & { tipo?: TipoMovTanque; litros?: number; tasaUsdLitro?: number },
): Promise<void> {
  // Equipo previo: si la edición lo cambia, hay que re-encadenar también la cadena vieja.
  const { data: prev } = await supabase.from('combustible_tanque_movimientos')
    .select('equipo').eq('id', id).maybeSingle();
  const equipoViejo = (prev as { equipo?: string | null } | null)?.equipo ?? null;

  const upd: Record<string, unknown> = { ...campos(patch), updated_at: new Date().toISOString() };
  const afectaSaldo = patch.tipo != null || patch.litros != null || patch.tasaUsdLitro != null;
  if (patch.tipo != null) upd.tipo = patch.tipo;
  if (patch.litros != null) upd.litros = num(patch.litros);
  if (patch.tasaUsdLitro != null) upd.tasa_usd_litro = round(num(patch.tasaUsdLitro), 4);

  const { data, error } = await supabase.from('combustible_tanque_movimientos')
    .update(upd).eq('id', id)
    .select('tanque_id, equipo, mov_vinculado_id, fecha, hora, autorizado_por, ubicacion, observacion, litros, tasa_usd_litro')
    .single();
  if (error) throw error;
  const tanqueId = (data as { tanque_id: string }).tanque_id;
  const equipoNuevo = (data as { equipo: string | null }).equipo;

  if (afectaSaldo) await recomputarTanque(tanqueId);

  // Re-encadena los medidores en el NUEVO orden cronológico (la hora pudo moverlo).
  await reencadenarContadorTanque(tanqueId);
  await reencadenarHorometroEquipo(equipoNuevo);
  if (equipoViejo && equipoViejo !== equipoNuevo) await reencadenarHorometroEquipo(equipoViejo);

  // TRASLADO entre tanques: si este movimiento tiene contraparte vinculada, propagamos
  // los datos COMPARTIDOS (fecha, hora, autorizado, ubicación, observación, litros, tasa)
  // a la otra pata y recomputamos su tanque. Antes la contraparte quedaba desincronizada
  // (p. ej. se cambiaba la hora en un tanque y en el otro no).
  const vinculadoId = (data as { mov_vinculado_id: string | null }).mov_vinculado_id;
  if (vinculadoId) {
    const d = data as {
      fecha: string | null; hora: string | null; autorizado_por: string | null;
      ubicacion: string | null; observacion: string | null; litros: number | null; tasa_usd_litro: number | null;
    };
    const compartidos: Record<string, unknown> = {
      fecha: d.fecha, hora: d.hora, autorizado_por: d.autorizado_por,
      ubicacion: d.ubicacion, observacion: d.observacion,
      updated_at: new Date().toISOString(),
    };
    // Las dos patas mueven los mismos litros (y misma tasa): se sincronizan si cambiaron.
    if (patch.litros != null) compartidos.litros = num(patch.litros);
    if (patch.tasaUsdLitro != null) compartidos.tasa_usd_litro = round(num(patch.tasaUsdLitro), 4);

    const { data: cp } = await supabase.from('combustible_tanque_movimientos')
      .update(compartidos).eq('id', vinculadoId).select('tanque_id, equipo').single();
    if (cp) {
      const cpTanque = (cp as { tanque_id: string }).tanque_id;
      const cpEquipo = (cp as { equipo: string | null }).equipo;
      if (afectaSaldo) await recomputarTanque(cpTanque);
      await reencadenarContadorTanque(cpTanque);
      if (cpEquipo) await reencadenarHorometroEquipo(cpEquipo);
    }
  }
}

export async function eliminarMovimientoTanque(mov: MovimientoTanque): Promise<void> {
  // Si es un traslado entre tanques (o su entrada vinculada), revertimos AMBOS tanques
  // y borramos las dos filas: el combustible sale del destino y vuelve al tanque origen.
  let par: MovimientoTanque | null = null;
  if (mov.mov_vinculado_id) {
    const { data } = await supabase.from('combustible_tanque_movimientos')
      .select('*').eq('id', mov.mov_vinculado_id).maybeSingle();
    par = (data as MovimientoTanque | null) ?? null;
  }

  await revertirSaldoMovimiento(mov);
  if (par) await revertirSaldoMovimiento(par);

  const ids = par ? [mov.id, par.id] : [mov.id];
  const { error } = await supabase.from('combustible_tanque_movimientos').delete().in('id', ids);
  if (error) throw error;

  // Tras la baja, RE-ENCADENAR los medidores: el horómetro (por equipo) y el contador del
  // surtidor (por tanque) deben recolgar del anterior, igual que en la edición. Antes esto
  // no se hacía y al borrar un horómetro la cadena quedaba desfasada (no sincronizaba).
  await reencadenarHorometroEquipo(mov.equipo);
  await reencadenarContadorTanque(mov.tanque_id);
  if (par) {
    if (par.equipo && par.equipo !== mov.equipo) await reencadenarHorometroEquipo(par.equipo);
    if (par.tanque_id && par.tanque_id !== mov.tanque_id) await reencadenarContadorTanque(par.tanque_id);
  }
}

/* ───────────── Reporte global ───────────── */

export interface ReporteTanque {
  tanque: TanqueCombustible;
  entradas: number;
  uso: number;
  traslados: number;
  disponible: number;
}

/** Reporte de volumen disponible por tanque (réplica de la hoja resumen). */
export async function reporteGlobal(): Promise<ReporteTanque[]> {
  const tanques = await listTanques();
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('tanque_id, tipo, litros');
  if (error) throw error;
  const agg = new Map<string, { entradas: number; uso: number; traslados: number }>();
  for (const row of (data ?? []) as Array<{ tanque_id: string; tipo: TipoMovTanque; litros: number }>) {
    const a = agg.get(row.tanque_id) ?? { entradas: 0, uso: 0, traslados: 0 };
    if (row.tipo === 'entrada' || row.tipo === 'retorno') a.entradas += num(row.litros);
    else if (row.tipo === 'uso' || row.tipo === 'merma') a.uso += num(row.litros); // merma = salida/pérdida
    else a.traslados += num(row.litros);
    agg.set(row.tanque_id, a);
  }
  return tanques.map((tanque) => {
    const a = agg.get(tanque.id) ?? { entradas: 0, uso: 0, traslados: 0 };
    return { tanque, entradas: a.entradas, uso: a.uso, traslados: a.traslados, disponible: num(tanque.saldo_litros) };
  });
}

/* ───────────── Grupo «Los Brasileros» y aviso de combustible bajo ───────────── */

/** Tanques del grupo «Los Brasileros» (Tanque #2 Brasileros + Registro Brasileros - GT):
 *  se identifican porque su nombre contiene «brasileros». Suman aparte (su propia tarjeta)
 *  y se descuentan del total general / del aviso de combustible bajo. */
export const esBrasileros = (nombre: string | null | undefined): boolean =>
  (nombre ?? '').toLowerCase().includes('brasileros');

/** Umbral (litros) del grupo GENERAL por debajo del cual se avisa que hay que comprar
 *  combustible. Aplica SOLO a la primera tarjeta (todos los tanques excepto los Brasileros). */
export const UMBRAL_COMBUSTIBLE_BAJO = 6000;

/** Litros disponibles del grupo GENERAL (todos los tanques excepto «Los Brasileros»).
 *  Es el número de la primera tarjeta; alimenta el aviso de combustible bajo. */
export async function combustibleDisponibleGeneral(): Promise<number> {
  const { data, error } = await supabase.from('combustible_tanques').select('nombre, saldo_litros');
  if (error) throw error;
  return ((data ?? []) as Array<{ nombre: string | null; saldo_litros: number | null }>)
    .filter((t) => !esBrasileros(t.nombre))
    .reduce((a, t) => a + num(t.saldo_litros), 0);
}

/* ───────────── Conciliación (libro vs mina) ───────────── */

export async function listConciliaciones(tanqueId?: string): Promise<ConciliacionCombustible[]> {
  let q = supabase.from('combustible_conciliaciones').select('*').order('fecha', { ascending: false });
  if (tanqueId) q = q.eq('tanque_id', tanqueId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ConciliacionCombustible[];
}

/** Resumen de un tanque en un rango (semana) calculado desde sus movimientos. */
export interface ResumenTanquePeriodo {
  tanqueId: string;
  tanqueNombre: string;
  saldoActual: number;      // saldo vigente del tanque (libro)
  saldoInicial: number;     // saldo en libros al iniciar la semana
  entradas: number;
  usos: number;
  traslados: number;
  retornos: number;
  mermas: number;
  saldoLibros: number;      // cierre = inicial + entradas + retornos − usos − traslados − mermas
  movimientos: number;      // cantidad de movimientos en la semana
}

/**
 * Calcula el saldo en libros de TODOS los tanques para un rango de fechas (semana):
 * saldo inicial del período (arrastre) + lo ocurrido dentro del rango. El saldo
 * inicial de creación de cada tanque se infiere de su saldo actual menos el neto de
 * todos sus movimientos (los movimientos son la fuente de verdad). Una sola consulta.
 * `desde`/`hasta` en 'YYYY-MM-DD' (ambos inclusive).
 */
export async function resumenTanquesPeriodo(desde: string, hasta: string): Promise<ResumenTanquePeriodo[]> {
  const tanques = await listTanques();
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('tipo, litros, fecha, tanque_id');
  if (error) throw error;
  const movs = (data ?? []) as { tipo: string; litros: number; fecha: string | null; tanque_id: string }[];
  const signo = (tipo: string) => (tipo === 'entrada' || tipo === 'retorno' ? 1 : -1);

  return tanques.map((t) => {
    const mt = movs.filter((m) => m.tanque_id === t.id);
    const netAll = mt.reduce((a, m) => a + signo(m.tipo) * num(m.litros), 0);
    const inicialCreacion = num(t.saldo_litros) - netAll;
    const antes = mt.filter((m) => (m.fecha ?? '') < desde);
    const enRango = mt.filter((m) => { const f = m.fecha ?? ''; return f >= desde && f <= hasta; });
    const saldoInicial = inicialCreacion + antes.reduce((a, m) => a + signo(m.tipo) * num(m.litros), 0);
    const suma = (tipo: string) => enRango.filter((m) => m.tipo === tipo).reduce((a, m) => a + num(m.litros), 0);
    const entradas = suma('entrada'), usos = suma('uso'), traslados = suma('traslado'), retornos = suma('retorno'), mermas = suma('merma');
    const saldoLibros = saldoInicial + entradas + retornos - usos - traslados - mermas;
    return {
      tanqueId: t.id, tanqueNombre: t.nombre, saldoActual: round(num(t.saldo_litros), 2),
      saldoInicial: round(saldoInicial, 2),
      entradas: round(entradas, 2), usos: round(usos, 2), traslados: round(traslados, 2),
      retornos: round(retornos, 2), mermas: round(mermas, 2),
      saldoLibros: round(saldoLibros, 2), movimientos: enRango.length,
    };
  });
}

export async function crearConciliacion(input: {
  tanqueId: string;
  periodo?: string | null;
  saldoLibros: number;
  saldoReportadoMina: number;
  saldoCubicacion?: number | null;
  notas?: string | null;
  actor: string;
}): Promise<ConciliacionCombustible> {
  const { data, error } = await supabase
    .from('combustible_conciliaciones')
    .insert({
      tanque_id: input.tanqueId,
      periodo: input.periodo?.trim() || null,
      saldo_libros: num(input.saldoLibros),
      saldo_reportado_mina: num(input.saldoReportadoMina),
      saldo_cubicacion: input.saldoCubicacion == null ? null : num(input.saldoCubicacion),
      notas: input.notas?.trim() || null,
      created_by: input.actor,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ConciliacionCombustible;
}

/* ───────────── Cubicaciones (lecturas físicas guardadas) ───────────── */

export async function listCubicaciones(tanqueId?: string): Promise<CubicacionCombustible[]> {
  let q = supabase.from('combustible_cubicaciones').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (tanqueId) q = q.eq('tanque_id', tanqueId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CubicacionCombustible[];
}

/** Guarda una medición física: convierte la altura a litros con la geometría del
 *  tanque y deja registrada la diferencia contra el saldo por libros del momento. */
export async function crearCubicacion(input: {
  tanqueId: string;
  alturaCm: number;
  fecha?: string;
  notas?: string | null;
  actor: string;
}): Promise<CubicacionCombustible> {
  const altura = num(input.alturaCm);
  if (altura < 0) throw new Error('La altura no puede ser negativa.');
  const t = await getTanque(input.tanqueId);
  const litros = cubicarLitros(t, altura);
  const { data, error } = await supabase
    .from('combustible_cubicaciones')
    .insert({
      tanque_id: input.tanqueId,
      fecha: input.fecha || hoy(),
      altura_cm: altura,
      litros_cubicacion: litros,
      saldo_libros: num(t.saldo_litros),
      notas: input.notas?.trim() || null,
      created_by: input.actor,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as CubicacionCombustible;
}

export async function eliminarCubicacion(id: string): Promise<void> {
  const { error } = await supabase.from('combustible_cubicaciones').delete().eq('id', id);
  if (error) throw error;
}

/* ───────────── Consumo por equipo / mina / mes (gráficas) ───────────── */

export interface ConsumoEquipoItem {
  id: string;
  nombre: string;
  cantidad: number;
  valor: number;
}

export type AgrupacionConsumo = 'equipo' | 'mina' | 'mes';

const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Uso de combustible agrupado por equipo, mina (ubicación) o mes, en un rango de
 *  fechas (litros + USD al costo). Solo cuenta movimientos de tipo 'uso'. */
export async function consumoUso(desde: Date, hasta: Date, por: AgrupacionConsumo = 'equipo'): Promise<ConsumoEquipoItem[]> {
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('equipo, ubicacion, litros, monto_usd, fecha, tipo, tanque_id')
    .eq('tipo', 'uso')
    .gte('fecha', desde.toISOString().slice(0, 10))
    .lte('fecha', hasta.toISOString().slice(0, 10));
  if (error) throw error;
  // El valor en $ usa la TASA ACTUAL del tanque (tasa fija), no el monto histórico de
  // cada movimiento: así el total siempre refleja la tasa vigente (p. ej. litros × 0,50)
  // y no queda desfasado si un movimiento se guardó con una tasa anterior.
  const tanqueIds = Array.from(new Set((data ?? []).map((r) => (r as { tanque_id?: string }).tanque_id).filter(Boolean))) as string[];
  const tasaPorTanque = new Map<string, number>();
  if (tanqueIds.length) {
    const { data: tks } = await supabase.from('combustible_tanques').select('id, tasa_usd_litro').in('id', tanqueIds);
    for (const t of (tks ?? []) as Array<{ id: string; tasa_usd_litro: number | null }>) tasaPorTanque.set(t.id, num(t.tasa_usd_litro));
  }
  const acc = new Map<string, ConsumoEquipoItem>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const litros = num(row.litros);
    if (litros <= 0) continue;
    let clave: string;
    if (por === 'mina') clave = (row.ubicacion as string)?.trim() || '— sin mina —';
    else if (por === 'mes') {
      const f = String(row.fecha ?? '');
      const [y, m] = f.split('-');
      clave = m ? `${MESES_ES[(Number(m) - 1 + 12) % 12]} ${y}` : '— sin fecha —';
    } else clave = (row.equipo as string)?.trim() || '— sin equipo —';
    const cur = acc.get(clave) ?? { id: clave, nombre: clave, cantidad: 0, valor: 0 };
    cur.cantidad += litros;
    // Valor = litros × tasa vigente del tanque. Si no se conoce el tanque/tasa, cae al monto guardado.
    const tasa = row.tanque_id ? tasaPorTanque.get(row.tanque_id as string) ?? 0 : 0;
    cur.valor += tasa > 0 ? litros * tasa : num(row.monto_usd);
    acc.set(clave, cur);
  }
  const arr = Array.from(acc.values()).map((x) => ({ ...x, cantidad: round(x.cantidad, 2), valor: round(x.valor, 2) }));
  // Por mes: orden cronológico; el resto, por mayor consumo.
  return por === 'mes' ? arr : arr.sort((a, b) => b.cantidad - a.cantidad);
}

/** Compat: consumo por equipo (usa consumoUso). */
export function consumoPorEquipo(desde: Date, hasta: Date): Promise<ConsumoEquipoItem[]> {
  return consumoUso(desde, hasta, 'equipo');
}

/** Horómetro vigente (último HF registrado) de TODOS los equipos, en una sola consulta.
 *  Devuelve Map<nombreEquipo, horómetro>. Lo usa Maquinaria para calcular las HRS
 *  restantes hasta el próximo mantenimiento sin pegarle N veces a la base. */
export async function horometrosVigentesPorEquipo(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('equipo, horometro_fin, created_at')
    .not('horometro_fin', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ equipo: string | null; horometro_fin: number | null }>) {
    const eq = (r.equipo ?? '').trim();
    if (!eq || r.horometro_fin == null) continue;
    if (!out.has(eq)) out.set(eq, num(r.horometro_fin)); // orden desc: el primero es el vigente
  }
  return out;
}

/** Kilometraje vigente (última lectura de odómetro) de TODOS los equipos, en una sola
 *  consulta. Devuelve Map<nombreEquipo, kilometraje>. El odómetro es absoluto: el último
 *  registrado (por created_at) es el vigente. Lo usa Maquinaria para la alerta por km. */
export async function kilometrajesVigentesPorEquipo(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('equipo, kilometraje, created_at')
    .not('kilometraje', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const out = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ equipo: string | null; kilometraje: number | null }>) {
    const eq = (r.equipo ?? '').trim();
    if (!eq || r.kilometraje == null) continue;
    if (!out.has(eq)) out.set(eq, num(r.kilometraje)); // orden desc: el primero es el vigente
  }
  return out;
}

/** Último kilometraje (odómetro) registrado para un equipo. Sirve para autocargar la
 *  próxima lectura en el surtidor (el odómetro solo crece). */
export async function ultimoKilometrajeEquipo(equipo: string): Promise<number | null> {
  const e = equipo.trim();
  if (!e) return null;
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('kilometraje, created_at')
    .eq('equipo', e)
    .not('kilometraje', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const v = (data as { kilometraje?: number | null } | null)?.kilometraje;
  return v == null ? null : num(v);
}

/* ───────────── Medidores por equipo (horómetro / contador) ───────────── */

export async function listMedidores(): Promise<MedidorCombustible[]> {
  const { data, error } = await supabase
    .from('combustible_medidores')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MedidorCombustible[];
}

/** Último horómetro FINAL registrado para un equipo, leído de los MOVIMIENTOS del tanque
 *  (el medidor ahora se captura en cada movimiento). Sirve para autocargar el HI siguiente. */
export async function ultimoHorometroEquipo(equipo: string): Promise<number | null> {
  const e = equipo.trim();
  if (!e) return null;
  // El HI del próximo movimiento del equipo = HF del ÚLTIMO REGISTRADO de ese equipo
  // (orden por created_at desc, igual que el contador). No por fecha: así un registro
  // con fecha más vieja no "pisa" el horómetro vigente.
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('horometro_fin, created_at')
    .eq('equipo', e)
    .not('horometro_fin', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const v = (data as { horometro_fin?: number | null } | null)?.horometro_fin;
  return v == null ? null : num(v);
}

/** Último CONTADOR FINAL registrado para UN TANQUE (su surtidor). El contador no se
 *  vincula al equipo (eso es el horómetro): el inicial del próximo movimiento de ese
 *  tanque es su último final cargado. Para un traslado, es el contador del tanque de
 *  ORIGEN (de donde sale el combustible). Se ordena por created_at (último registrado),
 *  no por fecha (que puede ser retroactiva). */
export async function ultimoContadorTanque(tanqueId: string): Promise<number | null> {
  if (!tanqueId) return null;
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('contador_global_fin, created_at')
    .eq('tanque_id', tanqueId)
    .not('contador_global_fin', 'is', null)
    // Excluimos las ENTRADAS que son reflejo de un traslado (mov_vinculado_id no nulo): su
    // contador es el del surtidor del tanque de ORIGEN, no el propio de este tanque.
    .or('tipo.neq.entrada,mov_vinculado_id.is.null')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const v = (data as { contador_global_fin?: number | null } | null)?.contador_global_fin;
  return v == null ? null : num(v);
}

export async function crearMedidor(input: {
  equipo: string;
  fecha?: string;
  horometroIni?: number | null;
  horometroFin?: number | null;
  contadorIni?: number | null;
  contadorFin?: number | null;
  observacion?: string | null;
  actor: string;
  actorName?: string | null;
}): Promise<MedidorCombustible> {
  const equipo = input.equipo.trim();
  if (!equipo) throw new Error('Elegí el equipo.');
  const { data, error } = await supabase
    .from('combustible_medidores')
    .insert({
      equipo,
      fecha: input.fecha || hoy(),
      horometro_ini: input.horometroIni ?? null,
      horometro_fin: input.horometroFin ?? null,
      contador_ini: input.contadorIni ?? null,
      contador_fin: input.contadorFin ?? null,
      observacion: input.observacion?.trim() || null,
      created_by: input.actor,
      actor_name: input.actorName ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as MedidorCombustible;
}

export async function eliminarMedidor(id: string): Promise<void> {
  const { error } = await supabase.from('combustible_medidores').delete().eq('id', id);
  if (error) throw error;
}
