/* ============================================================
   Golden Touch · Documentación · Reglas de la nota de envío

   Funciones puras (sin base ni pantalla) que comparten el formulario,
   el histórico y el PDF: cómo se escribe el correlativo, qué renglones
   cuentan y cuánto suma la nota. El correlativo lo asigna la BASE
   (secuencia `envios_documentacion_numero_seq`): aquí solo se le da formato.
   ============================================================ */

export interface RenglonEnvio {
  descripcion: string;
  cantidad: number | null;
}

export type EstadoEnvio = 'emitido' | 'recibido' | 'anulado';

export const ESTADO_ENVIO_LABEL: Record<EstadoEnvio, string> = {
  emitido: 'Enviada',
  recibido: 'Recibida conforme',
  anulado: 'Anulada',
};

/** N° de la nota con 4 dígitos, como en el formato impreso: 1 → «0001». */
export function numeroEnvio(n: number | null | undefined): string {
  const v = Math.max(0, Math.trunc(Number(n) || 0));
  return String(v).padStart(4, '0');
}

/** Renglones que van a la nota: con descripción. La cantidad vacía se guarda como null. */
export function renglonesValidos(items: RenglonEnvio[]): RenglonEnvio[] {
  return items
    .map((r) => ({
      descripcion: (r.descripcion ?? '').trim(),
      cantidad: r.cantidad == null || Number.isNaN(Number(r.cantidad)) ? null : Number(r.cantidad),
    }))
    .filter((r) => r.descripcion.length > 0);
}

/** Suma de cantidades (los renglones sin cantidad no suman). */
export function totalRenglones(items: RenglonEnvio[]): number {
  return renglonesValidos(items).reduce((a, r) => a + (r.cantidad ?? 0), 0);
}

/** Texto de cantidad para tabla/PDF: enteros sin decimales, el resto con coma. */
export function cantidadTexto(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '';
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toLocaleString('es-VE', { maximumFractionDigits: 2 });
}

/* ───────── Catálogo de destinatarios ───────── */

/** Lo que se guarda de un destinatario y se copia a la nota. */
export interface DatosDestinatario {
  razon_social: string;
  rif: string | null;
  direccion: string | null;
  atencion_a: string | null;
  condicion: string | null;
}

const normDest = (s: string | null | undefined) =>
  String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** El destinatario del catálogo con esa razón social (sin importar mayúsculas, acentos ni espacios). */
export function buscarDestinatario<T extends DatosDestinatario>(lista: T[], razon: string): T | null {
  const k = normDest(razon);
  return k ? lista.find((d) => normDest(d.razon_social) === k) ?? null : null;
}

/** ¿Lo escrito en la nota difiere de lo guardado? (para ofrecer actualizar el catálogo) */
export function difiereDelCatalogo(datos: DatosDestinatario, guardado: DatosDestinatario): boolean {
  const campos: (keyof DatosDestinatario)[] = ['razon_social', 'rif', 'direccion', 'atencion_a', 'condicion'];
  return campos.some((c) => normDest(datos[c]) !== normDest(guardado[c]));
}

/** Renglón del buscador: «ALCALDÍA DE CARONÍ · J-00000000-0 · Atención: Ana Pérez». */
export function etiquetaDestinatario(d: DatosDestinatario): string {
  return [d.razon_social, d.rif, d.atencion_a ? `Atención: ${d.atencion_a}` : null].filter(Boolean).join(' · ');
}
