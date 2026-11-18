/* ============================================================
   Golden Touch · Control de Maquinaria · la Órbita · preferencias
   Lo que el usuario cambia en la maqueta vive en ESTE navegador:
   categoría de cada equipo (D22), traspasos de maqueta, cuadrícula o
   tabla, y la entrada elegida. Claves `gt.maquinaria.orbita.v1.*`; la
   página de prueba usa otro prefijo, para no mezclarse con lo real.
   · localStorage puede fallar (modo privado, cuota): se sigue en memoria.
   · Un valor ilegible o de otra forma se descarta entero.
   ============================================================ */
import type { CategoriaEquipo, TraspasoOrbita } from './orbitaDatos';

export const PREFIJO_ORBITA = 'gt.maquinaria.orbita.v1.';
export const PREFIJO_ORBITA_DEMO = 'gt.maquinaria.orbita.demo.v1.';

export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export type EntradaOrbita = 'mindmap' | 'directo' | 'vitrina';
export type VistaFlota = 'cards' | 'tabla';
/** Dónde dejó el usuario una tarjeta, respecto de su sitio por geometría, en
 *  puntos de % de la escena (no px: así escala con el tamaño de la escena). */
export type DesplazamientoTarjeta = { dx: number; dy: number };

const CATEGORIAS_VALIDAS: readonly string[] = ['propio', 'alquilado', 'asociado', 'contratista'];
const esTexto = (s: unknown): s is string => typeof s === 'string';

function almacenDelNavegador(): Almacen | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

const VALIDAR = {
  categorias(v: unknown): Record<string, CategoriaEquipo> | null {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const ok = Object.values(v as Record<string, unknown>).every((c) => esTexto(c) && CATEGORIAS_VALIDAS.includes(c));
    return ok ? (v as Record<string, CategoriaEquipo>) : null;
  },
  traspasos(v: unknown): TraspasoOrbita[] | null {
    if (!Array.isArray(v)) return null;
    return v.every((t) => t && esTexto(t.equipoId) && esTexto(t.destino)) ? (v as TraspasoOrbita[]) : null;
  },
  vista(v: unknown): VistaFlota | null {
    return v === 'cards' || v === 'tabla' ? v : null;
  },
  entrada(v: unknown): EntradaOrbita | null {
    return v === 'mindmap' || v === 'directo' || v === 'vitrina' ? v : null;
  },
  posiciones(v: unknown): Record<string, DesplazamientoTarjeta> | null {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const ok = Object.values(v as Record<string, unknown>).every(
      (d) => d != null && typeof d === 'object'
        && Number.isFinite((d as DesplazamientoTarjeta).dx) && Number.isFinite((d as DesplazamientoTarjeta).dy),
    );
    return ok ? (v as Record<string, DesplazamientoTarjeta>) : null;
  },
};

type Clave = keyof typeof VALIDAR;
type ValorDe<K extends Clave> = NonNullable<ReturnType<(typeof VALIDAR)[K]>>;

export function crearPreferenciasOrbita(prefijo = PREFIJO_ORBITA, almacen: Almacen | null = almacenDelNavegador()) {
  function leer<K extends Clave>(clave: K, porDefecto: ValorDe<K>): ValorDe<K> {
    try {
      const crudo = almacen?.getItem(prefijo + clave);
      if (crudo == null) return porDefecto;
      return (VALIDAR[clave](JSON.parse(crudo)) as ValorDe<K> | null) ?? porDefecto;
    } catch {
      return porDefecto;
    }
  }
  function guardar<K extends Clave>(clave: K, valor: ValorDe<K>): void {
    try {
      almacen?.setItem(prefijo + clave, JSON.stringify(valor));
    } catch {
      /* cuota o modo privado: queda en memoria hasta recargar */
    }
  }
  return {
    /** null = nunca se guardó nada (la demo pone sus categorías de ejemplo). */
    leerCategorias: (): Record<string, CategoriaEquipo> | null => {
      try {
        return almacen?.getItem(prefijo + 'categorias') == null ? null : leer('categorias', {});
      } catch {
        return null;
      }
    },
    guardarCategorias: (c: Record<string, CategoriaEquipo>) => guardar('categorias', c),
    leerTraspasos: () => leer('traspasos', [] as TraspasoOrbita[]),
    guardarTraspasos: (t: TraspasoOrbita[]) => guardar('traspasos', t),
    leerVista: () => leer('vista', 'cards' as VistaFlota),
    guardarVista: (v: VistaFlota) => guardar('vista', v),
    leerEntrada: () => leer('entrada', 'mindmap' as EntradaOrbita),
    guardarEntrada: (e: EntradaOrbita) => guardar('entrada', e),
    leerPosiciones: () => leer('posiciones', {} as Record<string, DesplazamientoTarjeta>),
    guardarPosiciones: (p: Record<string, DesplazamientoTarjeta>) => guardar('posiciones', p),
    limpiarPosiciones: () => { try { almacen?.removeItem(prefijo + 'posiciones'); } catch { /* da igual */ } },
  };
}

export type PreferenciasOrbita = ReturnType<typeof crearPreferenciasOrbita>;

/** Asigna (o quita, con 'por_asignar') la categoría de un equipo. Pura. */
export function conCategoria(
  actuales: Readonly<Record<string, CategoriaEquipo>>, equipoId: string, categoria: CategoriaEquipo | 'por_asignar',
): Record<string, CategoriaEquipo> {
  const nuevas = { ...actuales };
  if (categoria === 'por_asignar') delete nuevas[equipoId];
  else nuevas[equipoId] = categoria;
  return nuevas;
}

/** Deja (o quita, con null) el desplazamiento de una tarjeta. Pura. */
export function conPosicion(
  actuales: Readonly<Record<string, DesplazamientoTarjeta>>, id: string, d: DesplazamientoTarjeta | null,
): Record<string, DesplazamientoTarjeta> {
  const nuevas = { ...actuales };
  if (d == null) delete nuevas[id];
  else nuevas[id] = d;
  return nuevas;
}
