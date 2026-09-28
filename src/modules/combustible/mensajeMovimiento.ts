/* ============================================================
   Golden Touch · Combustible · Aviso del movimiento para WhatsApp

   Lo que se manda al grupo apenas se carga un surtido: qué salió, cuántos
   litros, de qué tanque, a qué equipo, quién autorizó y cuándo. Con emojis
   porque se lee en el teléfono, a la carrera y con sol.

   El texto se arma acá, sin pantalla, para poder probarlo: WhatsApp no
   perdona un mensaje mal armado y este se manda a un grupo de trabajo.
   ============================================================ */
import type { MovimientoTanque, TipoMovTanque } from '@/shared/lib/types';

/** La flecha dice para dónde va el combustible: abajo sale, arriba entra. */
export const EMOJI_TIPO: Record<TipoMovTanque, string> = {
  uso: '🔽',
  traslado: '🔁',
  entrada: '🔼',
  retorno: '↩️',
  merma: '⚠️',
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
 * no existen no se escriben, así no quedan renglones con «—» al pedo.
 */
export function mensajeMovimiento(d: DatosMensaje): string {
  const m = d.mov;
  const signo = m.tipo === 'entrada' || m.tipo === 'retorno' ? '+' : '-';
  const lineas: string[] = [
    `${EMOJI_TIPO[m.tipo]} *${TITULO_TIPO[m.tipo]}*`,
    '',
    `⛽ *Litros:* ${signo}${num(m.litros)} L`,
  ];

  if (d.tanque) lineas.push(`🛢️ *Tanque:* ${d.tanque}`);
  if (m.tipo === 'traslado' && d.tanqueDestino) lineas.push(`➡️ *Pasa al tanque:* ${d.tanqueDestino}`);
  if (m.equipo) lineas.push(`🚚 *Equipo:* ${m.equipo}`);
  if (m.autorizado_por) lineas.push(`✅ *Autorizado por:* ${m.autorizado_por}`);
  if (m.ubicacion) lineas.push(`📍 *Destino:* ${m.ubicacion}`);

  const fecha = fechaCorta(m.fecha);
  if (fecha) lineas.push(`📅 *Fecha:* ${fecha}${m.hora ? ` · 🕒 ${m.hora}` : ''}`);
  else if (m.hora) lineas.push(`🕒 *Hora:* ${m.hora}`);

  if (m.contador_global_fin != null) lineas.push(`🔢 *Contador:* ${num(m.contador_global_fin)}`);
  if (m.horometro_fin != null) lineas.push(`⏱️ *Horómetro:* ${num(m.horometro_fin)}`);
  if (m.kilometraje != null) lineas.push(`🛣️ *Kilometraje:* ${num(m.kilometraje)}`);
  if (m.observacion) lineas.push(`📝 *Nota:* ${m.observacion}`);

  lineas.push('', `🏢 GOLDEN TOUCH 1127 C.A.${d.registradoPor ? ` · Cargado por ${d.registradoPor}` : ''}`);
  return lineas.join('\n');
}

/** Enlace de WhatsApp con el mensaje ya escrito (abre la app o WhatsApp Web). */
export function enlaceWhatsapp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
