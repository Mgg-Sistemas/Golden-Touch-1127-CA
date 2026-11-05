/* ============================================================
   Golden Touch · Mandar un texto por WhatsApp

   Lo usan los avisos que se arman en el teléfono (el surtido de combustible,
   la comida servida). Vive aquí, sin pantalla, para poder probarlo.
   ============================================================ */

/**
 * Enlace de WhatsApp con el mensaje ya escrito (abre la app o WhatsApp Web).
 *
 * Se limpia el selector invisible U+FE0F por si alguna vez se cuela: WhatsApp
 * lo descarta igual y, cuando queda a medias, el emoji llega como cuadrito.
 * Mejor mandar el carácter solo, que es lo que el teléfono sabe pintar.
 */
export function enlaceWhatsapp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(sinSelectorDeEmoji(texto))}`;
}

/**
 * Enlace directo a WhatsApp Web en PC de escritorio.
 * Evita la pantalla intermedia de `api.whatsapp.com` (wa.me) que decodifica
 * erróneamente los emojis UTF-8 multibyte convirtiéndolos en rombos ().
 */
export function enlaceWhatsappWeb(texto: string): string {
  return `https://web.whatsapp.com/send?text=${encodeURIComponent(sinSelectorDeEmoji(texto))}`;
}

/**
 * Enlace inteligente según dispositivo:
 * En teléfonos móviles usa `wa.me/?text=` para abrir de inmediato la app nativa instalada.
 * En PC / escritorio usa `web.whatsapp.com/send?text=` para abrir WhatsApp Web directamente,
 * preservando el 100% de los emojis y saltos de línea sin pasar por la pasarela rota de Meta.
 */
export function enlaceWhatsappInteligente(texto: string): string {
  const esMovil = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  return esMovil ? enlaceWhatsapp(texto) : enlaceWhatsappWeb(texto);
}

/** Quita el selector de presentación de emoji (U+FE0F), que WhatsApp pierde. */
export function sinSelectorDeEmoji(texto: string): string {
  return texto.replace(/️/g, '');
}
