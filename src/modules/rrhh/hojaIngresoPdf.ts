/* ============================================================
   Golden Touch · RRHH · Hoja de ingreso y registro de personal (PDF)

   Planilla EN BLANCO que se le entrega a quien ingresa para que la complete
   a mano, y que después alimenta la ficha del sistema. Son DOS hojas:

   · HOJA 1: los datos de la persona (personales, condiciones de salud, carga
     familiar y contacto de emergencia), con la declaración y la firma.
   · HOJA 2: DOCUMENTOS A CONSIGNAR POR OFICINA. La lista de papeles que hay
     que entregar, por segmentos, que la oficina va tildando a medida que los
     recibe. La lista vive en `documentosAConsignar.ts`.

   Se armó sobre el modelo que trajo el usuario, con estas diferencias:

   · SIN DATOS BANCARIOS. El modelo traía una sección «4. Datos de
     transferencia bancaria». Se quitó a pedido, y por eso la hoja de
     documentos tampoco pide nada de banco.

   · ADAPTADA A VENEZUELA. El modelo venía con vocabulario de otro país
     («Cédula / DNI / RUT», «Ciudad / Comuna»). Acá dice «Cédula de
     Identidad» y «Ciudad / Municipio», el estado civil usa las mismas
     opciones que el sistema (soltero, casado, divorciado, viudo,
     concubinato) y se pide el RIF, para que lo que se escribe a mano entre
     después sin traducir nada.

   Todo el texto es fijo: no lleva datos de nadie, son las planillas vacías.

   POR QUÉ LAS MEDIDAS SON TAN JUSTAS. La hoja 1 entra en UNA carta y tiene
   que seguir entrando: cada renglón mide `ALTO_CAMPO`, y lo que sobra al pie
   es el hueco para firmar. Si se agrega un campo hay que medir de nuevo —lo
   que no entra se va a una hoja suelta con la firma sola, que es peor que no
   agregarlo.
   ============================================================ */
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import { previewPdf } from '@/shared/lib/reportePreview';
import { EMPRESA_CONTACTO, EMPRESA_RIF } from '@/shared/lib/empresa';
import { SEGMENTOS_DOCUMENTOS } from './documentosAConsignar';

/** Alto de un renglón de campo: lo que queda para escribir a mano arriba de la raya. */
const ALTO_CAMPO = 25;
/** Alto de un renglón de la tabla de carga familiar. */
const ALTO_FILA = 19;
/** Tamaño de letra y alto de renglón de la lista de documentos (hoja 2): letra 12, que se lee en papel. */
const TAM_DOC = 12;
const ALTO_DOC = 19;

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
function casilla(doc: Doc, x: number, y: number, texto: string, tamano = 9): number {
  const lado = tamano >= 12 ? 11 : 8.5;
  doc.setDrawColor(110, 110, 110);
  doc.setLineWidth(0.7);
  doc.rect(x, y - lado + 1, lado, lado);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tamano);
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
  return y + 16;
}

/** Rótulo gris chico (el mismo de las etiquetas de campo), suelto. */
function rotulo(doc: Doc, x: number, y: number, texto: string): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(105, 105, 105);
  doc.text(texto.toUpperCase(), x, y);
  doc.setTextColor(20, 20, 20);
}

/** Un «[ ] Sí  [ ] No» a partir de `x`. Devuelve dónde termina. */
function siNo(doc: Doc, x: number, y: number): number {
  const fin = casilla(doc, x, y, 'Sí');
  return casilla(doc, fin + 10, y, 'No');
}

