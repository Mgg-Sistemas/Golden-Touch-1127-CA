/* ============================================================
   Golden Touch · RRHH · Carnet de personal (imagen PNG)
   Tamaño 54 × 86 mm a 300 DPI = 638 × 1016 px (formato vertical).

   Formato «solo la empresa» del 12/10/2026: el mismo carnet que MGG armó a
   partir del de La Cantera. Sin logos de la CVM, Motor Minero ni Gobierno.
   · Frente: marco dorado; ARRIBA el logo de Golden Touch con su RIF (o el
     de MTO si es de esa nómina); la FOTO con borde naranja; nombre (primer
     nombre y primer apellido) y C.I. en letra grande; cargo y vigencia; y
     abajo, centrado y GRANDE, el QR (abre /c/<token>: activo = datos,
     inactivo = solo logo). Subir el logo es lo que le dio sitio al QR.
   · Reverso (sin marco): el logo arriba; el recuadro punteado con el texto
     de la credencial y el contacto; la firma y el sello lado a lado; una
     raya naranja y la razón social con el RIF y la ciudad al pie.
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
  /** La vigencia y el RIF del pie, en gris. */
  gris: string;
}

/** Colores de cada versión (los contrastes los verifica carnetPersonal.test.ts). */
export const PALETA_CARNET: Record<TemaCarnet, PaletaCarnet> = {
  claro: { fondo: '#ffffff', marco: '#c49a1c', naranja: '#f28c00', texto: '#111111', puntos: '#2b2b2b', fotoVacia: '#eef1f5', gris: '#5f6672' },
  oscuro: { fondo: '#15171b', marco: '#d4a72c', naranja: '#f28c00', texto: '#f3f3f3', puntos: '#d0d0d0', fotoVacia: '#262a31', gris: '#9aa6b5' },
};

/** El QR va SIEMPRE oscuro sobre blanco: al revés, muchos lectores no lo leen. */
export const QR_OSCURO = '#111111';

