/* ============================================================
   Golden Touch · Adjuntos (facturas) de Compra/Servicio Directo
   Permite VARIAS facturas (PDF o imagen) por compra/servicio.
   Tabla `adjuntos_directos` (modulo + ref_id) + Storage en el
   bucket de cada módulo. Acepta PDF e imágenes; se previsualizan.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

export type ModuloDirecto = 'compra' | 'servicio';

const BUCKET: Record<ModuloDirecto, string> = {
  compra: 'compras-directas',
  servicio: 'servicios-directos',
};

export interface AdjuntoDirecto {
  id: string;
  modulo: ModuloDirecto;
  ref_id: string;
  path: string;
  nombre: string | null;
  content_type: string | null;
  created_at: string;
  created_by: string | null;
}

/** Facturas de una compra/servicio (más recientes primero). */
export async function listAdjuntosDirectos(modulo: ModuloDirecto, refId: string): Promise<AdjuntoDirecto[]> {
  if (!refId) return [];
  const { data, error } = await supabase
    .from('adjuntos_directos')
    .select('*')
    .eq('modulo', modulo)
    .eq('ref_id', refId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdjuntoDirecto[];
}

/** Sube un archivo (PDF/imagen) y registra la factura. */
export async function agregarAdjuntoDirecto(
  modulo: ModuloDirecto, refId: string, file: File, actor?: string | null,
): Promise<AdjuntoDirecto> {
  if (file.type && file.type !== 'application/pdf' && !file.type.startsWith('image/'))
    throw new Error('El adjunto debe ser un PDF o una imagen.');
  const safe = file.name.replace(/[^\w.-]+/g, '_');
  // Prefijo único por archivo para no pisar otras facturas de la misma compra.
  const stamp = Math.floor(performance.now()).toString(36);
  const path = `${refId}/${stamp}-${safe}`;
  const { error: upErr } = await supabase.storage.from(BUCKET[modulo]).upload(path, file, {
    upsert: true, contentType: file.type || 'application/pdf',
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from('adjuntos_directos')
    .insert({ modulo, ref_id: refId, path, nombre: file.name, content_type: file.type || null, created_by: actor ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data as AdjuntoDirecto;
}

/** Elimina una factura: borra el archivo del Storage y su registro. */
export async function eliminarAdjuntoDirecto(adjunto: AdjuntoDirecto): Promise<void> {
  await supabase.storage.from(BUCKET[adjunto.modulo]).remove([adjunto.path]);
  const { error } = await supabase.from('adjuntos_directos').delete().eq('id', adjunto.id);
  if (error) throw error;
}

/** URL firmada (10 min) para previsualizar/descargar la factura. */
export async function urlAdjuntoDirecto(modulo: ModuloDirecto, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET[modulo]).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
