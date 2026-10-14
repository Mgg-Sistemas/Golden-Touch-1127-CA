/* ============================================================
   Golden Touch · Choferes / Conductores · Guías (14/10/2026)

   Las guías (de despacho, de movilización…) se cargan en PDF con su fecha, su
   número y, si aplica, el chofer y el vehículo. Se buscan por cualquier dato,
   se filtran por fecha y se ven en vista previa sin salir del sistema.
   ============================================================ */
import { esPdf, MAX_BYTES_DOCUMENTO, megas, type ArchivoSubido } from './archivosChofer';

export interface Guia {
  id: string;
  fecha: string;
  numero: string | null;
  descripcion: string | null;
  conductor_id: string | null;
  vehiculo_id: string | null;
  nota: string | null;
  path: string;
  nombre: string;
  tamano: number | null;
  subido_por: string | null;
  subido_por_nombre: string | null;
  created_at: string;
}

export interface FiltroGuias {
  texto: string;
  desde: string;
  hasta: string;
}

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Lo que es SOLO PDF y hasta 10 MB. `null` = se puede subir. */
export function validarArchivoGuia(file: ArchivoSubido | null | undefined): string | null {
  if (!file) return 'Elige el PDF de la guía.';
  if (!esPdf(file)) return 'La guía tiene que ser un archivo PDF.';
  if (Number(file.size) <= 0) return 'El archivo está vacío.';
  if (Number(file.size) > MAX_BYTES_DOCUMENTO) return `El PDF pesa ${megas(file.size)} y el tope es 10 MB.`;
  return null;
}

/** Filtra por fechas (inclusive) y por texto en cualquier dato de la guía (sin acentos).
 *  `extra` da el texto del chofer y del vehículo de cada guía. */
export function filtrarGuias(guias: Guia[], f: FiltroGuias, extra: (g: Guia) => string = () => ''): Guia[] {
  const t = normal(f.texto.trim());
  return guias.filter((g) => (!f.desde || g.fecha >= f.desde) && (!f.hasta || g.fecha <= f.hasta)
    && (!t || normal([g.numero, g.descripcion, g.nota, g.nombre, g.subido_por_nombre, extra(g)].filter(Boolean).join(' ')).includes(t)));
}

/** Más nuevas primero (por fecha de la guía y, el mismo día, por la hora de carga). */
export function ordenarGuias(guias: Guia[]): Guia[] {
  return [...guias].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
}

/** Título corto de la guía: «Guía N° 0012 · Despacho de mineral». */
export function tituloGuia(g: Pick<Guia, 'numero' | 'descripcion' | 'nombre'>): string {
  const partes = [g.numero ? `Guía N° ${g.numero}` : null, g.descripcion].filter(Boolean);
  return partes.length ? partes.join(' · ') : g.nombre;
}
