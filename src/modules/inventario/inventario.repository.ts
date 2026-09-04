/* ============================================================
   Golden Touch · Inventario · Repository (Supabase)
   Acceso a `productos`. Las mutaciones de `stock` se hacen
   exclusivamente desde `movimientos.repository.ts` (kardex).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { EstadoGenerico, Orden, Producto, RecetaFundicion } from '@/shared/lib/types';

export interface ProductoInput {
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: number;
  stock_min: number;
  precio: number;
  almacen: string;
  estado: EstadoGenerico;
  restock_pct?: number | null;
  receta_fundicion?: RecetaFundicion | null;
  precio_venta?: number | null;
  es_receta?: boolean;
  es_producible?: boolean;
  /** Genérico/surtido que NO se stockea (no entra al inventario). */
  no_inventariable?: boolean;
  // Detalle del producto (opcional).
  nombre_busqueda?: string | null;
  marca?: string | null;
  modelo?: string | null;
  serial?: string | null;
  codigo?: string | null;
  numero?: string | null;
  descripcion?: string | null;
  ubicacion?: string | null;
}

export const CATEGORIAS_DEFAULT = [
  'Explosivos',
  'EPP',
  'Herramientas',
  'Maquinaria',
  'Lubricantes',
  'Reactivos',
  'Repuestos',
  'Logística',
] as const;
// Alias para retro-compatibilidad con código que importaba CATEGORIAS.
export const CATEGORIAS = CATEGORIAS_DEFAULT;

export const UNIDADES_DEFAULT = ['und', 'kg', 'l', 'm', 'par', 'saco', 'tambor', 'caja'] as const;
export const UNIDADES = UNIDADES_DEFAULT;

/* ─────────────── SKU automático e incremental ───────────────
   El SKU es <PREFIJO>-<NNN>. El prefijo se hereda de los productos
   que ya existen en esa categoría (lo que "se viene manejando":
   LUB-, EXP-, MAQ-…); si la categoría es nueva se deriva de su
   nombre (3 letras). El número es correlativo por prefijo. */

/** Deriva el prefijo de SKU de una categoría: reutiliza el prefijo más usado
 *  entre los productos existentes de esa categoría; si no hay, lo arma con las
 *  primeras 3 letras del nombre de la categoría. */
export function prefijoCategoria(categoria: string, productos: Producto[] = []): string {
  const counts = new Map<string, number>();
  productos
    .filter((p) => p.categoria === categoria && p.sku)
    .forEach((p) => {
      const m = String(p.sku).match(/^([A-Za-z]+)/);
      if (m) {
        const pre = m[1].toUpperCase();
        counts.set(pre, (counts.get(pre) ?? 0) + 1);
      }
    });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) return top[0];
  const norm = categoria
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  return norm.slice(0, 3) || 'GEN';
}

/** Siguiente SKU correlativo (CLIENTE, sin persistencia): mayor número + 1.
 *  ⚠ Reutiliza el número si se borra el SKU más alto. Solo se usa como
 *  estimación local de respaldo; la asignación real va por `nextSku`/`peekSku`,
 *  que usan un contador PERSISTENTE en la base (no reutiliza números). */
