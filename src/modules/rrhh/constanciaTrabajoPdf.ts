/* ============================================================
   Golden Touch · RRHH · Constancia de Trabajo (PDF · vista previa)
   Carta formal de trabajo ajustada exactamente al formato físico oficial
   de la empresa (con fecha a la derecha, título subrayado, redacción
   oficial y pie con domicilio fiscal).
   ============================================================ */
import type { Personal } from '@/shared/lib/types';
import { money } from '@/shared/lib/format';
import { loadLogoPdfEmpresa, loadFirmaDataUrl, loadFirma2DataUrl, loadFirmaOrlandoDataUrl, dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { EMPRESA_RIF, ciudadCorta, identidadEmpresa } from '@/shared/lib/empresa';
import { cedulaConPuntos } from '@/modules/asignaciones/actas';

export type FirmanteConstancia = 'orlando' | 'rrhh' | 'leydis' | 'gerente' | 'ninguna';

export { EMPRESA_RIF };

export interface ConstanciaTrabajoInput {
  persona: Personal;
  /** A quién va dirigida. Opcional: si no se escribe, la carta no lleva destinatario. */
  dirigidoA?: string | null;
  /** Incluir el salario mensual (USD) en el texto. */
  incluirSalario: boolean;
  /** Firma que se estampa al pie. */
  firmante: FirmanteConstancia;
  /** Ciudad/lugar de expedición. */
  lugar?: string | null;
}

const FIRMANTES: Record<
  Exclude<FirmanteConstancia, 'ninguna'>,
  { nombre: string | null; completo: string; cargo: string; cargoFirma: string; ci?: string; ciTexto?: string }
> = {
  orlando: {
    nombre: 'ORLANDO MOLINA',
    completo: 'ORLANDO SIMON MOLINA CHACON',
    cargo: 'Presidente',
    cargoFirma: 'PRESIDENTE',
    ci: 'C.I. 13.847.053',
    ciTexto: 'V-13.847.053',
  },
  rrhh: {
    nombre: null,
    completo: 'el(la) Representante de Recursos Humanos',
    cargo: 'Jefa de Recursos Humanos',
    cargoFirma: 'JEFA DE RECURSOS HUMANOS',
  },
  leydis: {
    nombre: 'LEYDIS RENGEL',
    completo: 'LEYDIS RENGEL',
    cargo: 'Jefa de Administración',
    cargoFirma: 'JEFA DE ADMINISTRACIÓN',
    ci: 'C.I. 17.654.321',
    ciTexto: 'V-17.654.321',
  },
  gerente: {
    nombre: 'JESÚS LOZADA',
    completo: 'JESÚS ENRIQUE LOZADA',
    cargo: 'Gerente General',
    cargoFirma: 'GERENTE GENERAL',
    ci: 'C.I. 12.345.678',
    ciTexto: 'V-12.345.678',
  },
};

/** Formatea fecha como dd/mm/aaaa. */
function fechaCortaIngreso(iso?: string | null): string {
  if (!iso) return 'su fecha de ingreso';
  const clean = iso.slice(0, 10);
  const partes = clean.split('-');
  if (partes.length === 3) {
    const [y, m, d] = partes;
    return `${d}/${m}/${y}`;
  }
  return clean;
}

export async function construirConstanciaTrabajoPdf(input: ConstanciaTrabajoInput): Promise<import('jspdf').jsPDF> {
  const { persona: p } = input;
  const emp = identidadEmpresa(p.empresa);
  const [{ jsPDF }, logo, firmaGerente, firmaLeydis, firmaOrlando] = await Promise.all([
    import('jspdf'),
    loadLogoPdfEmpresa(p.empresa).catch(() => null),
    input.firmante === 'gerente' ? loadFirmaDataUrl().catch(() => null) : Promise.resolve(null),
    input.firmante === 'leydis' ? loadFirma2DataUrl().catch(() => null) : Promise.resolve(null),
    input.firmante === 'orlando' ? loadFirmaOrlandoDataUrl().catch(() => null) : Promise.resolve(null),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 56.7; // 2 cm
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  // ─── Membrete superior ───
  // Logo a la izquierda
  const CAJA_LOGO = 72;
  if (logo) {
    dibujarLogoPdf(doc, logo, MARGIN, y, CAJA_LOGO);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20, 20, 20);
    doc.text(emp.nombre, MARGIN, y + 30);
  }

  // Fecha alineada a la derecha
  const hoy = new Date();
  const diaHoy = new Intl.DateTimeFormat('es-VE', { day: 'numeric', timeZone: 'America/Caracas' }).format(hoy);
  const mesHoy = new Intl.DateTimeFormat('es-VE', { month: 'long', timeZone: 'America/Caracas' }).format(hoy);
  const mesCap = mesHoy.charAt(0).toUpperCase() + mesHoy.slice(1);
  const anioHoy = new Intl.DateTimeFormat('es-VE', { year: 'numeric', timeZone: 'America/Caracas' }).format(hoy);
  const ciudad = input.lugar ? pdfSafe(input.lugar) : ciudadCorta(emp) || 'Puerto Ordaz';

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(20, 20, 20);
  doc.text(`${ciudad}, ${diaHoy} de ${mesHoy} de ${anioHoy}`, PAGE_W - MARGIN, y + 46, { align: 'right' });

  y += CAJA_LOGO + 28;

  // Destinatario opcional (si se especificó)
  const destinatario = pdfSafe(input.dirigidoA);
  if (destinatario) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(destinatario, MARGIN, y);
    y += 26;
  }

  // ─── Título (Centrado y Subrayado) ───
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20, 20, 20);
  const titleText = 'CONSTANCIA DE TRABAJO';
  const cx = PAGE_W / 2;
  doc.text(titleText, cx, y, { align: 'center' });
  const tw = doc.getTextWidth(titleText);
  doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.8);
  doc.line(cx - tw / 2, y + 2.5, cx + tw / 2, y + 2.5);
  y += 34;

  // ─── Cuerpo (Justificado) ───
  const firma = input.firmante !== 'ninguna' ? FIRMANTES[input.firmante] : FIRMANTES.orlando;
  const nombreFirmante = firma.completo;
  const ciFirmante = firma.ciTexto
    ? `Cédula de Identidad ${firma.ciTexto}, Mayor de edad y de este domicilio, `
    : 'Mayor de edad y de este domicilio, ';
  const condicionFirmante = `actuando en mi condición de ${firma.cargo} de la empresa: ${emp.nombre}, identificada con el RIF Nro. ${emp.rif}, `;

  const ciudadano = p.genero === 'F' ? 'la Ciudadana' : 'el Ciudadano';
  const nacionalidad = p.nacionalidad ? p.nacionalidad.trim() : (p.genero === 'F' ? 'Venezolana' : 'Venezolano');
  const nombreTrabajador = pdfSafe(`${p.nombre} ${p.apellido ?? ''}`.trim().toUpperCase());
  const cedulaTrabajador = p.cedula ? pdfSafe(cedulaConPuntos(p.cedula)) : '—';
  const cargoTrabajador = pdfSafe(p.cargo) || 'su cargo';
  const fechaIngresoTexto = fechaCortaIngreso(p.fecha_ingreso);
  const salario = Number(p.sueldo_base) > 0 ? money(p.sueldo_base) : null;
  const clausulaSalario = input.incluirSalario && salario
    ? `, devengando un salario mensual de ${salario} (USD)`
    : '';

  const parrafo1 =
    `Quien suscribe, ${nombreFirmante}, ${ciFirmante}${condicionFirmante}` +
    `por medio de la presente hago constar que ${ciudadano}: ${nombreTrabajador}, ${nacionalidad}, Mayor de edad, ` +
    `Titular de la Cédula de Identidad Nº ${cedulaTrabajador}, se desempeña en nuestra empresa con el cargo de: ${cargoTrabajador}, ` +
    `desde el ${fechaIngresoTexto}${clausulaSalario}.`;

  const parrafo2 =
    `Constancia que se expide a solicitud de la parte interesada en la Ciudad de ${ciudad}, ` +
    `a los ${diaHoy} días del mes de ${mesCap} del año ${anioHoy}.`;

  const parrafo3 = 'Sin más a que hacer referencia.';

  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  const escribirParrafo = (texto: string, yy: number, gap: number): number => {
    const lineas = doc.splitTextToSize(texto, CONTENT_W) as string[];
    doc.text(lineas, MARGIN, yy, { align: 'justify', maxWidth: CONTENT_W, lineHeightFactor: 1.55 });
    return yy + lineas.length * 11 * 1.55 + gap;
  };

  y = escribirParrafo(parrafo1, y, 26);
  y = escribirParrafo(parrafo2, y, 22);
  y = escribirParrafo(parrafo3, y, 10);

  // ─── Firma ───
  const firmaY = Math.min(Math.max(y + 60, PAGE_H - 220), PAGE_H - 165);
  const centro = PAGE_W / 2;

  try {
    if (input.firmante === 'orlando' && firmaOrlando) {
      const w = 150, h = Math.min(75, (w * firmaOrlando.h) / (firmaOrlando.w || 1));
      doc.addImage(firmaOrlando.dataUrl, 'PNG', centro - w / 2, firmaY - h + 10, w, h);
    } else if (input.firmante === 'gerente' && firmaGerente) {
      const w = 150, h = 67;
      doc.addImage(firmaGerente, 'PNG', centro - w / 2, firmaY - h + 10, w, h);
    } else if (input.firmante === 'leydis' && firmaLeydis) {
      const w = 150, h = Math.min(75, (w * firmaLeydis.h) / (firmaLeydis.w || 1));
      doc.addImage(firmaLeydis.dataUrl, 'PNG', centro - w / 2, firmaY - h + 10, w, h);
    }
  } catch { /* firma opcional */ }

  doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.8);
  doc.line(centro - 110, firmaY, centro + 110, firmaY);
  doc.setTextColor(20, 20, 20);

  if (firma && firma.nombre) {
    let ly = firmaY + 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text(firma.nombre, centro, ly, { align: 'center' });
    ly += 13;
    if (firma.ci) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text(firma.ci, centro, ly, { align: 'center' });
      ly += 13;
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text(firma.cargoFirma, centro, ly, { align: 'center' });
  } else if (firma) {
    let ly = firmaY + 15;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text(firma.cargoFirma, centro, ly, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 90, 90);
    doc.text('Firma autorizada', centro, firmaY + 16, { align: 'center' });
  }

  // ─── Pie de página: Domicilio Fiscal y Contacto ───
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8);

  const domTexto = emp.clave === 'GT'
    ? 'Domicilio Fiscal: UD-208, Urbanización Villa Granada, Manzana Nro 19, Parcela Nro 11, Puerto Ordaz, Municipio Caroní, estado Bolívar.'
    : `Domicilio Fiscal: ${emp.domicilio}`;
  const contactoTexto = emp.clave === 'GT'
    ? 'Teléfono: 0414-1924237 Correo:touchgolden1127@gmail.com'
    : `Teléfono: ${emp.whatsapp || emp.contacto} Correo:${emp.email}`;

  doc.text(pdfSafe(domTexto), PAGE_W / 2, PAGE_H - 46, { align: 'center', maxWidth: CONTENT_W });
  doc.text(pdfSafe(contactoTexto), PAGE_W / 2, PAGE_H - 34, { align: 'center' });

  return doc;
}

export async function descargarConstanciaTrabajoPdf(input: ConstanciaTrabajoInput): Promise<void> {
  const doc = await construirConstanciaTrabajoPdf(input);
  const slug = `${input.persona.nombre}_${input.persona.apellido ?? ''}`.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'personal';
  previewPdf(doc, `constancia-trabajo-${slug}.pdf`);
}
