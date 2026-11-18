/* ============================================================
   Golden Touch · Control de Maquinaria · la Vitrina · datos (puro)
   Del ModeloOrbita arma la lista de PROTAGONISTAS a recorrer, según el modo:
   máquina, propietario o ubicación (el usuario: «el protagonista puede
   variar»). Cada protagonista trae su gráfico (izquierda) y sus datos
   esenciales (derecha). Sin React, sin base: solo transforma lo que ya hay.
   ============================================================ */
import { norm } from '@/shared/lib/texto';
import { ETIQUETA_CATEGORIA, type FilaFlota, type ModeloOrbita } from '../orbitaDatos';
import type { EstadoEquipo } from '../../flota';

export type ModoVitrina = 'maquina' | 'propietario' | 'ubicacion';
export type Tono = 'ok' | 'warn' | 'bad' | 'muted';

export interface DatoEsencial {
  etiqueta: string;
  valor: string;
  tono?: Tono;
}

export interface Protagonista {
  id: string;
  /** Qué dibujar a la izquierda. */
  grafico: { modo: ModoVitrina; tipo?: string; inicial?: string };
  /** Ojal pequeño arriba del título. */
  supra: string;
  titulo: string;
  /** Línea secundaria bajo el título. */
  sub?: string;
  /** Un tono de acento (estado / salud). */
  acento?: Tono;
  /** Texto normalizado para buscar (marca, modelo, placa, dueño…). */
  buscar: string;
  datos: DatoEsencial[];
  /** Acción primaria: 'ficha' (abre la máquina) o 'elegir' (segmenta la flota). */
  accion?: { tipo: 'ficha' | 'elegir'; id: string; texto: string };
}

const ESTADO_LABEL: Record<EstadoEquipo, { texto: string; tono: Tono }> = {
  operativa: { texto: 'Operativa', tono: 'ok' },
  taller: { texto: 'En taller', tono: 'warn' },
  repuestos: { texto: 'Esperando repuestos', tono: 'warn' },
  averiada: { texto: 'Averiada', tono: 'bad' },
  parada: { texto: 'Parada', tono: 'bad' },
  espera: { texto: 'En espera', tono: 'muted' },
  por_confirmar: { texto: 'Por confirmar', tono: 'muted' },
  retirada: { texto: 'Retirada', tono: 'muted' },
};

const nHrs = (h: number | null) => (h == null ? '—' : `${h.toLocaleString('es-VE')} h`);
const inicialDe = (s: string) => (s.replace(/[^\p{L}\p{N}]/gu, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '—').toUpperCase();
const salud = (pct: number): Tono => (pct >= 90 ? 'ok' : pct >= 70 ? 'warn' : 'bad');

function deMaquina(f: FilaFlota): Protagonista {
  const est = ESTADO_LABEL[f.estado];
  const modelo = [f.marca, f.modelo].filter(Boolean).join(' ') || f.tipo;
  const aviso = f.aviso?.nivel === 'vencido' ? { etiqueta: 'Servicio', valor: 'Vencido', tono: 'bad' as Tono }
    : f.aviso?.nivel === 'proximo' ? { etiqueta: 'Servicio', valor: 'Próximo', tono: 'warn' as Tono } : null;
  return {
    id: f.id,
    grafico: { modo: 'maquina', tipo: f.tipo },
    supra: `${f.propietarioNombre || 'Sin propietario'} · ${ETIQUETA_CATEGORIA[f.categoria]}`,
    titulo: f.equipo || f.tipo,
    sub: f.tipo,
    acento: est.tono,
    buscar: norm([f.equipo, f.tipo, f.marca, f.modelo, f.placa, f.serial, f.propietarioNombre, ETIQUETA_CATEGORIA[f.categoria], f.ubicacion].filter(Boolean).join(' ')),
    datos: [
      { etiqueta: 'Modelo', valor: modelo },
      { etiqueta: 'Estado', valor: est.texto, tono: est.tono },
      { etiqueta: 'Horómetro', valor: nHrs(f.horometro) },
      { etiqueta: 'Placa / serial', valor: f.placa || f.serial || '—' },
      { etiqueta: 'Ubicación', valor: f.ubicacion || '—' },
      ...(aviso ? [aviso] : []),
    ],
    accion: { tipo: 'ficha', id: f.id, texto: 'Ver ficha completa' },
  };
}

function dePropietario(modelo: ModeloOrbita): Protagonista[] {
  return modelo.propietarios.map((p) => ({
    id: p.id,
    grafico: { modo: 'propietario' as ModoVitrina, inicial: inicialDe(p.nombre) },
    supra: `Propietario · puesto ${p.puesto}`,
    titulo: p.nombre,
    sub: p.mezcla.map((m) => `${ETIQUETA_CATEGORIA[m.id]} ${m.cantidad}`).join(' · '),
    acento: salud(p.pctSalud),
    buscar: norm([p.nombre, ...p.mezcla.map((m) => ETIQUETA_CATEGORIA[m.id])].join(' ')),
    datos: [
      { etiqueta: 'Equipos', valor: String(p.total) },
      { etiqueta: 'Operativos', valor: `${p.operativos} · ${p.pctSalud} %`, tono: salud(p.pctSalud) },
      { etiqueta: 'En taller', valor: String(p.enTaller), tono: p.enTaller ? 'warn' : 'muted' },
      { etiqueta: 'Averiados', valor: String(p.averiados), tono: p.averiados ? 'bad' : 'muted' },
    ],
    accion: { tipo: 'elegir', id: p.id, texto: 'Ver su flota' },
  }));
}

function deUbicacion(modelo: ModeloOrbita): Protagonista[] {
  const grupos = new Map<string, FilaFlota[]>();
  for (const f of modelo.flota) {
    const u = f.ubicacion || 'Sin ubicación';
    grupos.set(u, [...(grupos.get(u) ?? []), f]);
  }
  return [...grupos.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'))
    .map(([u, fs]) => {
      const operativos = fs.filter((f) => f.estado === 'operativa').length;
      const averiados = fs.filter((f) => f.estado === 'averiada' || f.estado === 'parada').length;
      const duenos = new Set(fs.map((f) => f.propietarioId)).size;
      const pct = fs.length ? Math.round((operativos * 100) / fs.length) : 0;
      return {
        id: `u:${u}`,
        grafico: { modo: 'ubicacion' as ModoVitrina },
        supra: 'Ubicación',
        titulo: u,
        sub: `${duenos} ${duenos === 1 ? 'propietario' : 'propietarios'}`,
        acento: salud(pct),
        buscar: norm(u),
        datos: [
          { etiqueta: 'Equipos', valor: String(fs.length) },
          { etiqueta: 'Operativos', valor: `${operativos} · ${pct} %`, tono: salud(pct) },
          { etiqueta: 'Averiados', valor: String(averiados), tono: averiados ? 'bad' : 'muted' },
          { etiqueta: 'Propietarios', valor: String(duenos) },
        ],
      };
    });
}

/** Los protagonistas a recorrer en la Vitrina, según el modo. */
export function protagonistas(modelo: ModeloOrbita, modo: ModoVitrina): Protagonista[] {
  if (modo === 'propietario') return dePropietario(modelo);
  if (modo === 'ubicacion') return deUbicacion(modelo);
  return modelo.flota.map(deMaquina);
}
