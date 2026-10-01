/* ============================================================
   Golden Touch · RRHH · Minutas · punto de partida del editor

   Funciones puras (sin red ni React) que arman lo que el editor muestra
   al abrirse. Viven aparte del componente para poder probarse solas.
   ============================================================ */
import type { Minuta, MinutaParticipante } from '@/shared/lib/types';
import {
  filaAcuerdoVacia, filaAvanceVacia, filaParticipanteVacia, type BorradorMinuta,
} from './minutaModelo';

/** Hoy en Venezuela (`AAAA-MM-DD`). No usar toISOString(): da la fecha en UTC. */
export function hoyVE(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(ahora);
}

/** Una lista nunca se muestra vacía: arranca con una fila en blanco para escribir. */
function conUnaFila<T>(lista: T[] | null | undefined, vacia: () => T): T[] {
  return lista && lista.length ? lista : [vacia()];
}

/**
 * El formulario inicial. `null` = minuta nueva (hoy, borrador, listas con una
 * fila vacía); si no, copia lo guardado y completa los nulos de la base.
 */
export function borradorDesdeMinuta(m: Minuta | null, ahora: Date = new Date()): BorradorMinuta {
  if (!m) {
    return {
      fecha: hoyVE(ahora), lugar: '', hora_inicio: '', objetivo: '',
      orden_dia: [''], participantes: [filaParticipanteVacia()],
      acuerdos: [filaAcuerdoVacia()], otros_asuntos: '', proxima_fecha: null,
      proximos_puntos: [''], avances: [filaAvanceVacia()], observaciones: '',
      estado: 'borrador', anexar_adjuntos_pdf: false,
    };
  }
  return {
    fecha: m.fecha,
    lugar: m.lugar ?? '',
    hora_inicio: m.hora_inicio ?? '',
    objetivo: m.objetivo ?? '',
    orden_dia: conUnaFila(m.orden_dia, () => ''),
    participantes: conUnaFila(m.participantes, filaParticipanteVacia).map((p) => ({ ...p })),
    acuerdos: conUnaFila(m.acuerdos, filaAcuerdoVacia).map((a) => ({ ...a })),
    otros_asuntos: m.otros_asuntos ?? '',
    proxima_fecha: m.proxima_fecha ?? null,
    proximos_puntos: conUnaFila(m.proximos_puntos, () => ''),
    avances: conUnaFila(m.avances, filaAvanceVacia).map((a) => ({ ...a })),
    observaciones: m.observaciones ?? '',
    estado: m.estado,
    anexar_adjuntos_pdf: !!m.anexar_adjuntos_pdf,
  };
}

/** Lo mínimo que se lee de una persona del personal. */
export interface PersonaElegible {
  id: string;
  nombre: string;
  apellido?: string | null;
  cargo?: string | null;
}

/**
 * Fila de participante a partir de una persona del personal. COPIA nombre y
 * cargo como texto: si mañana la persona se da de baja, la minuta no cambia.
 */
export function participanteDesdePersonal(p: PersonaElegible): MinutaParticipante {
  return {
    personal_id: p.id,
    nombre: `${p.nombre} ${p.apellido ?? ''}`.trim(),
    cargo: p.cargo ?? '',
  };
}