export function siguienteSku(categoria: string, productos: Producto[] = []): string {
  const prefijo = prefijoCategoria(categoria, productos);
  const re = new RegExp(`^${prefijo}[-_]?(\\d+)$`, 'i');
  let max = 0;
  productos.forEach((p) => {
    const m = String(p.sku ?? '').match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefijo}-${String(max + 1).padStart(3, '0')}`;
}

const fmtSku = (prefijo: string, n: number) => `${prefijo}-${String(n).padStart(3, '0')}`;

/** Prefijo REAL de una categoría, según la base.
 *
 *  Antes esto se adivinaba en el navegador con las 3 primeras letras del
 *  nombre, sin memoria: dos categorías distintas caían en el mismo prefijo
 *  (PROTEINA y PRODUCCION son las dos «PRO») y terminaban compartiendo el
 *  contador, con lo que el SKU dejaba de decir a qué familia pertenece el
 *  producto. Ahora `sku_prefijos` recuerda la asignación: cada categoría
 *  estrena su propio prefijo y lo conserva para siempre.
 *
 *  Si la consulta falla se cae al cálculo local de siempre — un problema de
 *  red no puede dejar a nadie sin poder crear un producto. */
async function prefijoDeCategoria(categoria: string, productos: Producto[] = []): Promise<string> {
  const { data, error } = await supabase.rpc('prefijo_categoria', { p_categoria: categoria });
  if (error || !data) return prefijoCategoria(categoria, productos);
  return String(data);
}

/** Previsualiza el próximo SKU SIN reservarlo (para mostrarlo en el formulario).
 *  Refleja el contador persistente: no reutiliza números aunque se borre el más alto. */
export async function peekSku(categoria: string, productos: Producto[] = []): Promise<string> {
  const prefijo = await prefijoDeCategoria(categoria, productos);
  const { data, error } = await supabase.rpc('peek_sku', { p_prefijo: prefijo });
  if (error) throw error;
  return fmtSku(prefijo, Number(data) || 1);
}

/** Reserva (atómico) y devuelve el próximo SKU correlativo. Úsese al CREAR. */
export async function nextSku(categoria: string, productos: Producto[] = []): Promise<string> {
  const prefijo = await prefijoDeCategoria(categoria, productos);
  const { data, error } = await supabase.rpc('next_sku', { p_prefijo: prefijo, p_n: 1 });
  if (error) throw error;
  return fmtSku(prefijo, Number(data) || 1);
}

/** Reserva N SKUs correlativos de una categoría (un solo viaje) y los devuelve. */
export async function reservarSkus(categoria: string, n: number, productos: Producto[] = []): Promise<string[]> {
  if (n <= 0) return [];
  const prefijo = await prefijoDeCategoria(categoria, productos);
  const { data, error } = await supabase.rpc('next_sku', { p_prefijo: prefijo, p_n: n });
  if (error) throw error;
  const start = Number(data) || 1;
  return Array.from({ length: n }, (_, i) => fmtSku(prefijo, start + i));
}

/* Catálogos compartidos: persistidos en Supabase (tabla `taxonomias`) +
   valores ya presentes en productos (por compatibilidad con datos legados). */
import { addTaxonomia, deleteTaxonomia, listTaxonomia, renameTaxonomia } from '@/shared/lib/taxonomias';

export async function getCategorias(fromProductos: Producto[] = []): Promise<string[]> {
  const set = new Set<string>();
  try {
    const extras = await listTaxonomia('inventario.categoria');
    extras.forEach((c) => set.add(c));
  } catch { /* falla silenciosa */ }
  fromProductos.forEach((p) => p.categoria && set.add(p.categoria));
  // Defaults de respaldo sólo si la lectura del catálogo falló completamente.
  if (set.size === 0) CATEGORIAS_DEFAULT.forEach((c) => set.add(c));
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}

export async function addCategoria(nombre: string, actorEmail?: string): Promise<string | null> {
  return addTaxonomia('inventario.categoria', nombre, actorEmail);
}

/**
 * Renombra una categoría de inventario en cascada:
 *  · Actualiza la fila de `taxonomias` (insert nuevo + delete viejo).
 *  · Re-etiqueta todos los `productos.categoria` que tenían el valor anterior.
 *  Devuelve la cantidad de productos afectados.
 */
export async function renombrarCategoria(oldNombre: string, newNombre: string, actorEmail?: string): Promise<number> {
  const oldClean = oldNombre.trim();
  const newClean = newNombre.trim();
  if (!oldClean || !newClean) throw new Error('Nombres vacíos');
  if (oldClean === newClean) return 0;

  await renameTaxonomia('inventario.categoria', oldClean, newClean, actorEmail);

  const { data, error } = await supabase
    .from('productos')
    .update({ categoria: newClean })
    .eq('categoria', oldClean)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function eliminarCategoria(nombre: string): Promise<void> {
  const { count, error } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('categoria', nombre);
  if (error) throw error;
  if ((count ?? 0) > 0) throw new Error(`No se puede eliminar: ${count} producto(s) usan esta categoría`);
  await deleteTaxonomia('inventario.categoria', nombre);
}

export async function getUnidades(fromProductos: Producto[] = []): Promise<string[]> {
  // Deduplicamos SIN distinguir mayúsculas/minúsculas (evita el doble «kg»/«Kg»).
  // La primera grafía que aparece (catálogo > productos) gana como canónica.
  const porClave = new Map<string, string>();
  const agregar = (u?: string | null) => {
    const v = (u ?? '').trim();
    if (!v) return;
    const k = v.toLowerCase();
    if (!porClave.has(k)) porClave.set(k, v);
  };
  try {
    const extras = await listTaxonomia('inventario.unidad');
    extras.forEach(agregar);
  } catch { /* falla silenciosa */ }
  if (fromProductos.length > 0) {
    fromProductos.forEach((p) => agregar(p.unidad));
  } else {
    // Sin lista de productos (p. ej. Solicitud de Pedido): traemos las unidades
    // usadas en productos directo de la BD, para no perder medidas que existen en
    // inventario pero todavía no están en el catálogo `taxonomias` (p. ej. «UND»).
    try {
      const { data } = await supabase.from('productos').select('unidad');
      (data ?? []).forEach((r: { unidad?: string | null }) => agregar(r.unidad));
    } catch { /* falla silenciosa */ }
  }
  if (porClave.size === 0) UNIDADES_DEFAULT.forEach(agregar);
  return Array.from(porClave.values()).sort((a, b) => a.localeCompare(b, 'es'));
}

export async function addUnidad(nombre: string, actorEmail?: string): Promise<string | null> {
  return addTaxonomia('inventario.unidad', nombre, actorEmail);
}

export async function renombrarUnidad(oldNombre: string, newNombre: string, actorEmail?: string): Promise<number> {
  const oldClean = oldNombre.trim();
  const newClean = newNombre.trim();
  if (!oldClean || !newClean) throw new Error('Nombres vacíos');
  if (oldClean === newClean) return 0;
  await renameTaxonomia('inventario.unidad', oldClean, newClean, actorEmail);
  const { data, error } = await supabase
    .from('productos')
    .update({ unidad: newClean })
    .eq('unidad', oldClean)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function contarProductosPorCategoria(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('productos').select('categoria');
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    const c = (row as { categoria: string }).categoria;
    if (c) acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
}

/** Conteo de productos por unidad (para el gestor de Medidas). */
export async function contarProductosPorUnidad(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('productos').select('unidad');
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    const u = (row as { unidad: string }).unidad;
    if (u) acc[u] = (acc[u] ?? 0) + 1;
    return acc;
  }, {});
}

/** Elimina una medida del catálogo. SOLO si ningún producto la usa. */
export async function eliminarUnidad(nombre: string): Promise<void> {
  const { count, error } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('unidad', nombre);
  if (error) throw error;
  if ((count ?? 0) > 0) throw new Error(`No se puede eliminar: ${count} producto(s) usan esta medida`);
  await deleteTaxonomia('inventario.unidad', nombre);
}

export async function listProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .order('nombre', { ascending: true });
  if (error) throw error;
  // Orden alfabético A→Z real (español, sin distinguir mayúsculas/acentos):
  // la colación de la BD puede intercalar mayúsculas/números/acentos distinto,
  // así que se reordena en el cliente para que la lista quede siempre A-Z.
  return ((data ?? []) as Producto[]).sort((a, b) =>
    (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es', { sensitivity: 'base', numeric: true }));
}

export async function findProducto(id: string): Promise<Producto | null> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Producto | null;
}

export async function findBySku(sku: string): Promise<Producto | null> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('sku', sku)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Producto | null;
}

export async function createProducto(input: ProductoInput): Promise<Producto> {
  const { data, error } = await supabase
    .from('productos')
    .insert(input)
    .select('*')
    .single();
  if (error) {
    // La base no admite dos productos ACTIVOS con el mismo nombre ignorando
    // tildes y mayúsculas (índice `productos_nombre_sin_acentos_activos`).
    // Sin este mensaje el usuario solo vería el error crudo de Postgres y no
    // entendería por qué le rechaza un nombre que en pantalla "no existe":
    // el que ya está cargado puede tener otra tilde u otras mayúsculas.
    if ((error as { code?: string }).code === '23505' && /nombre_sin_acentos/.test(error.message ?? '')) {
      throw new Error(
        `Ya existe un producto llamado «${input.nombre}» (los acentos y las mayúsculas no cuentan: ` +
        'si está cargado como «PLÁTANO», no se puede crear «PLATANO»). Buscalo en el inventario y usá ese.',
      );
    }
    throw error;
  }
  const prod = data as Producto;
  // El producto nace TAMBIÉN con su fila en `existencias` (su almacén, con el stock/costo
  // inicial), así aparece en las vistas por almacén sin esperar a su primer movimiento.
  // Idempotente: si ya existiera la fila, no la pisa. (Antes quedaban productos "fantasma"
  // sin existencia hasta recibir mercancía.)
  const almacen = (input.almacen ?? '').trim();
  if (almacen) {
    const { error: exErr } = await supabase
      .from('existencias')
      .upsert(
        {
          producto_id: prod.id,
          almacen,
          stock: Math.max(0, Number(input.stock) || 0),
          costo_promedio: Math.max(0, Number(input.precio) || 0),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'producto_id,almacen', ignoreDuplicates: true },
      );
    if (exErr) throw exErr;
  }
  return prod;
}

export async function updateProducto(
  id: string,
  patch: Partial<ProductoInput>,
): Promise<Producto> {
  // Si el patch trae PRECIO, capturamos el anterior para propagar SOLO cuando cambió
  // (así un cambio de nombre/estado no pisa el costo por almacén).
  let precioAnterior: number | null = null;
  if (patch.precio !== undefined) {
    const { data: prev } = await supabase.from('productos').select('precio').eq('id', id).maybeSingle();
    precioAnterior = prev ? Number((prev as { precio: number | null }).precio) : null;
  }
  const { data, error } = await supabase
    .from('productos')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  // Al EDITAR el precio unitario desde inventario, se PROPAGA como costo (PMP) a las
  // existencias del producto en TODOS sus almacenes. Así Salidas/Traslados —que descuentan
  // al costo por almacén (existencias.costo_promedio)— reflejan el precio nuevo y no el
  // inicial. Solo se dispara cuando el precio realmente cambió.
  if (patch.precio !== undefined && Number.isFinite(Number(patch.precio)) && Number(patch.precio) !== precioAnterior) {
    const nuevoCosto = Math.round((Number(patch.precio) || 0) * 10000) / 10000;
    // GT-INT-13 · Acotado al almacén del producto. Sin el filtro, corregir el
    // «Precio UND» de la ficha aplastaba el costo promedio REAL de todos los
    // almacenes a la vez —promedios construidos con varias compras— y ese costo
    // histórico no se puede reconstruir salvo recorriendo el kardex a mano.
    const almacenProd = (data as { almacen?: string | null }).almacen ?? 'General';
    const { error: eEx } = await supabase
      .from('existencias')
      .update({ costo_promedio: nuevoCosto, updated_at: new Date().toISOString() })
      .eq('producto_id', id)
      .eq('almacen', almacenProd);
    if (eEx) throw eEx;
  }
  return data as Producto;
}

export async function setEstadoProducto(
  id: string,
  estado: EstadoGenerico,
): Promise<Producto> {
  return updateProducto(id, { estado });
}

/**
 * Mutación directa de stock — uso restringido a `movimientos.repository.ts`.
 * El resto del código debe pasar SIEMPRE por `registrarMovimiento` para
 * mantener el kardex sincronizado.
 */
export async function _setStockRaw(id: string, nuevoStock: number): Promise<void> {
  const { error } = await supabase
    .from('productos')
    .update({ stock: nuevoStock })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Recepciones finalizadas: órdenes ya cerradas (estado 'finalizada').
 * Se muestran como tarjetas (historial) en el módulo de inventario.
 */
export async function listRecepcionesFinalizadas(): Promise<Orden[]> {
  const { data, error } = await supabase
    .from('ordenes')
    .select('*')
    .eq('estado', 'finalizada')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Orden[];
}

/**
 * Órdenes PENDIENTES por recepción (las que el almacenista debe recibir):
 * contra entrega lista para recibir (`por_recibir`) o ya pagada y aún sin recibir
 * (`pagada` con `recibida_en` nulo). Se muestran como tarjetas en Recepciones para
 * que el almacenista las reciba y elija el almacén destino.
 */
export async function listRecepcionesPorMarcar(): Promise<Orden[]> {
  const { data, error } = await supabase
    .from('ordenes')
    .select('*')
    .is('recibida_en', null)
    .in('estado', ['por_recibir', 'pagada'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Orden[];
}

/**
 * Cuántas órdenes están PENDIENTES por marcar la recepción (desde Pedidos/Compras):
 * contra entrega lista para recibir (`por_recibir`) o ya pagada y aún sin recibir
 * (`pagada` con `recibida_en` nulo). Es el número que se muestra en el botón de
 * Recepciones; las finalizadas NO cuentan.
 */
export async function contarRecepcionesPorMarcar(): Promise<number> {
  const { count, error } = await supabase
    .from('ordenes')
    .select('id', { count: 'exact', head: true })
    .is('recibida_en', null)
    .in('estado', ['por_recibir', 'pagada']);
  if (error) throw error;
  return count ?? 0;
}

/* ============================================================
   Productos parecidos — aviso antes de crear un duplicado

   La unicidad por nombre (índice `productos_nombre_sin_acentos_activos`) solo
   frena el nombre IDÉNTICO. Pero los duplicados reales nacen de otra forma:
   alguien escribe «FILTRO HIDRAULICO RETORNO» sin saber que ya existe
   «FILTRO HIDRÁULICO DE RETORNO 14509379». Esta consulta trae los candidatos
   para preguntarle antes de crear.

   El parecido lo calcula la base con trigramas sobre nombre + marca + modelo +
   código + SKU (ver supabase/2026-09-04-productos-parecidos.sql). Se hace allá
   y no acá para no traerse los 469 productos al navegador en cada tecla.
   ============================================================ */
export interface ProductoParecido {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  marca: string | null;
  modelo: string | null;
  almacen: string | null;
  stock: number;
  /** 0 a 1. 1 = idéntico. */
  parecido: number;
  misma_categoria: boolean;
}

export async function buscarProductosParecidos(
  nombre: string,
  categoria?: string | null,
): Promise<ProductoParecido[]> {
  const n = (nombre ?? '').trim();
  // Con menos de 3 letras cualquier cosa se parece a todo: no vale la pena
  // molestar al usuario con una lista de ruido.
  if (n.length < 3) return [];
  const { data, error } = await supabase.rpc('productos_parecidos', {
    p_nombre: n,
    p_categoria: categoria ?? null,
    p_limite: 6,
  });
  // Si la consulta falla NO se bloquea la creación: esto es una ayuda, no un
  // control. Un aviso que no se pudo calcular no puede impedir trabajar.
  if (error) return [];
  return ((data ?? []) as ProductoParecido[]).map((r) => ({
    ...r,
    stock: Number(r.stock) || 0,
    parecido: Number(r.parecido) || 0,
  }));
}