const img = (archivo: string) => `${import.meta.env.BASE_URL}carnet/${archivo}`;
const LOGOS = {
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

/**
 * Texto centrado en negrita (800) que se achica de `size` a `min` y, si aun así no entra,
 * se parte hasta `maxLineas` renglones. Devuelve la Y siguiente.
 */
function textoAjustado(ctx: CanvasRenderingContext2D, texto: string, cx: number, y: number, maxW: number, size: number, min: number, maxLineas: number): number {
  let t = size;
  ctx.font = `800 ${t}px ${FUENTE}`;
  let lineas = partirLineas(ctx, texto, maxW);
  while ((lineas.length > maxLineas || lineas.some((l) => ctx.measureText(l).width > maxW)) && t > min) {
    t -= 1;
    ctx.font = `800 ${t}px ${FUENTE}`;
    lineas = partirLineas(ctx, texto, maxW);
  }
  let yy = y;
  for (const l of lineas.slice(0, maxLineas)) { ctx.fillText(l, cx, yy); yy += t + 4; }
  return yy;
}

/** Fondo y marco dorado redondeado (el frente; el reverso va sin marco). */
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

  // ARRIBA, solo el logo de la empresa con su RIF: Golden Touch, o Minería Tin Oxide si es de la nómina MTO.
  const logoY = 38, logoH = 148;
  const logoEmpresa = p.empresa === 'MTO' ? await loadLogoPdfEmpresa('MTO').catch(() => LOGOS.golden) : LOGOS.golden;
  await dibujarContain(ctx, logoEmpresa, 66, logoY, CARNET_W - 132, logoH, tema);

  // Foto con borde naranja.
  const fw = 236, fh = 290;
  const fx = (CARNET_W - fw) / 2;
  const fy = logoY + logoH + 32;
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
  ctx.lineWidth = 8;
  roundRect(ctx, fx - 4, fy - 4, fw + 8, fh + 8, 6);
  ctx.stroke();

  // Nombre (primer nombre y primer apellido) y C.I., en letra grande: se leen a un metro.
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.texto;
  const maxW = CARNET_W - 80;
  let y = fy + fh + 44;
  y = textoAjustado(ctx, nombreParaCarnet(p) || '—', cx, y, maxW, 36, 24, 2);
  y = textoAjustado(ctx, p.cedula ? `C.I. ${cedulaConPuntos(p.cedula)}` : 'C.I. —', cx, y + 2, maxW, 36, 24, 1);

  // Cargo y vigencia (la vigencia en gris).
  let ty = y + 12;
  const cargo = String(p.cargo ?? '').trim().toUpperCase();
  if (cargo) ty = textoAjustado(ctx, cargo, cx, ty, CARNET_W - 90, 30, 20, 2);
  const vence = fechaCarnet(p.carnet_vence);
  if (vence) {
    ctx.fillStyle = pal.gris;
    ty = textoAjustado(ctx, `Vigencia ${vence}`, cx, ty + 2, CARNET_W - 90, 26, 18, 1);
    ctx.fillStyle = pal.texto;
  }

  // QR GRANDE abajo, al centro: ocupa lo que queda hasta el pie (tope 250 px ≈ 21 mm).
  const qrAbajo = CARNET_H - 40;
  const qrSize = Math.max(140, Math.min(250, qrAbajo - (ty + 18)));
  const qrTop = qrAbajo - qrSize;
  const qrDataUrl = await QRCode.toDataURL(contenidoQrPersona(p), {
    errorCorrectionLevel: 'M', margin: 1, width: qrSize * 2,
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
/** Segundo párrafo (12/10/2026): la persona forma parte del personal de la empresa (ya no menciona la CVM). */
const reversoP2 = (razon: string) => `La persona portadora de esta credencial forma parte del personal de ${razon}`;

/** Genera el REVERSO del carnet (PNG, 638×1016 px). Igual para todos los de una misma empresa. */
export async function generarCarnetReversoDataUrl(tema: TemaCarnet = 'claro', empresa?: string | null): Promise<string> {
  const pal = PALETA_CARNET[tema];
  const emp = identidadEmpresa(empresa);
  const { canvas, ctx } = lienzo();
  const cx = CARNET_W / 2;
  // El reverso no lleva el marco dorado: solo el fondo.
  ctx.fillStyle = pal.fondo;
  ctx.fillRect(0, 0, CARNET_W, CARNET_H);
  const esMto = emp.clave === 'MTO';
  const razon = esMto ? 'Minería Tin Oxide, C.A.' : 'Golden Touch 1127 C.A.';

  // ARRIBA, el logo de la empresa.
  const logoY = 40, logoH = 140;
  const logoEmpresa = esMto ? await loadLogoPdfEmpresa('MTO').catch(() => LOGOS.golden) : LOGOS.golden;
  await dibujarContain(ctx, logoEmpresa, 76, logoY, CARNET_W - 152, logoH, tema);

  // Recuadro punteado con el texto de la credencial y el contacto (el alto sale del texto).
  ctx.textAlign = 'center';
  const boxX = 34, boxY = logoY + logoH + 30, boxW = CARNET_W - 68;
  const anchoTexto = boxW - 50, linea = 29;
  ctx.font = `400 22px ${FUENTE}`;
  const l1 = partirLineas(ctx, REVERSO_P1, anchoTexto);
  const l2 = partirLineas(ctx, reversoP2(razon), anchoTexto);
  const boxH = 44 + (l1.length + l2.length) * linea + 20 + 22 + 2 * linea + 30;
  ctx.save();
  ctx.strokeStyle = pal.puntos;
  ctx.lineWidth = 4;
  ctx.setLineDash([4, 9]);
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.restore();
  ctx.fillStyle = pal.texto;
  let y = boxY + 44;
  for (const ln of l1) { ctx.fillText(ln, cx, y); y += linea; }
  y += 20;
  for (const ln of l2) { ctx.fillText(ln, cx, y); y += linea; }
  y += 22;
  ctx.fillText(emp.email, cx, y); y += linea;
  ctx.fillText(`WhatsApp ${emp.whatsapp}`, cx, y);

  // Firma (izquierda) y sello (derecha) en la misma fila, pegados al pie. MTO no tiene sello
  // cargado: su firma va al centro.
  const filaH = 124;
  const altoPie = 14 + 8 + 80;
  const filaY = Math.max(boxY + boxH + 18, CARNET_H - 36 - altoPie - filaH);
  const cajaW = (CARNET_W - 100) / 2;
  if (esMto) {
    await dibujarContain(ctx, LOGOS.firma, (CARNET_W - cajaW) / 2, filaY, cajaW, filaH, tema);
  } else {
    await dibujarContain(ctx, LOGOS.firma, 40, filaY, cajaW, filaH, tema);
    await dibujarContain(ctx, LOGOS.goldenSello, 60 + cajaW, filaY, cajaW, filaH, tema);
  }

  // Raya naranja y, al pie, la razón social con el RIF y la ciudad.
  const rayaY = filaY + filaH + 14;
  ctx.fillStyle = pal.naranja;
  ctx.fillRect(70, rayaY, CARNET_W - 140, 8);
  ctx.fillStyle = pal.texto;
  ctx.font = `700 24px ${FUENTE}`;
  ctx.fillText(razon, cx, rayaY + 44);
  ctx.fillStyle = pal.gris;
  ctx.font = `400 19px ${FUENTE}`;
  ctx.fillText(`RIF ${emp.rif} · ${emp.ciudad}`, cx, rayaY + 74);

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
