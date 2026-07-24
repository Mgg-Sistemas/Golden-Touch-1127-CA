/* ============================================================
   Golden Touch · Tesorería · Transferencias inter-sistema (puente)
   Dos sistemas independientes (cada uno su Supabase, p. ej. Mineral
   Group y un Centro de Acopio externo como Peramanal). Cuando Tesorería
   traslada dinero a un centro de acopio EXTERNO, además del traslado
   local se crea una transferencia "saliente" y se EMPUJA al otro sistema
   vía Edge Function (transfer-enviar → transfer-recibir). El destino la
   guarda como "entrante / por_confirmar"; al confirmar el operador,
   acredita su caja y devuelve el ACK que pasa la saliente a "recibida".

   `transf_id` es el id GLOBAL compartido por ambos lados → idempotencia:
   un reintento nunca acredita dos veces.

   El código de la empresa propia sale de VITE_EMPRESA_CODIGO (por defecto
   'mineral-group'). El mismo build desplegado como el otro sistema usa su
   propio código y queda simétrico: ambos saben enviar y recibir.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { TransferLeg, TransferenciaInter, CuentaCaja } from '@/shared/lib/types';
import { ingresarDivisa } from './cajaSaldos.repository';

const TABLE = 'transferencias_inter';
const EMPRESA = (import.meta.env.VITE_EMPRESA_CODIGO as string | undefined)?.trim() || 'mineral-group';

/** Código de la empresa/sistema propio (este Supabase). */
export function empresaPropia(): string { return EMPRESA; }

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
  });
}

