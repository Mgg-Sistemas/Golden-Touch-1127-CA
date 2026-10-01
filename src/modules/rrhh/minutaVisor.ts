/* ============================================================
   Golden Touch · RRHH · Minutas · visor de adjuntos

   Lógica pura del visor de imágenes (zoom y rotación) y del reparto de
   archivos de una subida en tanda. Vive aparte del componente para poder
   probarse sola, igual que `minutaBorrador.ts`.
   ============================================================ */

export const ESCALA_MIN = 0.5;
export const ESCALA_MAX = 4;
export const PASO_ESCALA = 0.25;

/** Escala siguiente: un paso arriba o abajo, sin salirse de 0,5–4 ni arrastrar decimales. */
export function escalaSiguiente(actual: number, dir: 1 | -1): number {
  const n = +(actual + dir * PASO_ESCALA).toFixed(2);
  return Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, n));
}

/** Giro siguiente: suma 90° y vuelve a 0 tras la vuelta completa. */
export function giroSiguiente(actual: number): number {
  return (actual + 90) % 360;
}

/** El único lugar donde se arma el `transform` del visor. */
export function transformVisor(escala: number, giro: number): string {
  return `scale(${escala}) rotate(${giro}deg)`;
}

/** ¿Se puede mostrar como imagen? Va por el tipo MIME guardado al subir. */
export function esImagenAdjunto(tipo: string | null | undefined): boolean {
  return (tipo ?? '').startsWith('image/');
}

/**
 * Reparte los archivos elegidos entre los que se pueden subir y los rechazados
 * con su motivo. Un rechazado NO frena a los demás.
 */
export function repartirTanda<T extends { name: string }>(
  archivos: T[],
  validar: (f: T) => string | null,
): { validos: T[]; rechazados: { nombre: string; motivo: string }[] } {
  const validos: T[] = [];
  const rechazados: { nombre: string; motivo: string }[] = [];
  for (const f of archivos) {
    const motivo = validar(f);
    if (motivo) rechazados.push({ nombre: f.name, motivo });
    else validos.push(f);
  }
  return { validos, rechazados };
}
