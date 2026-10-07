/* ============================================================
   Golden Touch · Asignaciones · Autorización de tránsito (PDF)

   La asignación de un vehículo es la autorización para que la persona
   transite en él. Este papel es el que porta el conductor: quién (nombre,
   cédula, cargo), qué vehículo (placa, marca, modelo, año, color, seriales),
   desde cuándo y hasta cuándo, por qué ruta o zona, y las dos firmas A MANO
   (por la empresa y el conductor). Sale con la empresa de la nómina de la
   persona (GT o MTO). Si el vehículo ya se devolvió lleva «SIN EFECTO»; si
   pasó la fecha tope, «VENCIDA».
   ============================================================ */
import { loadLogoPdfEmpresa, dibujarLogoPdf, anchoLogoPdf } from '@/shared/lib/pdfLogo';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { previewPdf } from '@/shared/lib/reportePreview';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { hoyVenezuela } from '@/shared/lib/rangosFecha';
import { nombreDe, type Asignacion, type PersonaMin } from './asignacionesReglas';
import { vigenciaAutorizacion, type VehiculoCatalogo } from './vehiculosCatalogo';

const NARANJA: [number, number, number] = [255, 138, 0];
const FONDO_CAJA: [number, number, number] = [255, 247, 237];
const BORDE_CAJA: [number, number, number] = [255, 200, 140];

