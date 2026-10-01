/* ============================================================
   Golden Touch · RRHH · Minuta de reunión (PDF)

   Reproduce en papel el formato que la empresa ya usa. Dos modalidades:

   · `generarMinutaPdf(null)`  → HOJA EN BLANCO para llenar a mano. Cada tabla
     sale con los renglones del formato de papel (`RENGLONES_HOJA`).
   · `generarMinutaPdf(minuta)` → la minuta cargada; cada tabla lleva sus filas
     más `RENGLONES_EXTRA` renglones vacíos para anotar a mano.

   La columna FIRMA sale SIEMPRE vacía: se firma sobre el papel impreso, el
   sistema nunca captura firmas. Todas las tablas repiten su encabezado en cada
   página (`showHead: 'everyPage'`) porque una minuta larga se parte.

   Todo texto pasa por `pdfSafe`: la helvetica de jsPDF no dibuja lo que no
   existe en Windows-1252.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { EMPRESA_CONTACTO, EMPRESA_RIF } from '@/shared/lib/empresa';
import type {
  Minuta, MinutaAcuerdo, MinutaAvance, MinutaParticipante,
} from '@/shared/lib/types';

export const RENGLONES_HOJA = {
  ordenDia: 7, participantes: 6, acuerdos: 6, avances: 4, observaciones: 7,
} as const;

/** Renglones de cortesía que se agregan al final de cada tabla ya cargada. */
export const RENGLONES_EXTRA = 2;

/** Completa `filas` con filas vacías hasta llegar a `minimo`. Nunca recorta. */
export function filasConRenglones<T>(filas: T[], minimo: number, vacia: () => T): T[] {
  const faltan = Math.max(0, minimo - filas.length);
  return [...filas, ...Array.from({ length: faltan }, vacia)];
}

type Doc = import('jspdf').jsPDF;

/** Alto de un renglón con raya (campos de texto libre). */
const ALTO_RAYA = 18;

const dia = (f: string | null | undefined) => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
};

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '' : `${n}%`);

/** Etiqueta chica arriba y raya debajo; `y` lo maneja quien llama. */
function campo(doc: Doc, x: number, y: number, ancho: number, etiqueta: string, valor = ''): void {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(105, 105, 105);
  doc.text(pdfSafe(etiqueta).toUpperCase(), x, y);
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.6);
  doc.line(x, y + 18, x + ancho, y + 18);
  if (valor) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
    doc.text(pdfSafe(valor), x + 2, y + 14, { maxWidth: ancho - 4 });
  }
  doc.setTextColor(20, 20, 20);
}

