/* ============================================================
   Golden Touch · Usuarios autorizados (acceso a Supabase)
   Tabla `usuarios_autorizados` (ver supabase/2026-10-28-usuarios-autorizados.sql).
   ============================================================ */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useRealtime } from '@/shared/lib/useRealtime';
import {
  getAutorizados, setAutorizados, subscribeAutorizados, autorizadoDe,
  type UsuarioAutorizado,
} from './autorizados';

const TABLE = 'usuarios_autorizados';
const COLS = 'email, aprobar_oc, aprobar_salidas, firma, firma_w, firma_h, updated_at, updated_by';

export async function listAutorizados(): Promise<UsuarioAutorizado[]> {
  const { data, error } = await supabase.from(TABLE).select(COLS).order('email');
  if (error) throw error;
  return (data ?? []) as UsuarioAutorizado[];
}

let cargando: Promise<void> | null = null;
/** Recarga la lista en memoria (la comparten todas las pantallas). */
export function recargarAutorizados(): Promise<void> {
  cargando ??= listAutorizados()
    .then((l) => setAutorizados(l))
    .catch((err) => {
      console.warn('Error al cargar lista de usuarios autorizados:', err);
    }) // si falla, queda la lista anterior (o null: reglas de respaldo)
    .finally(() => { cargando = null; });
  return cargando;
}

/**
 * Lista de usuarios autorizados, cargada una vez y al día por tiempo real.
 * `null` mientras carga. Llamarla en una pantalla hace que se vuelva a pintar
 * cuando la lista cambia (p. ej. el admin quita a alguien).
 */
export function useAutorizados(): UsuarioAutorizado[] | null {
  const lista = useSyncExternalStore(subscribeAutorizados, getAutorizados, getAutorizados);
  useEffect(() => { if (getAutorizados() === null) void recargarAutorizados(); }, []);
  useRealtime([TABLE], () => { void recargarAutorizados(); });
  return lista;
}

/** Crea o actualiza un usuario autorizado (sus opciones y/o su firma). */
export async function guardarAutorizado(
  a: Partial<UsuarioAutorizado> & { email: string }, actorEmail: string,
): Promise<void> {
  const fila = { ...a, email: a.email.trim().toLowerCase(), updated_at: new Date().toISOString(), updated_by: actorEmail };
  const { error } = await supabase.from(TABLE).upsert(fila, { onConflict: 'email' });
  if (error) throw error;
  await recargarAutorizados();
}

/** Quita al usuario de la lista. Lo que ya aprobó queda como está. */
export async function quitarAutorizado(email: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('email', email.trim().toLowerCase());
  if (error) throw error;
  await recargarAutorizados();
}

import {
  limpiarFirmaDataUrl as limpiarFirmaDataUrlLib,
  procesarArchivoFirma,
  recortarYLimpiarCanvas,
  type ResultadoFirma,
} from '@/shared/lib/limpiarFirma';

const cacheFirmasLimpias = new Map<string, ResultadoFirma>();

/**
 * Limpia y transparenta cualquier imagen de firma:
 * - Reduce al tamaño óptimo manteniendo la proporción
 * - Detecta adaptativamente el fondo del papel (incluso fotos con sombras o fondo gris)
 * - Vuelve 100% transparente el fondo y resalta el trazo de la tinta en negro carbón
 * - Recorta los márgenes vacíos para que la firma calce perfectamente sobre la línea
 */
export function procesarFirmaTransparente(
  img: HTMLImageElement | HTMLCanvasElement,
  maxW = 700,
): ResultadoFirma {
  const origW = 'naturalWidth' in img ? (img.naturalWidth || img.width) : img.width;
  const origH = 'naturalHeight' in img ? (img.naturalHeight || img.height) : img.height;
  if (!origW || !origH) throw new Error('Dimensiones de firma no disponibles.');

  const escala = Math.min(1, maxW / origW);
  const w = Math.max(1, Math.round(origW * escala));
  const h = Math.max(1, Math.round(origH * escala));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('El navegador no permite procesar canvas 2D.');

  ctx.drawImage(img, 0, 0, w, h);
  return recortarYLimpiarCanvas(canvas, ctx);
}

/** Limpia cualquier firma en dataUrl para asegurar fondo transparente */
export async function limpiarFirmaDataUrl(dataUrl: string, maxW = 700): Promise<ResultadoFirma> {
  return limpiarFirmaDataUrlLib(dataUrl, maxW);
}

/**
 * Firma cargada del usuario que aprobó (para los PDF). Busca en memoria y, si
 * la lista no está cargada (PDF abierto desde otra pantalla), la consulta.
 * `null` si ese usuario no tiene firma cargada: el PDF usa la firma de siempre.
 * Garantiza fondo transparente incluso si se guardó previamente con fondo de papel.
 */
export async function firmaCargadaDe(email?: string | null): Promise<ResultadoFirma | null> {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return null;
  const enCache = cacheFirmasLimpias.get(e);
  if (enCache) return enCache;
  let a = autorizadoDe(e);
  if (!a && getAutorizados() === null) {
    const { data } = await supabase.from(TABLE).select(COLS).eq('email', e).maybeSingle();
    a = (data as UsuarioAutorizado | null) ?? null;
  }
  if (!a?.firma) return null;
  const limpia = await limpiarFirmaDataUrlLib(a.firma).catch(() => null);
  const resultado = limpia || { dataUrl: a.firma, w: a.firma_w || 600, h: a.firma_h || 250 };
  cacheFirmasLimpias.set(e, resultado);
  if (limpia && limpia.dataUrl !== a.firma) {
    void supabase.from(TABLE).update({ firma: limpia.dataUrl, firma_w: limpia.w, firma_h: limpia.h }).eq('email', e);
  }
  return resultado;
}

/**
 * Prepara la imagen de firma que sube el usuario: la reduce (máx. 700 px de ancho),
 * vuelve TRANSPARENTE el fondo blanco/grisáceo y la exporta como PNG sin bordes vacíos.
 */
export async function prepararFirma(file: File): Promise<ResultadoFirma> {
  return procesarArchivoFirma(file, 700);
}
