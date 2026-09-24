/* ============================================================
   Golden Touch · RRHH · Hoja de ingreso y registro de personal (PDF)

   Planilla EN BLANCO que se le entrega a quien ingresa para que la complete
   a mano, y que después alimenta la ficha del sistema.

   Se armó sobre el modelo que trajo el usuario, con dos diferencias:

   · SIN DATOS BANCARIOS. El modelo traía una sección «4. Datos de
     transferencia bancaria». Se quitó a pedido.

   · ADAPTADA A VENEZUELA. El modelo venía con vocabulario de otro país
     («Cédula / DNI / RUT», «Ciudad / Comuna», «RUT / Identificación»). Acá dice «Cédula de
     Identidad» y «Ciudad / Municipio», y el estado civil usa las mismas
     opciones que el sistema (soltero, casado, divorciado, viudo,
     concubinato), para que lo que se escribe a mano entre después sin
     traducir nada.

   Todo el texto es fijo: no lleva datos de nadie, es la planilla vacía.
   ============================================================ */
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import { previewPdf } from '@/shared/lib/reportePreview';
import { EMPRESA_CONTACTO, EMPRESA_RIF } from '@/shared/lib/empresa';

/** Alto de un renglón de campo: lo que queda para escribir a mano arriba de la raya. */
const ALTO_CAMPO = 27;
/** Alto de un renglón de la tabla de carga familiar. */
const ALTO_FILA = 21;

type Doc = import('jspdf').jsPDF;

/**
 * Un campo: la etiqueta chica arriba y la raya para escribir debajo.
 * Devuelve nada; el avance de `y` lo maneja quien llama, para poder poner
 * dos campos en el mismo renglón.
 */
function campo(doc: Doc, x: number, y: number, ancho: number, etiqueta: string): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(105, 105, 105);
  doc.text(etiqueta.toUpperCase(), x, y);
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.6);
  doc.line(x, y + ALTO_CAMPO - 9, x + ancho, y + ALTO_CAMPO - 9);
  doc.setTextColor(20, 20, 20);
}

/** Una casilla [ ] con su texto al lado. Devuelve dónde termina, para encadenar. */
function casilla(doc: Doc, x: number, y: number, texto: string): number {
  const lado = 8.5;
  doc.setDrawColor(110, 110, 110);
  doc.setLineWidth(0.7);
  doc.rect(x, y - lado + 1, lado, lado);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text(texto, x + lado + 5, y);
  return x + lado + 9 + doc.getTextWidth(texto);
}

