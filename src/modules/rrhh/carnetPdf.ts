/* ============================================================
   Golden Touch · RRHH · Carnet en PDF, a su medida real (06/10/2026)

   Una hoja de 54 × 86 mm por cara (frente y reverso), con la imagen a
   página completa. Así, impreso en «Tamaño real» (100 %), sale exacto al
   tamaño del carnet y no hay que recortarlo a ojo ni adivinar la escala.
   Las imágenes son las mismas del PNG (638 × 1016 px = 300 DPI).
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';

/** Medida del carnet en milímetros (CR80 vertical). */
export const CARNET_MM = { ancho: 54, alto: 86 } as const;

export async function descargarCarnetPdf(frente: string, reverso: string | null, nombreArchivo: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: [CARNET_MM.ancho, CARNET_MM.alto], orientation: 'portrait' });
  doc.addImage(frente, 'PNG', 0, 0, CARNET_MM.ancho, CARNET_MM.alto);
  if (reverso) {
    doc.addPage([CARNET_MM.ancho, CARNET_MM.alto], 'portrait');
    doc.addImage(reverso, 'PNG', 0, 0, CARNET_MM.ancho, CARNET_MM.alto);
  }
  previewPdf(doc, nombreArchivo);
}
