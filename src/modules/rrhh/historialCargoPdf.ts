/* ============================================================
   Golden Touch · RRHH · Historial de cargos (PDF, vista previa) — 04/11/2026

   El papel del expediente: qué cargo tenía la persona, a cuál pasó, desde
   cuándo y por qué. Mismo formato que el historial de sueldo.
   Todo pasa por `pdfSafe` (la helvetica de jsPDF solo escribe Windows-1252).
   ============================================================ */
import { quienSync } from '@/shared/lib/directorioUsuarios';
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { dibujarLogoPdf } from '@/shared/lib/pdfLogo';
import type { Personal } from '@/shared/lib/types';
import { MOTIVO_CARGO_SIN_REGISTRAR, type PersonalCargo } from './cargos';

const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
};

export async function verHistorialCargoPdf(persona: Personal, filas: PersonalCargo[]): Promise<void> {
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
  doc.text(pdfSafe('HISTORIAL DE CAMBIOS DE CARGO'), W / 2, y + 16, { align: 'center' });
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(`${emp.nombre}  ·  RIF ${emp.rif}`), W / 2, y + 31, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 52;

  const nombre = `${persona.nombre} ${persona.apellido ?? ''}`.trim();
  const datos: string[] = [nombre];
  if (persona.cedula) datos.push(`C.I. ${persona.cedula}`);
  if (persona.ficha_nro) datos.push(`Ficha ${persona.ficha_nro}`);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(pdfSafe(datos.join('  ·  ')), MARGIN, y, { maxWidth: W - MARGIN * 2 });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(pdfSafe(
    `Cargo actual: ${persona.cargo || '—'}${persona.departamento ? `   ·   Departamento: ${persona.departamento}` : ''}`
    + (persona.fecha_ingreso ? `   ·   Ingreso: ${dia(persona.fecha_ingreso)}` : ''),
  ), MARGIN, y + 15, { maxWidth: W - MARGIN * 2 });
  y += 30;

  // Del más viejo al más nuevo: un historial se lee hacia adelante.
  const orden = [...filas].sort((a, b) => {
    const f = String(a.fecha).localeCompare(String(b.fecha));
    return f !== 0 ? f : String(a.created_at).localeCompare(String(b.created_at));
  });

  autoTable(doc, {
    startY: y,
    head: [['FECHA DEL CAMBIO', 'CARGO ANTERIOR', 'CARGO NUEVO', 'DEPARTAMENTO', 'MOTIVO', 'REGISTRADO']],
    body: orden.length ? orden.map((r) => [
      dia(r.fecha),
      pdfSafe(r.cargo_anterior || '—'),
      pdfSafe(r.cargo_nuevo || '—'),
      pdfSafe((r.departamento_anterior || '') === (r.departamento_nuevo || '')
        ? (r.departamento_nuevo || '—')
        : `${r.departamento_anterior || '—'} -> ${r.departamento_nuevo || '—'}`),
      pdfSafe(`${r.motivo === MOTIVO_CARGO_SIN_REGISTRAR ? 'Sin motivo registrado' : r.motivo}${r.nota?.trim() ? `\n${r.nota.trim()}` : ''}`),
      pdfSafe(`${dia(r.created_at)}${r.created_by || r.actor_name ? `\n${quienSync(r.actor_name, r.created_by)}` : ''}`),
    ]) : [[{ content: pdfSafe('Todavía no hay cambios de cargo registrados.'), colSpan: 6, styles: { halign: 'center' } }]],
    styles: { fontSize: 8, cellPadding: 3.5, overflow: 'linebreak' },
    headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 82 },
      2: { cellWidth: 82, fontStyle: 'bold' },
      3: { cellWidth: 72 },
      4: { cellWidth: 'auto' },
      5: { cellWidth: 78, fontSize: 7 },
    },
    margin: MARGIN,
  });

  // @ts-expect-error lastAutoTable lo agrega el plugin
  const fin = (doc.lastAutoTable?.finalY ?? y) as number;
  doc.setFontSize(7); doc.setTextColor(110, 110, 110);
  doc.text(pdfSafe(
    '"Fecha del cambio" es desde cuando rige el cargo nuevo, que puede ser anterior al dia en que se cargo; a la derecha '
    + 'figura cuando se cargo y quien lo cargo. Ningun renglon se edita.',
  ), MARGIN, fin + 16, { maxWidth: W - MARGIN * 2 });

  const archivo = `historial-cargos-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;
  previewPdf(doc, archivo);
}
