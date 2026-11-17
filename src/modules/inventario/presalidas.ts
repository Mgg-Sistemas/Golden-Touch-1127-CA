/* ============================================================
   Golden Touch · Pre-salidas de Almacén (Borradores de Salida para WhatsApp)
   Portado desde MGG (17-11-2026).

   Permite al almacenista preparar una pre-salida con sus materiales en la
   vista de teléfono, compartirla al grupo de WhatsApp para que el supervisor
   o persona autorizada apruebe por ese medio, editar el borrador si hay
   cambios, y finalmente ejecutar la salida oficial con su autorizado.
   No descuenta inventario hasta su confirmación final.
   ============================================================ */
import { norm } from '@/shared/lib/texto';
import { fechaHoraVE, num } from './salidasMina';

export interface LineaPreSalida {
  productoId: string;
  productoNombre: string;
  sku: string;
  categoria?: string;
  unidad: string;
  cantidad: number;
}

export interface PreSalida {
  id: string;
  codigo: string;
  almacen: string;
  motivo: string;
  retorna: boolean;
  equipo?: { id: string; nombre: string } | null;
  tipoMant?: string | null;
  lineas: LineaPreSalida[];
  estado: 'pendiente' | 'procesada' | 'descartada';
  autorizadoPor?: string | null;
  salidaCodigo?: string | null;
  actor: string;
  actorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreSalidaInput {
  id?: string;
  codigo?: string;
  almacen: string;
  motivo: string;
  retorna: boolean;
  equipo?: { id: string; nombre: string } | null;
  tipoMant?: string | null;
  lineas: LineaPreSalida[];
  actor: string;
  actorName: string | null;
}

/** Nombre legible del almacén en los mensajes y encabezados. */
export function nombreAlmacenVisible(almacen: string | null | undefined): string {
  const a = (almacen ?? '').trim();
  if (!a || a.toLowerCase() === 'general') return 'Inventario Los Pinos';
  return a;
}

/** Carpeta segura por almacén. */
export function slugAlmacenPreSalida(almacen: string | null | undefined): string {
  return norm(almacen || 'general').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';
}

/** Genera el siguiente código correlativo de pre-salida: ej. PRE-2026-0001 */
export function siguienteCodigoPreSalida(existentes: Array<{ codigo?: string | null }>, ano = new Date().getFullYear()): string {
  const prefijo = `PRE-${ano}-`;
  let max = 0;
  for (const item of existentes) {
    const c = (item.codigo ?? '').trim().toUpperCase();
    if (c.startsWith(prefijo)) {
      const n = parseInt(c.slice(prefijo.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    } else if (c.startsWith('PRE-')) {
      const partes = c.split('-');
      const n = parseInt(partes[partes.length - 1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefijo}${String(max + 1).padStart(4, '0')}`;
}

/** Valida los campos de una pre-salida antes de guardarla. */
export function validarPreSalida(d: { lineas: Array<{ cantidad: number; productoNombre?: string }>; motivo: string }): string | null {
  if (!d.lineas.length) return 'Agrega al menos un material a la pre-salida.';
  for (const l of d.lineas) {
    if (!(Number(l.cantidad) > 0)) return `Indica una cantidad válida para ${l.productoNombre || 'el material'}.`;
  }
  if (d.motivo.trim().length < 3) return 'Indica el motivo de la pre-salida (a quién, para qué o a qué equipo).';
  return null;
}

/** Mensaje formateado para enviar al grupo de WhatsApp pidiendo autorización (idéntico a MGG). */
export function mensajePreSalidaWhatsapp(p: PreSalida, quien?: string | null): string {
  const solicitante = quien || p.actorName || p.actor || 'Almacén';
  const l = [
    '⏳ *SOLICITUD DE SALIDA DE ALMACÉN (POR AUTORIZAR)*',
    `🔖 *Código:* ${p.codigo}`,
    `🏬 *Almacén:* ${nombreAlmacenVisible(p.almacen)}`,
    '',
    `📦 *Materiales a despachar (${p.lineas.length}):*`,
    ...p.lineas.map((x) => `• ${x.productoNombre}: ${num(x.cantidad)} ${x.unidad || 'UND'}`),
    '',
    `📝 *Motivo:* ${p.motivo}`,
  ];
  if (p.equipo?.nombre) {
    l.push(`🚜 *Equipo / Destino:* ${p.equipo.nombre}${p.tipoMant ? ` (${p.tipoMant})` : ''}`);
  }
  l.push(p.retorna ? '🔄 *Retorna:* SÍ (temporal)' : '❌ *Retorna:* NO (consumo)');
  l.push(`👷 *Preparado por:* ${solicitante}`);
  l.push(`🕒 *Fecha:* ${fechaHoraVE(p.createdAt)}`);
  l.push('');
  l.push('👉 *Favor responder a este mensaje indicando si está APROBADA la salida de estos materiales.*');
  return l.join('\n');
}

/** Filtra pre-salidas por texto tolerante a tildes y mayúsculas. */
export function filtrarPreSalidas(lista: PreSalida[], busqueda: string): PreSalida[] {
  const q = (busqueda ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!q) return lista;
  return lista.filter((p) => {
    const texto = [
      p.codigo,
      p.almacen,
      p.motivo,
      p.equipo?.nombre ?? '',
      p.actorName ?? '',
      p.actor,
      ...p.lineas.map((l) => `${l.productoNombre} ${l.sku}`),
    ].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return texto.includes(q);
  });
}

/* ─── Empaque PNG válido (1×1 transparente + payload UTF-8) para sync silencioso en buckets de imágenes ─── */

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x0d, 0x0a, 0x2d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);
const MARKER_TXT = '\n/*GT_PRESALIDA_JSON*/\n';

export function empaquetarPreSalidaPng(pre: PreSalida): Uint8Array {
  const enc = new TextEncoder();
  const tail = enc.encode(`${MARKER_TXT}${JSON.stringify(pre)}`);
  const out = new Uint8Array(PNG_1X1.length + tail.length);
  out.set(PNG_1X1, 0);
  out.set(tail, PNG_1X1.length);
  return out;
}

export function desempaquetarPreSalidaPng(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    const markerBytes = new TextEncoder().encode(MARKER_TXT);
    let pos = -1;
    outer: for (let i = 0; i <= bytes.length - markerBytes.length; i++) {
      for (let j = 0; j < markerBytes.length; j++) {
        if (bytes[i + j] !== markerBytes[j]) continue outer;
      }
      pos = i + markerBytes.length;
      break;
    }
    const jsonTxt = new TextDecoder('utf-8').decode(pos >= 0 ? bytes.subarray(pos) : bytes);
    return JSON.parse(jsonTxt) as Record<string, unknown>;
  } catch {
    return null;
  }
}
