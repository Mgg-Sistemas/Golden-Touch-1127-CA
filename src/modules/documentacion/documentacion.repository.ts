/* ============================================================
   Golden Touch · Documentación · Repository (Supabase)

   Dos tablas:
     · `documentos_empresa`: archivo de documentos de la empresa (RIF,
       registro mercantil, permisos, contratos…) con su archivo en el
       bucket privado `documentacion` y fecha de vencimiento opcional.
     · `envios_documentacion`: las NOTAS DE ENVÍO. El correlativo lo asigna
       la base (secuencia) al insertar y un trigger impide reescribirlo;
       una nota no se borra: se anula y queda en el histórico.
   RLS: lee puede_leer('documentacion'); escribe is_admin() or puede('documentacion').
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { renglonesValidos, type EstadoEnvio, type RenglonEnvio } from './notaEnvio';

const T_DOCS = 'documentos_empresa';
const T_ENVIOS = 'envios_documentacion';
const BUCKET = 'documentacion';

/* ─────────────────────────── Documentos ─────────────────────────── */

export interface DocumentoEmpresa {
  id: string;
  titulo: string;
  categoria: string;
  descripcion: string | null;
  archivo_path: string | null;
  archivo_nombre: string | null;
  vence: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentoInput {
  titulo: string;
  categoria: string;
  descripcion?: string | null;
  vence?: string | null;
}

/** Categorías sugeridas (se puede escribir otra). */
export const CATEGORIAS_DOCUMENTO = [
  'Legal', 'Fiscal / SENIAT', 'Permisos y licencias', 'Contratos', 'Seguros', 'Bancos', 'Personal', 'General',
];

const nombreSeguro = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

async function subir(carpeta: string, file: File): Promise<string> {
  const path = `${carpeta}/${Date.now()}_${nombreSeguro(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function urlArchivoDocumentacion(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function listDocumentos(): Promise<DocumentoEmpresa[]> {
  const { data, error } = await supabase.from(T_DOCS).select('*').order('categoria').order('titulo');
  if (error) throw error;
  return (data ?? []) as DocumentoEmpresa[];
}

export async function guardarDocumento(
  input: DocumentoInput, archivo: File | null, actor: { email: string; nombre: string | null }, existente?: DocumentoEmpresa | null,
): Promise<DocumentoEmpresa> {
  const titulo = input.titulo.trim();
  if (!titulo) throw new Error('Escribe el nombre del documento.');
  let archivo_path = existente?.archivo_path ?? null;
  let archivo_nombre = existente?.archivo_nombre ?? null;
  if (archivo) { archivo_path = await subir('documentos', archivo); archivo_nombre = archivo.name; }
  if (!archivo_path) throw new Error('Adjunta el archivo del documento (PDF o imagen).');
  const fila = {
    titulo,
    categoria: input.categoria.trim() || 'General',
    descripcion: input.descripcion?.trim() || null,
    vence: input.vence || null,
    archivo_path, archivo_nombre,
  };
  const q = existente
    ? supabase.from(T_DOCS).update(fila).eq('id', existente.id)
    : supabase.from(T_DOCS).insert({ ...fila, created_by: actor.email, created_by_name: actor.nombre });
  const { data, error } = await q.select('*').single();
  if (error) throw error;
  // Si se reemplazó el archivo, el anterior ya no lo usa nadie.
  if (archivo && existente?.archivo_path && existente.archivo_path !== archivo_path) {
    await supabase.storage.from(BUCKET).remove([existente.archivo_path]).catch(() => undefined);
  }
  return data as DocumentoEmpresa;
}

/** Borra el archivo (desde la app: SQL no puede tocar storage) y luego el registro. */
export async function eliminarDocumento(d: DocumentoEmpresa): Promise<void> {
  if (d.archivo_path) {
    const { error: e1 } = await supabase.storage.from(BUCKET).remove([d.archivo_path]);
    if (e1) throw e1;
  }
  const { error } = await supabase.from(T_DOCS).delete().eq('id', d.id);
  if (error) throw error;
}

/* ─────────────────────────── Notas de envío ─────────────────────────── */

export interface NotaEnvio {
  id: string;
  numero: number;
  fecha: string;
  razon_social: string;
  rif: string | null;
  atencion_a: string | null;
  condicion: string | null;
  items: RenglonEnvio[];
  total_etiqueta: string;
  total: number | null;
  entregado_por: string | null;
  notas: string | null;
  estado: EstadoEnvio;
  recibido_por: string | null;
  recibido_en: string | null;
  recibido_path: string | null;
  recibido_nombre: string | null;
  anulado_motivo: string | null;
  anulado_por: string | null;
  anulado_en: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotaEnvioInput {
  fecha: string;
  razon_social: string;
  rif?: string | null;
  atencion_a?: string | null;
  condicion?: string | null;
  items: RenglonEnvio[];
  total_etiqueta?: string | null;
  total?: number | null;
  entregado_por?: string | null;
  notas?: string | null;
}

export async function listNotasEnvio(): Promise<NotaEnvio[]> {
  const { data, error } = await supabase.from(T_ENVIOS).select('*').order('numero', { ascending: false });
  if (error) throw error;
  return (data ?? []) as NotaEnvio[];
}

function filaNota(input: NotaEnvioInput) {
  const items = renglonesValidos(input.items);
  if (!input.razon_social.trim()) throw new Error('Indica la razón social o el departamento que recibe.');
  if (!items.length) throw new Error('Agrega al menos un renglón con su descripción.');
  if (!input.fecha) throw new Error('Indica la fecha.');
  return {
    fecha: input.fecha,
    razon_social: input.razon_social.trim(),
    rif: input.rif?.trim() || null,
    atencion_a: input.atencion_a?.trim() || null,
    condicion: input.condicion?.trim() || null,
    items,
    total_etiqueta: input.total_etiqueta?.trim() || 'Documentos',
    total: input.total == null || Number.isNaN(Number(input.total)) ? null : Number(input.total),
    entregado_por: input.entregado_por?.trim() || null,
    notas: input.notas?.trim() || null,
  };
}

/** Crea la nota; el N° lo pone la base y vuelve en la fila. */
export async function crearNotaEnvio(input: NotaEnvioInput, actor: { email: string; nombre: string | null }): Promise<NotaEnvio> {
  const { data, error } = await supabase
    .from(T_ENVIOS)
    .insert({ ...filaNota(input), created_by: actor.email, created_by_name: actor.nombre })
    .select('*').single();
  if (error) throw error;
  return data as NotaEnvio;
}

/** Corrige una nota mientras está enviada (no cambia su N°). */
export async function actualizarNotaEnvio(id: string, input: NotaEnvioInput): Promise<NotaEnvio> {
  const { data, error } = await supabase
    .from(T_ENVIOS).update(filaNota(input)).eq('id', id).eq('estado', 'emitido')
    .select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La nota ya no está en estado «Enviada»: no se puede editar.');
  return data as NotaEnvio;
}

/** Marca la nota como recibida conforme; opcionalmente adjunta la copia firmada. */
export async function marcarRecibida(n: NotaEnvio, recibidoPor: string, copiaFirmada: File | null): Promise<NotaEnvio> {
  let recibido_path = n.recibido_path, recibido_nombre = n.recibido_nombre;
  if (copiaFirmada) { recibido_path = await subir(`envios/${n.id}`, copiaFirmada); recibido_nombre = copiaFirmada.name; }
  const { data, error } = await supabase
    .from(T_ENVIOS)
    .update({ estado: 'recibido', recibido_por: recibidoPor.trim() || null, recibido_en: new Date().toISOString(), recibido_path, recibido_nombre })
    .eq('id', n.id).neq('estado', 'anulado')
    .select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La nota está anulada.');
  return data as NotaEnvio;
}

/** Anula la nota: queda en el histórico con su N° (el correlativo no se reutiliza). */
export async function anularNotaEnvio(n: NotaEnvio, motivo: string, actorEmail: string): Promise<void> {
  if (!motivo.trim()) throw new Error('Escribe el motivo de la anulación.');
  const { error } = await supabase
    .from(T_ENVIOS)
    .update({ estado: 'anulado', anulado_motivo: motivo.trim(), anulado_por: actorEmail, anulado_en: new Date().toISOString() })
    .eq('id', n.id);
  if (error) throw error;
}
