/* ============================================================
   Golden Touch · Pedidos · Catálogo de SERVICIOS
   Servicios contratables (recargas, mantenimientos, etc.) usados
   en la Solicitud de Servicio (SS) → Control de Servicio (CS).
   Mismo patrón que pedido_catalogos / maquinaria_catalogos.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

const TABLE = 'servicios_catalogo';

/** Categorías base de servicio. MANTENIMIENTO obliga a casar un equipo de Control de Maquinaria. */
export const CATEGORIAS_SERVICIO = ['RECARGA', 'MANTENIMIENTO', 'OTRO'] as const;
export type CategoriaServicio = (typeof CATEGORIAS_SERVICIO)[number] | string;

/** Categoría que exige seleccionar la máquina/vehículo casado. */
export const CATEGORIA_MANTENIMIENTO = 'MANTENIMIENTO';

/**
 * Servicios de RECARGA de gas / oxígeno / extintores: para estos se piden, además,
 * la CANTIDAD DE BOMBONAS y los KG A RECARGAR. Detecta por el texto de la categoría
 * y/o el tipo de servicio (tolerante a acentos).
 */
export function esRecargaGas(...textos: Array<string | null | undefined>): boolean {
  const t = textos.filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /\b(gas|oxigeno|extintor)/.test(t);
}

export interface ServicioCatalogo {
  id: string;
  categoria: string;
  nombre: string;
  activo: boolean;
  orden: number;
  created_by?: string | null;
  created_at: string;
}

export async function listServiciosCatalogo(): Promise<ServicioCatalogo[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('categoria', { ascending: true })
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ServicioCatalogo[];
}

/** Solo servicios ACTIVOS (para los selectores del formulario), opcionalmente por categoría. */
export async function listServiciosActivos(categoria?: string): Promise<ServicioCatalogo[]> {
  const rows = await listServiciosCatalogo();
  return rows.filter((r) => r.activo && (!categoria || r.categoria === categoria));
}

export async function addServicioCatalogo(categoria: string, nombre: string, actor?: string | null): Promise<ServicioCatalogo> {
  const cat = categoria.trim().toUpperCase();
  const nom = nombre.trim();
  if (!cat) throw new Error('Indicá la categoría del servicio.');
  if (!nom) throw new Error('Indicá el nombre del servicio.');
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ categoria: cat, nombre: nom, orden: 999, created_by: actor ?? null })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese servicio ya existe en la categoría.');
    throw error;
  }
  return data as ServicioCatalogo;
}

export async function updateServicioCatalogo(id: string, nombre: string, categoria?: string): Promise<void> {
  const nom = nombre.trim();
  if (!nom) throw new Error('Indicá el nombre del servicio.');
  const patch: { nombre: string; categoria?: string } = { nombre: nom };
  if (categoria !== undefined) patch.categoria = categoria.trim().toUpperCase();
  const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ese servicio ya existe en la categoría.');
    throw error;
  }
}

export async function setServicioActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ activo }).eq('id', id);
  if (error) throw error;
}

export async function eliminarServicioCatalogo(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** Una solicitud/Control de Servicio de mantenimiento casado a un equipo de Maquinaria. */
export interface ServicioDeEquipo {
  id: string;
  codigo: string;
  oc_codigo: string | null;
  estado: string;
  total: number | null;
  created_at: string;
  /** Ítems de servicio de ESTE equipo (tipo de servicio + cantidad). */
  servicios: { nombre: string; cantidad: number }[];
}

/**
 * Solicitudes / Controles de Servicio (tipo='servicio') que tienen al menos un ítem
 * casado al equipo dado (`equipo_id`). Sirve para el SEGUIMIENTO desde Control de
 * Maquinaria: ver qué mantenimientos se pidieron/cotizaron para ese equipo.
 */
export async function listServiciosDeEquipo(equipoId: string): Promise<ServicioDeEquipo[]> {
  if (!equipoId) return [];
  const { data, error } = await supabase
    .from('ordenes')
    .select('id, codigo, oc_codigo, estado, total, created_at, items')
    .eq('tipo', 'servicio')
    .contains('items', JSON.stringify([{ equipo_id: equipoId }]))
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((o) => {
    const items = (Array.isArray(o.items) ? o.items : []) as Array<{ nombre?: string; cantidad?: number; equipo_id?: string | null }>;
    return {
      id: o.id as string,
      codigo: o.codigo as string,
      oc_codigo: (o.oc_codigo as string | null) ?? null,
      estado: o.estado as string,
      total: o.total != null ? Number(o.total) : null,
      created_at: o.created_at as string,
      servicios: items.filter((it) => it.equipo_id === equipoId).map((it) => ({ nombre: it.nombre ?? '—', cantidad: Number(it.cantidad) || 0 })),
    };
  });
}