function fechaVe(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

export async function descargarAutorizacionVehiculoPdf(a: Asignacion, persona: PersonaMin | null, v: VehiculoCatalogo | null): Promise<void> {
  const emp = identidadEmpresa(persona?.empresa);
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadLogoPdfEmpresa(persona?.empresa).catch(() => null),
  ]);
  const hoy = hoyVenezuela();
  const vig = vigenciaAutorizacion(a, hoy);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56.7;
  const der = W - M;
  const ancho = W - 2 * M;
  let y = M;

  // ─── Encabezado: logo + título; N° y fecha a la derecha ───
  const LOGO = 52;
  const tx = logo ? M + anchoLogoPdf(LOGO) + 12 : M;
  if (logo) dibujarLogoPdf(doc, logo, M, y, LOGO);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20);
  doc.text('Autorización de tránsito', tx, y + 17);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`${pdfSafe(emp.nombre)} · RIF ${emp.rif}`, tx, y + 32);
  doc.text('Vehículo asignado al personal', tx, y + 44);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NARANJA);
  doc.text(`N° ${a.codigo}`, der, y + 17, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60);
  doc.text(`Emitida: ${fechaVe(hoy)}`, der, y + 33, { align: 'right' });
  y += Math.max(LOGO, 44) + 8;

  doc.setFontSize(8); doc.setTextColor(110);
  const dom = doc.splitTextToSize(`Domicilio fiscal: ${pdfSafe(emp.domicilio)}`, ancho) as string[];
  doc.text(dom, M, y);
  y += dom.length * 10 + 2;
  doc.setDrawColor(...NARANJA); doc.setLineWidth(1.5);
  doc.line(M, y, der, y);
  y += 22;

  // ─── Texto de la autorización ───
  const nombre = pdfSafe(nombreDe(persona)).toUpperCase();
  const ci = persona?.cedula ? `titular de la cédula de identidad N° ${pdfSafe(persona.cedula)}, ` : '';
  const cargo = persona?.cargo ? `quien se desempeña como ${pdfSafe(persona.cargo)}, ` : '';
  const vigencia = a.autorizacion_hasta
    ? `La presente autorización es válida desde el ${fechaVe(a.fecha)} hasta el ${fechaVe(a.autorizacion_hasta)}, y queda sin efecto antes de esa fecha si se registra la devolución del vehículo.`
    : `La presente autorización es válida desde el ${fechaVe(a.fecha)} y mientras el vehículo permanezca asignado a su nombre; queda sin efecto al registrarse su devolución.`;
  const parrafo = `Por medio de la presente, ${pdfSafe(emp.nombre)}, RIF ${emp.rif}, AUTORIZA al ciudadano(a) ${nombre}, ${ci}${cargo}`
    + `a conducir y transitar con el vehículo descrito a continuación, el cual le ha sido asignado por la empresa. ${vigencia}`;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(30);
  const lineas = doc.splitTextToSize(parrafo, ancho) as string[];
  doc.text(lineas, M, y, { lineHeightFactor: 1.45 });
  y += lineas.length * 10.5 * 1.45 + 12;

  // ─── Datos del vehículo (cuadrícula del sistema, cabecera naranja) ───
  const dato = (x: string | number | null | undefined) => (x == null || x === '' ? '—' : pdfSafe(String(x)));
  const placa = v?.placa ?? a.placa;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [[{ content: 'DATOS DEL VEHÍCULO', colSpan: 4 }]],
    body: [
      ['Placa', dato(placa), 'Tipo', dato(v?.tipo)],
      ['Marca', dato(v?.marca), 'Modelo', dato(v?.modelo)],
      ['Año', dato(v?.anio), 'Color', dato(v?.color)],
      ['Serial de carrocería', dato(v?.serial_carroceria), 'Serial de motor', dato(v?.serial_motor)],
      ['Identificación', dato(v?.alias ?? a.descripcion), 'Km al entregar', a.km_entrega != null ? `${a.km_entrega.toLocaleString('es-VE')} km` : '—'],
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 6, textColor: 20, lineColor: [210, 210, 210], lineWidth: 0.5 },
    headStyles: { fillColor: NARANJA, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 110, textColor: 90, fillColor: [250, 250, 250] },
      1: { fontStyle: 'bold' },
      2: { cellWidth: 100, textColor: 90, fillColor: [250, 250, 250] },
      3: { fontStyle: 'bold' },
    },
  });
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 14;

  // ─── Ruta / zona autorizada ───
  if (a.ruta_autorizada || a.observacion) {
    const txt = [
      a.ruta_autorizada ? `Ruta / zona autorizada: ${pdfSafe(a.ruta_autorizada)}` : null,
      a.observacion ? `Observación: ${pdfSafe(a.observacion)}` : null,
    ].filter(Boolean).join('\n');
    const l = doc.splitTextToSize(txt, ancho - 20) as string[];
    const bh = l.length * 13 + 16;
    doc.setFillColor(...FONDO_CAJA); doc.setDrawColor(...BORDE_CAJA); doc.setLineWidth(0.7);
    doc.roundedRect(M, y, ancho, bh, 5, 5, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(30);
    doc.text(l, M + 10, y + 16);
    y += bh + 14;
  }

  // ─── Compromiso del conductor ───
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70);
  const comp = doc.splitTextToSize(
    'El conductor autorizado debe portar este documento junto con su licencia de conducir y certificado médico vigentes, '
    + 'usar el vehículo solo para las actividades de la empresa y responder por su buen uso, cuidado y devolución.', ancho) as string[];
  doc.text(comp, M, y, { lineHeightFactor: 1.4 });
  y += comp.length * 9 * 1.4 + 10;
  doc.setFontSize(9.5); doc.setTextColor(40);
  doc.text(`Se expide en ${pdfSafe(emp.ciudad)}, a los ${fechaVe(hoy)}.`, M, y);

  // ─── Firmas a mano ───
  const firmaY = Math.max(y + 90, H - 120);
  const fw = (ancho - 40) / 2;
  doc.setDrawColor(120); doc.setLineWidth(0.6);
  doc.line(M, firmaY, M + fw, firmaY);
  doc.line(der - fw, firmaY, der, firmaY);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20);
  doc.text('Autoriza (por la empresa)', M + fw / 2, firmaY + 15, { align: 'center' });
  doc.text('Conductor autorizado', der - fw / 2, firmaY + 15, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text('Nombre, firma y sello', M + fw / 2, firmaY + 29, { align: 'center' });
  doc.text(`${nombre}${persona?.cedula ? ` · C.I. ${pdfSafe(persona.cedula)}` : ''}`, der - fw / 2, firmaY + 29, { align: 'center', maxWidth: fw });

  if (vig !== 'vigente') {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(64); doc.setTextColor(220, 60, 60);
    doc.text(vig === 'vencida' ? 'VENCIDA' : 'SIN EFECTO', W / 2, H / 2, { align: 'center', angle: 30 });
  }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150);
  doc.text(`Documento generado por el sistema · Autorización ${a.codigo}${placa ? ` · Placa ${placa}` : ''}`, M, H - 30);

  previewPdf(doc, `autorizacion-${a.codigo}${placa ? `-${placa}` : ''}.pdf`);
}
