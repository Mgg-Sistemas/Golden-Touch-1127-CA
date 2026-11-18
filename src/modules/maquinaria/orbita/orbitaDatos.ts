/* ============================================================
   Golden Touch · Control de Maquinaria · la Órbita · los datos
   (31/10/2026, E-09)

   Pieza PURA (sin base, sin localStorage, sin React): de los equipos
   reales arma los propietarios de la Órbita y las filas de la flota.
   Corrige lo que la maqueta original hacía (plan §1):
   · usa SOLO los equipos que recibe (nada de datos de demostración);
   · el estado es `estadoEfectivo` (el del resto del sistema);
   · el horómetro es la lectura vigente, no la base del último servicio.
   D22: las 7 tarjetas con más equipos + «Otros propietarios (n)»; la
   categoría es de cada EQUIPO (se asigna en la maqueta), y la tarjeta del
   dueño muestra la mezcla.
   ============================================================ */
import { norm } from '@/shared/lib/texto';
import type { MaquinariaEquipo } from '../maquinariaEquipos.repository';
import { estadoEfectivo, type AvisoServicio, type EstadoEquipo } from '../flota';

/* ───────── Categorías (por equipo, D22) ───────── */

export type CategoriaEquipo = 'propio' | 'alquilado' | 'asociado' | 'contratista';
export type CategoriaId = CategoriaEquipo | 'por_asignar';

export const CATEGORIAS: { id: CategoriaId; label: string; icono: string }[] = [
  { id: 'propio', label: 'Propio', icono: '🏢' },
  { id: 'alquilado', label: 'Alquilado', icono: '⛏️' },
  { id: 'asociado', label: 'Asociado', icono: '🚚' },
  { id: 'contratista', label: 'Contratista', icono: '🏗️' },
  { id: 'por_asignar', label: 'Por asignar', icono: '❓' },
];
export const ETIQUETA_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.label])) as Record<CategoriaId, string>;

/* ───────── Entrada ───────── */

export interface LecturaOrbita {
  horometro: number | null;
  kilometraje: number | null;
}

/** Traspaso de maqueta (O5): el equipo pasa a otro dueño, solo en este navegador. */
export interface TraspasoOrbita {
  equipoId: string;
  destino: string;
  fecha?: string;
}

export interface EntradaOrbita {
  equipos: readonly MaquinariaEquipo[];
  lecturas?: ReadonlyMap<string, LecturaOrbita>;
  avisos?: ReadonlyMap<string, AvisoServicio | null>;
  /** equipoId → categoría. Sin entrada = «Por asignar». */
  categorias?: Readonly<Record<string, CategoriaEquipo>>;
  /** En orden; el último de cada equipo manda. */
  traspasos?: readonly TraspasoOrbita[];
  /** Tarjetas con nombre propio (D22: 7). El resto va a «Otros propietarios». */
  maxTarjetas?: number;
}

/* ───────── Salida ───────── */

export const ID_GENERAL = 'GENERAL';
export const ID_SIN = 'p:__sin';
export const ID_OTROS = 'p:__otros';
export const ETIQUETA_SIN = 'Sin propietario';
export const ETIQUETA_OTROS = 'Otros propietarios';
export const MAX_TARJETAS = 7;

export interface ConteoEstados {
  total: number;
  operativos: number;
  /** En taller o esperando repuestos. */
  enTaller: number;
  /** Averiados o parados. */
  averiados: number;
  /** Esperando instrucciones o por confirmar. */
  enEspera: number;
  retirados: number;
  /** Operativos sobre los no retirados, 0–100. */
  pctSalud: number;
  alertas: { vencidos: number; proximos: number };
}

export interface PropietarioOrbita extends ConteoEstados {
  id: string;
  nombre: string;
  /** Equipos por categoría (incluye «por_asignar»), en el orden de CATEGORIAS, solo las que hay. */
  mezcla: { id: CategoriaId; cantidad: number }[];
  /** La categoría con más equipos (a igual cantidad, la primera de CATEGORIAS). */
  dominante: CategoriaId;
  /** 1 = el de más equipos. «Otros» va después de los demás. */
  puesto: number;
  /** Solo «Otros»: a quién junta. */
  agrupa?: { id: string; nombre: string; cantidad: number }[];
}

export interface FilaFlota {
  id: string;
  equipo: string;
  tipo: string;
  marca: string | null;
  modelo: string | null;
  serial: string | null;
  placa: string | null;
  anio: number | null;
  color: string | null;
  combustible: string | null;
  consumoPorHora: number | null;
  /** Lectura vigente; null = sin lectura. */
  horometro: number | null;
  operador: string | null;
  ubicacion: string | null;
  estado: EstadoEquipo;
  categoria: CategoriaId;
  /** Dueño real (después de los traspasos de maqueta). */
  propietarioId: string;
  propietarioNombre: string;
  /** La tarjeta donde cuenta: el dueño o «Otros». */
  tarjetaId: string;
  aviso: AvisoServicio | null;
  traspasado: boolean;
}

export interface ModeloOrbita {
  general: ConteoEstados;
  /** Las tarjetas, del puesto 1 al 7, y «Otros» al final si hace falta. */
  propietarios: PropietarioOrbita[];
  flota: FilaFlota[];
}

/* ───────── Armado ───────── */

const limpiar = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const slug = (v: string) => norm(v).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sin-nombre';
export const idPropietario = (nombre: string | null | undefined) => {
  const n = limpiar(nombre);
  return n ? `p:${slug(n)}` : ID_SIN;
};

