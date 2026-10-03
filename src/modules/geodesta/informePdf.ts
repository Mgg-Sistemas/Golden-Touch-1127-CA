/* ============================================================
   Golden Touch · Geodesta · Informe (PDF)

   Hoja carta con el membrete de la empresa: logos (Golden Touch a la izquierda,
   CVM a la derecha, cada uno con su interruptor), ciudad y fecha, código,
   Para / De, los apartados definidos por el usuario en orden (cuadros como
   tabla, textos como párrafo con sus imágenes), «Atentamente;», espacio de
   firma y la dirección al pie de la última página.

   Las imágenes llegan ya resueltas en `imgs` (id → dataUrl); aquí no se pide
   nada a la red salvo los logos. Un id ausente o un dataUrl dañado deja un
   hueco, nunca rompe. Todo texto pasa por `pdfSafe`.
   ============================================================ */
import { previewPdf } from '@/shared/lib/reportePreview';
import { pdfSafe } from '@/shared/lib/pdfSafe';
import { EMPRESA_CONTACTO, EMPRESA_RIF } from '@/shared/lib/empresa';
import type { ApartadoCuadro, ApartadoTexto, ColumnaCuadro, InformeGeodesta } from '@/shared/lib/types';

export const ANCHO_UTIL = 532;   // 612 (carta) − 2 × 40 de margen
const ANCHO_MINIMO_COL = 36;

/** Reparte el ancho útil entre las columnas, sin pasarse nunca de la hoja. */
export function anchosDeColumnas(cols: ColumnaCuadro[]): number[] {
  const n = cols.length;
  if (n === 0) return [];
  const w = Math.max(ANCHO_MINIMO_COL, Math.floor(ANCHO_UTIL / n));
  // Con muchas columnas el mínimo podría sumar más que la hoja: se reparte
  // por igual el ancho real disponible.
  if (w * n > ANCHO_UTIL) return cols.map(() => ANCHO_UTIL / n);
  const anchos = cols.map(() => w);
  anchos[n - 1] += ANCHO_UTIL - w * n;   // el sobrante va a la última
  return anchos;
}

