/* ============================================================
   Golden Touch · RRHH · Historial de sueldo (PDF)

   El papel que respalda un aumento: de cuánto a cuánto pasó el sueldo de una
   persona, cuándo rigió cada cambio y por qué. Sirve para el expediente y para
   cualquier reclamo, que es justamente lo que no se podía mostrar cuando el
   sueldo era un solo número que se pisaba.

   Todo pasa por `pdfSafe`: la helvetica de jsPDF solo escribe Windows-1252 y
   un glifo que no existe ahí rompe el renglón entero.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { etiquetaVariacion, variacionSueldo } from './sueldos';
import type { Personal, PersonalSueldo } from '@/shared/lib/types';
import { dibujarLogoPdf } from '@/shared/lib/pdfLogo';

const usd = (v: number | null | undefined) =>
  `$ ${Number(v ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
};

export async function descargarHistorialSueldoPdf(
  persona: Personal,
  filas: PersonalSueldo[],
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoPdfEmpresa }, { identidadEmpresa }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
    import('@/shared/lib/empresa'),
  ]);
  const emp = identidadEmpresa(persona.empresa);
  const logo = await loadLogoPdfEmpresa(persona.empresa).catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 56.69; // 2 cm por lado
  let y = MARGIN;
  if (logo) { dibujarLogoPdf(doc, logo, MARGIN, y, 40); }

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(pdfSafe('HISTORIAL DE SUELDO'), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`${emp.nombre}  ·  RIF ${emp.rif}`), W / 2, y + 31, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 52;

  // Ficha de la persona: quién es y cuánto gana hoy.
  const nombre = `${persona.nombre} ${persona.apellido ?? ''}`.trim();
  const datos: string[] = [nombre];
  if (persona.cedula) datos.push(`C.I. ${persona.cedula}`);
  if (persona.cargo) datos.push(persona.cargo);
  if (persona.departamento) datos.push(persona.departamento);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(pdfSafe(datos.join('  ·  ')), MARGIN, y, { maxWidth: W - MARGIN * 2 });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(
    `Sueldo base mensual vigente: ${usd(persona.sueldo_base)} USD`
    + (persona.fecha_ingreso ? `   ·   Ingreso: ${dia(persona.fecha_ingreso)}` : ''),
  ), MARGIN, y + 15);
  y += 30;

  // Del más viejo al más nuevo: un historial se lee hacia adelante, aunque en
  // pantalla convenga lo último arriba.
  const orden = [...filas].sort((a, b) => {
    const f = String(a.fecha).localeCompare(String(b.fecha));
    return f !== 0 ? f : String(a.created_at).localeCompare(String(b.created_at));
  });

  autoTable(doc, {
    startY: y,
    head: [['DESDE', 'SUELDO ANTERIOR', 'SUELDO NUEVO', 'VARIACIÓN', 'MOTIVO', 'NOTA', 'REGISTRADO']],
    body: orden.map((r) => {
      const v = variacionSueldo(r.sueldo_anterior, r.sueldo_nuevo);
      return [
        dia(r.fecha),
        r.sueldo_anterior == null ? '—' : usd(r.sueldo_anterior),
        usd(r.sueldo_nuevo),
        r.sueldo_anterior == null ? '—' : etiquetaVariacion(v),
        pdfSafe(r.motivo),
        pdfSafe(r.nota?.trim() || '—'),
        pdfSafe(`${dia(r.created_at)}${r.created_by ? `\n${r.created_by}` : ''}`),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 62, halign: 'right' },
      2: { cellWidth: 62, halign: 'right' },
      3: { cellWidth: 70, halign: 'right' },
      4: { cellWidth: 'auto' },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 82, fontSize: 7 },
    },
    margin: MARGIN,
  });

  // @ts-expect-error lastAutoTable lo agrega el plugin
  const fin = (doc.lastAutoTable?.finalY ?? y) as number;
  doc.setFontSize(7); doc.setTextColor(110, 110, 110);
  doc.text(pdfSafe(
    'El sueldo base es MENSUAL en dolares. "Desde" es la fecha en que empezo a regir el sueldo nuevo, que puede ser '
    + 'anterior al dia en que se cargo; al lado derecho figura cuando se cargo y quien lo cargo. Ningun renglon se edita.',
  ), MARGIN, fin + 16, { maxWidth: W - MARGIN * 2 });

  const archivo = `historial-sueldo-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;
  previewPdf(doc, archivo);
}
