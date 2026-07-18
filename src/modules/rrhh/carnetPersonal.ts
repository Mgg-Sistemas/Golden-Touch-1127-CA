/* ============================================================
   Golden Touch · RRHH · Carnet de personal (imagen PNG)
   Tamaño 54 × 86 mm a 300 DPI = 638 × 1016 px (formato vertical).
   Muestra logo, FOTO de la persona, nombre y apellido, cédula y un
   QR con los datos de contacto. Colores del sistema (naranja/oscuro).
   ============================================================ */
import QRCode from 'qrcode';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import type { Personal } from '@/shared/lib/types';

// 54 mm × (300 / 25.4) = 637.8 → 638 px  ·  86 mm × (300 / 25.4) = 1015.7 → 1016 px
export const CARNET_W = 638;
export const CARNET_H = 1016;

// Paleta del sistema (theme.css).
const COL = {
  bg0: '#1c1f24',
  bg1: '#12151a',
  bg2: '#262a31',
  primary: '#ff8a00',
  primary2: '#ffa733',
  gold: '#ffd54a',
  text: '#e7ecf3',
  muted: '#9aa6b5',
  panel: '#ffffff',
  qrDark: '#161a20',
};

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

/** Dibuja una imagen recortada para CUBRIR el rectángulo (object-fit: cover). */
function dibujarCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const r = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > r) { sw = img.height * r; sx = (img.width - sw) / 2; }
  else { sh = img.width / r; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Texto que va DENTRO del QR: datos de la persona en texto legible al escanear. */
export function textoQrPersona(p: Personal): string {
  const nombre = `${p.nombre} ${p.apellido ?? ''}`.trim();
  const lineas = [
    'GOLDEN TOUCH 1127 C.A.',
    `Nombre: ${nombre}`,
    p.cedula ? `Cédula: ${p.cedula}` : '',
    p.cargo ? `Cargo: ${p.cargo}` : '',
    p.departamento ? `Departamento: ${p.departamento}` : '',
    p.telefono ? `Teléfono: ${p.telefono}` : '',
    (p.contacto_emergencia || p.telefono_emergencia)
      ? `Emergencia: ${[p.contacto_emergencia, p.telefono_emergencia].filter(Boolean).join(' · ')}`
      : '',
  ].filter(Boolean);
  return lineas.join('\n');
}

/** Ajusta el tamaño de fuente para que el texto quepa en `maxW` (baja hasta `min`). */
function fuenteQueQuepa(ctx: CanvasRenderingContext2D, texto: string, base: number, min: number, peso: string, maxW: number): number {
  let size = base;
  for (; size > min; size -= 2) {
    ctx.font = `${peso} ${size}px 'Segoe UI', Arial, sans-serif`;
    if (ctx.measureText(texto).width <= maxW) break;
  }
  ctx.font = `${peso} ${size}px 'Segoe UI', Arial, sans-serif`;
  return size;
}

/**
 * Genera el carnet de una persona y devuelve un PNG (data URL) de 638×1016 px
 * (54×86 mm a 300 DPI). Incluye logo, foto (si hay), nombre/apellido, cédula y QR.
 * @param fotoDataUrl foto de la persona ya resuelta como data URL (opcional).
 */
export async function generarCarnetPersonalDataUrl(p: Personal, fotoDataUrl?: string | null): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = CARNET_W;
  canvas.height = CARNET_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el lienzo del carnet.');
  ctx.textBaseline = 'middle';

  // Fondo (degradado oscuro del sistema).
  const bg = ctx.createLinearGradient(0, 0, 0, CARNET_H);
  bg.addColorStop(0, COL.bg0);
  bg.addColorStop(1, COL.bg1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARNET_W, CARNET_H);

  // Borde interior sutil.
  ctx.strokeStyle = 'rgba(255,138,0,0.35)';
  ctx.lineWidth = 4;
  roundRect(ctx, 10, 10, CARNET_W - 20, CARNET_H - 20, 26);
  ctx.stroke();

  // Banda superior naranja (encabezado) con el logo a la izquierda.
  const head = ctx.createLinearGradient(0, 0, CARNET_W, 0);
  head.addColorStop(0, COL.primary);
  head.addColorStop(1, COL.primary2);
  ctx.fillStyle = head;
  roundRect(ctx, 10, 10, CARNET_W - 20, 122, 24);
  ctx.fill();
  ctx.fillRect(10, 96, CARNET_W - 20, 36);

  ctx.fillStyle = '#1a0e00';
  ctx.textAlign = 'center';
  ctx.font = "700 32px 'Segoe UI', Arial, sans-serif";
  ctx.fillText('GOLDEN TOUCH 1127 C.A.', CARNET_W / 2 + 24, 58);
  ctx.font = "600 19px 'Segoe UI', Arial, sans-serif";
  ctx.fillText('CARNET DE PERSONAL', CARNET_W / 2 + 24, 92);

  // Logo (círculo blanco) en el encabezado.
  const cx = CARNET_W / 2;
  try {
    const logo = await loadLogoDataUrl();
    const img = await cargarImg(logo);
    const lx = 74, ly = 71, lr = 40;
    ctx.save();
    ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.clip();
    ctx.drawImage(img, lx - lr, ly - lr, lr * 2, lr * 2);
    ctx.restore();
  } catch { /* sin logo, sigue */ }

  // Marco de la FOTO (rectángulo redondeado, centrado).
  const fw = 260, fh = 312;
  const fx = (CARNET_W - fw) / 2;
  const fy = 156;
  ctx.save();
  roundRect(ctx, fx, fy, fw, fh, 18);
  ctx.fillStyle = COL.bg2;
  ctx.fill();
  ctx.clip();
  if (fotoDataUrl) {
    try {
      const foto = await cargarImg(fotoDataUrl);
      dibujarCover(ctx, foto, fx, fy, fw, fh);
    } catch { /* si falla, queda el placeholder */ }
  } else {
    // Silueta placeholder (cabeza + hombros).
    ctx.fillStyle = 'rgba(154,166,181,0.45)';
    const pcx = fx + fw / 2;
    ctx.beginPath(); ctx.arc(pcx, fy + fh * 0.4, 56, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(pcx, fy + fh * 1.02, 100, Math.PI, 0); ctx.fill();
  }
  ctx.restore();
  // Borde naranja del marco de la foto.
  roundRect(ctx, fx, fy, fw, fh, 18);
  ctx.strokeStyle = COL.primary;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Nombre y apellido (grande, blanco) + cédula (dorado) + cargo/depto (tenue).
  const nombre = `${p.nombre} ${p.apellido ?? ''}`.trim().toUpperCase();
  ctx.textAlign = 'center';
  ctx.fillStyle = COL.text;
  fuenteQueQuepa(ctx, nombre, 42, 24, '700', CARNET_W - 80);
  ctx.fillText(nombre, cx, fy + fh + 52);

  if (p.cedula) {
    ctx.fillStyle = COL.gold;
    ctx.font = "700 32px 'Consolas', 'Courier New', monospace";
    ctx.fillText(p.cedula, cx, fy + fh + 96);
  }
  if (p.cargo || p.departamento) {
    ctx.fillStyle = COL.muted;
    const sub = [p.cargo, p.departamento].filter(Boolean).join(' · ');
    fuenteQueQuepa(ctx, sub, 22, 15, '500', CARNET_W - 90);
    ctx.fillText(sub, cx, fy + fh + 132);
  }

  // Panel blanco con el QR.
  const panelW = 316;
  const panelX = (CARNET_W - panelW) / 2;
  const panelY = 646;
  ctx.fillStyle = COL.panel;
  roundRect(ctx, panelX, panelY, panelW, panelW, 20);
  ctx.fill();

  const qrDataUrl = await QRCode.toDataURL(textoQrPersona(p), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 280,
    color: { dark: COL.qrDark, light: '#ffffff' },
  });
  const qrImg = await cargarImg(qrDataUrl);
  const qrSize = 280;
  ctx.drawImage(qrImg, cx - qrSize / 2, panelY + (panelW - qrSize) / 2, qrSize, qrSize);

  // Leyenda bajo el QR.
  ctx.fillStyle = COL.muted;
  ctx.font = "500 20px 'Segoe UI', Arial, sans-serif";
  ctx.fillText('Escaneá el código para ver los datos de contacto', cx, panelY + panelW + 30);

  // Pie naranja.
  const footY = CARNET_H - 62;
  ctx.fillStyle = COL.primary;
  roundRect(ctx, 10, footY, CARNET_W - 20, 52, 20);
  ctx.fill();
  ctx.fillRect(10, footY, CARNET_W - 20, 28);
  ctx.fillStyle = '#1a0e00';
  ctx.font = "700 21px 'Segoe UI', Arial, sans-serif";
  ctx.fillText('IDENTIFICACIÓN OFICIAL · GOLDEN TOUCH 1127 C.A.', cx, footY + 29);

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

/** Dibuja un párrafo JUSTIFICADO (ambos márgenes alineados; la última línea al ras
 *  izquierdo). Devuelve la Y siguiente. */
function textoJustificado(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, maxW: number, lh: number): number {
  const lineas = partirLineas(ctx, texto, maxW);
  let yy = y;
  lineas.forEach((linea, i) => {
    const palabras = linea.split(' ');
    const ultima = i === lineas.length - 1;
    if (ultima || palabras.length === 1) {
      ctx.fillText(linea, x, yy);
    } else {
      const anchoPalabras = palabras.reduce((a, w) => a + ctx.measureText(w).width, 0);
      const hueco = (maxW - anchoPalabras) / (palabras.length - 1);
      let cursor = x;
      for (const w of palabras) { ctx.fillText(w, cursor, yy); cursor += ctx.measureText(w).width + hueco; }
    }
    yy += lh;
  });
  return yy;
}

/** Texto legal fijo del reverso del carnet. */
const REVERSO_P1 = 'Credencial de uso exclusivo para las alianzas en minerales estratégicos suscritas en la República Bolivariana de Venezuela. Agradecemos a todas las autoridades civiles, militares e institucionales prestar la mayor colaboración posible al portador de esta identificación.';
const REVERSO_P2 = 'La persona portadora de esta credencial pertenece al grupo de alianza de minerales estratégicos de la Corporación Venezolana de Minería.';
const REVERSO_EMAIL = 'mineralgroupguayanaca@gmail.com';
const REVERSO_WHATSAPP = 'WhatsApp +58 424-9349731';

/** Ruta del asset con la imagen institucional del reverso (Corporación Venezolana de Minería). */
const REVERSO_IMG_URL = `${import.meta.env.BASE_URL}cvm.jpg`;

/**
 * Genera el REVERSO del carnet (638×1016 px): imagen institucional, texto legal de
 * la credencial y datos de contacto. La imagen se toma de `public/carnet-reverso.png`
 * (si no existe, se dibuja un marcador).
 */
export async function generarCarnetReversoDataUrl(imagenInstitucionalDataUrl?: string | null): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = CARNET_W;
  canvas.height = CARNET_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el lienzo del carnet.');
  ctx.textBaseline = 'middle';

  // Fondo BLANCO.
  const cardText = '#1f2530';
  const cardEmail = '#7a8b1f'; // verde oliva del logo CVM
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CARNET_W, CARNET_H);

  ctx.strokeStyle = 'rgba(255,138,0,0.55)';
  ctx.lineWidth = 4;
  roundRect(ctx, 10, 10, CARNET_W - 20, CARNET_H - 20, 26);
  ctx.stroke();

  // Encabezado naranja.
  const head = ctx.createLinearGradient(0, 0, CARNET_W, 0);
  head.addColorStop(0, COL.primary);
  head.addColorStop(1, COL.primary2);
  ctx.fillStyle = head;
  roundRect(ctx, 10, 10, CARNET_W - 20, 100, 24);
  ctx.fill();
  ctx.fillRect(10, 74, CARNET_W - 20, 36);
  ctx.fillStyle = '#1a0e00';
  ctx.textAlign = 'center';
  ctx.font = "700 28px 'Segoe UI', Arial, sans-serif";
  ctx.fillText('GOLDEN TOUCH 1127 C.A.', CARNET_W / 2, 60);

  const cx = CARNET_W / 2;

  // Logo institucional REDONDO: el cvm.jpg ya es un logo circular; se dibuja COVER y se
  // recorta al círculo (sus esquinas negras quedan fuera). Anillo naranja alrededor.
  const rImg = 112;
  const cyImg = 132 + rImg;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cyImg, rImg, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();
  let imgOk = false;
  try {
    const src = imagenInstitucionalDataUrl || REVERSO_IMG_URL;
    const img = await cargarImg(src);
    dibujarCover(ctx, img, cx - rImg, cyImg - rImg, rImg * 2, rImg * 2);
    imgOk = true;
  } catch { /* sin imagen: marcador */ }
  ctx.restore();
  if (!imgOk) {
    ctx.fillStyle = COL.muted;
    ctx.font = "500 18px 'Segoe UI', Arial, sans-serif";
    ctx.fillText('Imagen institucional', cx, cyImg);
  }
  // Anillo naranja del disco.
  ctx.beginPath();
  ctx.arc(cx, cyImg, rImg, 0, Math.PI * 2);
  ctx.strokeStyle = COL.primary;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Texto legal JUSTIFICADO (oscuro sobre blanco).
  const margin = 46;
  const maxW = CARNET_W - margin * 2;
  let y = cyImg + rImg + 46;
  ctx.textAlign = 'left';
  ctx.fillStyle = cardText;
  ctx.font = "400 21px 'Segoe UI', Arial, sans-serif";
  y = textoJustificado(ctx, REVERSO_P1, margin, y, maxW, 31);
  y += 20;
  ctx.font = "600 21px 'Segoe UI', Arial, sans-serif";
  y = textoJustificado(ctx, REVERSO_P2, margin, y, maxW, 31);

  // Contacto (resaltado).
  const contY = CARNET_H - 150;
  ctx.textAlign = 'center';
  ctx.fillStyle = cardEmail;
  ctx.font = "700 22px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(REVERSO_EMAIL, cx, contY);
  ctx.fillStyle = cardText;
  ctx.font = "600 22px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(REVERSO_WHATSAPP, cx, contY + 34);

  // Pie naranja.
  const footY = CARNET_H - 62;
  ctx.fillStyle = COL.primary;
  roundRect(ctx, 10, footY, CARNET_W - 20, 52, 20);
  ctx.fill();
  ctx.fillRect(10, footY, CARNET_W - 20, 28);
  ctx.fillStyle = '#1a0e00';
  ctx.textAlign = 'center';
  ctx.font = "700 20px 'Segoe UI', Arial, sans-serif";
  ctx.fillText('CORPORACIÓN VENEZOLANA DE MINERÍA', cx, footY + 29);

  return canvas.toDataURL('image/png');
}

/** Nombre de archivo sugerido para el carnet. */
export function nombreArchivoCarnet(p: Personal, cara: 'frente' | 'reverso' = 'frente'): string {
  const base = `${p.nombre}_${p.apellido ?? ''}`.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `carnet_${base || 'personal'}_${cara}.png`;
}
