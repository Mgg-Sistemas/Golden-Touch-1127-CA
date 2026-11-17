import { previewPdf, previewExcel } from './reportePreview';
import type { jsPDF } from 'jspdf';
import type { WorkBook } from 'xlsx-js-style';

/**
 * Adaptador de compatibilidad para la previsualización de reportes PDF de Contabilidad
 */
export function previewPdfDoc(doc: jsPDF | unknown, filename: string): void {
  previewPdf(doc as jsPDF, filename);
}

/**
 * Adaptador de compatibilidad para la previsualización de libros Excel de Contabilidad
 */
export function previewWorkbook(_XLSX: unknown, wb: WorkBook | unknown, filename: string): void {
  void previewExcel(wb as WorkBook, filename);
}
