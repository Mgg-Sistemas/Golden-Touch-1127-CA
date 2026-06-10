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

export async function updateCatalogo(id: string, valor: string): Promise<void> {
  const v = valor.trim();
  if (!v) throw new Error('Indicá el valor.');
  const { error } = await supabase.from('combustible_catalogos').update({ valor: v }).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese valor ya existe en el catálogo.');
    throw error;
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
  if (input.tasaUsdLitro != null) {
    const tasa = Math.max(0, num(input.tasaUsdLitro));
    const actual = await getTanque(id);
    patch.tasa_usd_litro = round(tasa, 4);
    patch.saldo_usd = round((Number(actual.saldo_litros) || 0) * tasa, 2);
  }
  const { error } = await supabase.from('combustible_tanques').update(patch).eq('id', id);
  if (error) throw error;
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

export async function listMovimientosTanque(tanqueId: string): Promise<MovimientoTanque[]> {
  const { data, error } = await supabase
    .from('combustible_tanque_movimientos')
    .select('*')
    .eq('tanque_id', tanqueId)
    .order('fecha', { ascending: true })
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  // Saldos corridos (litros y USD), como en el Excel.
  let saldoL = 0;
  let saldoU = 0;
  return (data ?? []).map((row) => {
    const m = row as MovimientoTanque;
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

  const saldoL = num(t.saldo_litros) + litros;
  const saldoU = num(t.saldo_usd) + litros * costo;
  const tasa = saldoL > 0 ? saldoU / saldoL : costo; // promedio ponderado

  await insertarMovimiento({
    ...campos(input.campos ?? {}),
    tanque_id: input.tanqueId,
    tipo: 'entrada',
    litros,
    tasa_usd_litro: round(costo, 4),
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

  await insertarMovimiento({
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

  // Si el traslado va a otro tanque, lo acreditamos como ENTRADA en el destino.
  if (input.tanqueDestinoId) {
    await registrarEntrada({
      tanqueId: input.tanqueDestinoId,
      litros,
      costoLitro: tasa,
      campos: { ...input.campos, observacion: `Traslado desde ${t.nombre}${input.campos?.observacion ? ' · ' + input.campos.observacion : ''}` },
      actor: input.actor,
      actorName: input.actorName ?? null,
    });
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

export async function eliminarMovimientoTanque(mov: MovimientoTanque): Promise<void> {
  // Revierte el efecto en el saldo del tanque y borra la fila.
  const t = await getTanque(mov.tanque_id);
  const litros = num(mov.litros);
  const monto = num(mov.monto_usd);
  let saldoL = num(t.saldo_litros);
  let saldoU = num(t.saldo_usd);
  if (mov.tipo === 'entrada' || mov.tipo === 'retorno') { saldoL -= litros; saldoU -= monto; }
  else { saldoL += litros; saldoU += monto; }
  const tasa = saldoL > 0 ? saldoU / saldoL : num(t.tasa_usd_litro);
  const { error } = await supabase.from('combustible_tanque_movimientos').delete().eq('id', mov.id);
  if (error) throw error;
  await aplicarSaldoTanque(mov.tanque_id, saldoL, saldoU, tasa);
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
    .select('equipo, ubicacion, litros, monto_usd, fecha, tipo')
    .eq('tipo', 'uso')
    .gte('fecha', desde.toISOString().slice(0, 10))
    .lte('fecha', hasta.toISOString().slice(0, 10));
  if (error) throw error;
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
    cur.valor += num(row.monto_usd);
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

/** Último horómetro FINAL registrado para un equipo (para autocargar el HI siguiente). */
export async function ultimoHorometroEquipo(equipo: string): Promise<number | null> {
  const e = equipo.trim();
  if (!e) return null;
  const { data, error } = await supabase
    .from('combustible_medidores')
    .select('horometro_fin, fecha, created_at')
    .eq('equipo', e)
    .not('horometro_fin', 'is', null)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const v = (data as { horometro_fin?: number | null } | null)?.horometro_fin;
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
