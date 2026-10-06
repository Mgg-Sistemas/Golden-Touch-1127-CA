/* ============================================================
   Golden Touch · RRHH · Carnet de personal (imagen PNG)
   Tamaño 54 × 86 mm a 300 DPI = 638 × 1016 px (formato vertical).

   Formato del 06/10/2026, el del carnet que se venía imprimiendo a mano
   (HECTOR ALAGAL - GT - 2026.pdf), que es el que le gusta a la empresa:
   · Frente: fondo blanco con marco dorado, logo de la CVM arriba a la
     izquierda y de Motor Minero a la derecha, la FOTO con borde naranja,
     nombre y cédula, el logo de Golden Touch con su RIF, cargo, vigencia
     y el QR (que abre /c/<token>: activo = datos, inactivo = solo logo).
   · Reverso: el sello «CVM Aliados» sobre un recuadro punteado con el
     texto legal y el contacto, la firma y el sello de Golden Touch, y el
     logo del Ministerio del Poder Popular de Desarrollo Minero Ecológico.
   Antes había dos versiones (fondo negro y blanco); este formato es uno solo.
   Los logos viven en public/carnet/ (sacados del PDF de muestra).
   ============================================================ */
import QRCode from 'qrcode';
import { recorteDeEncuadre, type Encuadre } from './encuadreFoto';
import { EMPRESA_EMAIL, EMPRESA_WHATSAPP } from '@/shared/lib/empresa';
import { lineasSaludQr } from './saludPersonal';
import { fechaCarnet } from './vigenciaCarnet';
import type { Personal } from '@/shared/lib/types';

// 54 mm × (300 / 25.4) = 637.8 → 638 px  ·  86 mm × (300 / 25.4) = 1015.7 → 1016 px
export const CARNET_W = 638;
export const CARNET_H = 1016;

/** Colores del formato. Todo va sobre blanco (ver carnetPersonal.test.ts). */
export const COLORES_CARNET = {
  fondo: '#ffffff',
  /** Marco exterior, dorado como el del carnet impreso. */
  marco: '#c49a1c',
  /** Borde de la foto y raya de abajo del reverso. */
  naranja: '#f28c00',
  texto: '#111111',
  /** Puntos del recuadro del reverso. */
  puntos: '#2b2b2b',
  qr: '#111111',
} as const;

const img = (archivo: string) => `${import.meta.env.BASE_URL}carnet/${archivo}`;
const LOGOS = {
  cvm: img('cvm.jpg'),
  motorMinero: img('motor-minero.jpg'),
  cvmAliados: img('cvm-aliados.jpg'),
  gobierno: img('gobierno.jpg'),
  firma: img('firma.jpg'),
  goldenSello: img('golden-sello.jpg'),
  golden: `${import.meta.env.BASE_URL}${encodeURIComponent('Logo Golden Touch.jpg')}`,
};

const FUENTE = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

