/* ============================================================
   Golden Touch · RRHH · Constancia de Trabajo (PDF · vista previa)
   Carta formal que hace constar que la persona presta servicios en
   la empresa: cargo, departamento, fecha de ingreso y (opcional) el
   salario mensual. Firma de Administración o Gerencia. Se abre en
   vista previa y se descarga solo si el usuario lo pide.
   ============================================================ */
import type { Personal } from '@/shared/lib/types';
import { money } from '@/shared/lib/format';
import { loadLogoDataUrl, loadFirmaDataUrl, loadFirma2DataUrl } from '@/shared/lib/pdfLogo';
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';

export type FirmanteConstancia = 'leydis' | 'gerente' | 'ninguna';

export interface ConstanciaTrabajoInput {
  persona: Personal;
  /** A quién va dirigida (por defecto «A quien pueda interesar»). */
  dirigidoA?: string | null;
  /** Incluir el salario mensual (USD) en el texto. */
  incluirSalario: boolean;
  /** Firma que se estampa al pie. */
  firmante: FirmanteConstancia;
  /** Ciudad/lugar de expedición. */
  lugar?: string | null;
}

const FIRMANTES: Record<Exclude<FirmanteConstancia, 'ninguna'>, { nombre: string; cargo: string }> = {
  leydis: { nombre: 'LEYDIS RENGEL', cargo: 'Jefa de Administración' },
  gerente: { nombre: 'JESÚS LOZADA', cargo: 'Gerente General' },
};

/** Fecha larga en español: «15 de marzo de 2023». */
function fechaLarga(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export async function descargarConstanciaTrabajoPdf(input: ConstanciaTrabajoInput): Promise<void> {
  const { persona: p } = input;
  const [{ jsPDF }, logo, firmaGerente, firmaLeydis] = await Promise.all([
    import('jspdf'),
    loadLogoDataUrl().catch(() => null),
    input.firmante === 'gerente' ? loadFirmaDataUrl().catch(() => null) : Promise.resolve(null),
    input.firmante === 'leydis' ? loadFirma2DataUrl().catch(() => null) : Promise.resolve(null),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 56.7; // 2 cm
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  // ─── Membrete ───
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 54, 54); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 68 : MARGIN;
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('GOLDEN TOUCH 1127 C.A.', tx, y + 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.setTextColor(90, 90, 90);
  doc.text('Sistema de Gestión de Inventarios', tx, y + 36);
  doc.text('mineralgroupguayanaca@gmail.com  ·  WhatsApp +58 424-9349731', tx, y + 50);
  doc.setTextColor(20, 20, 20);
  y += 74;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 30;

  // ─── Destinatario + fecha ───
  const hoy = new Date();
  const diaHoy = new Intl.DateTimeFormat('es-VE', { day: 'numeric', timeZone: 'America/Caracas' }).format(hoy);
  const mesHoy = new Intl.DateTimeFormat('es-VE', { month: 'long', timeZone: 'America/Caracas' }).format(hoy);
  const anioHoy = new Intl.DateTimeFormat('es-VE', { year: 'numeric', timeZone: 'America/Caracas' }).format(hoy);
  const lugar = pdfSafe(input.lugar) || 'Puerto Ordaz, Estado Bolívar';

  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(`${lugar}, ${diaHoy} de ${mesHoy} de ${anioHoy}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 26;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(pdfSafe(input.dirigidoA) || 'A quien pueda interesar:', MARGIN, y);
  y += 34;

  // ─── Título ───
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('CONSTANCIA DE TRABAJO', PAGE_W / 2, y, { align: 'center' });
  y += 34;

  // ─── Cuerpo (justificado) ───
  const nombre = pdfSafe(`${p.nombre} ${p.apellido ?? ''}`.trim().toUpperCase());
  const cedula = p.cedula ? pdfSafe(p.cedula) : '—';
  const cargo = pdfSafe(p.cargo) || 'su cargo';
  const depto = pdfSafe(p.departamento);
  const ingreso = fechaLarga(p.fecha_ingreso);
  const salario = Number(p.sueldo_base) > 0 ? money(p.sueldo_base) : null;

  const clausulaDepto = depto ? `, adscrito(a) al departamento de ${depto},` : '';
  const clausulaIngreso = p.fecha_ingreso ? ` desde el ${ingreso} hasta la presente fecha` : ' hasta la presente fecha';
  const clausulaSalario = input.incluirSalario && salario
    ? `, devengando un salario mensual de ${salario} (USD)`
    : '';

  const parrafo1 =
    `Quien suscribe, en representación de GOLDEN TOUCH 1127 C.A., por medio de la presente hace constar que ` +
    `el(la) ciudadano(a) ${nombre}, titular de la cédula de identidad N° ${cedula}, presta sus servicios en ` +
    `nuestra empresa desempeñando el cargo de ${cargo}${clausulaDepto}${clausulaIngreso}${clausulaSalario}.`;

  const parrafo2 =
    `Constancia que se expide a solicitud de la parte interesada, en ${lugar}, ` +
    `a los ${diaHoy} días del mes de ${mesHoy} de ${anioHoy}.`;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5);
  const escribirParrafo = (texto: string, yy: number, gap: number): number => {
    const lineas = doc.splitTextToSize(texto, CONTENT_W) as string[];
    doc.text(lineas, MARGIN, yy, { align: 'justify', maxWidth: CONTENT_W, lineHeightFactor: 1.6 });
    return yy + lineas.length * 11.5 * 1.6 + gap;
  };
  y = escribirParrafo(parrafo1, y, 22);
  y = escribirParrafo(parrafo2, y, 20);

  // ─── Firma ───
  const firma = input.firmante !== 'ninguna' ? FIRMANTES[input.firmante] : null;
  const firmaY = Math.min(Math.max(y + 60, PAGE_H - 200), PAGE_H - 150);
  const centro = PAGE_W / 2;

  // Estampar la imagen de firma justo por encima de la línea.
  try {
    if (input.firmante === 'gerente' && firmaGerente) {
      const w = 150, h = 67; // proporción real de firma.png
      doc.addImage(firmaGerente, 'PNG', centro - w / 2, firmaY - h + 6, w, h);
    } else if (input.firmante === 'leydis' && firmaLeydis) {
      const w = 150, h = Math.min(80, (w * firmaLeydis.h) / (firmaLeydis.w || 1));
      doc.addImage(firmaLeydis.dataUrl, 'JPEG', centro - w / 2, firmaY - h + 6, w, h);
    }
  } catch { /* firma opcional */ }

  doc.setDrawColor(120); doc.setLineWidth(0.6);
  doc.line(centro - 110, firmaY, centro + 110, firmaY);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  if (firma) {
    doc.text(firma.nombre, centro, firmaY + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(firma.cargo, centro, firmaY + 30, { align: 'center' });
    doc.text('GOLDEN TOUCH 1127 C.A.', centro, firmaY + 44, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text('Firma y sello autorizados', centro, firmaY + 16, { align: 'center' });
    doc.text('GOLDEN TOUCH 1127 C.A.', centro, firmaY + 30, { align: 'center' });
  }

  // Pie.
  doc.setFontSize(8); doc.setTextColor(140);
  doc.text(
    `Documento generado por el sistema · ${new Intl.DateTimeFormat('es-VE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Caracas' }).format(hoy)}`,
    MARGIN, PAGE_H - 36,
  );

  const slug = `${p.nombre}_${p.apellido ?? ''}`.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'personal';
  previewPdf(doc, `constancia-trabajo-${slug}.pdf`);
}
