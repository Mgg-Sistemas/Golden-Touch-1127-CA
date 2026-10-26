/* ============================================================
   Golden Touch · Compras · Buscador de órdenes por TODAS sus características
   y filtro «Realizadas por» (17/10/2026).

   Lógica pura (sin Supabase): la usan el Kanban/Lista de Órdenes de Compra y
   el Histórico, y se prueba sola. Solo importa helpers sin efectos.
   ============================================================ */
import type { Orden, Proveedor } from '@/shared/lib/types';
import { norm } from '@/shared/lib/texto';
import { date, dateTime, statusBadge } from '@/shared/lib/format';

/** Datos de apoyo para armar el texto buscable de una orden. */
export interface ContextoBusqueda {
  proveedores?: Map<string, Pick<Proveedor, 'razon_social' | 'rif' | 'contacto'> & { categorias?: string[] | null }>;
  /** email (en minúscula) → «Nombre Apellido». */
  personas?: Map<string, string>;
  /** sku → categoría del producto. */
  categorias?: Map<string, string>;
  /** equipo_id → nombre, marca, modelo y marcas de repuestos/filtros */
  equipos?: Map<string, { equipo: string; marca?: string | null; modelo?: string | null; repuestos?: string[] }>;
}

/** Un monto en todas las grafías con las que alguien lo escribiría. */
export function grafiasMonto(n: number | null | undefined): string[] {
  if (n == null || !Number.isFinite(Number(n))) return [];
  const v = Number(n);
  const fijo = v.toFixed(2);                       // 1500.50
  const [ent, dec] = fijo.split('.');
  const milesPunto = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const milesComa = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return Array.from(new Set([
    String(v), fijo, `${ent},${dec}`, `${milesPunto},${dec}`, `${milesComa}.${dec}`, milesPunto, milesComa, ent,
  ]));
}

/** Una fecha ISO como dd-mm-yyyy, dd/mm/yyyy y yyyy-mm-dd (y con hora si la trae). */
export function grafiasFecha(iso: string | null | undefined): string[] {
  if (!iso) return [];
  const d = date(iso);
  if (!d || d === '—') return [];
  return [d, d.replace(/-/g, '/'), d.split('-').reverse().join('-'), dateTime(iso)];
}

/**
 * Quién hizo la OC (el analista de Compras): el que eligió la oferta
 * (`oc_creada_por`); si no, quien la emitió; si no, el actor del evento de
 * creación en el historial; y para las OP todavía sin OC, quien las aprobó.
 * Devuelve el correo (en minúscula) o null.
 */
export function realizadaPor(o: Orden): string | null {
  const directo = o.oc_creada_por || o.oc_emitida_por;
  if (directo) return directo.toLowerCase();
  const ev = [...(o.historial ?? [])].reverse().find((h) => /^oc_creada/.test(h.evento) && h.actor);
  if (ev?.actor) return ev.actor.toLowerCase();
  return o.aprobada_por ? o.aprobada_por.toLowerCase() : null;
}

/** Nombre para mostrar de un correo (o el correo si no se conoce). */
export function nombrePersona(email: string | null | undefined, personas?: Map<string, string>): string {
  if (!email) return '';
  return personas?.get(email.toLowerCase()) ?? email;
}

/** Las personas que realizaron las órdenes de la lista, ordenadas por nombre. */
export function personasQueRealizaron(ordenes: Orden[], personas?: Map<string, string>): { email: string; nombre: string }[] {
  const vistos = new Map<string, string>();
  for (const o of ordenes) {
    const e = realizadaPor(o);
    if (e && !vistos.has(e)) vistos.set(e, nombrePersona(e, personas));
  }
  return [...vistos.entries()].map(([email, nombre]) => ({ email, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

const metodoLegible = (s: string | null | undefined) => (s ?? '').replace(/_/g, ' ');

/** Todo lo que se puede decir de una orden, normalizado, para buscar por cualquier característica. */
export function textoBuscableOrden(o: Orden, ctx: ContextoBusqueda = {}): string {
  const prov = o.proveedor_id ? ctx.proveedores?.get(o.proveedor_id) : undefined;
  const items = o.items ?? [];
  const partes: (string | number | null | undefined)[] = [
    o.codigo, o.oc_codigo,
    o.tipo === 'servicio' ? 'servicio' : 'compra producto',
    o.urgente ? 'urgente' : null,
    o.estado, statusBadge(o.estado).label,
    prov?.razon_social, prov?.rif, prov?.contacto, ...(prov?.categorias ?? []),
    o.solicitante, o.solicitante_email, o.ci_solicitante, o.unidad_solicitante,
    nombrePersona(realizadaPor(o), ctx.personas), realizadaPor(o),
    nombrePersona(o.aprobada_por, ctx.personas), nombrePersona(o.oc_aprobada_por, ctx.personas),
    nombrePersona(o.pagada_por, ctx.personas), nombrePersona(o.recibida_por, ctx.personas),
    o.notas, o.motivo, o.finalidad, o.oc_seleccion_observacion, o.nota_recepcion, o.motivo_rechazo,
    ...(o.clasificacion ?? []),
    o.almacen_destino, metodoLegible(o.condiciones_pago),
    ...(o.metodo_pago ?? []).flatMap((m) => [metodoLegible(m.metodo), m.moneda, ...grafiasMonto(m.monto)]),
    o.total_moneda, o.pago_en_divisa ? 'divisa divisas' : null,
    o.numero_administracion,
    o.comprobante_tipo === 'nota_entrega' ? 'nota de entrega' : o.comprobante_tipo,
    o.iva_aplicado ? 'iva' : null, o.igtf_aplicado ? 'igtf' : null,
    o.retencion_aplicada ? 'retencion' : null,
    ...grafiasMonto(o.total), ...grafiasMonto(o.total_divisa), ...grafiasMonto(o.abonado_total),
    ...grafiasMonto(o.anticipo_monto), o.anticipo_moneda,
    ...grafiasFecha(o.created_at), ...grafiasFecha(o.aprobada_en), ...grafiasFecha(o.oc_creada_en),
    ...grafiasFecha(o.oc_aprobada_en), ...grafiasFecha(o.pagada_en), ...grafiasFecha(o.recibida_en),
    ...grafiasFecha(o.finalizada_en),
    ...items.flatMap((it) => {
      const eq = it.equipo_id ? ctx.equipos?.get(it.equipo_id) : undefined;
      return [
        it.sku, it.nombre, it.marca, it.modelo, it.unidad, it.area, it.finalidad,
        it.equipo_nombre, it.insumo_nombre, it.categoria_servicio, it.marca_recibida, it.modelo_recibido,
        eq?.equipo, eq?.marca, eq?.modelo, ...(eq?.repuestos ?? []),
        ctx.categorias?.get(it.sku), ...grafiasMonto(it.precio), ...grafiasMonto(it.cantidad * it.precio),
      ];
    }),
    ...(o.detalle_servicio ?? []).map((d) => JSON.stringify(d)),
  ];
  return partes.map((v) => norm(v == null ? '' : String(v))).filter(Boolean).join(' | ');
}

/** ¿La orden coincide con lo buscado? Varias palabras = todas tienen que aparecer. */
export function coincideOrden(o: Orden, buscar: string, ctx: ContextoBusqueda = {}): boolean {
  const palabras = norm(buscar).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const texto = textoBuscableOrden(o, ctx);
  return palabras.every((p) => texto.includes(p));
}
