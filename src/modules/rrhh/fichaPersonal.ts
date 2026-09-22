/* ============================================================
   Golden Touch · RRHH · Ficha del trabajador (cálculo puro)

   Todo lo que se puede contar, agrupar, filtrar o derivar de la ficha sin
   tocar la base: la edad y la antigüedad (que NO se guardan, se calculan,
   porque un número guardado envejece mal), los conteos de las tarjetas, los
   filtros de la lista y las agrupaciones.
   ============================================================ */
import type { Personal, PersonalFamiliar } from '@/shared/lib/types';

/* ───────── Catálogos ───────── */

export const EMPRESAS = [
  { valor: 'GT' as const, label: 'Nómina GT', corto: 'GT' },
  { valor: 'MTO' as const, label: 'Nómina MTO', corto: 'MTO' },
];

export const GENEROS = [
  { valor: 'M', label: 'Masculino' },
  { valor: 'F', label: 'Femenino' },
  { valor: 'O', label: 'Otro' },
];

export const ESTADOS_CIVILES = [
  { valor: 'soltero', label: 'Soltero/a' },
  { valor: 'casado', label: 'Casado/a' },
  { valor: 'concubinato', label: 'Concubinato' },
  { valor: 'divorciado', label: 'Divorciado/a' },
  { valor: 'viudo', label: 'Viudo/a' },
];

export const PARENTESCOS = [
  { valor: 'hijo', label: 'Hijo/a' },
  { valor: 'conyuge', label: 'Cónyuge' },
  { valor: 'padre', label: 'Padre' },
  { valor: 'madre', label: 'Madre' },
  { valor: 'hermano', label: 'Hermano/a' },
  { valor: 'otro', label: 'Otro' },
];

export const GRUPOS_SANGUINEOS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

const label = (lista: { valor: string; label: string }[], v: string | null | undefined): string => {
  const x = lista.find((i) => i.valor === v);
  return x ? x.label : '—';
};

export const labelGenero = (v: string | null | undefined) => label(GENEROS, v);
export const labelEstadoCivil = (v: string | null | undefined) => label(ESTADOS_CIVILES, v);
export const labelParentesco = (v: string | null | undefined) => label(PARENTESCOS, v);
export const labelEmpresa = (v: string | null | undefined) =>
  EMPRESAS.find((e) => e.valor === v)?.label ?? 'Nómina GT';

/* ───────── Edad y antigüedad ───────── */

