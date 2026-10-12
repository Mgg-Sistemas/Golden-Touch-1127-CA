/* ============================================================
   Golden Touch · RRHH · Carnet de personal (imagen PNG)
   Tamaño 54 × 86 mm a 300 DPI = 638 × 1016 px (formato vertical).

   Formato del 12/10/2026 (ordenado como el carnet de La Cantera): SOLO el
   logo de la empresa —sin CVM, Motor Minero ni Gobierno— y el QR grande.
   · Frente: marco dorado; arriba el logo de Golden Touch con su RIF (o el
     de MTO si es de esa nómina); la FOTO con borde naranja, nombre, cédula,
     el CARGO en mayúsculas y la vigencia; abajo el QR grande con
     «ESCANEE PARA VERIFICAR» (abre /c/<token>: activo = datos, inactivo =
     solo logo). Subir el logo es lo que le dio sitio al QR (116 → ~280 px).
   · Reverso: el logo arriba interrumpiendo el recuadro punteado con el
     texto legal y el contacto, y la firma autorizada sobre la raya naranja.
   Dos versiones: fondo BLANCO (la del impreso) y fondo NEGRO. En la negra cada
   logo va sobre una placa blanca redondeada, igual que el QR.
   Los logos viven en public/carnet/ (sacados del PDF de muestra).
   ============================================================ */
import QRCode from 'qrcode';
import { recorteDeEncuadre, type Encuadre } from './encuadreFoto';
import { identidadEmpresa } from '@/shared/lib/empresa';
import { loadLogoPdfEmpresa } from '@/shared/lib/pdfLogo';
import { lineasSaludQr } from './saludPersonal';
import { fechaCarnet } from './vigenciaCarnet';
import type { Personal } from '@/shared/lib/types';

// 54 mm × (300 / 25.4) = 637.8 → 638 px  ·  86 mm × (300 / 25.4) = 1015.7 → 1016 px
export const CARNET_W = 638;
export const CARNET_H = 1016;

/** Las dos versiones del carnet. La blanca es la del carnet impreso. */
export type TemaCarnet = 'claro' | 'oscuro';

export const TEMAS_CARNET: { valor: TemaCarnet; etiqueta: string; sufijo: string }[] = [
  { valor: 'claro', etiqueta: 'Fondo blanco', sufijo: 'blanco' },
  { valor: 'oscuro', etiqueta: 'Fondo negro', sufijo: 'negro' },
];

export interface PaletaCarnet {
  fondo: string;
  /** Marco exterior, dorado como el del carnet impreso. */
  marco: string;
  /** Borde de la foto y raya de abajo del reverso. */
  naranja: string;
  texto: string;
  /** Puntos del recuadro del reverso. */
  puntos: string;
  /** Relleno del marco de la foto cuando no hay foto. */
  fotoVacia: string;
  /** El cargo y el «Escanee para verificar», en el color de la marca (más oscuro que el naranja para que se lea). */
  cargo: string;
}

/** Colores de cada versión (los contrastes los verifica carnetPersonal.test.ts). */
export const PALETA_CARNET: Record<TemaCarnet, PaletaCarnet> = {
  claro: { fondo: '#ffffff', marco: '#c49a1c', naranja: '#f28c00', texto: '#111111', puntos: '#2b2b2b', fotoVacia: '#eef1f5', cargo: '#8a4b00' },
  oscuro: { fondo: '#15171b', marco: '#d4a72c', naranja: '#f28c00', texto: '#f3f3f3', puntos: '#d0d0d0', fotoVacia: '#262a31', cargo: '#f5a623' },
};

/** El QR va SIEMPRE oscuro sobre blanco: al revés, muchos lectores no lo leen. */
export const QR_OSCURO = '#111111';

