/* ============================================================
   Golden Touch · Cocina · Buscar en los movimientos de cocina (09/10/2026)

   Pedido del usuario: filtrar el listado por TIPO de movimiento con un
   selector que se pueda escribir, y una búsqueda de texto que encuentre una
   comida por cualquier cosa que tenga a la vista: el víver, su categoría, la
   comida, quién la cargó o la verificó, la fecha, la nota, el código, las
   cantidades, los platos, el valor, si vino del teléfono…

   La búsqueda va sin acentos ni mayúsculas, y con varias palabras pide que
   estén TODAS («pollo almuerzo ana»), en cualquier orden.
   ============================================================ */
import { norm } from '@/shared/lib/texto';

/** Lo mínimo de una comida para buscarla (es un subconjunto de CocinaMovimiento). */
export interface ComidaBuscable {
  codigo?: string | null;
  tipo_comida: string;
  platos?: number | string | null;
  valor_total?: number | string | null;
  nota?: string | null;
  actor_name?: string | null;
  at: string;
  origen?: string | null;
  verificado_at?: string | null;
  verificado_por?: string | null;
  items?: { producto_id: string; sku?: string | null; nombre?: string | null; cantidad?: number | string | null; unidad?: string | null }[] | null;
}

export interface ContextoBusqueda {
  /** El rótulo de la comida («Almuerzo»). */
  rotuloTipo: (tipo: string) => string;
  /** La categoría del víver en el inventario, si se conoce. */
  categoriaDe?: (productoId: string) => string | null | undefined;
  /** Cómo se ve la fecha en la tabla (p. ej. «09/10/2026 12:30»). */
  fechaVisible?: (iso: string) => string;
}

/** Día de Caracas (−04:00) de un instante, como AAAA-MM-DD y DD/MM/AAAA. */
function diasCaracas(iso: string): string[] {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return [];
  const dia = new Date(d.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [a, m, dd] = dia.split('-');
  return [dia, `${dd}/${m}/${a}`, `${dd}-${m}-${a}`];
}

/** Las cantidades como se escriben: «2,5» y «2.5». */
function numeros(v: unknown): string[] {
  const x = Number(v);
  if (!Number.isFinite(x)) return [];
  const s = String(Math.round(x * 10000) / 10000);
  return s.includes('.') ? [s, s.replace('.', ',')] : [s];
}

/** Todo lo que se puede buscar de una comida, en un solo texto normalizado. */
export function textoBuscableComida(m: ComidaBuscable, ctx: ContextoBusqueda): string {
  const partes: (string | null | undefined)[] = [
    m.codigo, m.tipo_comida, ctx.rotuloTipo(m.tipo_comida), m.nota, m.actor_name,
    m.verificado_at ? 'verificada' : 'pendiente sin verificar',
    m.verificado_por,
    m.origen === 'telefono' ? 'telefono movil celular' : 'pc computadora',
    ...diasCaracas(m.at),
    ctx.fechaVisible?.(m.at),
    ...numeros(m.platos).map((p) => `${p} platos`),
    ...numeros(m.valor_total),
  ];
  for (const it of m.items ?? []) {
    partes.push(it.nombre, it.sku, it.unidad, ctx.categoriaDe?.(it.producto_id), ...numeros(it.cantidad));
  }
  return norm(partes.filter(Boolean).join(' · '));
}

/**
 * Filtra las comidas: por tipo (vacío = todas) y por texto. Con varias palabras,
 * cada una tiene que aparecer en algún lado de la comida.
 */
export function buscarComidas<T extends ComidaBuscable>(
  movs: T[], filtro: { tipo?: string | null; texto?: string | null }, ctx: ContextoBusqueda,
): T[] {
  const tipo = (filtro.tipo ?? '').trim();
  const palabras = norm(filtro.texto).split(/\s+/).filter(Boolean);
  return movs.filter((m) => {
    if (tipo && m.tipo_comida !== tipo) return false;
    if (!palabras.length) return true;
    const t = textoBuscableComida(m, ctx);
    return palabras.every((p) => t.includes(p));
  });
}
