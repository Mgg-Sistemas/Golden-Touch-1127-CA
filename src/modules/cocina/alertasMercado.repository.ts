/* ============================================================
   Golden Touch · Cocina → Compras · Alerta "restablecer el mercado"
   La cocina avisa que hay que montar el mercado; Compras lo ve como
   una tarjeta en Pedidos y la atiende creando la SP de MERCADO.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { push } from '@/modules/notificaciones/notif.repository';

export interface AlertaMercado {
  id: string;
  nota: string | null;
  estado: 'pendiente' | 'atendida';
  creada_por: string | null;
  creada_por_nombre: string | null;
  creada_en: string;
  atendida_por: string | null;
  atendida_en: string | null;
}

/** Cocina levanta la alerta + avisa a Compras (notificación con dedup). */
export async function crearAlertaMercado(input: { nota?: string | null; actor: string; actorName?: string | null }): Promise<AlertaMercado> {
  const { data, error } = await supabase
    .from('alertas_mercado')
    .insert({ nota: input.nota?.trim() || null, creada_por: input.actor, creada_por_nombre: input.actorName ?? null })
    .select('*')
    .single();
  if (error) throw error;
  try {
    await push({
      kind: 'warning',
      destino: 'all',
      title: '🛒 Restablecer el mercado',
      message: `${input.actorName || input.actor} solicita montar el mercado${input.nota ? ' · ' + input.nota.trim() : ''}`,
      link: '#/app/pedidos',
      dedup_key: 'alerta-mercado',
    });
  } catch { /* la notificación no debe bloquear la alerta */ }
  return data as AlertaMercado;
}

/** Alertas pendientes (para la tarjeta en Pedidos/Compras). */
export async function listAlertasMercadoPendientes(): Promise<AlertaMercado[]> {
  const { data, error } = await supabase
    .from('alertas_mercado')
    .select('*')
    .eq('estado', 'pendiente')
    .order('creada_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AlertaMercado[];
}

/** Compras marca la alerta como atendida (montó el mercado). */
export async function marcarAlertaAtendida(id: string, actor: string): Promise<void> {
  const { error } = await supabase
    .from('alertas_mercado')
    .update({ estado: 'atendida', atendida_por: actor, atendida_en: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