const img = (archivo: string) => `${import.meta.env.BASE_URL}carnet/${archivo}`;
const LOGOS = {
  firma: img('firma.jpg'),
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
    identidadEmpresa(p.empresa).nombre,
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

/**
 * Dibuja una imagen ENTERA dentro de la caja (object-fit: contain), centrada. Nunca falla.
 *
 * En la versión NEGRA el logo va sobre una placa blanca redondeada (como el QR):
 * los logos son JPG con fondo blanco y pasarlos a negro los ensucia (bordes
 * grises, cajas alrededor). Sobre la placa se ven con sus colores de siempre.
 */
async function dibujarContain(
  ctx: CanvasRenderingContext2D, src: string, x: number, y: number, w: number, h: number, tema: TemaCarnet = 'claro',
) {
  try {
    const im = await cargarImg(src);
    const pad = tema === 'oscuro' ? 8 : 0;
    const k = Math.min((w - pad * 2) / im.width, (h - pad * 2) / im.height);
    const dw = im.width * k; const dh = im.height * k;
    const dx = x + (w - dw) / 2; const dy = y + (h - dh) / 2;
    if (pad) {
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, dx - pad, dy - pad, dw + pad * 2, dh + pad * 2, 12);
      ctx.fill();
    }
    ctx.drawImage(im, dx, dy, dw, dh);
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

/** Fondo y marco dorado redondeado: igual en las dos caras. */
function fondoYMarco(ctx: CanvasRenderingContext2D, pal: PaletaCarnet) {
  ctx.fillStyle = pal.fondo;
  ctx.fillRect(0, 0, CARNET_W, CARNET_H);
  ctx.strokeStyle = pal.marco;
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
export async function generarCarnetPersonalDataUrl(
  p: Personal, fotoDataUrl?: string | null, tema: TemaCarnet = 'claro',
): Promise<string> {
  const pal = PALETA_CARNET[tema];
  const { canvas, ctx } = lienzo();
  const cx = CARNET_W / 2;
  fondoYMarco(ctx, pal);

  // Arriba, solo el logo de la empresa con su RIF: Golden Touch, o Minería Tin Oxide si es de la nómina MTO.
  const gw = 400, gh = gw * (608 / 1696);
  const logoEmpresa = p.empresa === 'MTO' ? await loadLogoPdfEmpresa('MTO').catch(() => LOGOS.golden) : LOGOS.golden;
  await dibujarContain(ctx, logoEmpresa, (CARNET_W - gw) / 2, 30, gw, gh, tema);

  // Foto con borde naranja.
  const fw = 236, fh = 290;
  const fx = (CARNET_W - fw) / 2;
  const fy = 186;
  ctx.save();
  roundRect(ctx, fx, fy, fw, fh, 6);
  ctx.fillStyle = pal.fotoVacia;
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
    ctx.beginPath(); ctx.arc(cx, fy + fh * 0.4, 52, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, fy + fh * 1.02, 92, Math.PI, 0); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = pal.naranja;
  ctx.lineWidth = 7;
  roundRect(ctx, fx, fy, fw, fh, 6);
  ctx.stroke();

  // Nombre COMPLETO. Si no entra ni con la letra más chica, va en dos renglones
  // (nombres / apellidos) y lo de abajo se corre.
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.texto;
  const completo = enTitulo(`${p.nombre ?? ''} ${p.apellido ?? ''}`);
  const maxW = CARNET_W - 70;
  let y = fy + fh + 34;
  if (letraQueQuepa(ctx, completo, 32, 24, maxW)) {
    ctx.fillText(completo, cx, y);
  } else {
    for (const linea of [enTitulo(p.nombre), enTitulo(p.apellido)].filter(Boolean)) {
      letraQueQuepa(ctx, linea, 28, 18, maxW);
      ctx.fillText(linea, cx, y);
      y += 30;
    }
    y -= 30;
  }
  if (p.cedula) {
    y += 34;
    ctx.font = `700 27px ${FUENTE}`;
    ctx.fillText(`C.I. ${cedulaConPuntos(p.cedula)}`, cx, y);
  }

  // Cargo en mayúsculas y en el color de la marca (como el carnet de La Cantera), y la vigencia.
  if (p.cargo) {
    y += 34;
    ctx.fillStyle = pal.cargo;
    const cargo = String(p.cargo).trim().toUpperCase();
    letraQueQuepa(ctx, cargo, 23, 14, maxW);
    ctx.fillText(cargo, cx, y);
  }
  const vence = fechaCarnet(p.carnet_vence);
  if (vence) {
    y += 31;
    ctx.fillStyle = pal.texto;
    ctx.font = `700 23px ${FUENTE}`;
    ctx.fillText(`Vigencia ${vence}`, cx, y);
  }

  // QR GRANDE abajo, al centro: abre /c/<token> (activo = datos, inactivo = solo el logo).
  // Ocupa lo que queda entre la vigencia y el pie, con tope de 284 px (≈ 24 mm).
  // Corrección «Q»: se sigue leyendo con el plástico rayado o con polvo.
  const pie = CARNET_H - 62;
  const qrTop = y + 28;
  const qrSize = Math.max(170, Math.min(284, pie - qrTop));
  const qrDataUrl = await QRCode.toDataURL(contenidoQrPersona(p), {
    errorCorrectionLevel: 'Q', margin: 1, width: qrSize * 2,
    color: { dark: QR_OSCURO, light: '#ffffff' },
  });
  if (tema === 'oscuro') {
    // Sobre negro el QR va en un recuadro blanco: claro sobre oscuro no lo lee cualquier teléfono.
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, cx - qrSize / 2 - 8, qrTop - 8, qrSize + 16, qrSize + 16, 10);
    ctx.fill();
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(await cargarImg(qrDataUrl), cx - qrSize / 2, qrTop, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = pal.cargo;
  ctx.font = `700 17px ${FUENTE}`;
  ctx.fillText('ESCANEE PARA VERIFICAR', cx, qrTop + qrSize + 24);

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

/** Genera el REVERSO del carnet (PNG, 638×1016 px). Igual para todos los de una misma empresa. */
export async function generarCarnetReversoDataUrl(tema: TemaCarnet = 'claro', empresa?: string | null): Promise<string> {
  const pal = PALETA_CARNET[tema];
  const emp = identidadEmpresa(empresa);
  const { canvas, ctx } = lienzo();
  const cx = CARNET_W / 2;
  fondoYMarco(ctx, pal);

  // Recuadro punteado con el texto legal y el contacto.
  const bx = 44, by = 112, bw = CARNET_W - 88, bh = 600;
  ctx.save();
  ctx.strokeStyle = pal.puntos;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.setLineDash([0.1, 10]);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.restore();

  // Arriba, solo el logo de la empresa, interrumpiendo el borde del recuadro.
  const gw = 380, gh = gw * (608 / 1696);
  const logoEmpresa = emp.clave === 'MTO' ? await loadLogoPdfEmpresa('MTO').catch(() => LOGOS.golden) : LOGOS.golden;
  ctx.fillStyle = pal.fondo;
  ctx.fillRect(cx - gw / 2 - 10, by - 8, gw + 20, 16);
  await dibujarContain(ctx, logoEmpresa, cx - gw / 2, 34, gw, gh, tema);

  ctx.textAlign = 'center';
  ctx.fillStyle = pal.texto;
  ctx.font = `400 23px ${FUENTE}`;
  let y = 222;
  y = textoCentrado(ctx, REVERSO_P1, cx, y, bw - 44, 32);
  y += 20;
  y = textoCentrado(ctx, REVERSO_P2, cx, y, bw - 44, 32);
  y += 22;
  ctx.fillText(emp.email, cx, y);
  ctx.fillText(`WhatsApp ${emp.whatsapp}`, cx, y + 32);

  // Firma autorizada, centrada sobre la raya naranja, con la razón social y el RIF.
  await dibujarContain(ctx, LOGOS.firma, cx - 140, 740, 280, 150, tema);
  ctx.strokeStyle = pal.naranja;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(130, 904); ctx.lineTo(CARNET_W - 130, 904); ctx.stroke();
  ctx.fillStyle = pal.texto;
  ctx.font = `700 19px ${FUENTE}`;
  ctx.fillText('Firma autorizada', cx, 932);
  ctx.font = `400 17px ${FUENTE}`;
  // El logo de Golden Touch ya lleva el RIF; el de MTO no, así que ahí va escrito.
  ctx.fillText(emp.clave === 'MTO' ? `Minería Tin Oxide, C.A. · RIF ${emp.rif}` : 'Golden Touch 1127, C.A.', cx, 958);

  return canvas.toDataURL('image/png');
}

/**
 * Nombre de archivo sugerido. Lleva la cara y la versión: si no, bajar el frente
 * blanco y después el negro deja dos archivos iguales y el segundo queda «(1)».
 */
export function nombreArchivoCarnet(p: Personal, cara: 'frente' | 'reverso' = 'frente', tema: TemaCarnet = 'claro'): string {
  const base = `${p.nombre}_${p.apellido ?? ''}`.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const sufijo = TEMAS_CARNET.find((t) => t.valor === tema)?.sufijo ?? tema;
  return `carnet_${base || 'personal'}_${cara}_${sufijo}.png`;
}
