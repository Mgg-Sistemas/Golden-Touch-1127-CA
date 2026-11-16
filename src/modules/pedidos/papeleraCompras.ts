import { supabase } from '@/shared/lib/supabase';

export type TipoPapeleraCompras = 'orden' | 'compra' | 'servicio';
export type AccionPapeleraCompras = 'enviar' | 'restaurar' | 'vaciar';
export interface RegistroPapeleraCompras {
  id: string;
  tipo: TipoPapeleraCompras;
  codigo: string;
  estado: string;
  contabilizada: boolean;
  adjuntos: { path: string; nombre: string; imagenOrden?: boolean }[];
}

export async function cambiarPapeleraCompras(tipo: TipoPapeleraCompras, ids: readonly string[], accion: AccionPapeleraCompras): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase.rpc('compras_papelera_cambiar', { p_tipo: tipo, p_ids: ids, p_accion: accion });
  if (error) throw new Error(error.message);
  const n = Number(data) || 0;
  if (accion !== 'vaciar' && n !== ids.length) throw new Error('El documento ya cambió. Actualiza la lista.');
  return n;
}

export async function listPapeleraCompras(): Promise<RegistroPapeleraCompras[]> {
  const { data, error } = await supabase.rpc('compras_papelera_listar');
  if (error) throw new Error(error.message);
  return (data ?? []) as RegistroPapeleraCompras[];
}
