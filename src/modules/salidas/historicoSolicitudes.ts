/* ============================================================
   Golden Touch · Histórico de solicitudes de salida

   El tablero de solicitudes mostraba TODAS las tarjetas de cada columna.
   Con 51 ejecutadas y 4 canceladas, la columna «Ejecutada» se volvía un
   rollo de scroll donde lo de esta semana quedaba enterrado junto a lo de
   julio, y el tablero dejaba de servir para lo único que sirve un tablero:
   ver qué hay en trámite ahora.

   Acá vive la regla: cada columna muestra las últimas `TOPE_COLUMNA` y el
   resto se consulta en el histórico, que sí tiene filtros —incluido POR
   QUIÉN HIZO LA ACCIÓN, que es el dato que el tablero nunca mostró.

   Todo lo de este archivo es cálculo puro (sin React y sin Supabase) para
   poder probarlo con las solicitudes de verdad.
   ============================================================ */
import type { EstadoSolicitudSalida, SolicitudSalida } from '@/shared/lib/types';
import { norm } from '@/shared/lib/texto';

/** Cuántas tarjetas muestra cada columna del tablero. El resto va al histórico. */
export const TOPE_COLUMNA = 10;

/** Qué evento del historial dejó la solicitud en el estado que tiene hoy. */
const EVENTO_DE_ESTADO: Record<EstadoSolicitudSalida, string> = {
  por_aprobar: 'creada',
  aprobada: 'aprobada',
  ejecutada: 'ejecutada',
  cancelada: 'cancelada',
};

export const ETIQUETA_ACCION: Record<string, string> = {
  creada: 'Creada',
  aprobada: 'Aprobada',
  ejecutada: 'Ejecutada',
  cancelada: 'Cancelada',
  editada: 'Editada',
  nota_editada: 'Nota editada',
};

/** Quién dejó la solicitud como está, y cuándo. */
export interface AccionSolicitud {
  /** `creada` · `aprobada` · `ejecutada` · `cancelada`. */
  evento: string;
  /** Correo de quien la hizo; queda vacío en solicitudes viejas que no lo guardaron. */
  actor: string;
  /** Momento de la acción, en ISO. Cae a `created_at` cuando el historial no lo dice. */
  at: string;
  /** Motivo anotado al cancelar, cuando lo hay. */
  motivo?: string;
}

/**
 * La acción que explica el estado actual. Se lee del `historial` de atrás para
 * adelante —si una solicitud se aprobó, se editó y se volvió a aprobar, manda la
 * última— y recién si no está ahí se cae a las columnas `aprobada_por` /
 * `ejecutada_por`, que es lo único que tienen las solicitudes viejas.
 */
export function accionDe(s: SolicitudSalida): AccionSolicitud {
  const buscado = EVENTO_DE_ESTADO[s.estado];
  const eventos = s.historial ?? [];
  for (let i = eventos.length - 1; i >= 0; i--) {
    const ev = eventos[i];
    if (ev && ev.evento === buscado) {
      return { evento: buscado, actor: ev.actor ?? '', at: ev.at || s.created_at, motivo: ev.motivo };
    }
  }
  if (s.estado === 'aprobada' && s.aprobada_por) {
    return { evento: 'aprobada', actor: s.aprobada_por, at: s.aprobada_en || s.created_at };
  }
  if (s.estado === 'ejecutada' && s.ejecutada_por) {
    return { evento: 'ejecutada', actor: s.ejecutada_por, at: s.ejecutada_en || s.created_at };
  }
  return { evento: buscado, actor: s.actor ?? '', at: s.created_at };
}

/**
 * El DÍA de una marca de tiempo, en la hora de Venezuela y como `AAAA-MM-DD`.
 * Cortar el ISO a secas daría el día en UTC: una salida ejecutada a las 21:00
 * de Caracas cae al día siguiente y el filtro «hasta el 21» la dejaría afuera.
 */
export function diaVE(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
}

/** Las últimas `tope` (la lista ya viene de la más nueva a la más vieja) y cuántas quedan fuera. */
export function recortarColumna<T>(items: T[], tope = TOPE_COLUMNA): { visibles: T[]; ocultas: number } {
  if (items.length <= tope) return { visibles: items, ocultas: 0 };
  return { visibles: items.slice(0, tope), ocultas: items.length - tope };
}

export interface FiltroHistorico {
  /** Texto libre: código, solicitante, material, destino, unidad, motivo. */
  texto?: string;
  /** Estado de la solicitud; vacío = todos. */
  estado?: EstadoSolicitudSalida | '';
  /** Correo de QUIEN HIZO LA ACCIÓN que dejó la solicitud en ese estado. */
  actor?: string;
  /** Día de la acción, `AAAA-MM-DD`, inclusive. */
  desde?: string;
  hasta?: string;
}

/** Todo lo que se busca por texto en una solicitud, incluidos los materiales de los renglones. */
function textoDe(s: SolicitudSalida): string {
  const items = (s.items ?? []).map((it) => `${it.producto_nombre ?? ''} ${it.producto_sku ?? ''}`).join(' ');
  return [
    s.codigo, s.solicitante, s.actor_name, s.actor, s.producto_nombre,
    s.destino, s.unidad_solicitante, s.motivo, s.almacen_origen, s.almacen_destino, items,
  ].map((v) => norm(v)).join(' ');
}

/** Aplica los filtros del histórico. El orden de entrada se respeta. */
export function filtrarHistorico(sols: SolicitudSalida[], f: FiltroHistorico): SolicitudSalida[] {
  const q = norm(f.texto ?? '');
  return sols.filter((s) => {
    if (f.estado && s.estado !== f.estado) return false;
    const acc = accionDe(s);
    if (f.actor && acc.actor.toLowerCase() !== f.actor.toLowerCase()) return false;
    if (f.desde || f.hasta) {
      const dia = diaVE(acc.at);
      if (f.desde && dia < f.desde) return false;
      if (f.hasta && dia > f.hasta) return false;
    }
    if (q && !textoDe(s).includes(q)) return false;
    return true;
  });
}

/** Los actores presentes en un juego de solicitudes, para llenar el selector «quién». */
export function actoresDeAccion(
  sols: SolicitudSalida[],
  nombreDe: (email?: string | null) => string,
): { email: string; nombre: string }[] {
  const m = new Map<string, string>();
  sols.forEach((s) => {
    const { actor } = accionDe(s);
    if (!actor) return;
    const clave = actor.toLowerCase();
    if (!m.has(clave)) m.set(clave, nombreDe(actor) || actor);
  });
  return Array.from(m.entries())
    .map(([email, nombre]) => ({ email, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
