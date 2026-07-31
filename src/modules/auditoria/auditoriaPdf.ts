/* ============================================================
   Golden Touch · Auditoría · PDF (vista previa antes de descargar)
   Dos reportes:
    · Resumen general: tiempo conectado, sesiones y acciones por
      usuario, más las acciones por módulo.
    · Detalle de un usuario: tiempo conectado por día y la línea de
      tiempo de todas sus acciones (con fecha/hora y descripción).
   Reutiliza `previewPdf` (visor embebido, descarga opcional).
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';

export interface AuditoriaResumenPdfInput {
  rango: string;
  conectados: number;
  tiempoTotal: string;
  usuariosActivos: number;
  accionesTotal: number;
  usuarios: { nombre: string; email: string; sesiones: number; tiempo: string; acciones: number; conectado: boolean }[];
  modulos: { modulo: string; icono: string; acciones: number }[];
}

export interface AuditoriaUsuarioPdfInput {
  nombre: string;
  email: string;
  rango: string;
  conectado: boolean;
  tiempoTotal: string;
  sesiones: number;
  acciones: number;
  diasActivos: number;
  porDia: { dia: string; tiempo: string }[];
  timeline: { fecha: string; hora: string; titulo: string; detalle: string }[];
}

async function nuevoDoc(orientacion: 'portrait' | 'landscape', titulo: string, subtitulo: string) {
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: orientacion });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 42.52;
  let y = MARGIN;
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }
  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(titulo, W / 2 + 28, y + 20, { align: 'center' });
  doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(subtitulo, W / 2 + 28, y + 36, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 52;
  return { doc, autoTable, W, MARGIN, y };
}

const HEAD_STYLE: { fillColor: [number, number, number]; textColor: [number, number, number]; fontStyle: 'bold'; halign: 'center' } = {
  fillColor: [210, 210, 210], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center',
};

export async function descargarAuditoriaResumenPdf(input: AuditoriaResumenPdfInput): Promise<void> {
  const fecha = new Date().toISOString().slice(0, 10);
  const { doc, autoTable, MARGIN, y } = await nuevoDoc(
    'landscape',
    'AUDITORÍA DE USUARIOS',
    `GOLDEN TOUCH 1127 C.A. · ${input.rango} · Generado ${fecha}`,
  );

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(
    `Conectados ahora: ${input.conectados}   ·   Tiempo total: ${input.tiempoTotal}   ·   Usuarios: ${input.usuariosActivos}   ·   Acciones: ${input.accionesTotal}`,
    MARGIN, y + 6,
  );

  autoTable(doc, {
    startY: y + 20,
    head: [['USUARIO', 'CORREO', 'SESIONES', 'TIEMPO CONECTADO', 'ACCIONES', 'ESTADO']],
    body: input.usuarios.map((u) => [pdfSafe(u.nombre), pdfSafe(u.email), String(u.sesiones), pdfSafe(u.tiempo), String(u.acciones), u.conectado ? 'Conectado' : '-']),
    styles: { fontSize: 8, cellPadding: 4, valign: 'middle', overflow: 'linebreak' },
    headStyles: HEAD_STYLE,
    columnStyles: {
      0: { cellWidth: 130, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 60 },
      3: { halign: 'right', cellWidth: 100 },
      4: { halign: 'right', cellWidth: 66 },
      5: { halign: 'center', cellWidth: 74 },
    },
    margin: MARGIN,
  });

  if (input.modulos.length) {
    const afterY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Acciones por módulo', MARGIN, afterY + 24);
    autoTable(doc, {
      startY: afterY + 32,
      head: [['MÓDULO', 'ACCIONES']],
      body: input.modulos.map((m) => [pdfSafe(`${m.icono} ${m.modulo}`), String(m.acciones)]),
      styles: { fontSize: 8, cellPadding: 4, valign: 'middle' },
      headStyles: HEAD_STYLE,
      columnStyles: { 0: { cellWidth: 240 }, 1: { halign: 'right', cellWidth: 80 } },
      margin: MARGIN,
      tableWidth: 320,
    });
  }

  previewPdf(doc, `auditoria-usuarios-${fecha}.pdf`);
}

export async function descargarAuditoriaUsuarioPdf(input: AuditoriaUsuarioPdfInput): Promise<void> {
  const fecha = new Date().toISOString().slice(0, 10);
  const slug = input.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  const { doc, autoTable, MARGIN, y } = await nuevoDoc(
    'portrait',
    `AUDITORÍA · ${input.nombre.toUpperCase()}`,
    `${input.email} · ${input.rango}${input.conectado ? ' · Conectado' : ''} · Generado ${fecha}`,
  );

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(
    `Tiempo conectado: ${input.tiempoTotal}   ·   Sesiones: ${input.sesiones}   ·   Acciones: ${input.acciones}   ·   Días activos: ${input.diasActivos}`,
    MARGIN, y + 6,
  );

  let cursorY = y + 20;
  if (input.porDia.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Tiempo conectado por día', MARGIN, cursorY + 8);
    autoTable(doc, {
      startY: cursorY + 14,
      head: [['DÍA', 'TIEMPO']],
      body: input.porDia.map((r) => [pdfSafe(r.dia), pdfSafe(r.tiempo)]),
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
      headStyles: HEAD_STYLE,
      columnStyles: { 0: { cellWidth: 140 }, 1: { halign: 'right', cellWidth: 100 } },
      margin: MARGIN,
      tableWidth: 240,
    });
    cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY + 40;
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(`Detalle de acciones (${input.acciones})`, MARGIN, cursorY + 24);
  autoTable(doc, {
    startY: cursorY + 30,
    head: [['FECHA', 'HORA', 'ACCIÓN', 'DETALLE']],
    body: input.timeline.length
      ? input.timeline.map((e) => [pdfSafe(e.fecha), pdfSafe(e.hora), pdfSafe(e.titulo), pdfSafe(e.detalle)])
      : [['-', '-', 'Sin acciones registradas en el período', '']],
    styles: { fontSize: 7.5, cellPadding: 3, valign: 'top', overflow: 'linebreak' },
    headStyles: HEAD_STYLE,
    columnStyles: {
      0: { cellWidth: 66 },
      1: { cellWidth: 42, halign: 'center' },
      2: { cellWidth: 150 },
      3: { cellWidth: 'auto' },
    },
    margin: MARGIN,
  });

  previewPdf(doc, `auditoria-${slug}-${fecha}.pdf`);
}
