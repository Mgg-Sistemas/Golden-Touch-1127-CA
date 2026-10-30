/* ============================================================
   Golden Touch · Inventario · Avisos de WhatsApp de la vista de teléfono (29/10/2026)

   La vista de teléfono sirve para los dos depósitos (Inventario General y
   Depósito Mina) y cada botón deja su aviso listo para WhatsApp al guardar:
   producto nuevo, entrada y traslado entre almacenes (la salida y el retorno
   de la Mina tienen el suyo en salidasMina.ts, el stock en stockMinaWhatsapp.ts).
   Todos los emojis son «emoji por defecto» (sin U+FE0F, que WhatsApp pierde).
   ============================================================ */
import { num } from '@/shared/lib/format';
import { fechaHoraVE } from './salidasMina';

/** Nombre del depósito como se lee en el chat. */
export function nombreDepositoChat(almacen: string): string {
  if (!almacen || almacen === 'General') return 'Inventario General';
  return almacen;
}

const pie = (deposito: string, quien: string | null | undefined, cuando: string | null | undefined) => {
  const l: string[] = [];
  if (quien) l.push(`👷 *Registrado por:* ${quien}`);
  const f = fechaHoraVE(cuando ?? new Date().toISOString());
  if (f) l.push(`🕒 ${f}`);
  l.push('', `🏢 GOLDEN TOUCH 1127 C.A. · ${deposito}`);
  return l;
};

const conUnidad = (n: number, unidad?: string | null) => `${num(n)}${unidad ? ` ${unidad}` : ''}`;

export interface AvisoProductoNuevo {
  deposito: string;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  cantidad: number;
  costo?: number | null;
  ubicacion?: string | null;
}

/** «Producto nuevo»: el alta y lo que entró con ella. */
export function mensajeProductoNuevo(a: AvisoProductoNuevo, quien?: string | null, cuando?: string | null): string {
  const l = [
    `🆕 *PRODUCTO NUEVO · ${a.deposito.toUpperCase()}*`,
    `🔖 *SKU:* ${a.sku}`,
    '',
    `📦 *Producto:* ${a.nombre}`,
    `🏷 *Categoría:* ${a.categoria}`,
    `🔢 *Cantidad inicial:* ${conUnidad(a.cantidad, a.unidad)}`,
  ];
  if (a.costo && a.costo > 0) l.push(`💵 *Costo c/u:* $${num(a.costo)}`);
  if (a.ubicacion?.trim()) l.push(`📍 *Ubicación:* ${a.ubicacion.trim()}`);
  l.push('', ...pie(a.deposito, quien, cuando));
  return l.join('\n');
}

export interface AvisoEntrada {
  deposito: string;
  sku: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  /** Lo que quedó después de la entrada. */
  queda: number;
  nota?: string | null;
}

/** «Entrada»: llegó más de un producto que ya estaba. */
export function mensajeEntrada(a: AvisoEntrada, quien?: string | null, cuando?: string | null): string {
  const l = [
    `📥 *ENTRADA · ${a.deposito.toUpperCase()}*`,
    '',
    `📦 *Producto:* ${a.nombre} (${a.sku})`,
    `➕ *Entró:* ${conUnidad(a.cantidad, a.unidad)}`,
    `📊 *Queda en existencia:* ${conUnidad(a.queda, a.unidad)}`,
  ];
  if (a.nota?.trim()) l.push(`📝 *Nota:* ${a.nota.trim()}`);
  l.push('', ...pie(a.deposito, quien, cuando));
  return l.join('\n');
}

/** Lo que devuelve la base (inventario_trasladar_deposito). */
export interface TrasladoAlmacen {
  codigo: string;
  cantidad: number;
  unidad: string;
  origen: string;
  destino: string;
  producto_origen_id: string;
  producto_destino_id: string;
  nombre: string;
  sku_origen: string;
  sku_destino: string;
  creado_en_destino: boolean;
  stock_origen: number;
  stock_destino: number;
  nota: string | null;
  at: string;
}

/** «Traslado entre almacenes»: de dónde a dónde, cuánto y cómo quedan los dos. */
export function mensajeTraslado(t: TrasladoAlmacen, quien?: string | null): string {
  const o = nombreDepositoChat(t.origen);
  const d = nombreDepositoChat(t.destino);
  const l = [
    '🔁 *TRASLADO ENTRE ALMACENES*',
    `🔖 *N°:* ${t.codigo}`,
    '',
    `📦 *Producto:* ${t.nombre}`,
    `🔢 *Cantidad:* ${conUnidad(Number(t.cantidad), t.unidad)}`,
    `📤 *Sale de:* ${o} (${t.sku_origen})`,
    `📥 *Entra a:* ${d} (${t.sku_destino})${t.creado_en_destino ? ' · producto nuevo en ese almacén' : ''}`,
    '',
    `📊 *Queda en ${o}:* ${conUnidad(Number(t.stock_origen), t.unidad)}`,
    `📊 *Queda en ${d}:* ${conUnidad(Number(t.stock_destino), t.unidad)}`,
  ];
  if (t.nota?.trim()) l.push(`📝 *Nota:* ${t.nota.trim()}`);
  l.push('', ...pie(o, quien, t.at));
  return l.join('\n');
}
