/* ============================================================
   Golden Touch · Control de Maquinaria · Resumen de flota en tarjetas
   (27/10/2026)

   Pieza pura (sin React ni jsPDF): cuenta los equipos de la lista y los
   agrupa por tipo / marca / apartado / estado / propietario para pintar el
   resumen «tipo check» que encabeza el PDF y el Excel de equipos:
   «RETROEXCAVADORA · 5 (CAT 3 · VOLVO 2)», «VOLVO · 3»…
   Además entrega los totales por apartado (Maquinaria y Equipos, Vehículos,
   Motos…) y por estado (Operativa, Por confirmar…) para la franja de arriba.
   ============================================================ */
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';
import {
  ESTADOS_EQUIPO,
  claseEquipo,
  estadoEfectivo,
  iconoDeClase,
  listarApartados,
  type EstadoEquipo,
} from './flota';

/** Por qué se agrupan las tarjetas del resumen. */
export type AgrupacionResumen = 'tipo' | 'marca' | 'apartado' | 'estado' | 'propietario';

export interface GrupoResumen {
  clave: string;
  etiqueta: string;
  icono: string;
  cantidad: number;
  porcentaje: number;
  desglose: { etiqueta: string; cantidad: number }[];
}

export interface ResumenFlota {
  total: number;
  agruparPor: AgrupacionResumen;
  etiquetaAgrupacion: string;
  grupos: GrupoResumen[];
  /** Siempre en el orden de `listarApartados()`, solo los que tienen equipos. */
  porApartado: { clave: string; etiqueta: string; icono: string; cantidad: number }[];
  /** Siempre en el orden de `ESTADOS_EQUIPO`, solo los que tienen equipos. */
  porEstado: { clave: EstadoEquipo; etiqueta: string; icono: string; cantidad: number }[];
}

export const ETIQUETAS_AGRUPACION_RESUMEN: Record<AgrupacionResumen, string> = {
  tipo: 'Tipo de equipo',
  marca: 'Marca',
  apartado: 'Apartado',
  estado: 'Estado',
  propietario: 'Empresa / Propietario',
};

/** Opciones del selector «Agrupar por» del resumen (en el orden en que se ofrecen). */
export const AGRUPACIONES_RESUMEN: { id: AgrupacionResumen; label: string }[] = (
  ['tipo', 'marca', 'apartado', 'estado', 'propietario'] as AgrupacionResumen[]
).map((id) => ({ id, label: ETIQUETAS_AGRUPACION_RESUMEN[id] }));

export const SIN_TIPO = 'SIN TIPO';
export const SIN_MARCA = 'SIN MARCA';
export const SIN_PROPIETARIO = 'Sin propietario asignado';
const ICONO_APARTADO_DESCONOCIDO = '📦';

/** Texto limpio: sin espacios dobles ni bordes. */
const limpiar = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const mayus = (v: string | null | undefined) => limpiar(v).toUpperCase();

const tipoDe = (e: MaquinariaEquipo) => mayus(e.tipo) || SIN_TIPO;
const marcaDe = (e: MaquinariaEquipo) => mayus(e.marca) || SIN_MARCA;

/** Compara por cantidad descendente y, a igual cantidad, por etiqueta en español. */
function porCantidadYEtiqueta<T extends { cantidad: number; etiqueta: string }>(a: T, b: T): number {
  return b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es');
}

/** Cuenta `equipos` por la etiqueta que devuelve `de`, ordenado por cantidad desc y etiqueta. */
function contarPor(equipos: MaquinariaEquipo[], de: (e: MaquinariaEquipo) => string): { etiqueta: string; cantidad: number }[] {
  const conteo = new Map<string, number>();
  for (const e of equipos) {
    const k = de(e);
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([etiqueta, cantidad]) => ({ etiqueta, cantidad }))
    .sort(porCantidadYEtiqueta);
}

interface IdentidadGrupo {
  clave: string;
  etiqueta: string;
  icono: string;
}

