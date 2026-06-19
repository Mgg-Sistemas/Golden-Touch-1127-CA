/* ============================================================
   Golden Touch · Pedidos · Chat interno por orden (OC)
   Conversación de seguimiento entre el Gerente General y el
   analista de compras (y el equipo de pedidos). Un hilo por orden.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { push as pushNotificacion } from '@/modules/notificaciones/notif.repository';

export interface MensajeOrden {
  id: string;
  orden_id: string;
  autor_email: string;
  autor_nombre: string | null;
  mensaje: string;
  created_at: string;
}

/** Mensajes de una orden, del más viejo al más nuevo. */
export async function listMensajes(ordenId: string): Promise<MensajeOrden[]> {
  const { data, error } = await supabase
    .from('orden_mensajes')
    .select('*')
    .eq('orden_id', ordenId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MensajeOrden[];
}

/** Envía un mensaje y avisa al equipo (notificación con dedup por orden). */
export async function enviarMensaje(input: {
  ordenId: string;
  ordenLabel: string;
  mensaje: string;
  autorEmail: string;
  autorNombre?: string | null;
}): Promise<MensajeOrden> {
  const texto = input.mensaje.trim();
  if (!texto) throw new Error('Escribí un mensaje.');
  const { data, error } = await supabase
    .from('orden_mensajes')
    .insert({
      orden_id: input.ordenId,
      autor_email: input.autorEmail,
      autor_nombre: input.autorNombre ?? null,
      mensaje: texto,
    })
    .select('*')
    .single();
  if (error) throw error;
  // Nudge: una notificación no leída por orden (dedup) para que la otra parte la vea.
  try {
    await pushNotificacion({
      kind: 'info',
      title: `💬 Mensaje en ${input.ordenLabel}`,
      message: `${input.autorNombre || input.autorEmail}: ${texto.slice(0, 80)}`,
      link: '#/app/pedidos',
      dedup_key: `chat:${input.ordenId}`,
    });
  } catch { /* la notificación no debe bloquear el envío */ }
  return data as MensajeOrden;
}

/** Marca el hilo de una orden como leído por el usuario (now()). */
export async function marcarLeido(ordenId: string, usuarioId: string): Promise<void> {
  if (!usuarioId) return;
  await supabase
    .from('orden_chat_lecturas')
    .upsert(
      { orden_id: ordenId, usuario_id: usuarioId, last_read_at: new Date().toISOString() },
      { onConflict: 'orden_id,usuario_id' },
    );
}

/**
 * Cuenta de mensajes NO leídos por orden para un usuario (mensajes de OTROS más
 * nuevos que su última lectura). Devuelve un mapa orden_id → cantidad.
 * Se calcula sobre las órdenes indicadas (las visibles en pantalla).
 */
export async function noLeidosPorOrden(
  ordenIds: string[],
  usuarioId: string,
  email: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ordenIds.length || !usuarioId) return out;
  const [{ data: msgs }, { data: lect }] = await Promise.all([
    supabase.from('orden_mensajes').select('orden_id, autor_email, created_at').in('orden_id', ordenIds),
    supabase.from('orden_chat_lecturas').select('orden_id, last_read_at').eq('usuario_id', usuarioId).in('orden_id', ordenIds),
  ]);
  const lastRead = new Map((lect ?? []).map((l) => [l.orden_id as string, l.last_read_at as string]));
  for (const m of (msgs ?? []) as Array<{ orden_id: string; autor_email: string; created_at: string }>) {
    if (m.autor_email === email) continue;            // los propios no cuentan como no leídos
    const lr = lastRead.get(m.orden_id);
    if (lr && m.created_at <= lr) continue;            // ya leído
    out.set(m.orden_id, (out.get(m.orden_id) ?? 0) + 1);
  }
  return out;
}
