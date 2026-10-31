/* ============================================================
   Golden Touch · Permiso por depósito (30/10/2026)

   Cada depósito (Depósito Mina, Reutilizables, Items Dañados y los que se
   creen) es independiente: se da por rol, uno por uno, en
   `roles_permisos.almacenes` = { "<nombre del almacén>": "lectura" | "escritura" }.
   Sin clave = sin acceso. La base lo exige igual (puede_ver_almacen /
   puede_escribir_almacen en el RLS de productos, existencias, movimientos y
   salidas del depósito).

   El Inventario General ('General', Los Pinos) NO va en ese mapa: lo sigue
   dando el módulo «Inventario» de la matriz. El administrador ve todo.
   ============================================================ */
import { ALMACEN_GENERAL } from '@/modules/inventario/depositos';

export type NivelAlmacen = 'lectura' | 'escritura';
export type PermisosAlmacenes = Record<string, NivelAlmacen>;

/** Lo guardado en la base, limpio: solo nombres con 'lectura' o 'escritura'. Lo demás = sin acceso. */
export function normalizarPermisosAlmacenes(v: unknown): PermisosAlmacenes {
  const out: PermisosAlmacenes = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [nombre, nivel] of Object.entries(v as Record<string, unknown>)) {
    const n = nombre.trim();
    if (!n || n === ALMACEN_GENERAL) continue;
    if (nivel === 'lectura' || nivel === 'escritura') out[n] = nivel;
  }
  return out;
}

/** ¿Es el Inventario General? (vacío también: lo que no es de otro depósito es del General). */
export function esAlmacenGeneral(nombre: string | null | undefined): boolean {
  const n = (nombre ?? '').trim();
  return !n || n === ALMACEN_GENERAL;
}

export interface ContextoAlmacen {
  isAdmin: boolean;
  almacenes: PermisosAlmacenes;
  /** Permiso del módulo Inventario (gobierna el General). */
  inventario: { lectura: boolean; escritura: boolean };
}

export function puedeVerAlmacen(nombre: string | null | undefined, ctx: ContextoAlmacen): boolean {
  if (ctx.isAdmin) return true;
  if (esAlmacenGeneral(nombre)) return ctx.inventario.lectura;
  const nivel = ctx.almacenes[(nombre ?? '').trim()];
  return nivel === 'lectura' || nivel === 'escritura';
}

export function puedeEscribirAlmacen(nombre: string | null | undefined, ctx: ContextoAlmacen): boolean {
  if (ctx.isAdmin) return true;
  if (esAlmacenGeneral(nombre)) return ctx.inventario.escritura;
  return ctx.almacenes[(nombre ?? '').trim()] === 'escritura';
}

/** Nivel que muestra el editor de roles para un depósito. */
export type NivelEditor = 'sin' | NivelAlmacen;

/** Cambia el nivel de un depósito en el mapa de un rol (sin mutar el original). 'sin' lo quita. */
export function conNivelAlmacen(actual: PermisosAlmacenes, nombre: string, nivel: NivelEditor): PermisosAlmacenes {
  const out: PermisosAlmacenes = { ...actual };
  if (nivel === 'sin') delete out[nombre];
  else out[nombre] = nivel;
  return out;
}
