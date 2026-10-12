/* ============================================================
   Golden Touch · Asignaciones · El acta de entrega (lo que se prueba sin base)

   Portado de MGG el 12/10/2026: la carta numerada «ASIGNACIÓN 026-2026»
   con quién entrega por la empresa (quien suscribe), a quién, qué, firma
   y huella de quien recibe, y un ANEXO FOTOGRÁFICO.

   El número: la PRIMERA acta se escribe a mano (para seguir la numeración
   que se llevaba en papel). Desde ahí el formulario propone la siguiente
   (incremental); si se borra ese número, hay que escribirlo a mano. Si se
   eliminan todas las actas, se vuelve a empezar a mano.
   ============================================================ */
import type { Asignacion, PersonaMin } from './asignacionesReglas';

/** El número del acta: NNN-AAAA («026-2026»), correlativo por año. */
export const FORMATO_NUMERO_ACTA = /^\d{3,}-\d{4}$/;

/** Máximo de fotos del anexo fotográfico por acta. */
export const MAX_FOTOS_ACTA = 4;

/** A partir de cuántos ítems la carta los pone en tabla en vez de en la frase. */
export const ITEMS_EN_TABLA = 4;

/** Qué está mal con el número del acta. Vacío también es error: se escribe a mano. */
export function errorNumeroActa(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return 'Escribe el número del acta (ej.: 026-2026).';
  if (!FORMATO_NUMERO_ACTA.test(s)) return 'El número del acta va como 026-2026 (correlativo-año).';
  return null;
}

/** «026-2026» a partir de un correlativo y un año. */
export function numeroActa(correlativo: number, anio: number): string {
  return `${String(Math.max(1, Math.trunc(correlativo))).padStart(3, '0')}-${anio}`;
}

/**
 * El número que se propone para la próxima acta del año:
 *  · sin ninguna acta registrada → '' (la primera se escribe a mano);
 *  · con actas de ese año → la mayor + 1;
 *  · con actas solo de años anteriores → 001 del año.
 */
export function siguienteNumeroActa(existentes: readonly string[], anio: number): string {
  let hay = false;
  let max = 0;
  for (const n of existentes) {
    const m = /^(\d+)-(\d{4})$/.exec((n ?? '').trim());
    if (!m) continue;
    hay = true;
    if (Number(m[2]) === anio) max = Math.max(max, Number(m[1]));
  }
  if (!hay) return '';
  return numeroActa(max + 1, anio);
}