export async function descargarHojaIngresoPdf(): Promise<void> {
  const [{ jsPDF }, logo] = await Promise.all([
    import('jspdf'),
    loadLogoDataUrl().catch(() => null),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 38; // 1,34 cm: la planilla necesita ancho para escribir
  const ANCHO = PAGE_W - MARGIN * 2;
  const COL = (ANCHO - 18) / 2; // dos columnas con aire en el medio
  const COL2_X = MARGIN + COL + 18;
  // Tres columnas, para el renglón de nacimiento / cédula / RIF.
  const TER = (ANCHO - 32) / 3;
  const TER2_X = MARGIN + TER + 16;
  const TER3_X = TER2_X + TER + 16;

  /** El membrete, igual en las dos hojas. Devuelve dónde sigue el contenido. */
  function membrete(y0: number): number {
    let y = y0;
    if (logo) { try { doc.addImage(logo, 'JPEG', MARGIN, y, 44, 44); } catch { /* opcional */ } }
    const tx = logo ? MARGIN + 56 : MARGIN;
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('GOLDEN TOUCH 1127 C.A.', tx, y + 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`RIF: ${EMPRESA_RIF}`, tx, y + 30);
    doc.setFont('helvetica', 'normal');
    doc.text(EMPRESA_CONTACTO, tx, y + 42);
    doc.setTextColor(20, 20, 20);
    y += 52;
    doc.setDrawColor(255, 138, 0); doc.setLineWidth(1.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    return y + 18;
  }

  /** El título de la hoja, centrado, con su aclaración debajo. */
  function titulo(y0: number, texto: string, aclaracion: string): number {
    let y = y0;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(texto, PAGE_W / 2, y, { align: 'center' });
    y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(105, 105, 105);
    doc.text(aclaracion, PAGE_W / 2, y, { align: 'center' });
    doc.setTextColor(20, 20, 20);
    return y + 17;
  }

  /* ════════════════ HOJA 1 · Los datos de la persona ════════════════ */
  let y = membrete(MARGIN);
  y = titulo(y, 'HOJA DE INGRESO Y REGISTRO DE PERSONAL',
    'Por favor, llene todos los campos de forma clara y con letra de molde.');

  // ─── 1. Datos personales ───
  y = seccion(doc, MARGIN, y, '1. Datos personales');

  campo(doc, MARGIN, y, COL, 'Primer apellido');
  campo(doc, COL2_X, y, COL, 'Segundo apellido');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, ANCHO, 'Nombres');
  y += ALTO_CAMPO;

  // La fecha va con su propio formato, para que no la escriban de cinco maneras.
  rotulo(doc, MARGIN, y, 'Fecha de nacimiento');

  // Las rayitas y, debajo, qué va en cada una. Las tres palabras se centran
  // MIDIENDO cada tramo: separadas con espacios quedaban corridas respecto de
  // la raya que nombran.
  doc.setFont('helvetica', 'normal');
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

  // La cédula y el RIF son DOS datos distintos: el RIF es el fiscal y es el
  // que va en los recibos, así que se pide acá y no se deduce de la cédula.
  campo(doc, TER2_X, y, TER, 'Cédula de identidad');
  campo(doc, TER3_X, y, TER, 'RIF (J/V-00000000-0)');
  // Este renglón es MÁS ALTO que los demás: lleva los rótulos «día/mes/año»
  // debajo de la raya. Sin este aire extra se pisaban con NACIONALIDAD.
  y += ALTO_CAMPO + 12;

  campo(doc, MARGIN, y, COL, 'Nacionalidad');
  campo(doc, COL2_X, y, COL, 'Tipo de sangre / RH');
  y += ALTO_CAMPO;

  // Estado civil y género: casillas, no rayas.
  rotulo(doc, MARGIN, y, 'Estado civil');
  let cx = MARGIN;
  for (const opcion of ['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Viudo(a)', 'Concubinato']) {
    cx = casilla(doc, cx, y + 14, opcion) + 8;
  }
  y += ALTO_CAMPO;

  rotulo(doc, MARGIN, y, 'Género');
  cx = MARGIN;
  for (const opcion of ['Masculino', 'Femenino', 'Otro']) {
    cx = casilla(doc, cx, y + 14, opcion) + 10;
  }
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, ANCHO, 'Dirección de habitación');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, COL, 'Ciudad / Municipio');
  campo(doc, COL2_X, y, COL, 'Estado');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, COL, 'Teléfono celular');
  campo(doc, COL2_X, y, COL, 'Teléfono local');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, ANCHO, 'Correo electrónico');
  y += ALTO_CAMPO;

  // ─── 2. Condiciones de salud ───
  // Cada pregunta lleva su respuesta y su detalle en el MISMO renglón: un «sí»
  // sin decir a qué no sirve de nada, y separarlos en dos renglones no entraba.
  y = seccion(doc, MARGIN, y, '2. Condiciones de salud');

  rotulo(doc, MARGIN, y, '¿Padece alguna alergia?');
  siNo(doc, MARGIN, y + 14);
  campo(doc, COL2_X, y, COL, '¿A qué? (medicamentos, alimentos, picaduras)');
  y += ALTO_CAMPO;

  rotulo(doc, MARGIN, y, '¿Padece alguna enfermedad?');
  siNo(doc, MARGIN, y + 14);
  campo(doc, COL2_X, y, COL, '¿Cuál? (indique tratamiento o medicación)');
  y += ALTO_CAMPO;

  // ─── 3. Carga familiar ───
  y = seccion(doc, MARGIN, y, '3. Carga familiar y dependientes directos');

  const COLS = [
    { titulo: 'Nombre completo del dependiente', ancho: ANCHO * 0.40 },
    { titulo: 'Parentesco', ancho: ANCHO * 0.18 },
    { titulo: 'Fecha de nacimiento', ancho: ANCHO * 0.22 },
    { titulo: 'Cédula', ancho: ANCHO * 0.20 },
  ];
  const FILAS = 4;

  // Encabezado de la tabla.
  doc.setFillColor(243, 244, 246);
  doc.rect(MARGIN, y - 10, ANCHO, 16, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  let colX = MARGIN;
  for (const c of COLS) {
    doc.text(c.titulo.toUpperCase(), colX + 5, y + 1);
    colX += c.ancho;
  }
  doc.setTextColor(20, 20, 20);
  const tablaY = y - 10;
  y += 6;

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
  y = tablaFin + 14;

  // ─── 4. Contacto de emergencia ───
  y = seccion(doc, MARGIN, y, '4. Contacto en caso de emergencia');

  campo(doc, MARGIN, y, COL, 'Nombre completo');
  campo(doc, COL2_X, y, COL, 'Parentesco');
  y += ALTO_CAMPO;

  campo(doc, MARGIN, y, COL, 'Teléfono móvil');
  campo(doc, COL2_X, y, COL, 'Teléfono fijo / trabajo');
  y += ALTO_CAMPO + 6;

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
  const HUECO_MIN = 36;
  if (firmaY - finDeclaracion < HUECO_MIN) {
    // No debería pasar con el contenido fijo de esta planilla; si alguien agrega
    // campos y deja de entrar, es preferible una hoja más a una firma pisando
    // el texto.
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
  doc.setTextColor(20, 20, 20);

  /* ════════════════ HOJA 2 · Documentos a consignar ════════════════ */
  doc.addPage();
  y = membrete(MARGIN);
  y = titulo(y, 'DOCUMENTOS A CONSIGNAR POR OFICINA',
    'Marque cada documento recibido. Lo que dice «si aplica» se exige solo a quien le corresponda.');

  // A UNA COLUMNA y en letra 12, que es lo que se lee cómodo en papel. Con eso
  // la lista no entra en una hoja: sigue en la siguiente, con el membrete, y
  // el recuadro de la oficina va al pie de la ÚLTIMA. Un segmento entra
  // completo en la hoja o pasa entero a la siguiente: una lista de requisitos
  // partida al medio se lee como si faltaran renglones.
  const PIE_DOCS = 118;            // lo que se reserva abajo para «uso de la oficina»
  const TOPE = PAGE_H - MARGIN - PIE_DOCS;
  const SANGRIA = 20;              // de la casilla al texto
  const ANCHO_TEXTO = ANCHO - SANGRIA;
  let yc = y;

  /** Cómo se parte un renglón largo, y cuánto mide por eso. */
  const trozosDe = (nombre: string): string[] => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(TAM_DOC);
    return doc.splitTextToSize(nombre, ANCHO_TEXTO) as string[];
  };
  const altoDe = (nombre: string) => ALTO_DOC + (trozosDe(nombre).length - 1) * (TAM_DOC + 2);

  /** Sigue en una hoja nueva, con el membrete. */
  const siguienteHoja = () => {
    doc.addPage();
    yc = membrete(MARGIN);
  };

  // Los bloques de la hoja: los segmentos de la lista y, al final, renglones
  // en blanco. La oficina siempre termina pidiendo algo puntual; sin ese lugar
  // se escribe en el margen.
  const RENGLON_LIBRE = 22;
  const ALTO_TITULO = 20;
  const BLOQUES = [
    ...SEGMENTOS_DOCUMENTOS.map((s) => ({ titulo: s.titulo, documentos: s.documentos, libres: 0 })),
    { titulo: 'Otros documentos (indique)', documentos: [] as string[], libres: 3 },
  ];
  const AIRE = 8;
  const altoBloque = (b: typeof BLOQUES[number]) =>
    ALTO_TITULO + b.documentos.reduce((n, d) => n + altoDe(d), 0) + b.libres * RENGLON_LIBRE;

  for (const bloque of BLOQUES) {
    if (yc + altoBloque(bloque) > TOPE) siguienteHoja();

    doc.setFillColor(255, 138, 0);
    doc.rect(MARGIN, yc - 10, 3, 13, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(TAM_DOC);
    doc.setTextColor(20, 20, 20);
    doc.text(bloque.titulo.toUpperCase(), MARGIN + 9, yc);
    yc += ALTO_TITULO;

    for (const nombre of bloque.documentos) {
      // Los renglones largos se parten: el primero al lado de la casilla y el
      // resto alineado con el texto, no con la casilla.
      const trozos = trozosDe(nombre);
      casilla(doc, MARGIN, yc, trozos[0], TAM_DOC);
      for (let j = 1; j < trozos.length; j++) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(TAM_DOC);
        doc.text(trozos[j], MARGIN + SANGRIA, yc + j * (TAM_DOC + 2));
      }
      yc += ALTO_DOC + (trozos.length - 1) * (TAM_DOC + 2);
    }

    for (let j = 0; j < bloque.libres; j++) {
      const lado = 11;
      doc.setDrawColor(110, 110, 110); doc.setLineWidth(0.7);
      doc.rect(MARGIN, yc - lado + 1, lado, lado);
      doc.setDrawColor(170, 170, 170); doc.setLineWidth(0.5);
      doc.line(MARGIN + SANGRIA, yc + 1, MARGIN + ANCHO, yc + 1);
      yc += RENGLON_LIBRE;
    }
    yc += AIRE;
  }
  // ─── Uso de la oficina ───
  // Anclado al pie de la hoja de documentos, no a continuación de la lista:
  // así queda siempre en el mismo lugar y no baila según cuántos renglones haya.
  const yPie = PAGE_H - MARGIN - PIE_DOCS + 14;
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.6);
  doc.line(MARGIN, yPie - 14, PAGE_W - MARGIN, yPie - 14);
  let yp = seccion(doc, MARGIN, yPie + 4, 'Uso de la oficina');

  campo(doc, MARGIN, yp, COL, 'Recibido por (nombre y apellido)');
  campo(doc, COL2_X, yp, COL, 'Cargo');
  yp += ALTO_CAMPO;

  campo(doc, MARGIN, yp, COL, 'Fecha de recepción');
  campo(doc, COL2_X, yp, COL, 'Firma y sello');
  yp += ALTO_CAMPO;

  campo(doc, MARGIN, yp, ANCHO, 'Observaciones / documentos pendientes');

  previewPdf(doc, 'hoja-ingreso-personal.pdf');
}
