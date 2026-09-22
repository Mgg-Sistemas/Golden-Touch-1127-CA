/* ============================================================
   Golden Touch · RRHH · Recibos de nómina por lote

   Imprimir los recibos de una nómina entera y repartirlos es incómodo: la
   gente no cobra toda el mismo día, y quien reparte quiere los de HOY, no un
   PDF de treinta hojas con veinte que ya entregó la semana pasada.

   Acá se agrupan los renglones POR FECHA DE PAGO y se resuelve qué entra en
   la impresión. Es lógica pura —sin pantalla ni base— para poder probarla.
   ============================================================ */
import type { NominaRenglon } from '@/shared/lib/types';

/** Clave del grupo de los que todavía no cobraron. No es una fecha. */
export const SIN_PAGAR = 'sin-pagar';

export interface GrupoRecibos {
  /** `AAAA-MM-DD` del pago, o `SIN_PAGAR`. Sirve de `key` en React. */
  clave: string;
  /** La fecha del pago en ISO, o `null` si todavía no cobraron. */
  fecha: string | null;
  renglones: NominaRenglon[];
}

/** El día del pago, `AAAA-MM-DD`, sin pasar por `Date` (que corre el día por
 *  zona horaria y mandaría un pago de las 22:00 al día siguiente). */
function diaDePago(r: NominaRenglon): string | null {
  const s = String(r.pagada_en ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Parte los renglones en grupos por fecha de pago, del más viejo al más
 * nuevo. Los que todavía no cobraron van SIEMPRE al final: son los que
 * quedan por hacer, y arriba estorban.
 */
export function agruparRecibosPorFecha(renglones: NominaRenglon[]): GrupoRecibos[] {
  const porClave = new Map<string, GrupoRecibos>();
  for (const r of renglones ?? []) {
    const fecha = diaDePago(r);
    const clave = fecha ?? SIN_PAGAR;
    const grupo = porClave.get(clave) ?? { clave, fecha, renglones: [] };
    grupo.renglones.push(r);
    porClave.set(clave, grupo);
  }
  const grupos = [...porClave.values()];
  grupos.sort((a, b) => {
    if (a.clave === SIN_PAGAR) return 1;
    if (b.clave === SIN_PAGAR) return -1;
    return (a.fecha ?? '').localeCompare(b.fecha ?? '');
  });
  // Dentro de cada grupo, por nombre: así se buscan en la mano como en una lista.
  for (const g of grupos) g.renglones.sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
  return grupos;
}

/**
 * Los renglones que se van a imprimir: todos MENOS los desmarcados. Se lleva
 * la lista de excluidos y no la de incluidos a propósito — si mañana entra un
 * renglón nuevo a la nómina, entra a la impresión solo, sin que haya que
 * acordarse de marcarlo.
 */
export function renglonesAImprimir(renglones: NominaRenglon[], excluidos: Set<string>): NominaRenglon[] {
  return (renglones ?? []).filter((r) => !excluidos.has(r.id));
}

/** ¿Está todo el grupo marcado para imprimir? Para la casilla del encabezado. */
export function grupoCompleto(grupo: GrupoRecibos, excluidos: Set<string>): boolean {
  return grupo.renglones.length > 0 && grupo.renglones.every((r) => !excluidos.has(r.id));
}

/** ¿Hay parte del grupo marcado y parte no? (la casilla va en «indeterminado»). */
export function grupoAMedias(grupo: GrupoRecibos, excluidos: Set<string>): boolean {
  const marcados = grupo.renglones.filter((r) => !excluidos.has(r.id)).length;
  return marcados > 0 && marcados < grupo.renglones.length;
}

/**
 * Marca o desmarca un grupo entero, devolviendo el conjunto nuevo de
 * excluidos (no toca el que recibe: el estado de React se reemplaza, no se
 * modifica en su lugar, o la pantalla no se entera del cambio).
 */
export function alternarGrupo(grupo: GrupoRecibos, excluidos: Set<string>, imprimir: boolean): Set<string> {
  const proximo = new Set(excluidos);
  for (const r of grupo.renglones) {
    if (imprimir) proximo.delete(r.id);
    else proximo.add(r.id);
  }
  return proximo;
}

/** Lo mismo para un renglón suelto. */
export function alternarRenglon(id: string, excluidos: Set<string>, imprimir: boolean): Set<string> {
  const proximo = new Set(excluidos);
  if (imprimir) proximo.delete(id);
  else proximo.add(id);
  return proximo;
}