/** V-12874838 → V-12.874.838 (como se escribe en la carta). */
export function cedulaConPuntos(c: string | null | undefined): string {
  const s = (c ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  const m = /^([VEJPG])?-?([\d.]+)$/.exec(s);
  if (!m) return s;
  const digitos = m[2].replace(/\./g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${m[1] ?? 'V'}-${digitos}`;
}

const UNIDADES = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

/** «un (1)», «dos (2)», «treinta y cinco (35)». Pasado de 99, o con decimales, va solo el número. */
export function cantidadEnLetras(n: number | string | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  if (!Number.isInteger(v) || v > 99) return String(v);
  let letras: string;
  if (v < 30) letras = UNIDADES[v];
  else {
    const d = Math.floor(v / 10); const u = v % 10;
    letras = u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d];
  }
  return `${letras} (${v})`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «Puerto Ordaz, 24 de septiembre del 2026», con la fecha pura (YYYY-MM-DD). */
export function fechaCartaVE(iso: string | null | undefined, ciudad = 'Puerto Ordaz'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return ciudad;
  return `${ciudad}, ${Number(m[3])} de ${MESES[Number(m[2]) - 1] ?? ''} del ${m[1]}`;
}

/** Nombre completo en mayúsculas, como va en la carta. */
export function nombreCarta(p: Pick<PersonaMin, 'nombre' | 'apellido'> | null | undefined): string {
  return `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim().toUpperCase();
}

type ItemActa = Pick<Asignacion, 'descripcion' | 'cantidad' | 'serial' | 'numero_linea' | 'unidad'> & { retornable?: boolean | null };

/** Un ítem como se nombra en la carta: «un (1) BOLSO TIPO MALETÍN, serial ABC123». */
export function textoItemActa(a: ItemActa): string {
  const cant = cantidadEnLetras(a.cantidad ?? 1);
  const unidad = (a.unidad ?? '').trim();
  const conUnidad = unidad && !/^(und|unidad|unidades|u)$/i.test(unidad) ? `${cant} ${unidad.toLowerCase()} de ` : `${cant} `;
  const extra = [a.serial ? `serial ${a.serial}` : '', a.numero_linea ? `línea ${a.numero_linea}` : ''].filter(Boolean).join(', ');
  return `${conUnidad}${(a.descripcion ?? '').trim().toUpperCase()}${extra ? `, ${extra}` : ''}`;
}

/** «A; B y C»: la lista de lo entregado, en una frase. */
export function listaItemsActa(items: readonly ItemActa[]): string {
  const partes = items.map(textoItemActa).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join('; ')} y ${partes[partes.length - 1]}`;
}

/**
 * El cuerpo de la carta. Si nada es retornable (una dotación), no se le pide
 * «devolución inmediata» a nadie: sería pedirle que devuelva el uniforme.
 */
export function parrafoActa(o: {
  empresa: string;
  entregaNombre: string; entregaCedula: string; entregaCargo: string;
  recibeNombre: string;
  items: readonly ItemActa[];
  observaciones?: string | null;
}): string {
  const nombreEntrega = o.entregaNombre.trim()
    ? o.entregaNombre.toUpperCase()
    : '_______________________________';
  const quien = [nombreEntrega, o.entregaCedula ? `titular de la cédula de identidad N° ${cedulaConPuntos(o.entregaCedula)}` : '',
    o.entregaCargo ? `${o.entregaCargo} de la Empresa ${o.empresa}` : `de la Empresa ${o.empresa}`].filter(Boolean).join(', ');
  const enTabla = o.items.length >= ITEMS_EN_TABLA;
  const que = enTabla ? 'los bienes que se detallan a continuación' : listaItemsActa(o.items);
  const obs = (o.observaciones ?? '').trim();
  const finalidad = obs && obs.length <= 120 && !enTabla ? `, ${obs.replace(/\.$/, '')}` : '';
  const vuelve = o.items.some((i) => i.retornable !== false);
  const compromiso = vuelve
    ? 'comprometiéndose a su uso profesional, cuidado físico y devolución inmediata en caso de cese de la relación laboral.'
    : 'comprometiéndose a su uso profesional y cuidado físico.';
  const plural = o.items.length > 1 || enTabla;
  return `Quien suscribe, ${quien}. Le hace entrega a: ${o.recibeNombre.toUpperCase()} ${que}${finalidad}. `
    + `Por medio de esta se da constancia de que acepta que ${plural ? 'los bienes asignados son parte' : 'lo asignado es parte'} de sus herramientas de trabajo `
    + `PROPIEDAD de ${o.empresa}, ${compromiso}`;
}

/** Qué está mal con las fotos que se quieren subir. Null si todas sirven. */
export function errorFotosActa(archivos: readonly { name: string; type: string; size: number }[], yaCargadas = 0): string | null {
  if (archivos.length + yaCargadas > MAX_FOTOS_ACTA) return `El anexo fotográfico admite hasta ${MAX_FOTOS_ACTA} fotos.`;
  for (const f of archivos) {
    if (f.type && !f.type.startsWith('image/')) return `«${f.name}» no es una imagen.`;
    if (f.size > 10 * 1024 * 1024) return `«${f.name}» pesa más de 10 MB.`;
  }
  return null;
}

/** Nombre de archivo seguro para el almacenamiento (sin tildes ni símbolos). */
export function nombreArchivoSeguro(nombre: string): string {
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  return limpio.slice(-80) || 'archivo';
}