type Doc = import('jspdf').jsPDF;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** «2026-10-02» → «2 de Octubre de 2026». Sin `new Date`: evita el corrimiento de un día. */
function fechaLarga(iso: string): string {
  const [a, m, d] = String(iso ?? '').slice(0, 10).split('-').map(Number);
  if (!a || !m || !d || m < 1 || m > 12) return '';
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** Alto mínimo de una celda con imagen y caja máxima de las imágenes dentro de un texto. */
const ALTO_CELDA_IMG = 60;
const ALTO_IMG_TEXTO = 200;

const formatoImagen = (dataUrl: string): 'PNG' | 'JPEG' =>
  /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG';

/** Logo CVM (public/cvm.jpg) como dataUrl; null si no se puede cargar. */
async function cargarLogoCvm(): Promise<string | null> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}cvm.jpg`);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('No se pudo leer el logo CVM'));
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Dibuja `dataUrl` dentro de la caja dada, sin deformarlo. Un dataUrl dañado no lanza: devuelve null. */
function dibujarImagen(
  doc: Doc, dataUrl: string, x: number, y: number, maxW: number, maxH: number, centrar = false,
): { w: number; h: number } | null {
  try {
    const p = doc.getImageProperties(dataUrl);
    const k = Math.min(maxW / p.width, maxH / p.height, 1);
    const w = p.width * k; const h = p.height * k;
    doc.addImage(dataUrl, formatoImagen(dataUrl), centrar ? x + (maxW - w) / 2 : x, y, w, h);
    return { w, h };
  } catch {
    return null;
  }
}

/** Genera la vista previa (imprimir / descargar) del informe. */
export async function generarInformePdf(
  inf: InformeGeodesta, imgs: Record<string, string> = {}, fallidas?: Set<string>,
): Promise<void> {
  const doc = await construirInformePdf(inf, imgs, fallidas);
  previewPdf(doc, `${inf.codigo}.pdf`);
}

/** Arma el documento y lo devuelve, sin mostrarlo. Separado para poder probarlo. */
export async function construirInformePdf(
  inf: InformeGeodesta, imgs: Record<string, string> = {},
  /** Recoge los ids que SÍ llegaron pero no se pudieron dibujar (archivo dañado). */
  fallidas?: Set<string>,
): Promise<Doc> {
  const [{ jsPDF }, { default: autoTable }, { loadLogoDataUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('@/shared/lib/pdfLogo'),
  ]);
  const logoGt = inf.logo_gt ? await loadLogoDataUrl().catch(() => null) : null;
  const logoCvm = inf.logo_cvm ? await cargarLogoCvm() : null;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 40;
  let y = MARGIN;

  /** Salta de página si lo que sigue no entra (`reservado` = pie que no se pisa). */
  const asegurar = (alto: number, reservado = 0) => {
    if (y + alto > H - MARGIN - reservado) { doc.addPage(); y = MARGIN; }
  };
  const texto = (s: string, x: number, yy: number, align: 'left' | 'center' | 'right' = 'left') =>
    doc.text(pdfSafe(s), x, yy, { align });

  /* 1. Membrete: logos a los lados y el bloque de texto entre ellos */
  const LOGO = 46;
  const margenIzq = inf.logo_gt ? LOGO + 10 : 0;
  const margenDer = inf.logo_cvm ? LOGO + 10 : 0;
  if (logoGt) dibujarImagen(doc, logoGt, MARGIN, y, LOGO, LOGO);
  if (inf.logo_cvm) {
    const xCvm = W - MARGIN - LOGO;
    if (!(logoCvm && dibujarImagen(doc, logoCvm, xCvm, y, LOGO, LOGO))) {
      // Sin la imagen: las letras dentro de un recuadro, para que el espacio no quede mudo.
      doc.setDrawColor(90, 90, 90); doc.setLineWidth(1); doc.rect(xCvm, y, LOGO, LOGO);
      doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      texto('CVM', xCvm + LOGO / 2, y + LOGO / 2 + 5, 'center');
    }
  }
  const cx = MARGIN + margenIzq + (ANCHO_UTIL - margenIzq - margenDer) / 2;
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  texto('GOLDEN TOUCH 1127 C.A.', cx, y + 16, 'center');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
  texto(`RIF: ${EMPRESA_RIF}`, cx, y + 29, 'center');
  texto(EMPRESA_CONTACTO, cx, y + 40, 'center');
  y += LOGO + 8;
  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 22;

  /* 2 y 3. Ciudad y fecha; código */
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  const lugarFecha = [inf.ciudad?.trim(), fechaLarga(inf.fecha)].filter(Boolean).join(', ');
  texto(lugarFecha, W - MARGIN, y, 'right');
  y += 15;
  doc.setFont('helvetica', 'bold');
  texto(inf.codigo, W - MARGIN, y, 'right');
  y += 28;

  /* 4 y 5. Para / De */
  const bloque = (etiqueta: string, nombre: string | null, cargo: string | null) => {
    asegurar(44);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(20, 20, 20);
    texto(etiqueta, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    texto(nombre?.trim() ?? '', MARGIN + 40, y);
    texto(cargo?.trim() ?? '', MARGIN + 40, y + 14);
    y += 34;
  };
  bloque('Para:', inf.para_nombre, inf.para_cargo);
  bloque('De:', inf.de_nombre, inf.de_cargo);
  y += 4;

  /* 6. Apartados, en orden */
  const titulo = (t: string) => {
    if (!t.trim()) return;
    asegurar(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 20, 20);
    texto(t, MARGIN, y);
    y += 14;
  };

  const cuadro = (a: ApartadoCuadro) => {
    titulo(a.titulo);
    const idCelda = (fila: number, col: number) => {
      const c = a.columnas[col];
      return c ? (a.filas[fila]?.celdas[c.id] ?? '') : '';
    };
    const esImagen = (col: number) => a.columnas[col]?.tipo === 'imagen';
    const columnStyles: Record<number, { cellWidth: number }> = {};
    anchosDeColumnas(a.columnas).forEach((w, i) => { columnStyles[i] = { cellWidth: w }; });
    autoTable(doc, {
      startY: y,
      head: [a.columnas.map((c) => pdfSafe(c.nombre))],
      // Las columnas imagen salen vacías: su contenido se dibuja en didDrawCell.
      body: a.filas.map((f) => a.columnas.map((c) => (c.tipo === 'imagen' ? '' : pdfSafe(f.celdas[c.id] ?? '')))),
      theme: 'grid',
      showHead: 'everyPage',
      styles: { fontSize: 9, cellPadding: 5, minCellHeight: 18, overflow: 'linebreak' },
      headStyles: { fillColor: [255, 138, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles,
      margin: MARGIN,
      didParseCell: (d) => {
        if (d.section === 'body' && esImagen(d.column.index) && imgs[idCelda(d.row.index, d.column.index)]) {
          d.cell.styles.minCellHeight = ALTO_CELDA_IMG;
        }
      },
      didDrawCell: (d) => {
        if (d.section !== 'body' || !esImagen(d.column.index)) return;
        const url = imgs[idCelda(d.row.index, d.column.index)];
        if (!url) return;   // id ausente: la celda queda vacía
        const idImg = idCelda(d.row.index, d.column.index);
        if (!dibujarImagen(doc, url, d.cell.x + 3, d.cell.y + 3, d.cell.width - 6, d.cell.height - 6, true)) {
          fallidas?.add(idImg);
        }
      },
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin
    y = (doc.lastAutoTable?.finalY ?? y) + 14;
  };

  const parrafo = (a: ApartadoTexto) => {
    titulo(a.titulo);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(20, 20, 20);
    const lineas = a.texto.trim() ? (doc.splitTextToSize(pdfSafe(a.texto), ANCHO_UTIL) as string[]) : [];
    for (const l of lineas) {
      asegurar(14);
      doc.text(l, MARGIN, y);
      y += 14;
    }
    if (lineas.length) y += 6;
    for (const im of a.imagenes) {
      const url = imgs[im.imagen_id];
      if (!url) continue;   // imagen borrada: se omite
      asegurar(ALTO_IMG_TEXTO + 26);
      const r = dibujarImagen(doc, url, MARGIN, y, ANCHO_UTIL, ALTO_IMG_TEXTO, true);
      if (!r) { fallidas?.add(im.imagen_id); continue; }
      y += r.h + 12;
      if (im.pie.trim()) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
        texto(im.pie, W / 2, y - 2, 'center');
        y += 14;
      }
      y += 6;
    }
    y += 8;
  };

  for (const a of inf.apartados) {
    if (a.tipo === 'cuadro') cuadro(a); else parrafo(a);
  }

  /* 7 y 8. Cierre y pie: la dirección queda al fondo de la última página */
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  const pie = inf.direccion_pie?.trim()
    ? (doc.splitTextToSize(pdfSafe(inf.direccion_pie), ANCHO_UTIL) as string[])
    : [];
  const altoPie = pie.length ? pie.length * 10 + 10 : 0;
  asegurar(110, altoPie);
  y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(20, 20, 20);
  texto('Atentamente;', W / 2, y, 'center');
  y += 62;   // espacio para firmar a mano
  doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.6);
  doc.line(W / 2 - 80, y - 12, W / 2 + 80, y - 12);
  doc.setFont('helvetica', 'bold');
  texto(inf.firma_nombre?.trim() ?? '', W / 2, y, 'center');
  doc.setFont('helvetica', 'normal');
  texto(inf.firma_cargo?.trim() ?? '', W / 2, y + 14, 'center');
  if (pie.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
    doc.text(pie, W / 2, H - MARGIN - (pie.length - 1) * 10, { align: 'center' });
  }

  return doc;
}