/** Cómo se identifica el grupo de un equipo según la agrupación elegida. */
function identidadGrupo(e: MaquinariaEquipo, agruparPor: AgrupacionResumen): IdentidadGrupo {
  switch (agruparPor) {
    case 'tipo': {
      const clave = tipoDe(e);
      return { clave, etiqueta: clave, icono: iconoDeClase(claseEquipo(e)) };
    }
    case 'marca': {
      const clave = marcaDe(e);
      return { clave, etiqueta: clave, icono: iconoDeClase(claseEquipo(e)) };
    }
    case 'apartado': {
      const clave = claseEquipo(e);
      const ap = listarApartados().find((a) => a.id === clave);
      return { clave, etiqueta: ap?.label ?? clave, icono: ap?.icon ?? ICONO_APARTADO_DESCONOCIDO };
    }
    case 'estado': {
      const st = estadoEfectivo(e);
      const info = ESTADOS_EQUIPO[st];
      return { clave: st, etiqueta: info.label, icono: info.icon };
    }
    case 'propietario': {
      const prop = limpiar(e.propietario);
      // Se agrupa en mayúsculas para no partir «Golden Touch» y «GOLDEN TOUCH» en dos tarjetas.
      return prop
        ? { clave: prop.toUpperCase(), etiqueta: prop, icono: '🏢' }
        : { clave: 'SIN PROPIETARIO', etiqueta: SIN_PROPIETARIO, icono: '🏢' };
    }
  }
}

/**
 * Resumen de la flota agrupado por `agruparPor`:
 * - 'tipo' → tarjetas por tipo de equipo con desglose por marca («RETROEXCAVADORA 5: CAT 3 · VOLVO 2»);
 * - 'marca' → por marca con desglose por tipo («VOLVO 3: RETROEXCAVADORA 2 · CAMIÓN 1»);
 * - 'apartado' / 'estado' / 'propietario' → con desglose por tipo.
 * Los grupos y sus desgloses van por cantidad descendente y luego por etiqueta.
 */
export function resumenFlota(equipos: MaquinariaEquipo[], agruparPor: AgrupacionResumen = 'tipo'): ResumenFlota {
  const total = equipos.length;
  const desglosePor = agruparPor === 'tipo' ? marcaDe : tipoDe;

  const grupos = new Map<string, IdentidadGrupo & { equipos: MaquinariaEquipo[] }>();
  for (const e of equipos) {
    const id = identidadGrupo(e, agruparPor);
    const g = grupos.get(id.clave);
    if (g) g.equipos.push(e);
    else grupos.set(id.clave, { ...id, equipos: [e] });
  }

  const listaGrupos: GrupoResumen[] = [...grupos.values()]
    .map((g) => ({
      clave: g.clave,
      etiqueta: g.etiqueta,
      icono: g.icono,
      cantidad: g.equipos.length,
      porcentaje: total ? Math.round((g.equipos.length * 100) / total) : 0,
      desglose: contarPor(g.equipos, desglosePor),
    }))
    .sort(porCantidadYEtiqueta);

  // Totales por apartado, en el orden de la lista de apartados (los no registrados, al final).
  const conteoApartado = new Map<string, number>();
  for (const e of equipos) {
    const c = claseEquipo(e);
    conteoApartado.set(c, (conteoApartado.get(c) ?? 0) + 1);
  }
  const apartados = listarApartados();
  const porApartado: ResumenFlota['porApartado'] = apartados
    .filter((a) => (conteoApartado.get(a.id) ?? 0) > 0)
    .map((a) => ({ clave: a.id, etiqueta: a.label, icono: a.icon, cantidad: conteoApartado.get(a.id) ?? 0 }));
  for (const [clave, cantidad] of conteoApartado.entries()) {
    if (!apartados.some((a) => a.id === clave)) {
      porApartado.push({ clave, etiqueta: clave, icono: ICONO_APARTADO_DESCONOCIDO, cantidad });
    }
  }

  // Totales por estado, en el orden de ESTADOS_EQUIPO.
  const conteoEstado = new Map<EstadoEquipo, number>();
  for (const e of equipos) {
    const st = estadoEfectivo(e);
    conteoEstado.set(st, (conteoEstado.get(st) ?? 0) + 1);
  }
  const porEstado: ResumenFlota['porEstado'] = (Object.keys(ESTADOS_EQUIPO) as EstadoEquipo[])
    .filter((st) => (conteoEstado.get(st) ?? 0) > 0)
    .map((st) => ({ clave: st, etiqueta: ESTADOS_EQUIPO[st].label, icono: ESTADOS_EQUIPO[st].icon, cantidad: conteoEstado.get(st) ?? 0 }));

  return {
    total,
    agruparPor,
    etiquetaAgrupacion: ETIQUETAS_AGRUPACION_RESUMEN[agruparPor],
    grupos: listaGrupos,
    porApartado,
    porEstado,
  };
}

/** Texto de un desglose para una celda o un renglón: «CAT 3 · VOLVO 2». */
export function textoDesglose(desglose: { etiqueta: string; cantidad: number }[]): string {
  return desglose.map((d) => `${d.etiqueta} ${d.cantidad}`).join(' · ');
}