function resumenLegs(legs: TransferLeg[]): string {
  return legs
    .map((l) => `${l.moneda} ${Number(l.monto).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' · ');
}

/* ───────── Consultas ───────── */

export async function listTransferenciasInter(): Promise<TransferenciaInter[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransferenciaInter[];
}

/** Entrantes pendientes de confirmar (el dinero aún no se acreditó en ESE módulo).
 *  El dinero entrante se acepta por separado en cada módulo (Acopio y Tesorería):
 *  `modulo` filtra las que ese módulo todavía no aceptó. Sin `modulo`, todas las
 *  que siguen en 'por_confirmar' (aún les falta al menos un módulo). */
export async function listEntrantesPorConfirmar(modulo?: 'tesoreria' | 'acopio'): Promise<TransferenciaInter[]> {
  let q = supabase.from(TABLE).select('*')
    .eq('direccion', 'entrante').eq('estado', 'por_confirmar');
  // Cada módulo ve las que todavía no aceptó NI rechazó (aceptar/rechazar por separado).
  if (modulo === 'tesoreria') q = q.eq('aceptado_tesoreria', false).eq('rechazado_tesoreria', false);
  else if (modulo === 'acopio') q = q.eq('aceptado_acopio', false).eq('rechazado_acopio', false);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransferenciaInter[];
}

/** Rechaza una entrante en un módulo: la quita de su cola sin acreditar dinero.
 *  Es por módulo (simétrico a la aceptación): el otro módulo puede seguir aceptándola. */
export async function rechazarEntrante(id: string, modulo: 'tesoreria' | 'acopio'): Promise<void> {
  const patch = modulo === 'acopio' ? { rechazado_acopio: true } : { rechazado_tesoreria: true };
  const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
  if (error) throw error;
}

/** Marca 'recibida' + ACK una entrante SOLO cuando ambos módulos ya la aceptaron.
 *  Re-lee las banderas frescas para no depender de una fila en memoria (evita
 *  carreras entre el operador de Acopio y el de Tesorería). */
async function completarSiAmbosAceptaron(id: string): Promise<void> {
  const { data } = await supabase.from(TABLE)
    .select('aceptado_acopio, aceptado_tesoreria, callback_base, transf_id, estado').eq('id', id).single();
  const r = data as { aceptado_acopio?: boolean; aceptado_tesoreria?: boolean; callback_base?: string | null; transf_id: string; estado: string } | null;
  if (!r || r.estado === 'recibida') return;
  if (!(r.aceptado_acopio && r.aceptado_tesoreria)) return;
  await supabase.from(TABLE).update({ estado: 'recibida', confirmada_at: new Date().toISOString() }).eq('id', id);
  if (r.callback_base) {
    await supabase.functions.invoke('transfer-enviar', {
      body: { tipo: 'ack', transf_id: r.transf_id, callback_base: r.callback_base },
    }).catch(() => { /* ACK best-effort */ });
  }
}

/* ───────── Saliente (este sistema envía a otro) ───────── */

export interface CrearSalienteInput {
  empresaDestino: string;          // cajas.empresa_codigo del centro externo
  cajaId: string;                  // caja espejo local (el centro de acopio externo en este sistema)
  cajaNombre?: string | null;
  legs: TransferLeg[];
  motivo: string;
  actor: string;
  actorName?: string | null;
}

/**
 * Registra la transferencia saliente y la empuja al otro sistema. Si el destino
 * todavía no está configurado (el otro sistema aún no se desplegó), la deja en
 * estado 'error' con un mensaje claro para reintentar luego — NO bloquea el
 * traslado local, que ya quedó registrado.
 */
export async function crearTransferenciaSaliente(input: CrearSalienteInput): Promise<TransferenciaInter> {
  const legs = (input.legs ?? []).filter((l) => Number(l.monto) > 0);
  if (!legs.length) throw new Error('La transferencia no tiene montos.');
  const transfId = genId();
  const resumen = resumenLegs(legs);

  const { data, error } = await supabase.from(TABLE).insert({
    transf_id: transfId, direccion: 'saliente', estado: 'enviada',
    empresa_origen: EMPRESA, empresa_destino: input.empresaDestino,
    caja_id: input.cajaId, caja_nombre: input.cajaNombre ?? null,
    legs, resumen, motivo: input.motivo,
    actor: input.actor, actor_name: input.actorName ?? null,
  }).select('*').single();
  if (error) throw error;
  const row = data as TransferenciaInter;

  await empujarTransferencia(row).catch(async (e) => {
    await supabase.from(TABLE).update({ estado: 'error', mensaje_error: e instanceof Error ? e.message : 'No se pudo entregar' }).eq('id', row.id);
  });
  return row;
}

/** Empuja (o reintenta) la entrega de una saliente al otro sistema. */
async function empujarTransferencia(row: TransferenciaInter): Promise<void> {
  const { data: res, error } = await supabase.functions.invoke('transfer-enviar', {
    body: {
      tipo: 'transferencia', transf_id: row.transf_id,
      empresa_origen: row.empresa_origen, empresa_destino: row.empresa_destino,
      legs: row.legs, resumen: row.resumen, motivo: row.motivo,
      actor: row.actor, actor_name: row.actor_name,
    },
  });
  if (error) throw new Error(error.message ?? 'Edge function falló');
  const r = res as { entregada?: boolean; error?: string } | null;
  if (!r?.entregada) throw new Error(r?.error || 'El otro sistema no confirmó la recepción.');
  await supabase.from(TABLE).update({ estado: 'enviada', mensaje_error: null }).eq('id', row.id);
}

/** Reintenta entregar una saliente que quedó en 'error' (destino no configurado, etc.). */
export async function reintentarTransferencia(row: TransferenciaInter): Promise<void> {
  await empujarTransferencia(row);
}

/* ───────── Entrante (este sistema recibe de otro) ───────── */

/**
 * Confirma una transferencia entrante: acredita cada moneda a la caja local
 * (recalcula tasa promedio) y avisa al sistema de origen (ACK) para que su
 * saliente pase a 'recibida'. El crédito usa el id global → idempotente.
 */
export async function confirmarTransferenciaEntrante(input: {
  row: TransferenciaInter;
  cajaId?: string;            // caja local que recibe (si la fila no la trae)
  actor: string;
  actorName?: string | null;
}): Promise<void> {
  const { row } = input;
  if (row.estado !== 'por_confirmar') throw new Error('Esta transferencia ya fue procesada.');
  if (row.aceptado_tesoreria) throw new Error('Esta transferencia ya fue aceptada en Tesorería.');
  const cajaId = row.caja_id || input.cajaId;
  if (!cajaId) throw new Error('Elegí la caja que recibe el dinero.');
  const legs = (row.legs ?? []).filter((l) => Number(l.monto) > 0);
  if (!legs.length) throw new Error('La transferencia no tiene montos.');

  for (const leg of legs) {
    await ingresarDivisa({
      cajaId, cuenta: (leg.cuenta as CuentaCaja) ?? 'general', moneda: leg.moneda, monto: Number(leg.monto),
      tasaBs: leg.tasa_bs ?? null,
      origen: `Transferencia de ${row.empresa_origen}`, motivo: row.motivo ?? `Transferencia de ${row.empresa_origen}`,
      actor: input.actor, actorName: input.actorName ?? null,
    });
  }

  // El MISMO dinero externo entra por SEPARADO en cada módulo: acá solo se marca la
  // parte de Tesorería. Recién cuando Acopio también lo acepte, pasa a 'recibida' + ACK.
  await supabase.from(TABLE).update({ aceptado_tesoreria: true, caja_id: cajaId }).eq('id', row.id);
  await completarSiAmbosAceptaron(row.id);
}
