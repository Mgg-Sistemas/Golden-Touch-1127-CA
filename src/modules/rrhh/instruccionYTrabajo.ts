/* ============================================================
   Golden Touch · RRHH · Grado de instrucción y último trabajo

   Pedido del usuario (28/09/2026): la hoja de ingreso pregunta el grado de
   instrucción con casillas (primaria, bachiller, universitario) y el título
   obtenido, y el último trabajo: dónde estuvo, qué cargo tenía, cuánto duró y
   cuánto cobraba.

   Dos decisiones que valen explicarse:

   · LA DURACIÓN ES TEXTO, no dos fechas. Es lo que la persona escribe a mano
     en la planilla: «2 años y 3 meses», «de 2021 a 2024», «casi un año».
     Pedir dos fechas exactas hace que el campo quede vacío cuando no las
     recuerda, que es el caso común, y un dato vacío no sirve para nada.

   · EL TÍTULO CUELGA DEL GRADO. Si nadie marcó el grado, el título no se
     guarda: un «Ingeniero» sin grado marcado es un dato a medias que después
     nadie sabe si creer. Es la misma regla que las condiciones de salud.
   ============================================================ */

/** Los tres grados que pide la hoja de ingreso. */
export type GradoInstruccion = 'primaria' | 'bachiller' | 'universitario';

export const GRADOS: { value: GradoInstruccion; label: string }[] = [
  { value: 'primaria', label: 'Primaria' },
  { value: 'bachiller', label: 'Bachiller' },
  { value: 'universitario', label: 'Universitario' },
];

const ETIQUETA = GRADOS.reduce<Record<string, string>>((a, g) => { a[g.value] = g.label; return a; }, {});

/** Cómo se dice el grado en pantalla y en los PDF. */
export function labelGrado(g: GradoInstruccion | string | null | undefined): string {
  const k = String(g ?? '').trim();
  return ETIQUETA[k] ?? (k || '—');
}

/** ¿Es uno de los tres grados válidos? Lo que no lo sea se guarda en null. */
export function esGradoValido(g: unknown): g is GradoInstruccion {
  return g === 'primaria' || g === 'bachiller' || g === 'universitario';
}

/**
 * Normaliza el grado y su título: el título cuelga del grado. Sin grado
 * marcado no se guarda título, igual que el detalle de una alergia sin el «sí».
 */
export function normalizarInstruccion(
  grado: unknown, titulo: string | null | undefined,
): { grado: GradoInstruccion | null; titulo: string | null } {
  if (!esGradoValido(grado)) return { grado: null, titulo: null };
  return { grado, titulo: (titulo ?? '').trim() || null };
}

/** El último trabajo, tal como lo cuenta la persona. */
export interface TrabajoAnterior {
  empresa: string | null;
  cargo: string | null;
  duracion: string | null;
  /** Último sueldo que cobró. `null` si no lo dijo; 0 NO es lo mismo que vacío. */
  sueldo: number | null;
}

export const TRABAJO_VACIO: TrabajoAnterior = { empresa: null, cargo: null, duracion: null, sueldo: null };

/** Limpia los cuatro datos del último trabajo. Un sueldo que no es número queda en null. */
export function normalizarTrabajo(t: {
  empresa?: string | null; cargo?: string | null; duracion?: string | null;
  sueldo?: number | string | null;
}): TrabajoAnterior {
  const texto = (v: string | null | undefined) => (v ?? '').trim() || null;
  const crudo = t.sueldo;
  const n = crudo === '' || crudo == null ? NaN : Number(crudo);
  return {
    empresa: texto(t.empresa),
    cargo: texto(t.cargo),
    duracion: texto(t.duracion),
    sueldo: Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null,
  };
}

/** ¿Hay algo cargado del último trabajo? Sirve para no mostrar una sección vacía. */
export function tieneTrabajoAnterior(t: TrabajoAnterior): boolean {
  return !!(t.empresa || t.cargo || t.duracion || t.sueldo != null);
}

/**
 * Una línea para el carnet, la ficha o la búsqueda: «PDVSA · Operador · 3 años».
 * Los datos que faltan no dejan separadores sueltos.
 */
export function resumenTrabajo(t: TrabajoAnterior): string {
  return [t.empresa, t.cargo, t.duracion].filter(Boolean).join(' · ');
}
