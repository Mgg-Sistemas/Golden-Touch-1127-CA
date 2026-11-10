/* ──────────────────────────────────────────────────────────────────────────────
   «Se guarda en inventario como» (03/11/2026).

   Al cargar la cotización de una solicitud de productos, cada renglón muestra con qué
   producto (ficha) del inventario va a entrar al recibir la OC:
     · «Dejar como viene» (por defecto): el renglón ligado a un producto queda igual; el
       renglón con NOMBRE GENÉRICO de la SP (o el repuesto de Maquinaria) se guarda con
       ese mismo nombre (si ya hay un producto que se llama así, se usa ese; si no, se
       crea, con su categoría y unidad).
     · «Cambiar · elegir del inventario»: se liga a ese producto que ya existe.
     · «Cambiar · producto nuevo»: producto con el nombre que se escriba (si ya existe uno
       que se llama igual, se usa ese).
   La ficha nueva se crea recién al GUARDAR la cotización (si se cancela no queda nada).

   Nunca se renombra un producto existente: cambiar el nombre RE-LIGA el renglón. A
   diferencia de MGG, en GT el renglón toma el SKU del producto (así se agrupan las
   variantes de marca y se casa la recepción); el sku que tenía en la orden queda en
   `sku_orden` para que el reparto entre proveedores lo siga encontrando. Y dos renglones
   distintos no pueden terminar en el mismo producto (se volverían «variantes»).

   Reglas puras (sin base): las usa AgregarOfertaModal, ofertas.repository
   (ligarRenglonesAInventario), el reparto y la recepción.
   ────────────────────────────────────────────────────────────────────────────── */
import type { ItemOrden } from '@/shared/lib/types';
import { requiereAsignarProducto } from './piezasMaquinaria';

export type ModoNombreInventario = 'como_viene' | 'existente' | 'nuevo';

/** Lo que el analista eligió para un renglón. */
export interface EleccionNombreInventario {
  modo: ModoNombreInventario;
  /** Producto elegido (modo «existente»). */
  productoId?: string | null;
  /** Nombre escrito (modo «nuevo»). */
  nombre?: string | null;
  /** Para el producto nuevo: categoría (obligatoria, nunca GENERAL) y unidad. */
  categoria?: string | null;
  unidad?: string | null;
}

/** Lo mínimo de un producto del inventario que hace falta acá. */
export interface FichaMin {
  id: string;
  sku: string;
  nombre: string;
  unidad?: string | null;
  estado?: string | null;
}

/** Renglón de oferta re-ligado: recuerda el sku que tenía en la orden. */
export type ConSkuOrden<T> = T & { sku_orden?: string | null };

type RenglonInv = Pick<ItemOrden, 'sku' | 'nombre' | 'productoId' | 'unidad' | 'pieza_maquinaria' | 'nombre_generico'>;

/** Qué pasa con el renglón al guardar la cotización. */
export type DestinoRenglon =
  /** Queda tal cual, ligado a su producto. */
  | { tipo: 'igual' }
  /** Renglón sin producto que no lo necesita (viejo, no genérico): sigue sin entrar al inventario. */
  | { tipo: 'sin_ficha' }
  /** Se liga a este producto que ya existe. */
  | { tipo: 'ficha'; ficha: FichaMin }
  /** Hay que crear el producto. `falta` = qué dato falta para poder crearlo. */
  | { tipo: 'crear'; nombre: string; categoria: string; unidad: string; falta: string | null }
  /** No se puede resolver todavía (falta elegir el producto o escribir el nombre). */
  | { tipo: 'incompleto'; falta: string };

