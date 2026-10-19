/* ============================================================
   Golden Touch · Depósito Mina · Salidas desde el teléfono (13/10/2026)

   Material, cantidad, motivo y si RETORNA (sí o no), con hasta 4 fotos.
   Si retorna, queda «por retornar» y se le da retorno (todo o por partes)
   al inventario del Depósito Mina. Solo materiales del Depósito Mina: la
   base lo exige (`deposito_mina_registrar_salida`).

   Aquí vive lo que se calcula sin tocar la base: validar, cuánto falta por
   retornar y el aviso para WhatsApp. Todos los emojis son «emoji por
   defecto» (ninguno necesita el selector U+FE0F, que WhatsApp pierde).
   ============================================================ */

import { norm } from '@/shared/lib/texto';

export const MAX_FOTOS_SALIDA_MINA = 4;

export type EstadoSalidaMina = 'sin_retorno' | 'por_retornar' | 'retornada';

export interface FotoSalidaMina { path: string; filename: string }

export interface RetornoSalidaMina {
  at: string;
  cantidad: number;
  nota?: string | null;
  actor?: string | null;
  actor_name?: string | null;
}

export interface SalidaMina {
  id: string;
  codigo: string;
  producto_id: string;
  producto_nombre: string;
  unidad: string | null;
  cantidad: number;
  motivo: string;
  /** Quién autorizó la salida (lista de Combustible). */
  autorizado_por: string | null;
  retorna: boolean;
  retornado: number;
  retornos: RetornoSalidaMina[];
  fotos: FotoSalidaMina[];
  estado: EstadoSalidaMina;
  actor: string | null;
  actor_name: string | null;
  created_at: string;
}

export const ETIQUETA_ESTADO_SALIDA_MINA: Record<EstadoSalidaMina, string> = {
  sin_retorno: 'No retorna',
  por_retornar: 'Por retornar',
  retornada: 'Retornó',
};

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** «2», «2,5» → número; vacío o basura → 0. */
export function leerCantidad(t: string): number {
  const n = Number(String(t ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Cuánto falta por retornar (0 si no retorna o ya volvió todo). */
export function pendienteRetorno(s: Pick<SalidaMina, 'retorna' | 'cantidad' | 'retornado'>): number {
  if (!s.retorna) return 0;
  return Math.max(0, r4(Number(s.cantidad) - Number(s.retornado)));
}

/** Lo que impide registrar la salida. `null` = se puede. */
export function errorSalidaMina(d: {
  productoId: string | null; cantidad: number; stock: number; motivo: string; autorizado: string; retorna: boolean | null;
}): string | null {
  if (!d.productoId) return 'Elige el material.';
  if (!(d.cantidad > 0)) return 'Escribe cuánto sale.';
  if (d.cantidad > d.stock) return `No alcanza: en el depósito hay ${num(d.stock)}.`;
  if (d.motivo.trim().length < 3) return 'Escribe el motivo de la salida.';
  if (!d.autorizado.trim()) return 'Indica quién autorizó la salida.';
  if (d.retorna === null) return '¿Retorna? Marca SÍ o NO.';
  return null;
}

/** Lo que impide un retorno. `null` = se puede. */
export function errorRetornoMina(s: Pick<SalidaMina, 'retorna' | 'cantidad' | 'retornado'>, cantidad: number): string | null {
  const falta = pendienteRetorno(s);
  if (!s.retorna) return 'Esa salida no retorna.';
  if (falta <= 0) return 'Esa salida ya retornó completa.';
  if (!(cantidad > 0)) return 'Escribe cuánto retorna.';
  if (cantidad > falta) return `Solo faltan ${num(falta)} por retornar.`;
  return null;
}

/** Hasta 4 fotos y solo imágenes. */
export function errorFotosSalidaMina(archivos: { name: string; type: string }[], yaHay = 0): string | null {
  if (yaHay + archivos.length > MAX_FOTOS_SALIDA_MINA) return `Se pueden adjuntar hasta ${MAX_FOTOS_SALIDA_MINA} fotos.`;
  const mala = archivos.find((f) => !/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name));
  return mala ? `«${mala.name}» no es una imagen.` : null;
}

export const num = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 4 });

