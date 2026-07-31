/* ============================================================
   Golden Touch · Saneo de texto para PDF (jsPDF · fuentes estándar)
   Las fuentes base de jsPDF (helvetica) dibujan Windows-1252: los
   emojis / pictogramas / flechas quedan fuera y salen como basura
   (ej. "Ø=ÞÞ"). Este helper quita esos glifos y pasa las flechas a
   ASCII, PERO conserva la puntuación tipográfica (— … « » " " ' ' €
   • ·) y los acentos, que SÍ existen en Windows-1252.
   ============================================================ */

/** Deja `s` seguro para imprimir con las fuentes estándar de jsPDF. */
export function pdfSafe(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')            // emojis / pictogramas (🛞, 🍽, 🚜…)
    .replace(/[\u{2600}-\u{27BF}]/gu, '')              // símbolos misceláneos y dingbats
    .replace(/[\u{2B00}-\u{2BFF}]/gu, '')              // flechas/estrellas suplementarias
    .replace(/[\u{2190}-\u{21FF}]/gu, '')              // flechas (las usadas ya se pasaron a ASCII)
    .replace(/[\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, '') // selectores de variación / ZWJ / keycap
    .replace(/[\u{E000}-\u{F8FF}]/gu, '')              // uso privado (íconos de fuentes)
    .replace(/�/g, '')                            // carácter de reemplazo
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