/** Título de sección: número + nombre, con la banda de la marca. */
function seccion(doc: Doc, x: number, y: number, texto: string): number {
  doc.setFillColor(255, 138, 0);
  doc.rect(x, y - 10, 3, 13, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(texto.toUpperCase(), x + 9, y);
  return y + 18;
}

export async function descargarHojaIngresoPdf(): Promise<void> {
  const [{ jsPDF }, logo] = await Promise.all([
    import('jspdf'),
    loadLogoDataUrl().catch(() => null),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 42.5; // 1,5 cm: la planilla necesita ancho para escribir
  const ANCHO = PAGE_W - MARGIN * 2;
  const COL = (ANCHO - 18) / 2; // dos columnas con aire en el medio
  const COL2_X = MARGIN + COL + 18;
  let y = MARGIN;

  // ─── Membrete ───
  if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 46, 46); } catch { /* opcional */ } }
  const tx = logo ? MARGIN + 58 : MARGIN;
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('GOLDEN TOUCH 1127 C.A.', tx, y + 17);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`RIF: ${EMPRESA_RIF}`, tx, y + 31);
  doc.setFont('helvetica', 'normal');
  doc.text(EMPRESA_CONTACTO, tx, y + 44);
  doc.setTextColor(20, 20, 20);
  y += 56;

  doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 20;

  // ─── Título ───
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('HOJA DE INGRESO Y REGISTRO DE PERSONAL', PAGE_W / 2, y, { align: 'center' });
  y += 15;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.setTextColor(105, 105, 105);
  doc.text('Por favor, llene todos los campos de forma clara y con letra de molde.', PAGE_W / 2, y, { align: 'center' });
  doc.setTextColor(20, 20, 20);
  y += 18;

  // ─── 1. Datos personales ───
  y = seccion(doc, MARGIN, y, '1. Datos personales');

  campo(doc, MARGIN, y, COL, 'Primer apellido');
  campo(doc, COL2_X, y, COL, 'Segundo apellido');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, ANCHO, 'Nombres');
  y += ALTO_CAMPO;

  // La fecha va con su propio formato, para que no la escriban de cinco maneras.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.setTextColor(105, 105, 105);
  doc.text('FECHA DE NACIMIENTO', MARGIN, y);
  doc.setTextColor(20, 20, 20);

  // Las rayitas y, debajo, qué va en cada una. Las tres palabras se centran
  // MIDIENDO cada tramo: separadas con espacios quedaban corridas respecto de
  // la raya que nombran.
  doc.setFontSize(10);
  const HUECO_DIA = '____';
  const HUECO_ANIO = '________';
  const SEP = ' / ';
  doc.text(`${HUECO_DIA}${SEP}${HUECO_DIA}${SEP}${HUECO_ANIO}`, MARGIN, y + 16);
  const wDia = doc.getTextWidth(HUECO_DIA);
  const wAnio = doc.getTextWidth(HUECO_ANIO);
  const wSep = doc.getTextWidth(SEP);

  doc.setFontSize(6.5);
  doc.setTextColor(140, 140, 140);
  doc.text('día', MARGIN + wDia / 2, y + 25, { align: 'center' });
  doc.text('mes', MARGIN + wDia + wSep + wDia / 2, y + 25, { align: 'center' });
  doc.text('año', MARGIN + (wDia + wSep) * 2 + wAnio / 2, y + 25, { align: 'center' });
  doc.setTextColor(20, 20, 20);

  campo(doc, COL2_X, y, COL, 'Cédula de identidad');
  // Este renglón es MÁS ALTO que los demás: lleva los rótulos «día/mes/año»
  // debajo de la raya. Sin este aire extra se pisaban con NACIONALIDAD.
  y += ALTO_CAMPO + 12;

  campo(doc, MARGIN, y, COL, 'Nacionalidad');
  campo(doc, COL2_X, y, COL, 'Tipo de sangre / RH');
  y += ALTO_CAMPO;

  // Estado civil y género: casillas, no rayas.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.setTextColor(105, 105, 105);
  doc.text('ESTADO CIVIL', MARGIN, y);
  doc.setTextColor(20, 20, 20);
  let cx = MARGIN;
  for (const opcion of ['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Viudo(a)', 'Concubinato']) {
    cx = casilla(doc, cx, y + 15, opcion) + 8;
  }
  y += ALTO_CAMPO + 3;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.setTextColor(105, 105, 105);
  doc.text('GÉNERO', MARGIN, y);
  doc.setTextColor(20, 20, 20);
  cx = MARGIN;
  for (const opcion of ['Masculino', 'Femenino', 'Otro']) {
    cx = casilla(doc, cx, y + 15, opcion) + 10;
  }
  y += ALTO_CAMPO + 3;

  campo(doc, MARGIN, y, ANCHO, 'Dirección de habitación');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, COL, 'Ciudad / Municipio');
  campo(doc, COL2_X, y, COL, 'Estado');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, COL, 'Teléfono celular');
  campo(doc, COL2_X, y, COL, 'Teléfono local');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, ANCHO, 'Correo electrónico');
  y += ALTO_CAMPO + 4;

  // ─── 2. Carga familiar ───
  y = seccion(doc, MARGIN, y, '2. Carga familiar y dependientes directos');

  const COLS = [
    { titulo: 'Nombre completo del dependiente', ancho: ANCHO * 0.40 },
    { titulo: 'Parentesco', ancho: ANCHO * 0.18 },
    { titulo: 'Fecha de nacimiento', ancho: ANCHO * 0.22 },
    { titulo: 'Cédula', ancho: ANCHO * 0.20 },
  ];
  const FILAS = 4;

  // Encabezado de la tabla.
  doc.setFillColor(243, 244, 246);
  doc.rect(MARGIN, y - 10, ANCHO, 17, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  let colX = MARGIN;
  for (const c of COLS) {
    doc.text(c.titulo.toUpperCase(), colX + 5, y + 1);
    colX += c.ancho;
  }
  doc.setTextColor(20, 20, 20);
  const tablaY = y - 10;
  y += 7;

  // Las filas vacías.
  doc.setDrawColor(170, 170, 170);
  doc.setLineWidth(0.5);
  for (let f = 0; f <= FILAS; f++) {
    const ly = y + f * ALTO_FILA;
    doc.line(MARGIN, ly, MARGIN + ANCHO, ly);
  }
  const tablaFin = y + FILAS * ALTO_FILA;
  colX = MARGIN;
  for (let c = 0; c <= COLS.length; c++) {
    doc.line(colX, tablaY, colX, tablaFin);
    if (c < COLS.length) colX += COLS[c].ancho;
  }
  doc.line(MARGIN, tablaY, MARGIN + ANCHO, tablaY);
  y = tablaFin + 16;

  // ─── 3. Contacto de emergencia ───
  y = seccion(doc, MARGIN, y, '3. Contacto en caso de emergencia');

  campo(doc, MARGIN, y, COL, 'Nombre completo');
  campo(doc, COL2_X, y, COL, 'Parentesco');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, COL, 'Teléfono móvil');
  campo(doc, COL2_X, y, COL, 'Teléfono fijo / trabajo');
  y += ALTO_CAMPO + 8;

  // ─── Declaración y firma ───
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  const declaracion = 'Declaro bajo juramento que todos los datos aquí asentados son correctos, verídicos y '
    + 'actualizados, autorizando a la empresa a verificar su autenticidad si así lo requiere.';
  const lineas = doc.splitTextToSize(declaracion, ANCHO) as string[];
  doc.text(lineas, MARGIN, y);
  const finDeclaracion = y + lineas.length * 11;
  doc.setTextColor(20, 20, 20);

  // La firma va ANCLADA AL PIE, no a continuación del texto: así la hoja cierra
  // siempre pareja y todo el sobrante queda como hueco para firmar. Se firma
  // ARRIBA de la raya, así que ese hueco es lo que hay que reservar.
  const PISO = PAGE_H - MARGIN;
  const firmaY = PISO - 16;
  const HUECO_MIN = 40;
  if (firmaY - finDeclaracion < HUECO_MIN) {
    // No debería pasar con el contenido fijo de esta planilla; si alguien agrega
    // campos y deja de entrar, es preferible una segunda hoja a una firma
    // pisando el texto.
    doc.addPage();
  }

  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.8);
  const firmaW = ANCHO * 0.46;
  doc.line(MARGIN, firmaY, MARGIN + firmaW, firmaY);
  doc.line(PAGE_W - MARGIN - firmaW * 0.7, firmaY, PAGE_W - MARGIN, firmaY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text('Firma del trabajador', MARGIN, firmaY + 12);
  doc.text('Fecha de entrega', PAGE_W - MARGIN - firmaW * 0.7, firmaY + 12);

  previewPdf(doc, 'hoja-ingreso-personal.pdf');
}