/** Nombre como se guarda: espacios simples y MAYÚSCULAS. */
export function nombreFicha(nombre: string | null | undefined): string {
  return String(nombre ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Clave para comparar nombres como lo hace la base (sin acentos ni mayúsculas). */
export function claveNombreFicha(nombre: string | null | undefined): string {
  return nombreFicha(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** `true` si la categoría sirve para un producto: no vacía y no GENERAL. */
export function categoriaValida(categoria: string | null | undefined): boolean {
  const c = nombreFicha(categoria);
  return c !== '' && c !== 'GENERAL';
}

/** Producto ACTIVO que se llama igual (sin importar acentos, mayúsculas ni espacios). */
export function fichaPorNombre<T extends FichaMin>(nombre: string, fichas: T[]): T | null {
  const k = claveNombreFicha(nombre);
  if (!k) return null;
  return fichas.find((p) => (p.estado ?? 'activo') === 'activo' && claveNombreFicha(p.nombre) === k) ?? null;
}

/** Elección por defecto: dejar como viene. Un repuesto de Maquinaria propone REPUESTOS. */
export function eleccionInicial(it: Pick<ItemOrden, 'unidad' | 'pieza_maquinaria'>): EleccionNombreInventario {
  return { modo: 'como_viene', unidad: it.unidad ?? null, categoria: it.pieza_maquinaria === true ? 'REPUESTOS' : null };
}

function crearOFicha(nombre: string, it: RenglonInv, e: EleccionNombreInventario | undefined, fichas: FichaMin[]): DestinoRenglon {
  const n = nombreFicha(nombre);
  const existe = fichaPorNombre(n, fichas);
  if (existe) return existe.id === it.productoId ? { tipo: 'igual' } : { tipo: 'ficha', ficha: existe };
  const categoria = nombreFicha(e?.categoria ?? (it.pieza_maquinaria === true ? 'REPUESTOS' : ''));
  const unidad = String(e?.unidad ?? it.unidad ?? '').trim();
  const falta = !categoriaValida(categoria)
    ? 'elige la categoría del producto nuevo (no puede ser GENERAL)'
    : !unidad ? 'elige la unidad del producto nuevo' : null;
  return { tipo: 'crear', nombre: n, categoria, unidad, falta };
}

/** Qué pasa con un renglón según lo elegido. `fichas` = productos ACTIVOS del Inventario General. */
export function destinoRenglon(it: RenglonInv, e: EleccionNombreInventario | undefined, fichas: FichaMin[]): DestinoRenglon {
  const modo = e?.modo ?? 'como_viene';
  if (modo === 'existente') {
    const p = e?.productoId ? fichas.find((f) => f.id === e.productoId) : undefined;
    if (!p) return { tipo: 'incompleto', falta: 'elige el producto del inventario' };
    return p.id === it.productoId ? { tipo: 'igual' } : { tipo: 'ficha', ficha: p };
  }
  if (modo === 'nuevo') {
    if (!nombreFicha(e?.nombre)) return { tipo: 'incompleto', falta: 'escribe el nombre con el que se guarda en inventario' };
    return crearOFicha(e?.nombre ?? '', it, e, fichas);
  }
  // Dejar como viene.
  if (it.productoId) return { tipo: 'igual' };
  // Solo el nombre genérico de la SP y el repuesto de Maquinaria NECESITAN producto;
  // un renglón viejo sin producto sigue como siempre (no entra al inventario).
  if (!requiereAsignarProducto(it)) return { tipo: 'sin_ficha' };
  if (!nombreFicha(it.nombre)) return { tipo: 'incompleto', falta: 'el renglón no trae nombre: escribe uno' };
  return crearOFicha(it.nombre, it, e, fichas);
}

/** Un producto por crear y los renglones (sku) que lo usan. */
export interface FichaPorCrear {
  nombre: string;
  categoria: string;
  unidad: string;
  skus: string[];
}

export interface PlanFichas {
  /** Destino por sku del renglón (las variantes de marca comparten el del renglón base). */
  destinos: Map<string, DestinoRenglon>;
  crear: FichaPorCrear[];
  /** Primer problema que impide guardar, ya redactado; null si todo está resuelto. */
  error: string | null;
}

/**
 * Plan de toda la cotización. `renglones` = un renglón por sku (el base; sus variantes
 * de marca siguen la misma elección). Revisa además que dos renglones distintos no
 * terminen en el mismo producto.
 */
export function planFichas(
  renglones: Array<{ item: RenglonInv; eleccion?: EleccionNombreInventario }>,
  fichas: FichaMin[],
): PlanFichas {
  const destinos = new Map<string, DestinoRenglon>();
  const porNombre = new Map<string, FichaPorCrear>();
  const usadoPor = new Map<string, { nombre: string; producto: string }>();
  let error: string | null = null;
  for (const r of renglones) {
    const d = destinoRenglon(r.item, r.eleccion, fichas);
    destinos.set(r.item.sku, d);
    const nombre = r.item.nombre ?? r.item.sku;
    if (d.tipo === 'incompleto') { error ??= `«${nombre}»: ${d.falta}.`; continue; }
    let clave: string | null = null;
    let producto = '';
    if (d.tipo === 'igual' && r.item.productoId) {
      clave = `id:${r.item.productoId}`;
      producto = fichas.find((f) => f.id === r.item.productoId)?.nombre ?? nombre;
    } else if (d.tipo === 'ficha') {
      clave = `id:${d.ficha.id}`; producto = d.ficha.nombre;
    } else if (d.tipo === 'crear') {
      clave = `nuevo:${claveNombreFicha(d.nombre)}`; producto = d.nombre;
      porNombre.set(clave, { nombre: d.nombre, categoria: d.categoria, unidad: d.unidad, skus: [r.item.sku] });
      if (d.falta) error ??= `«${nombre}»: ${d.falta}.`;
    }
    if (!clave) continue;
    const previo = usadoPor.get(clave);
    if (previo) {
      error ??= `«${previo.nombre}» y «${nombre}» quedarían como el mismo producto (${producto}). Súmale la cantidad a un solo renglón o elige otro producto.`;
      continue;
    }
    usadoPor.set(clave, { nombre, producto });
  }
  return { destinos, crear: [...porNombre.values()], error };
}

/**
 * Liga el renglón al producto: productoId, SKU, nombre y unidad del producto. Guarda el
 * nombre con que se pidió (`nombre_solicitado`) y el sku que tenía en la orden
 * (`sku_orden`). Con presentación de compra (SACO de 25 KG…) la unidad de compra no se
 * toca: cambia solo la de uso. Un repuesto de Maquinaria queda también como repuesto del
 * equipo (`insumo_*`), igual que `asignarProducto`.
 */
export function religarRenglon<T extends ItemOrden>(it: ConSkuOrden<T>, f: FichaMin): ConSkuOrden<T> {
  if (it.productoId === f.id) return it;
  const conPresentacion = (Number(it.factor) || 1) !== 1;
  const unidadFicha = (f.unidad ?? '').trim();
  const out: ConSkuOrden<T> = {
    ...it,
    productoId: f.id,
    sku: f.sku,
    nombre: f.nombre,
    nombre_solicitado: it.nombre_solicitado ?? (nombreFicha(it.nombre) !== nombreFicha(f.nombre) ? it.nombre : null),
    sku_orden: it.sku_orden ?? it.sku,
  };
  if (unidadFicha) {
    if (conPresentacion) out.unidad_uso = unidadFicha;
    else out.unidad = unidadFicha;
  }
  if (it.pieza_maquinaria === true) {
    out.insumo_producto_id = f.id;
    out.insumo_nombre = f.nombre;
  }
  return out;
}

/** Aplica el plan a TODOS los renglones (las variantes de marca siguen a su renglón base por sku). */
export function aplicarPlan<T extends ItemOrden>(items: T[], fichaPorSku: Map<string, FichaMin>): ConSkuOrden<T>[] {
  return items.map((it) => {
    const f = fichaPorSku.get(it.sku);
    return f ? religarRenglon(it, f) : it;
  });
}

/** Un renglón por sku (el primero): las variantes de marca comparten la elección. */
export function renglonesBase<T extends Pick<ItemOrden, 'sku'>>(items: T[]): T[] {
  const vistos = new Set<string>();
  return items.filter((it) => (vistos.has(it.sku) ? false : (vistos.add(it.sku), true)));
}

/** ¿El renglón de la oferta corresponde a este renglón de la orden? (por producto/sku o por `sku_orden`). */
export function casaConRenglonOrden(
  ofertado: ConSkuOrden<Pick<ItemOrden, 'productoId' | 'sku' | 'nombre'>>,
  deOrden: Pick<ItemOrden, 'productoId' | 'sku' | 'nombre'>,
): boolean {
  const clave = (x: Pick<ItemOrden, 'productoId' | 'sku' | 'nombre'>) => x.productoId ?? x.sku ?? x.nombre;
  if (clave(ofertado) === clave(deOrden)) return true;
  return !!ofertado.sku_orden && ofertado.sku_orden === deOrden.sku;
}

/* ───────── Recepción: ningún renglón genérico entra sin producto ───────── */

/**
 * Error que frena la recepción si se está recibiendo (cantidad > 0) un renglón con nombre
 * genérico o un repuesto de Maquinaria que no tiene producto del inventario (antes se daba
 * por recibido y la mercancía nunca entraba). null si no hay problema.
 */
export function errorRenglonesSinFicha(
  items: Array<Pick<ItemOrden, 'sku' | 'nombre' | 'productoId' | 'pieza_maquinaria' | 'nombre_generico'>>,
  recibido: Map<string, number>,
): string | null {
  const sin = (items ?? []).filter((it) => requiereAsignarProducto(it) && !it.productoId && (Number(recibido.get(it.sku)) || 0) > 0);
  if (!sin.length) return null;
  const nombres = sin.map((it) => `«${(it.nombre ?? '').trim() || it.sku}»`).join(', ');
  return `${nombres} no ${sin.length === 1 ? 'tiene' : 'tienen'} producto del inventario: fija con qué nombre se guarda (en la cotización) antes de recibir.`;
}
