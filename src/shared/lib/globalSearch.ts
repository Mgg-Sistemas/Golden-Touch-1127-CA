/* ============================================================
   Golden Touch · Búsqueda global del sistema
   Busca en productos, proveedores y órdenes; devuelve una lista
   unificada con la ruta (vista + detalle) de cada resultado.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

export type TipoResultado = 'producto' | 'proveedor' | 'orden' | 'usuario';

export interface ResultadoBusqueda {
  tipo: TipoResultado;
  id: string;
  titulo: string;
  subtitulo: string;
  /** Ruta a la vista correspondiente, abriendo el detalle del elemento. */
  ruta: string;
}

const ICONOS: Record<TipoResultado, string> = {
  producto: '⬢',
  proveedor: '⚒',
  orden: '✉',
  usuario: '👤',
};
export function iconoResultado(t: TipoResultado): string { return ICONOS[t]; }

const ETIQUETAS: Record<TipoResultado, string> = {
  producto: 'Producto',
  proveedor: 'Proveedor',
  orden: 'Orden',
  usuario: 'Usuario',
};
export function etiquetaResultado(t: TipoResultado): string { return ETIQUETAS[t]; }

export async function buscarGlobal(qRaw: string): Promise<ResultadoBusqueda[]> {
  // Sanitiza: las comas y % rompen la sintaxis de `.or`/ilike de PostgREST.
  const q = qRaw.trim().replace(/[%,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const [prods, provs, ords, usrs] = await Promise.all([
    supabase.from('productos').select('id, sku, nombre, categoria')
      .or(`nombre.ilike.${like},sku.ilike.${like}`).limit(6),
    supabase.from('proveedores').select('id, razon_social, rif')
      .or(`razon_social.ilike.${like},rif.ilike.${like}`).limit(6),
    supabase.from('ordenes').select('id, codigo, estado')
      .ilike('codigo', like).limit(6),
    // Usuarios: por RLS, un admin ve a todos; el resto solo su propia ficha.
    supabase.from('usuarios').select('id, nombre, email, role')
      .or(`nombre.ilike.${like},email.ilike.${like}`).limit(6),
  ]);

  const res: ResultadoBusqueda[] = [];
  (prods.data ?? []).forEach((p) => {
    const r = p as { id: string; sku: string; nombre: string; categoria: string };
    res.push({ tipo: 'producto', id: r.id, titulo: r.nombre, subtitulo: `${r.sku} · ${r.categoria}`, ruta: `/app/inventario?detalle=${encodeURIComponent(r.id)}` });
  });
  (provs.data ?? []).forEach((p) => {
    const r = p as { id: string; razon_social: string; rif: string };
    res.push({ tipo: 'proveedor', id: r.id, titulo: r.razon_social, subtitulo: r.rif, ruta: `/app/proveedores?detalle=${encodeURIComponent(r.id)}` });
  });
  (ords.data ?? []).forEach((o) => {
    const r = o as { id: string; codigo: string; estado: string };
    res.push({ tipo: 'orden', id: r.id, titulo: r.codigo, subtitulo: `Orden · ${r.estado}`, ruta: `/app/pedidos?detalle=${encodeURIComponent(r.id)}` });
  });
  (usrs.data ?? []).forEach((u) => {
    const r = u as { id: string; nombre: string | null; email: string; role: string | null };
    res.push({ tipo: 'usuario', id: r.id, titulo: r.nombre || r.email, subtitulo: [r.email, r.role].filter(Boolean).join(' · '), ruta: `/app/usuarios?buscar=${encodeURIComponent(r.nombre || r.email)}` });
  });
  return res;
}
