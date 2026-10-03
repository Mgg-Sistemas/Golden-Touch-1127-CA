/* ============================================================
   Golden Touch · Geodesta · Informes (Supabase)

   El informe se guarda en UNA sola escritura: sus apartados viven en una
   columna jsonb de la misma fila. No hay cadena de escrituras que pueda
   cortarse a la mitad y dejar el informe incompleto.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { GeodestaConfig, InformeGeodesta } from '@/shared/lib/types';
import {
  apartadoTieneContenido, codigoGeodesta, componerBusqInforme, hoyVE, partesCodigo,
  type BorradorInforme,
} from './informeModelo';
import { borrarImagenesDeInforme } from './informeImagenes.repository';

const TABLE = 'geodesta_informes';
const TABLE_CONFIG = 'geodesta_config';

const textoONull = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/**
 * Traduce lo que hay en pantalla a las columnas exactas de la tabla. Los
 * apartados totalmente vacíos se descartan: nadie quiere ver bloques en blanco
 * guardados. Exportada para poder probarla sin tocar la red.
 */
export function filaAGuardar(b: BorradorInforme): Record<string, unknown> {
  const apartados = b.apartados.filter(apartadoTieneContenido);
  const codigo = b.codigo.trim();
  const partes = partesCodigo(codigo);
  return {
    codigo,
    codigo_anio: partes?.anio ?? null,
    codigo_nro: partes?.nro ?? null,
    fecha: b.fecha,
    estado: b.estado,
    ciudad: textoONull(b.ciudad),
    para_nombre: textoONull(b.para_nombre),
    para_cargo: textoONull(b.para_cargo),
    de_nombre: textoONull(b.de_nombre),
    de_cargo: textoONull(b.de_cargo),
    firma_nombre: textoONull(b.firma_nombre),
    firma_cargo: textoONull(b.firma_cargo),
    direccion_pie: textoONull(b.direccion_pie),
    logo_gt: b.logo_gt,
    logo_cvm: b.logo_cvm,
    apartados,
    busq: componerBusqInforme({ ...b, apartados }),
  };
}

export async function listInformes(): Promise<InformeGeodesta[]> {
  const { data, error } = await supabase
    .from(TABLE).select('*')
    .order('fecha', { ascending: false }).order('codigo_nro', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InformeGeodesta[];
}

/** Los informes fechados un día, el de número más alto primero. */
export async function listInformesDelDia(dia: string): Promise<InformeGeodesta[]> {
  const { data, error } = await supabase
    .from(TABLE).select('*').eq('fecha', dia).order('codigo_nro', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InformeGeodesta[];
}

/** Las fechas de los informes de un rango, solo la columna: el calendario las cuenta por día. */
export async function listFechasInformes(ini: string, fin: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLE).select('fecha').gte('fecha', ini).lte('fecha', fin);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { fecha: string }).fecha);
}

export async function getInforme(id: string): Promise<InformeGeodesta | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as InformeGeodesta | null;
}

/**
 * Código sugerido: el siguiente al mayor número ya usado en el año de la fecha.
 * Solo lee (no gasta números) y se corrige solo; una colisión rara la avisa
 * `existeCodigo` al guardar.
 */
export async function proximoCodigo(fecha?: string): Promise<string> {
  const anio = Number((fecha || hoyVE()).slice(0, 4));
  const { data, error } = await supabase
    .from(TABLE).select('codigo_nro').eq('codigo_anio', anio)
    .not('codigo_nro', 'is', null)
    .order('codigo_nro', { ascending: false }).limit(1);
  if (error) throw error;
  const max = Number((data?.[0] as { codigo_nro: number | null } | undefined)?.codigo_nro ?? 0);
  return codigoGeodesta(anio, (Number.isFinite(max) ? max : 0) + 1);
}

/** ¿Existe otro informe con este código? Para avisar, nunca para bloquear. */
export async function existeCodigo(codigo: string, exceptoId?: string): Promise<boolean> {
  try {
    let q = supabase.from(TABLE).select('id').eq('codigo', codigo.trim());
    if (exceptoId) q = q.neq('id', exceptoId);
    const { data, error } = await q.limit(1);
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function crearInforme(b: BorradorInforme, actor: string): Promise<InformeGeodesta> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...filaAGuardar(b), creado_por: actor })
    .select('*').single();
  if (error) throw error;
  return data as InformeGeodesta;
}

export async function actualizarInforme(id: string, b: BorradorInforme, actor: string): Promise<InformeGeodesta> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...filaAGuardar(b), modificado_por: actor, modificado_en: new Date().toISOString() })
    .eq('id', id)
    .select('*').single();
  if (error) throw error;
  return data as InformeGeodesta;
}

export async function borrarInforme(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
  // Después de la fila y nunca antes: si el borrado fallara, no se pierden las
  // imágenes de un informe que sigue vivo. La base borra las filas en cascada,
  // pero los archivos del almacén no.
  try {
    await borrarImagenesDeInforme(id);
  } catch (causa) {
    // El informe ya no existe: reintentar no sirve y no hay que hacer creer que sigue vivo.
    console.warn('No se pudieron borrar las imágenes del informe:', id, causa);
    const err = new Error(
      'El informe ya se borró, pero no se pudieron eliminar sus imágenes del almacén. Avisale a quien administra el sistema para que las limpie.',
      { cause: causa },
    );
    // El informe ya no existe: quien llama debe cerrar la pantalla de detalle.
    (err as Error & { informeBorrado?: boolean }).informeBorrado = true;
    throw err;
  }
}

/** Valores por defecto de los informes nuevos: una sola fila, id = 1. */
export async function getConfig(): Promise<GeodestaConfig | null> {
  const { data, error } = await supabase.from(TABLE_CONFIG).select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return (data ?? null) as GeodestaConfig | null;
}

export type ValoresPorDefecto = Pick<
  GeodestaConfig,
  'ciudad' | 'para_nombre' | 'para_cargo' | 'de_nombre' | 'de_cargo'
  | 'firma_nombre' | 'firma_cargo' | 'direccion_pie' | 'logo_gt' | 'logo_cvm'
>;

export async function guardarConfig(c: ValoresPorDefecto): Promise<void> {
  const { error } = await supabase
    .from(TABLE_CONFIG)
    .update({
      ciudad: c.ciudad.trim(),
      para_nombre: textoONull(c.para_nombre),
      para_cargo: textoONull(c.para_cargo),
      de_nombre: textoONull(c.de_nombre),
      de_cargo: textoONull(c.de_cargo),
      firma_nombre: textoONull(c.firma_nombre),
      firma_cargo: textoONull(c.firma_cargo),
      direccion_pie: textoONull(c.direccion_pie),
      logo_gt: c.logo_gt,
      logo_cvm: c.logo_cvm,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) throw error;
}