/** Fecha `YYYY-MM-DD` → partes, sin pasar por Date (que corre el día por zona horaria). */
function partes(f: string | null | undefined): [number, number, number] | null {
  const s = String(f ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [a, m, d] = s.split('-').map(Number);
  if (!a || !m || !d) return null;
  return [a, m, d];
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Meses cumplidos entre dos fechas. Negativo si la primera es futura. */
function mesesEntre(desde: string, hasta: string): number | null {
  const a = partes(desde); const b = partes(hasta);
  if (!a || !b) return null;
  let meses = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  if (b[2] < a[2]) meses -= 1;  // todavía no llegó el día del mes
  return meses;
}

/** Años cumplidos. `null` si no hay fecha o si la fecha es futura. */
export function edad(fechaNacimiento: string | null | undefined, hasta?: string): number | null {
  const m = mesesEntre(String(fechaNacimiento ?? ''), hasta ?? hoyISO());
  if (m === null || m < 0) return null;
  return Math.floor(m / 12);
}

export interface Antiguedad { anios: number; meses: number; texto: string }

/** Antigüedad en la empresa, en años y meses, ya escrita para mostrar. */
export function antiguedad(fechaIngreso: string | null | undefined, hasta?: string): Antiguedad | null {
  const m = mesesEntre(String(fechaIngreso ?? ''), hasta ?? hoyISO());
  if (m === null || m < 0) return null;
  const anios = Math.floor(m / 12);
  const meses = m % 12;
  const p = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`;
  const texto = anios === 0
    ? p(meses, 'mes', 'meses')
    : meses === 0
      ? p(anios, 'año', 'años')
      : `${p(anios, 'año', 'años')} y ${p(meses, 'mes', 'meses')}`;
  return { anios, meses, texto };
}

/* ───────── Carga familiar ───────── */

/** Los hijos de una persona dentro de su carga familiar. */
export const hijosDe = (fam: PersonalFamiliar[] | undefined): PersonalFamiliar[] =>
  (fam ?? []).filter((f) => f.parentesco === 'hijo');

/** ¿Es padre o madre? Es tener al menos un hijo cargado. */
export const esPadre = (fam: PersonalFamiliar[] | undefined): boolean => hijosDe(fam).length > 0;

/* ───────── Tarjetas ───────── */

export interface ResumenPersonal {
  total: number;
  activos: number;
  inactivos: number;
  hombres: number;
  mujeres: number;
  otroGenero: number;
  sinGenero: number;
  conHijos: number;
  solteros: number;
}

/**
 * Los números de las tarjetas. Se cuenta sobre la lista que se le pasa, así
 * las tarjetas dicen lo mismo que se está viendo (si hay un filtro puesto,
 * acompañan). `familiares` es el mapa persona → su carga familiar.
 */
export function resumenPersonal(
  lista: Personal[],
  familiares?: Map<string, PersonalFamiliar[]>,
): ResumenPersonal {
  const r: ResumenPersonal = {
    total: lista.length, activos: 0, inactivos: 0,
    hombres: 0, mujeres: 0, otroGenero: 0, sinGenero: 0,
    conHijos: 0, solteros: 0,
  };
  for (const p of lista) {
    if (p.activo) r.activos += 1; else r.inactivos += 1;
    if (p.genero === 'M') r.hombres += 1;
    else if (p.genero === 'F') r.mujeres += 1;
    else if (p.genero === 'O') r.otroGenero += 1;
    else r.sinGenero += 1;
    if (p.estado_civil === 'soltero') r.solteros += 1;
    if (esPadre(familiares?.get(p.id))) r.conHijos += 1;
  }
  return r;
}

/* ───────── Filtros ───────── */

export type FiltroTri = 'todos' | 'si' | 'no';

export interface FiltrosPersonal {
  texto?: string;
  departamento?: string;
  cargo?: string;
  estado?: 'todos' | 'activos' | 'inactivos';
  genero?: string;
  estadoCivil?: string;
  conHijos?: FiltroTri;
  /** Con foto cargada (para el carnet). */
  conFoto?: FiltroTri;
  edadMin?: number | null;
  edadMax?: number | null;
}

export const FILTROS_VACIOS: FiltrosPersonal = {
  texto: '', departamento: '', cargo: '', estado: 'todos', genero: '', estadoCivil: '',
  conHijos: 'todos', conFoto: 'todos', edadMin: null, edadMax: null,
};

/** Texto sin acentos ni mayúsculas, que es como se busca. */
const norm = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const cumpleTri = (f: FiltroTri | undefined, valor: boolean): boolean =>
  !f || f === 'todos' ? true : f === 'si' ? valor : !valor;

/** ¿Hay algún filtro puesto? Sirve para ofrecer el botón de limpiar. */
export function hayFiltros(f: FiltrosPersonal): boolean {
  return !!(f.texto?.trim() || f.departamento || f.cargo || f.genero || f.estadoCivil
    || (f.estado && f.estado !== 'todos')
    || (f.conHijos && f.conHijos !== 'todos')
    || (f.conFoto && f.conFoto !== 'todos')
    || f.edadMin != null || f.edadMax != null);
}

export function filtrarPersonal(
  lista: Personal[],
  f: FiltrosPersonal,
  familiares?: Map<string, PersonalFamiliar[]>,
  hoy?: string,
): Personal[] {
  const q = norm(f.texto).trim();
  return lista.filter((p) => {
    if (f.estado === 'activos' && !p.activo) return false;
    if (f.estado === 'inactivos' && p.activo) return false;
    if (f.departamento && (p.departamento ?? '') !== f.departamento) return false;
    if (f.cargo && (p.cargo ?? '') !== f.cargo) return false;
    if (f.genero && (p.genero ?? '') !== f.genero) return false;
    if (f.estadoCivil && (p.estado_civil ?? '') !== f.estadoCivil) return false;
    if (!cumpleTri(f.conHijos, esPadre(familiares?.get(p.id)))) return false;
    if (!cumpleTri(f.conFoto, !!p.foto_path)) return false;
    if (f.edadMin != null || f.edadMax != null) {
      const e = edad(p.fecha_nacimiento, hoy);
      // Sin fecha de nacimiento no se puede decir si entra en el rango: queda afuera.
      if (e === null) return false;
      if (f.edadMin != null && e < f.edadMin) return false;
      if (f.edadMax != null && e > f.edadMax) return false;
    }
    if (q) {
      const heno = norm([
        p.nombre, p.apellido, p.cedula, p.rif, p.cargo, p.departamento,
        p.telefono, p.direccion, p.ficha_nro,
      ].filter(Boolean).join(' '));
      if (!heno.includes(q)) return false;
    }
    return true;
  });
}

/* ───────── Agrupación ───────── */

export type CriterioGrupo = 'ninguno' | 'departamento' | 'cargo' | 'genero' | 'estado_civil' | 'paternidad';

export const CRITERIOS_GRUPO: { valor: CriterioGrupo; label: string }[] = [
  { valor: 'ninguno', label: 'Sin agrupar' },
  { valor: 'departamento', label: 'Por departamento' },
  { valor: 'cargo', label: 'Por cargo' },
  { valor: 'genero', label: 'Por género' },
  { valor: 'estado_civil', label: 'Por estado civil' },
  { valor: 'paternidad', label: 'Por padres / sin hijos' },
];

export interface GrupoPersonal { clave: string; titulo: string; gente: Personal[] }

/**
 * Parte la lista en grupos. Con `ninguno` devuelve un solo grupo, para que
 * quien lo dibuja no tenga que tratar dos casos distintos.
 */
export function agruparPersonal(
  lista: Personal[],
  criterio: CriterioGrupo,
  familiares?: Map<string, PersonalFamiliar[]>,
): GrupoPersonal[] {
  if (criterio === 'ninguno') return [{ clave: 'todos', titulo: '', gente: lista }];

  const titulo = (p: Personal): string => {
    switch (criterio) {
      case 'departamento': return p.departamento?.trim() || 'Sin departamento';
      case 'cargo': return p.cargo?.trim() || 'Sin cargo';
      case 'genero': return p.genero ? labelGenero(p.genero) : 'Sin género cargado';
      case 'estado_civil': return p.estado_civil ? labelEstadoCivil(p.estado_civil) : 'Sin estado civil';
      case 'paternidad': return esPadre(familiares?.get(p.id)) ? 'Con hijos' : 'Sin hijos';
      default: return '';
    }
  };

  const mapa = new Map<string, Personal[]>();
  for (const p of lista) {
    const t = titulo(p);
    const g = mapa.get(t);
    if (g) g.push(p); else mapa.set(t, [p]);
  }
  // Alfabético, pero lo que no tiene dato cargado va al final: es el resto,
  // no una categoría más.
  const sinDato = (t: string) => /^sin /i.test(t);
  return [...mapa.entries()]
    .map(([t, gente]) => ({ clave: t, titulo: t, gente }))
    .sort((a, b) => {
      if (sinDato(a.titulo) !== sinDato(b.titulo)) return sinDato(a.titulo) ? 1 : -1;
      return a.titulo.localeCompare(b.titulo, 'es');
    });
}

/** Los valores distintos de un campo, para llenar un selector de filtro. */
export function opcionesDe(lista: Personal[], campo: 'departamento' | 'cargo'): string[] {
  const s = new Set<string>();
  for (const p of lista) {
    const v = (p[campo] ?? '').trim();
    if (v) s.add(v);
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'es'));
}
