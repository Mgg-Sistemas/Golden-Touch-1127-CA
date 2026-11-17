/* ============================================================
   Golden Touch · Pre-salidas / Borradores de almacén (17/11/2026)

   Permite a los almacenistas armar un borrador de salida (PRE-AAAA-####)
   indicando destino/equipo, solicitante y materiales SIN descontar stock
   ni mover el kardex, enviarlo al grupo de WhatsApp para aprobación de los
   supervisores, ajustar materiales/cantidades si hace falta, y finalmente:
   · Confirmar salida (eligiendo quién autorizó + captura opcional de WhatsApp)
     → ahí recién descuenta stock y pasa al kardex oficial.
   · O descartar/cancelar el borrador si fue rechazado, sin afectar inventario.

   Nota sobre emojis de WhatsApp: se usan solo emojis estándar sin U+FE0F
   para que lleguen íntegros en Android, iOS y WhatsApp Web.
   ============================================================ */

import { norm } from '@/shared/lib/texto';
import { num } from './salidasMina';

export type EstadoPreSalida = 'borrador' | 'procesada' | 'cancelada';

export interface ItemPreSalida {
  producto_id: string;
  producto_sku: string;
  producto_nombre: string;
  unidad: string;
  cantidad: number;
}

export interface PreSalidaAlmacen {
  id: string;
  codigo: string;
  almacen: string;
  destino_equipo: string;
  equipo_id: string | null;
  equipo_nombre: string | null;
  tipo_mantenimiento: string | null;
  solicitante: string;
  motivo: string | null;
  retorna: boolean | null;
  items: ItemPreSalida[];
  estado: EstadoPreSalida;
  actor: string;
  actor_name: string | null;
  created_at: string;
  updated_at: string;
  autorizado_por?: string | null;
  salida_codigos?: string[] | null;
  salida_ids?: string[] | null;
  procesada_en?: string | null;
  procesada_por?: string | null;
  cancelada_en?: string | null;
  cancelada_motivo?: string | null;
}

/** Nombre legible del almacén para el mensaje de WhatsApp y la pantalla. */
export function etiquetaAlmacenPreSalida(almacen: string | null | undefined): string {
  const a = (almacen ?? '').trim();
  if (!a || a.toLowerCase() === 'general') return 'Principal (Los Pinos)';
  return a;
}

/** Carpeta segura por almacén cuando se respalda en Storage / localStorage. */
export function slugAlmacenPreSalida(almacen: string | null | undefined): string {
  const a = norm(almacen || 'general').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return a || 'general';
}

/** Validación de los datos de un borrador de pre-salida antes de guardarlo. */
export function errorPreSalida(d: {
  items: { producto_id: string; producto_nombre: string; cantidad: number; stock?: number }[];
  destinoEquipo: string;
  solicitante: string;
}): string | null {
  if (!d.items.length) return 'Agrega al menos un material a la pre-salida.';
  const ids = new Set<string>();
  for (const it of d.items) {
    if (!it.producto_id) return 'Elige el material en cada renglón.';
    if (ids.has(it.producto_id)) return `«${it.producto_nombre}» está repetido en el borrador.`;
    ids.add(it.producto_id);
    if (!(Number(it.cantidad) > 0)) return `Indica la cantidad de «${it.producto_nombre}».`;
    if (typeof it.stock === 'number' && Number(it.cantidad) > it.stock) {
      return `No alcanza «${it.producto_nombre}»: hay ${num(it.stock)} disponible(s).`;
    }
  }
  if (d.destinoEquipo.trim().length < 2) return 'Indica el destino, equipo o frente de trabajo.';
  if (d.solicitante.trim().length < 2) return 'Indica quién solicita / retira en físico.';
  return null;
}

/** Arma el motivo completo que quedará en el kardex oficial al confirmar la salida. */
export function motivoSalidaDesdePreSalida(pre: Pick<PreSalidaAlmacen, 'codigo' | 'destino_equipo' | 'equipo_nombre' | 'solicitante' | 'motivo'>): string {
  const partes: string[] = [];
  const dest = pre.destino_equipo.trim();
  const eq = pre.equipo_nombre?.trim() || '';
  if (eq) {
    partes.push(`Mantenimiento: ${eq}`);
    if (dest && norm(dest) !== norm(eq)) partes.push(`Destino: ${dest}`);
  } else if (dest) {
    partes.push(`Destino/Equipo: ${dest}`);
  }
  if (pre.solicitante.trim()) partes.push(`Solicitado por: ${pre.solicitante.trim()}`);
  if (pre.motivo?.trim()) partes.push(pre.motivo.trim());
  partes.push(`Pre-salida ${pre.codigo}`);
  return partes.join(' · ');
}

/** Mensaje preformateado listo para enviar al grupo de supervisores en WhatsApp. */
export function mensajePreSalidaWhatsapp(pre: Pick<PreSalidaAlmacen, 'codigo' | 'almacen' | 'destino_equipo' | 'solicitante' | 'motivo' | 'items'>): string {
  const lineas: string[] = [
    '📦 *SOLICITUD DE SALIDA DE ALMACÉN*',
    `🔢 *Código:* ${pre.codigo}`,
    `📍 *Almacén:* ${etiquetaAlmacenPreSalida(pre.almacen)}`,
    `🚜 *Destino / Equipo:* ${pre.destino_equipo.trim() || '—'}`,
    `👷 *Solicitado por:* ${pre.solicitante.trim() || '—'}`,
  ];
  if (pre.motivo?.trim()) {
    lineas.push(`📝 *Observación:* ${pre.motivo.trim()}`);
  }
  lineas.push('', '*Materiales a despachar:*');
  for (const it of pre.items) {
    const u = (it.unidad || 'und').trim();
    lineas.push(`• ${num(it.cantidad)} ${u} · ${it.producto_nombre}`);
  }
  lineas.push('', '_Favor responder indicando aprobación para proceder con la entrega._');
  return lineas.join('\n');
}

/**
 * Resuelve la última versión de cada pre-salida cuando los borradores se guardan
 * como archivos inmutables `<id>__<seq>__<estado>.json` en Storage.
 */
export function resolverUltimasVersionesStorage(
  nombres: string[],
  incluirCerradas = false,
): { id: string; seq: string; estado: EstadoPreSalida; filename: string }[] {
  const re = /^([a-z0-9-]+)__([a-z0-9-]+)__(borrador|procesada|cancelada)\.json$/i;
  const porId = new Map<string, { id: string; seq: string; estado: EstadoPreSalida; filename: string }>();
  for (const filename of nombres) {
    const m = re.exec(filename);
    if (!m) continue;
    const [, id, seq, estRaw] = m;
    const estado = estRaw.toLowerCase() as EstadoPreSalida;
    const prev = porId.get(id);
    if (!prev || seq > prev.seq) {
      porId.set(id, { id, seq, estado, filename });
    }
  }
  return Array.from(porId.values())
    .filter((x) => incluirCerradas || x.estado === 'borrador')
    .sort((a, b) => b.seq.localeCompare(a.seq) || a.id.localeCompare(b.id));
}