/** Lo que se puede buscar de una salida pendiente: material, código, motivo, quién autorizó,
 *  quién la registró, unidad, cantidades y la fecha (dd/mm/yyyy y dd-mm-yyyy). */
export function textoBuscableSalidaMina(s: SalidaMina): string {
  const f = fechaHoraVE(s.created_at);
  return norm([
    s.producto_nombre, s.codigo, s.motivo, s.autorizado_por, s.actor_name, s.unidad,
    String(s.cantidad), String(pendienteRetorno(s)), f, f.replace(/\//g, '-'),
  ].filter(Boolean).join(' '));
}

/** Filtra «Por retornar» por lo tecleado: sin acentos ni mayúsculas, y con varias palabras
 *  todas tienen que aparecer («manguera bomba»). Vacío devuelve todo. */
export function filtrarPorRetornar(salidas: SalidaMina[], buscar: string): SalidaMina[] {
  const palabras = norm(buscar).split(/\s+/).filter(Boolean);
  if (!palabras.length) return salidas;
  return salidas.filter((s) => { const t = textoBuscableSalidaMina(s); return palabras.every((p) => t.includes(p)); });
}

/** Fecha y hora de Venezuela: «13/10/2026 09:45». */
export function fechaHoraVE(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const f = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const v = (t: string) => f.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')}/${v('year')} ${v('hour')}:${v('minute')}`;
}

const pie = (quien: string | null | undefined, cuando: string | null | undefined) => {
  const l: string[] = [];
  if (quien) l.push(`👷 *Registrado por:* ${quien}`);
  const f = fechaHoraVE(cuando);
  if (f) l.push(`🕒 ${f}`);
  l.push('', '🏢 GOLDEN TOUCH 1127 C.A. · Depósito Mina');
  return l;
};

/** El aviso de la salida, listo para WhatsApp. */
export function mensajeSalidaMina(s: SalidaMina, quien?: string | null): string {
  const u = s.unidad ? ` ${s.unidad}` : '';
  const lineas = [
    '📤 *SALIDA DE DEPÓSITO*',
    `🔖 *N°:* ${s.codigo}`,
    '',
    `📦 *Material:* ${s.producto_nombre}`,
    `🔢 *Cantidad:* ${num(s.cantidad)}${u}`,
    `📝 *Motivo:* ${s.motivo}`,
  ];
  if (s.autorizado_por) lineas.push(`✅ *Autorizado por:* ${s.autorizado_por}`);
  lineas.push(s.retorna ? '🔄 *Retorna:* SÍ' : '❌ *Retorna:* NO');
  if (s.fotos.length) lineas.push(`📷 *Fotos:* ${s.fotos.length}`);
  lineas.push('', ...pie(quien ?? s.actor_name ?? s.actor, s.created_at));
  return lineas.join('\n');
}

/** El aviso de un retorno (total o parcial), listo para WhatsApp. */
export function mensajeRetornoMina(s: SalidaMina, cantidad: number, nota?: string | null, quien?: string | null, cuando?: string | null): string {
  const u = s.unidad ? ` ${s.unidad}` : '';
  const falta = pendienteRetorno(s);
  const lineas = [
    '📥 *RETORNO AL DEPÓSITO*',
    `🔖 *Salida:* ${s.codigo}`,
    '',
    `📦 *Material:* ${s.producto_nombre}`,
    `🔢 *Retorna:* ${num(cantidad)}${u} de ${num(s.cantidad)}${u}`,
    falta > 0 ? `⏳ *Falta por retornar:* ${num(falta)}${u}` : '✅ *Retornó completo*',
  ];
  if (nota?.trim()) lineas.push(`📝 *Nota:* ${nota.trim()}`);
  lineas.push('', ...pie(quien, cuando ?? new Date().toISOString()));
  return lineas.join('\n');
}