function contar(filas: readonly FilaFlota[]): ConteoEstados {
  const c = { total: filas.length, operativos: 0, enTaller: 0, averiados: 0, enEspera: 0, retirados: 0, vencidos: 0, proximos: 0 };
  for (const f of filas) {
    if (f.estado === 'operativa') c.operativos += 1;
    else if (f.estado === 'taller' || f.estado === 'repuestos') c.enTaller += 1;
    else if (f.estado === 'averiada' || f.estado === 'parada') c.averiados += 1;
    else if (f.estado === 'retirada') c.retirados += 1;
    else c.enEspera += 1;
    // Un retirado no pide servicio.
    if (f.estado !== 'retirada') {
      if (f.aviso?.nivel === 'vencido') c.vencidos += 1;
      else if (f.aviso?.nivel === 'proximo') c.proximos += 1;
    }
  }
  const activos = c.total - c.retirados;
  return {
    total: c.total, operativos: c.operativos, enTaller: c.enTaller, averiados: c.averiados, enEspera: c.enEspera, retirados: c.retirados,
    pctSalud: activos ? Math.round((c.operativos * 100) / activos) : 0,
    alertas: { vencidos: c.vencidos, proximos: c.proximos },
  };
}

function mezclaDe(filas: readonly FilaFlota[]): { mezcla: PropietarioOrbita['mezcla']; dominante: CategoriaId } {
  const n = new Map<CategoriaId, number>();
  for (const f of filas) n.set(f.categoria, (n.get(f.categoria) ?? 0) + 1);
  const mezcla = CATEGORIAS.filter((c) => n.has(c.id)).map((c) => ({ id: c.id, cantidad: n.get(c.id)! }));
  const dominante = mezcla.reduce<{ id: CategoriaId; cantidad: number } | null>((m, x) => (!m || x.cantidad > m.cantidad ? x : m), null)?.id ?? 'por_asignar';
  return { mezcla, dominante };
}

/** La forma de escribir más usada; a igual uso, la primera en orden alfabético. */
function masUsada(formas: Map<string, number>): string {
  return [...formas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))[0]?.[0] ?? '';
}

export function armarOrbita(entrada: EntradaOrbita): ModeloOrbita {
  const max = entrada.maxTarjetas ?? MAX_TARJETAS;
  const destino = new Map<string, TraspasoOrbita>();
  for (const t of entrada.traspasos ?? []) if (limpiar(t.destino)) destino.set(t.equipoId, t);

  // 1. Filas de la flota, con el dueño efectivo.
  const formas = new Map<string, Map<string, number>>();
  const filas: FilaFlota[] = entrada.equipos.map((e) => {
    const t = destino.get(e.id);
    const nombreDueno = limpiar(t ? t.destino : e.propietario);
    const pid = idPropietario(nombreDueno);
    if (nombreDueno) {
      const f = formas.get(pid) ?? new Map<string, number>();
      f.set(nombreDueno, (f.get(nombreDueno) ?? 0) + 1);
      formas.set(pid, f);
    }
    const lec = entrada.lecturas?.get(e.id);
    return {
      id: e.id,
      equipo: limpiar(e.equipo),
      tipo: limpiar(e.tipo) || 'Sin tipo',
      marca: limpiar(e.marca) || null,
      modelo: limpiar(e.modelo) || null,
      serial: limpiar(e.serial) || null,
      placa: limpiar(e.placa) || null,
      anio: e.anio ?? null,
      color: limpiar(e.color) || null,
      combustible: limpiar(e.combustible) || null,
      consumoPorHora: e.litros_consume ?? null,
      horometro: lec?.horometro ?? null,
      operador: limpiar(e.encargado_responsable) || null,
      ubicacion: limpiar(e.ubicacion) || null,
      estado: estadoEfectivo(e),
      categoria: entrada.categorias?.[e.id] ?? 'por_asignar',
      propietarioId: pid,
      propietarioNombre: '',
      tarjetaId: pid,
      aviso: entrada.avisos?.get(e.id) ?? null,
      traspasado: !!t,
    };
  });
  const nombreDe = (pid: string) => (pid === ID_SIN ? ETIQUETA_SIN : masUsada(formas.get(pid) ?? new Map()));
  for (const f of filas) f.propietarioNombre = nombreDe(f.propietarioId);

  // 2. Ranking: más equipos primero; a igual cantidad, por nombre (siempre el mismo orden).
  const porDueno = new Map<string, FilaFlota[]>();
  for (const f of filas) porDueno.set(f.propietarioId, [...(porDueno.get(f.propietarioId) ?? []), f]);
  const ranking = [...porDueno.entries()]
    .sort((a, b) => b[1].length - a[1].length || nombreDe(a[0]).localeCompare(nombreDe(b[0]), 'es') || (a[0] < b[0] ? -1 : 1));
  // Si sobra uno solo, va con nombre propio: «Otros (1)» no junta nada.
  const conNombre = ranking.length <= max + 1 ? ranking : ranking.slice(0, max);
  const resto = ranking.slice(conNombre.length);

  const propietarios: PropietarioOrbita[] = conNombre.map(([pid, fs], i) => ({
    id: pid, nombre: nombreDe(pid), ...contar(fs), ...mezclaDe(fs), puesto: i + 1,
  }));
  if (resto.length) {
    const fs = resto.flatMap(([, x]) => x);
    for (const f of fs) f.tarjetaId = ID_OTROS;
    propietarios.push({
      id: ID_OTROS, nombre: `${ETIQUETA_OTROS} (${resto.length})`, ...contar(fs), ...mezclaDe(fs),
      puesto: conNombre.length + 1,
      agrupa: resto.map(([pid, x]) => ({ id: pid, nombre: nombreDe(pid), cantidad: x.length })),
    });
  }

  filas.sort((a, b) => a.equipo.localeCompare(b.equipo, 'es') || (a.id < b.id ? -1 : 1));
  return { general: contar(filas), propietarios, flota: filas };
}
