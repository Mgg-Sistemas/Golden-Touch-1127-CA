/* ============================================================
   Golden Touch · Combustible · Aviso del movimiento para WhatsApp

   Lo que se manda al grupo apenas se carga un surtido: qué salió, cuántos
   litros, de qué tanque, a qué equipo, quién autorizó y cuándo. Con emojis
   porque se lee en el teléfono, a la carrera y con sol.

   El texto se arma aquí, sin pantalla, para poder probarlo: WhatsApp no
   perdona un mensaje mal armado y este se manda a un grupo de trabajo.
   ============================================================ */
import type { MovimientoTanque, TipoMovTanque } from '@/shared/lib/types';

/**
 * La flecha dice para dónde va el combustible: abajo sale, arriba entra.
 *
 * El surtidor (⛽) es el de los LITROS, que es el dato que se mira primero
 * (29/09/2026, pedido del usuario: antes era una gota de agua). El tanque pasó
 * al balde (🪣) para no repetir el mismo emoji dos renglones seguidos: el de
 * bidón, 🛢, es de los que necesitan el selector invisible y llega roto.
 *
 * TODOS los emojis de este archivo son «emoji por defecto» a propósito
 * (28/09/2026). Los que se veían antes —↩️ ⚠️ 🛢️ ➡️ ⏱️ 🛣️— son símbolos de
 * TEXTO que solo se pintan a color si los acompaña el selector invisible
 * U+FE0F. WhatsApp lo pierde al abrir el enlace con el mensaje escrito, así
 * que en el teléfono llegaban en blanco y negro o como un cuadrito. La prueba
 * de este archivo corta cualquier emoji que necesite ese selector.
 */
export const EMOJI_TIPO: Record<TipoMovTanque, string> = {
  uso: '🔽',
  traslado: '🔁',
  entrada: '🔼',
  retorno: '🔃',
  merma: '🚨',
};

export const TITULO_TIPO: Record<TipoMovTanque, string> = {
  uso: 'SALIDA DE COMBUSTIBLE',
  traslado: 'TRASLADO ENTRE TANQUES',
  entrada: 'ENTRADA DE COMBUSTIBLE',
  retorno: 'RETORNO AL TANQUE',
  merma: 'MERMA / FALTANTE',
};

const num = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 2 });

/** Fecha AAAA-MM-DD → DD/MM/AAAA. */
export function fechaCorta(f: string | null | undefined): string {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
}

export interface DatosMensaje {
  mov: MovimientoTanque;
  /** Tanque del movimiento. */
  tanque?: string | null;
  /** Tanque que recibe, en un traslado. */
  tanqueDestino?: string | null;
  /** Quién lo cargó (va al pie). */
  registradoPor?: string | null;
}

/**
 * El mensaje listo para pegar en WhatsApp. Cada dato en su renglón: los que
 * no existen no se escriben, así no quedan renglones con «—» de más.
 */
export function mensajeMovimiento(d: DatosMensaje): string {
  const m = d.mov;
  const signo = m.tipo === 'entrada' || m.tipo === 'retorno' ? '+' : '-';
  const lineas: string[] = [
    `${EMOJI_TIPO[m.tipo]} *${TITULO_TIPO[m.tipo]}*`,
    '',
    `⛽ *Litros:* ${signo}${num(m.litros)} L`,
  ];

  if (d.tanque) lineas.push(`🪣 *Tanque:* ${d.tanque}`);
  if (m.tipo === 'traslado' && d.tanqueDestino) lineas.push(`👉 *Pasa al tanque:* ${d.tanqueDestino}`);
  if (m.equipo) lineas.push(`🚚 *Equipo:* ${m.equipo}`);
  if (m.autorizado_por) lineas.push(`✅ *Autorizado por:* ${m.autorizado_por}`);
  if (m.ubicacion) lineas.push(`📍 *Destino:* ${m.ubicacion}`);

  const fecha = fechaCorta(m.fecha);
  if (fecha) lineas.push(`📅 *Fecha:* ${fecha}${m.hora ? ` · 🕒 ${m.hora}` : ''}`);
  else if (m.hora) lineas.push(`🕒 *Hora:* ${m.hora}`);

  if (m.contador_global_fin != null) lineas.push(`🔢 *Contador:* ${num(m.contador_global_fin)}`);
  if (m.horometro_fin != null) lineas.push(`⏳ *Horómetro:* ${num(m.horometro_fin)}`);
  if (m.kilometraje != null) lineas.push(`📏 *Kilometraje:* ${num(m.kilometraje)}`);
  if (m.observacion) lineas.push(`📝 *Nota:* ${m.observacion}`);

  lineas.push('', `🏢 GOLDEN TOUCH 1127 C.A.${d.registradoPor ? ` · Cargado por ${d.registradoPor}` : ''}`);
  return lineas.join('\n');
}

// El enlace y la limpieza del selector de emoji los usa también el aviso de comidas:
// viven en shared y se re-exportan aquí para quien ya los importaba de este archivo.
export { enlaceWhatsapp, sinSelectorDeEmoji } from '@/shared/lib/whatsapp';