/** «HECTOR LUIS ALAGAL» → «Hector Luis Alagal», como en el carnet impreso. Las partículas van en minúscula. */
export function enTitulo(texto?: string | null): string {
  const menores = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'dos']);
  return String(texto ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i > 0 && menores.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** «V-26830892» → «V-26.830.892» (los puntos de miles, como se imprime). */
export function cedulaConPuntos(cedula?: string | null): string {
  const t = String(cedula ?? '').trim().toUpperCase();
  const m = /^([VEJGP])?\s*-?\s*([\d.]+)$/.exec(t);
  if (!m) return t;
  const num = m[2].replace(/\./g, '');
  const conPuntos = num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return m[1] ? `${m[1]}-${conPuntos}` : conPuntos;
}

function cargarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Dibuja una imagen recortada para CUBRIR el rectángulo (object-fit: cover),
 * respetando el encuadre que se le haya puesto a la foto.
 *
 * Sin encuadre el resultado es exactamente el de antes —cubrir y centrar—, así
 * que las fotos que nadie ajustó se siguen viendo igual.
 */
function dibujarCover(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  x: number, y: number, w: number, h: number, encuadre?: Partial<Encuadre> | null,
) {
  const { sx, sy, sw, sh } = recorteDeEncuadre(img.width, img.height, w, h, encuadre);
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/**
 * Partículas que son parte del apellido, no un apellido.
 *
 * Sin esto, «DE LA CRUZ MARTÍNEZ» daría «DE» como apellido, y el carnet saldría
 * impreso con el apellido de nadie.
 */
const PARTICULAS = new Set([
  'DE', 'DEL', 'LA', 'LAS', 'LO', 'LOS', 'Y', 'DA', 'DAS', 'DO', 'DOS',
  'SAN', 'SANTA', 'VAN', 'VON', 'MC', 'MAC', 'SAINT', 'ST',
]);

/**
 * El primer nombre (o el primer apellido) de un texto que puede traer varios.
 *
 * Arrastra las partículas iniciales: «DE LA CRUZ MARTÍNEZ» devuelve
 * «DE LA CRUZ», no «DE».
 */
export function primeraParte(texto?: string | null): string {
  const palabras = String(texto ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!palabras.length) return '';
  const tomadas: string[] = [];
  for (const palabra of palabras) {
    tomadas.push(palabra);
    if (!PARTICULAS.has(palabra)) break; // la primera que no es partícula cierra
  }
  return tomadas.join(' ');
}

/**
 * Nombre que va IMPRESO en el carnet: primer nombre y primer apellido.
 *
 * En la base el nombre se guarda completo —hace falta así en la constancia de
 * trabajo, que es un documento legal—, pero en el carnet no entra: un
 * «JESÚS EDUARDO PÉREZ GÓMEZ» obliga a achicar la letra hasta que deja de
 * leerse a un metro, que es justo para lo que sirve un carnet.
 *
 * El QR NO usa esto: adentro va la identidad completa, que es lo que necesita
 * ver quien lo escanea.
 */
export function nombreParaCarnet(p: { nombre?: string | null; apellido?: string | null }): string {
  return [primeraParte(p.nombre), primeraParte(p.apellido)].filter(Boolean).join(' ');
}

/**
 * Lo que va DENTRO del QR (05/10/2026): el enlace a /c/<token>. Al escanearlo,
 * la página le pregunta a la base cómo está la persona: activa muestra sus datos,
 * desactivada muestra solo el logo de la empresa (CarnetPublicoPage).
 * Sin token (no debería pasar: la base lo pone sola) queda el texto de antes.
 */
export function contenidoQrPersona(p: Personal, origen = typeof window !== 'undefined' ? window.location.origin : ''): string {
  if (p.carnet_token && origen) return `${origen}${import.meta.env.BASE_URL.replace(/\/$/, '')}/c/${p.carnet_token}`;
  return textoQrPersona(p);
}

/** Texto con los datos de la persona (el QR de antes; queda de respaldo). */
export function textoQrPersona(p: Personal): string {
  const nombre = `${p.nombre} ${p.apellido ?? ''}`.trim();
  const lineas = [
    'GOLDEN TOUCH 1127 C.A.',
    `Nombre: ${nombre}`,
    p.cedula ? `Cédula: ${p.cedula}` : '',
    p.cargo ? `Cargo: ${p.cargo}` : '',
    p.departamento ? `Departamento: ${p.departamento}` : '',
    p.telefono ? `Teléfono: ${p.telefono}` : '',
    p.correo ? `Correo: ${p.correo}` : '',
    (p.contacto_emergencia || p.telefono_emergencia)
      ? `Emergencia: ${[p.contacto_emergencia, p.telefono_emergencia].filter(Boolean).join(' · ')}`
      : '',
    // Las condiciones de salud van aquí por lo mismo que el contacto de
    // emergencia: quien asiste a un accidentado escanea el carnet y necesita
    // saber a qué no puede ser alérgico ANTES de medicarlo.
    ...lineasSaludQr(p),
  ].filter(Boolean);
  return lineas.join('\n');
}

/** Dibuja una imagen ENTERA dentro de la caja (object-fit: contain), centrada. Nunca falla. */
async function dibujarContain(ctx: CanvasRenderingContext2D, src: string, x: number, y: number, w: number, h: number) {
  try {
    const im = await cargarImg(src);
    const k = Math.min(w / im.width, h / im.height);
    const dw = im.width * k; const dh = im.height * k;
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } catch { /* un logo que no carga no impide el carnet */ }
}

/** Pone la letra (negrita) más grande, entre `base` y `min`, con la que el texto entra en `maxW`. Dice si entró. */
function letraQueQuepa(ctx: CanvasRenderingContext2D, texto: string, base: number, min: number, maxW: number): boolean {
  for (let size = base; size >= min; size -= 1) {
    ctx.font = `700 ${size}px ${FUENTE}`;
    if (ctx.measureText(texto).width <= maxW) return true;
  }
  return false;
}

/** Fondo blanco y marco dorado redondeado: igual en las dos caras. */
function fondoYMarco(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLORES_CARNET.fondo;
  ctx.fillRect(0, 0, CARNET_W, CARNET_H);
  ctx.strokeStyle = COLORES_CARNET.marco;
  ctx.lineWidth = 10;
  roundRect(ctx, 9, 9, CARNET_W - 18, CARNET_H - 18, 34);
  ctx.stroke();
}

function lienzo(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = CARNET_W;
  canvas.height = CARNET_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el lienzo del carnet.');
  ctx.textBaseline = 'middle';
  return { canvas, ctx };
}

/**
 * Genera el FRENTE del carnet (PNG, 638×1016 px = 54×86 mm a 300 DPI).
 * @param fotoDataUrl foto de la persona ya resuelta como data URL (opcional).
 */
export async function generarCarnetPersonalDataUrl(p: Personal, fotoDataUrl?: string | null): Promise<string> {
  const { canvas, ctx } = lienzo();
  const cx = CARNET_W / 2;
  fondoYMarco(ctx);

  // Logos de arriba: CVM a la izquierda, Motor Minero a la derecha.
  await dibujarContain(ctx, LOGOS.cvm, 34, 30, 214, 132);
  await dibujarContain(ctx, LOGOS.motorMinero, CARNET_W - 34 - 132, 26, 132, 140);

  // Foto con borde naranja.
  const fw = 262, fh = 322;
  const fx = (CARNET_W - fw) / 2;
  const fy = 182;
  ctx.save();
  roundRect(ctx, fx, fy, fw, fh, 6);
  ctx.fillStyle = '#eef1f5';
  ctx.fill();
  ctx.clip();
  if (fotoDataUrl) {
    try {
      const foto = await cargarImg(fotoDataUrl);
      dibujarCover(ctx, foto, fx, fy, fw, fh, p.foto_encuadre);
    } catch { /* si falla, queda el fondo gris */ }
  } else {
    // Silueta (cabeza + hombros) mientras no haya foto.
    ctx.fillStyle = 'rgba(90,102,117,0.40)';
    ctx.beginPath(); ctx.arc(cx, fy + fh * 0.4, 56, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, fy + fh * 1.02, 100, Math.PI, 0); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = COLORES_CARNET.naranja;
  ctx.lineWidth = 7;
  roundRect(ctx, fx, fy, fw, fh, 6);
  ctx.stroke();

  // Nombre COMPLETO, como en el carnet impreso. Si no entra ni con la letra más
  // chica, va en dos renglones (nombres / apellidos).
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORES_CARNET.texto;
  const completo = enTitulo(`${p.nombre ?? ''} ${p.apellido ?? ''}`);
  const maxW = CARNET_W - 70;
  let y = fy + fh + 40;
  if (letraQueQuepa(ctx, completo, 34, 24, maxW)) {
    ctx.fillText(completo, cx, y);
  } else {
    for (const linea of [enTitulo(p.nombre), enTitulo(p.apellido)].filter(Boolean)) {
      letraQueQuepa(ctx, linea, 30, 18, maxW);
      ctx.fillText(linea, cx, y);
      y += 32;
    }
    y -= 32;
  }
  if (p.cedula) {
    ctx.font = `700 30px ${FUENTE}`;
    ctx.fillText(`C.I. ${cedulaConPuntos(p.cedula)}`, cx, y + 36);
  }

  // Logo de Golden Touch con su RIF.
  const gw = 372, gh = gw * (608 / 1696);
  const gy = 612;
  await dibujarContain(ctx, LOGOS.golden, (CARNET_W - gw) / 2, gy, gw, gh);

  // Cargo y vigencia.
  ctx.fillStyle = COLORES_CARNET.texto;
  if (p.cargo) {
    const cargo = enTitulo(p.cargo);
    letraQueQuepa(ctx, cargo, 28, 16, maxW);
    ctx.fillText(cargo, cx, gy + gh + 36);
  }
  const vence = fechaCarnet(p.carnet_vence);
  if (vence) {
    ctx.font = `700 28px ${FUENTE}`;
    ctx.fillText(`Vigencia ${vence}`, cx, gy + gh + 72);
  }

  // QR abajo, al centro: abre /c/<token> (activo = datos, inactivo = solo el logo).
  const qrSize = 116;
  const qrDataUrl = await QRCode.toDataURL(contenidoQrPersona(p), {
    errorCorrectionLevel: 'M', margin: 1, width: qrSize * 2,
    color: { dark: COLORES_CARNET.qr, light: '#ffffff' },
  });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(await cargarImg(qrDataUrl), cx - qrSize / 2, CARNET_H - 30 - qrSize, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;

  return canvas.toDataURL('image/png');
}

/** Parte un texto en líneas (greedy) que quepan en `maxW`. */
function partirLineas(ctx: CanvasRenderingContext2D, texto: string, maxW: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let linea = '';
  for (const w of palabras) {
    const prueba = linea ? `${linea} ${w}` : w;
    if (ctx.measureText(prueba).width > maxW && linea) { lineas.push(linea); linea = w; }
    else linea = prueba;
  }
  if (linea) lineas.push(linea);
  return lineas;
}


/** Texto legal fijo del reverso del carnet. */
const REVERSO_P1 = 'Credencial de uso exclusivo para las alianzas en minerales estratégicos suscritas en la República Bolivariana de Venezuela. Agradecemos a todas las autoridades civiles, militares e institucionales prestar la mayor colaboración posible al portador de esta identificación.';
const REVERSO_P2 = 'La persona portadora de esta credencial pertenece al grupo de alianzas de minerales estratégicos de la Corporación Venezolana de Minería.';

/** Párrafo CENTRADO (como en el carnet impreso). Devuelve la Y siguiente. */
function textoCentrado(ctx: CanvasRenderingContext2D, texto: string, cx: number, y: number, maxW: number, lh: number): number {
  let yy = y;
  for (const linea of partirLineas(ctx, texto, maxW)) { ctx.fillText(linea, cx, yy); yy += lh; }
  return yy;
}

/** Genera el REVERSO del carnet (PNG, 638×1016 px). Es igual para todos. */
export async function generarCarnetReversoDataUrl(): Promise<string> {
  const { canvas, ctx } = lienzo();
  const cx = CARNET_W / 2;
  fondoYMarco(ctx);

  // Recuadro punteado con el texto legal y el contacto.
  const bx = 44, by = 130, bw = CARNET_W - 88, bh = 560;
  ctx.save();
  ctx.strokeStyle = COLORES_CARNET.puntos;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.setLineDash([0.1, 10]);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.restore();

  // Sello «CVM Aliados» encima del borde de arriba (lo interrumpe, como en el impreso).
  await dibujarContain(ctx, LOGOS.cvmAliados, cx - 96, 14, 192, 196);

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORES_CARNET.texto;
  ctx.font = `400 23px ${FUENTE}`;
  let y = 236;
  y = textoCentrado(ctx, REVERSO_P1, cx, y, bw - 44, 32);
  y += 20;
  y = textoCentrado(ctx, REVERSO_P2, cx, y, bw - 44, 32);
  y += 22;
  ctx.fillText(EMPRESA_EMAIL, cx, y);
  ctx.fillText(`WhatsApp ${EMPRESA_WHATSAPP}`, cx, y + 32);

  // Firma a la izquierda y sello de Golden Touch a la derecha.
  await dibujarContain(ctx, LOGOS.firma, 64, 708, 250, 136);
  await dibujarContain(ctx, LOGOS.goldenSello, 336, 730, 238, 86);

  // Raya naranja y logo del Ministerio.
  ctx.strokeStyle = COLORES_CARNET.naranja;
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(92, 858); ctx.lineTo(CARNET_W - 92, 858); ctx.stroke();
  await dibujarContain(ctx, LOGOS.gobierno, cx - 98, 870, 196, 125);

  return canvas.toDataURL('image/png');
}

/** Nombre de archivo sugerido para el carnet (la cara va en el nombre, para no confundirlas al imprimir). */
export function nombreArchivoCarnet(p: Personal, cara: 'frente' | 'reverso' = 'frente'): string {
  const base = `${p.nombre}_${p.apellido ?? ''}`.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `carnet_${base || 'personal'}_${cara}.png`;
}
