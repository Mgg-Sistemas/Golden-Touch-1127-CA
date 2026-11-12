/* ============================================================
   Traslados con RECEPCIÓN (12/11/2026) · lógica pura.

   Del Inventario General (Los Pinos) al Depósito Mina el traslado ya no entra
   solo: sale de Los Pinos y queda «en tránsito» con las fotos del envío; el
   usuario del Depósito Mina lo ve en «Recepción de traslados», adjunta sus
   fotos y le da entrada (supabase/2026-11-12-traslados-transito-recepcion.sql).
   ============================================================ */
import { ALMACEN_MINA, DEPOSITOS_FIJOS } from './depositos';
import { nombreDepositoChat } from './inventarioMovil';
import { fechaHoraVE, num } from './salidasMina';

export const MAX_FOTOS_TRASLADO = 4;

export type EstadoTraslado = 'en_transito' | 'recibido' | 'anulado';

export interface FotoTraslado { path: string; filename: string }

export interface ItemTraslado {
  producto_id: string;
  nombre: string;
  sku: string;
  unidad: string;
  cantidad: number;
  costo?: number | null;
  codigo?: string | null;
}

export interface ResultadoItemTraslado {
  codigo: string;
  producto_destino_id: string;
  sku_destino: string;
  creado_en_destino: boolean;
  stock_destino: number;
}

export interface TrasladoTransito {
  id: string;
  codigo: string;
  origen: string;
  destino: string;
  items: ItemTraslado[];
  nota: string | null;
  fotos_envio: FotoTraslado[];
  enviado_por: string | null;
  enviado_por_nombre: string | null;
  created_at: string;
  estado: EstadoTraslado;
  recibido_por: string | null;
  recibido_por_nombre: string | null;
  recibido_en: string | null;
  nota_recepcion: string | null;
  fotos_recepcion: FotoTraslado[];
  resultado: ResultadoItemTraslado[] | null;
  motivo_anulacion?: string | null;
}

/** ¿Este traslado pasa por recepción? Hoy: de Los Pinos (General) al Depósito Mina. */
export function usaRecepcion(origen: string, destino: string): boolean {
  return origen === DEPOSITOS_FIJOS.general.almacen && destino === ALMACEN_MINA;
}

export function errorFotosTraslado(archivos: { name: string; type: string }[], yaHay = 0): string | null {
  if (yaHay + archivos.length > MAX_FOTOS_TRASLADO) return `Se pueden adjuntar hasta ${MAX_FOTOS_TRASLADO} fotos.`;
  const mala = archivos.find((f) => !/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name));
  return mala ? `«${mala.name}» no es una imagen.` : null;
}

const conUnidad = (n: number, u: string) => `${num(n)} ${u}`.trim();

function lineasItems(t: TrasladoTransito): string[] {
  return t.items.map((x, i) => {
    const r = t.resultado?.find((y) => y.codigo === x.codigo);
    const extra = r ? ` · queda ${conUnidad(Number(r.stock_destino) || 0, x.unidad)}${r.creado_en_destino ? ' (nuevo en el depósito)' : ''}` : '';
    return `${i + 1}. ${x.nombre} — *${conUnidad(Number(x.cantidad) || 0, x.unidad)}*${x.codigo ? ` (${x.codigo})` : ''}${extra}`;
  });
}

/** Aviso de WhatsApp al ENVIAR: va en camino, la Mina tiene que recibirlo. */
export function mensajeEnvioTraslado(t: TrasladoTransito, quien?: string | null): string {
  const l = [
    '🚚 *TRASLADO EN CAMINO*',
    `🔖 *N°:* ${t.codigo}`,
    `📤 *Sale de:* ${nombreDepositoChat(t.origen)}`,
    `📥 *Va a:* ${nombreDepositoChat(t.destino)} (pendiente por recibir)`,
    '',
    `📦 *Productos (${t.items.length}):*`,
    ...lineasItems(t),
  ];
  if (t.nota?.trim()) l.push('', `📝 *Nota:* ${t.nota.trim()}`);
  if (t.fotos_envio.length) l.push(`📷 *Fotos del envío:* ${t.fotos_envio.length}`);
  l.push('', `👤 *Envió:* ${quien || t.enviado_por_nombre || t.enviado_por || '—'}`, `🕒 ${fechaHoraVE(t.created_at)}`);
  return l.join('\n');
}

/** Aviso de WhatsApp al RECIBIR en la Mina. */
export function mensajeRecepcionTraslado(t: TrasladoTransito, quien?: string | null): string {
  const l = [
    '✅ *TRASLADO RECIBIDO*',
    `🔖 *N°:* ${t.codigo}`,
    `📤 *Salió de:* ${nombreDepositoChat(t.origen)} · ${t.enviado_por_nombre || t.enviado_por || '—'} · ${fechaHoraVE(t.created_at)}`,
    `📥 *Recibido en:* ${nombreDepositoChat(t.destino)}`,
    '',
    `📦 *Productos (${t.items.length}):*`,
    ...lineasItems(t),
  ];
  if (t.nota?.trim()) l.push('', `📝 *Nota del envío:* ${t.nota.trim()}`);
  if (t.nota_recepcion?.trim()) l.push(`📝 *Nota de la recepción:* ${t.nota_recepcion.trim()}`);
  if (t.fotos_recepcion.length) l.push(`📷 *Fotos de la recepción:* ${t.fotos_recepcion.length}`);
  l.push('', `👤 *Recibió:* ${quien || t.recibido_por_nombre || t.recibido_por || '—'}`, `🕒 ${fechaHoraVE(t.recibido_en ?? new Date().toISOString())}`);
  return l.join('\n');
}

/** Texto buscable de un traslado en tránsito. */
export function textoTraslado(t: TrasladoTransito): string {
  return [t.codigo, t.nota, t.enviado_por_nombre, t.enviado_por, ...t.items.flatMap((x) => [x.nombre, x.sku, x.codigo])]
    .filter(Boolean).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
