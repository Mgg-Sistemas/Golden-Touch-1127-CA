/* ============================================================
   Golden Touch · Geodesta · modelo y reglas del informe

   Lógica pura, sin red: apartados vacíos, validaciones, el código del
   documento y el texto de búsqueda. Vive aparte de los componentes para
   poder probarse sola, como `nominaCalculo.ts` o `minutaModelo.ts`.
   ============================================================ */
import { norm } from '@/shared/lib/texto';
import type {
  Apartado, ApartadoCuadro, ApartadoTexto, ColumnaCuadro, EstadoInforme, FilaCuadro,
} from '@/shared/lib/types';

/** Lo que el editor tiene en pantalla: el informe sin lo que pone la base. */
export interface BorradorInforme {
  codigo: string;
  fecha: string;
  estado: EstadoInforme;
  ciudad: string;
  para_nombre: string;
  para_cargo: string;
  de_nombre: string;
  de_cargo: string;
  firma_nombre: string;
  firma_cargo: string;
  direccion_pie: string;
  logo_gt: boolean;
  logo_cvm: boolean;
  apartados: Apartado[];
}

/**
 * Fecha de HOY en Venezuela (America/Caracas), no la del equipo.
 * `toISOString()` y `getFullYear()` dan UTC: desde las 8 de la noche hora
 * local ya serían «mañana». Este error apareció cuatro veces en Minutas.
 */
export function hoyVE(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);
}

let semilla = 0;
/** Id corto y único dentro de la sesión, para apartados, columnas y filas. */
export function nuevoId(): string {
  semilla += 1;
  return `${Date.now().toString(36)}-${semilla.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function columnaVacia(nombre = '', tipo: ColumnaCuadro['tipo'] = 'texto'): ColumnaCuadro {
  return { id: nuevoId(), nombre, tipo };
}

/** Una fila con una celda vacía por cada columna que exista en ese momento. */
export function filaVaciaDe(cols: ColumnaCuadro[]): FilaCuadro {
  const celdas: Record<string, string> = {};
  cols.forEach((c) => { celdas[c.id] = ''; });
  return { id: nuevoId(), celdas };
}

const NOMBRES_COLUMNAS_DEFECTO = ['Fecha', 'Actividad', 'Observaciones'];

/** Un cuadro nuevo arranca con las tres columnas del formato en papel. */
export function apartadoCuadroVacio(): ApartadoCuadro {
  const columnas = NOMBRES_COLUMNAS_DEFECTO.map((n) => columnaVacia(n));
  return { id: nuevoId(), tipo: 'cuadro', titulo: '', columnas, filas: [filaVaciaDe(columnas)] };
}

export function apartadoTextoVacio(): ApartadoTexto {
  return { id: nuevoId(), tipo: 'texto', titulo: '', texto: '', imagenes: [] };
}

/**
 * ¿Hay algo escrito en el apartado? Sirve para avisar antes de descartar uno.
 * Un cuadro con las columnas cambiadas cuenta como lleno aunque no tenga
 * datos: armar las columnas ya es trabajo del usuario.
 */
export function apartadoTieneContenido(a: Apartado): boolean {
  if (a.titulo.trim()) return true;
  if (a.tipo === 'texto') return a.texto.trim() !== '' || a.imagenes.length > 0;
  const columnasPorDefecto =
    a.columnas.length === NOMBRES_COLUMNAS_DEFECTO.length &&
    a.columnas.every((c, i) => c.nombre.trim() === NOMBRES_COLUMNAS_DEFECTO[i] && c.tipo === 'texto');
  if (!columnasPorDefecto) return true;
  return a.filas.some((f) => Object.values(f.celdas).some((v) => v.trim() !== ''));
}

/** `Dpto-Geol-2026-0001-02`, el formato de los informes reales de la empresa. */
export function codigoGeodesta(anio: number, n: number): string {
  return `Dpto-Geol-${anio}-${String(n).padStart(4, '0')}-02`;
}

const RE_CODIGO = /^Dpto-Geol-(\d{4})-(\d{1,6})-02$/i;

/**
 * Saca año y número de un código con el formato de la casa, o `null` si el
 * geólogo escribió otra cosa. Escribir cualquier cosa es válido: el histórico
 * simplemente lo ordena por fecha en vez de por número.
 */
export function partesCodigo(codigo: string): { anio: number; nro: number } | null {
  const m = RE_CODIGO.exec((codigo ?? '').trim());
  if (!m) return null;
  return { anio: Number(m[1]), nro: Number(m[2]) };
}

/** Qué impide guardar el informe, o `null` si se puede guardar. */
export function errorInforme(b: BorradorInforme): string | null {
  if (!b.fecha) return 'Indicá la fecha del informe.';
  if (!b.codigo.trim()) return 'Escribí el código del informe.';
  for (const a of b.apartados) {
    if (a.tipo === 'cuadro' && a.columnas.length === 0) {
      return `El cuadro «${a.titulo || 'sin título'}» no tiene ninguna columna.`;
    }
  }
  return null;
}

/** Todo el texto de un apartado, sin ids internos. */
function textoDeApartado(a: Apartado): string[] {
  if (a.tipo === 'texto') return [a.titulo, a.texto, ...a.imagenes.map((i) => i.pie)];
  return [
    a.titulo,
    ...a.columnas.map((c) => c.nombre),
    // Solo las celdas de columnas de TEXTO: las de imagen guardan un id interno.
    ...a.filas.flatMap((f) => a.columnas.filter((c) => c.tipo === 'texto').map((c) => f.celdas[c.id] ?? '')),
  ];
}

/**
 * Texto plano buscable, en minúsculas y sin acentos. Lo guarda el repositorio
 * en la columna `busq`, que tiene un índice de trigramas. Se arma acá para
 * poder probarlo.
 */
export function componerBusqInforme(b: BorradorInforme): string {
  const partes = [
    b.codigo, b.para_nombre, b.para_cargo, b.de_nombre, b.de_cargo, b.ciudad,
    ...b.apartados.flatMap(textoDeApartado),
  ];
  return norm(partes.filter(Boolean).join(' ')).trim();
}