/** Título de sección con la banda de la marca. Devuelve la `y` siguiente. */
function seccion(doc: Doc, x: number, y: number, texto: string): number {
  doc.setFillColor(255, 138, 0); doc.rect(x, y - 10, 3, 13, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
  doc.text(pdfSafe(texto).toUpperCase(), x + 9, y);
  return y + 14;
}

export async function generarMinutaPdf(
  m: Minuta | null,
  opciones?: { adjuntos?: { nombre: string; dataUrl: string }[] },
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logo = await loadLogoDataUrl().catch(() => null);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 40;
  const ANCHO = W - MARGIN * 2;
  let y = MARGIN;

  // Renglones mínimos: hoja en blanco = formato de papel; cargada = filas + extra.
  const minimo = (cargadas: number, hoja: number) => (m ? cargadas + RENGLONES_EXTRA : hoja);

  /** Salta de página si lo que sigue no entra. */
  const asegurar = (alto: number) => {
    if (y + alto > H - MARGIN) { doc.addPage(); y = MARGIN; }
  };

  /* ── Membrete y título ── */
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 38, 38); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 48 : MARGIN;
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(pdfSafe('GOLDEN TOUCH 1127 C.A.'), tx, y + 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
  doc.text(pdfSafe(`RIF: ${EMPRESA_RIF}`), tx, y + 25);
  doc.text(pdfSafe(EMPRESA_CONTACTO), tx, y + 36);
  y += 46;
  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 20;

  doc.setTextColor(255, 138, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(pdfSafe('MINUTA DE REUNIÓN'), W / 2, y, { align: 'center' });
  y += 14;
  doc.setTextColor(80, 80, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(
    pdfSafe(m ? `${m.numero}  ·  ${m.estado === 'finalizada' ? 'FINALIZADA' : 'BORRADOR'}` : 'N.º ________________'),
    W / 2, y, { align: 'center' },
  );
  doc.setTextColor(20, 20, 20);
  y += 18;

  /* ── Encabezado: campos con raya ── */
  const MITAD = (ANCHO - 18) / 2;
  const lugarFecha = m ? [m.lugar?.trim(), dia(m.fecha)].filter(Boolean).join(', ') : '';
  campo(doc, MARGIN, y, MITAD, 'Lugar y fecha', lugarFecha);
  campo(doc, MARGIN + MITAD + 18, y, MITAD, 'Hora de inicio', m?.hora_inicio?.slice(0, 5) ?? '');
  y += 30;
  campo(doc, MARGIN, y, ANCHO, 'Objetivo', m?.objetivo?.trim() ?? '');
  y += 36;

  /* ── Tabla genérica: mismo patrón en todas ── */
  const tabla = (
    head: string[],
    body: string[][],
    columnStyles: Record<number, Record<string, unknown>> = {},
  ) => {
    autoTable(doc, {
      startY: y,
      head: [head.map((h) => pdfSafe(h))],
      body,
      theme: 'grid',
      showHead: 'everyPage',
      styles: { fontSize: 9, cellPadding: 5, minCellHeight: 18, overflow: 'linebreak' },
      headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles,
      margin: MARGIN,
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin
    y = (doc.lastAutoTable?.finalY ?? y) + 14;
  };

  /** Lista numerada (orden del día y puntos a tratar). */
  const listaNumerada = (titulo: string, items: string[], hoja: number) => {
    const filas = filasConRenglones(items, minimo(items.length, hoja), () => '');
    tabla(['#', titulo], filas.map((t, i) => [String(i + 1), pdfSafe(t)]), { 0: { cellWidth: 28, halign: 'center' } });
  };

  /* 3. Orden del día */
  listaNumerada('ORDEN DEL DÍA', m?.orden_dia ?? [], RENGLONES_HOJA.ordenDia);

  /* 4. Participantes (firma siempre vacía) */
  tabla(
    ['PARTICIPANTES', 'CARGO', 'FIRMA'],
    filasConRenglones(
      m?.participantes ?? [],
      minimo(m?.participantes.length ?? 0, RENGLONES_HOJA.participantes),
      () => ({ personal_id: null, nombre: '', cargo: '' } as MinutaParticipante),
    ).map((p) => [pdfSafe(p.nombre), pdfSafe(p.cargo), '']),
    { 1: { cellWidth: 130 }, 2: { cellWidth: 120 } },
  );

  /* 5. Acuerdos */
  tabla(
    ['RESPONSABLE', 'ACTIVIDAD', 'FECHA COMPROMISO'],
    filasConRenglones(
      m?.acuerdos ?? [],
      minimo(m?.acuerdos.length ?? 0, RENGLONES_HOJA.acuerdos),
      () => ({ responsable: '', actividad: '', fecha_compromiso: null } as MinutaAcuerdo),
    ).map((a) => [pdfSafe(a.responsable), pdfSafe(a.actividad), dia(a.fecha_compromiso)]),
    { 0: { cellWidth: 120 }, 2: { cellWidth: 90 } },
  );

  /* 6. Otros asuntos: texto sobre rayas */
  asegurar(40);
  y = seccion(doc, MARGIN, y, 'Otros asuntos');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const lineasOtros = m?.otros_asuntos?.trim()
    ? (doc.splitTextToSize(pdfSafe(m.otros_asuntos), ANCHO - 4) as string[])
    : [];
  const rayas = filasConRenglones(lineasOtros, minimo(lineasOtros.length, RENGLONES_HOJA.observaciones), () => '');
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.6);
  for (const linea of rayas) {
    asegurar(ALTO_RAYA);
    y += ALTO_RAYA;
    if (linea) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
      doc.text(linea, MARGIN + 2, y - 4);
    }
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.6);
    doc.line(MARGIN, y, MARGIN + ANCHO, y);
  }
  y += 16;

  /* 7. Próxima reunión */
  asegurar(44);
  campo(doc, MARGIN, y, MITAD, 'Fecha de la próxima reunión', dia(m?.proxima_fecha));
  y += 40;

  /* 8. Puntos a tratar en la próxima reunión */
  listaNumerada('PUNTOS A TRATAR EN LA PRÓXIMA REUNIÓN', m?.proximos_puntos ?? [], RENGLONES_HOJA.ordenDia);

  /* 9. Avances */
  tabla(
    ['ACTIVIDAD', 'RESPONSABLE', 'FECHA PROGRAMADA', 'REV. FECHA', 'REV. %', 'REVISIÓN FINAL', '% AVANCE'],
    filasConRenglones(
      m?.avances ?? [],
      minimo(m?.avances.length ?? 0, RENGLONES_HOJA.avances),
      () => ({
        actividad: '', responsable: '', fecha_programada: null, revision_fecha: null,
        pct_inicial: null, revision_final: '', pct_avance: null,
      } as MinutaAvance),
    ).map((a) => [
      pdfSafe(a.actividad), pdfSafe(a.responsable), dia(a.fecha_programada), dia(a.revision_fecha),
      pct(a.pct_inicial), pdfSafe(a.revision_final), pct(a.pct_avance),
    ]),
    {
      1: { cellWidth: 70 }, 2: { cellWidth: 55 }, 3: { cellWidth: 55 },
      4: { cellWidth: 38 }, 5: { cellWidth: 70 }, 6: { cellWidth: 42 },
    },
  );

  /* 10. Observaciones: una columna; el texto, si lo hay, en la primera fila */
  const obs = m?.observaciones?.trim() ? [pdfSafe(m.observaciones)] : [];
  tabla(
    ['OBSERVACIONES'],
    filasConRenglones(obs, minimo(obs.length, RENGLONES_HOJA.observaciones), () => '').map((t) => [t]),
  );

  /* ── Adjuntos: una página por imagen; los PDF solo se listan por nombre ── */
  const adjuntos = opciones?.adjuntos ?? [];
  const pdfsAdjuntos: string[] = [];
  for (const a of adjuntos) {
    const mime = /^data:([^;,]+)/.exec(a.dataUrl)?.[1]?.toLowerCase() ?? '';
    if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
      doc.addPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 20, 20);
      doc.text(pdfSafe(`ANEXO: ${a.nombre}`), MARGIN, MARGIN);
      try {
        const props = doc.getImageProperties(a.dataUrl);
        const maxW = W - MARGIN * 2; const maxH = H - MARGIN * 2 - 20;
        const k = Math.min(maxW / props.width, maxH / props.height, 1);
        doc.addImage(a.dataUrl, mime === 'image/png' ? 'PNG' : 'JPEG', MARGIN, MARGIN + 14, props.width * k, props.height * k);
      } catch {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text(pdfSafe('No se pudo incluir la imagen.'), MARGIN, MARGIN + 18);
      }
    } else if (mime === 'application/pdf') {
      pdfsAdjuntos.push(a.nombre);
    }
  }
  if (pdfsAdjuntos.length) {
    doc.addPage(); y = MARGIN;
    tabla(['ARCHIVOS PDF ADJUNTOS (NO INCLUIDOS EN ESTE DOCUMENTO)'], pdfsAdjuntos.map((n) => [pdfSafe(n)]));
  }

  previewPdf(doc, m ? `${m.numero}.pdf` : 'minuta-en-blanco.pdf');
}
