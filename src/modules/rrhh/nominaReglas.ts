/* ============================================================
   Golden Touch · RRHH · Nómina — reglas puras (sin base ni React)

   - Una nómina CERRADA (todos sus renglones pagados, estado 'pagada') ya no
     se toca. La base lo hace cumplir con un trigger; esto es para la UI.
   - No se carga otra QUINCENA mientras la anterior de la misma empresa no
     esté cerrada. Vacaciones y liquidaciones (pagos de una sola persona)
     no cuentan ni se bloquean.
   - Filtro buscable y marcado masivo de la ventana «Marcar nómina».
   ============================================================ */
import { norm } from '@/shared/lib/texto';

export interface PeriodoReglas {
  codigo: string;
  empresa?: string | null;
  tipo?: string | null;
  estado: string;
  eliminado_en?: string | null;
  created_at?: string | null;
}

/** ¿La nómina está cerrada (pagada completa)? Entonces no se modifica. */
export function nominaCerrada(p: Pick<PeriodoReglas, 'estado'>): boolean {
  return p.estado === 'pagada';
}

/** ¿Está en la papelera? */
export function enPapelera(p: Pick<PeriodoReglas, 'eliminado_en'>): boolean {
  return !!p.eliminado_en;
}

/**
 * La quincena de esa empresa que sigue abierta (no pagada completa ni en la
 * papelera), si hay. Mientras exista, no se carga otra. Si hubiera más de
 * una (datos viejos), devuelve la más antigua: es la que hay que cerrar.
 */
export function quincenaAbierta<T extends PeriodoReglas>(periodos: T[], empresa: string): T | null {
  const abiertas = periodos.filter((p) =>
    (p.empresa ?? 'GT') === empresa
    && (p.tipo ?? 'quincena') === 'quincena'
    && !nominaCerrada(p)
    && !enPapelera(p));
  if (!abiertas.length) return null;
  return [...abiertas].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))[0];
}

export interface TrabajadorBuscable {
  nombre?: string | null;
  apellido?: string | null;
  cedula?: string | null;
  cargo?: string | null;
  departamento?: string | null;
}

/**
 * ¿El trabajador coincide con lo buscado? Busca en nombre, apellido, cédula,
 * cargo y departamento, sin acentos ni mayúsculas. Cada palabra de la
 * búsqueda tiene que aparecer en algún campo («maria operador» encuentra a
 * María que es operadora). En la cédula se ignoran puntos y guiones.
 */
export function coincideTrabajador(p: TrabajadorBuscable, consulta: string): boolean {
  const palabras = norm(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const cedula = norm(p.cedula).replace(/[.\-\s]/g, '');
  const texto = [p.nombre, p.apellido, p.cedula, p.cargo, p.departamento].map(norm).join(' ') + ' ' + cedula;
  return palabras.every((w) => texto.includes(w.replace(/[.-]/g, '')) || texto.includes(w));
}

/**
 * Aplica `cambio` solo a las filas cuyo id está en `ids` (las visibles con el
 * filtro). Las demás quedan igual: «Seleccionar todos» con un filtro puesto
 * no debe marcar a quien no se ve.
 */
export function aplicarA<T>(filas: T[], ids: ReadonlySet<string>, idDe: (f: T) => string, cambio: (f: T) => T): T[] {
  return filas.map((f) => (ids.has(idDe(f)) ? cambio(f) : f));
}
