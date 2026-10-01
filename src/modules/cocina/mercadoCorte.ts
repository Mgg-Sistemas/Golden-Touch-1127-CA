/* ============================================================
   Golden Touch · Cocina · Corte de inventario: partir del stock real

   Pedido del usuario (01/10/2026): «en Distribución de comidas vamos a partir
   con lo que está. Coloca lo demás en un histórico que se vea solo las
   entradas». El stock de ese día —el mercado que entró más los ajustes hechos
   en Inventario— es lo real, y de ahí arranca la cuenta.

   EL CORTE ES UN CIERRE, CON DOS DIFERENCIAS
   · El mercado nuevo arranca con el stock real del instante del corte (igual
     que en un cierre: no se descarta nada de la despensa).
   · Los ciclos anteriores quedan en «Mercados cerrados» mostrando SOLO LAS
     ENTRADAS: su consumo, sus mermas y su saldo ya no describen el almacén y
     se dejan de mostrar. No se borra nada: los datos siguen guardados en el
     ciclo, la marca solo cambia lo que se ve.

   La marca vive en `totales` (jsonb), como la del descarte: no pide migración.
   Aquí viven las piezas que se prueban sin base ni React.
   ============================================================ */
import type { ResumenViver } from './cocinaMercado.repository';
import type { MovimientosCiclo } from './mercadoCierre';

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** Largo mínimo del motivo del corte: tiene que explicar algo dentro de seis meses. */
export const MOTIVO_CORTE_MIN = 10;

/** El motivo que se propone al abrir el diálogo (se puede cambiar). */
export const MOTIVO_CORTE_SUGERIDO =
  'Se parte del stock real: el mercado que entró y los ajustes hechos en Inventario.';

export function motivoCorteValido(motivo: string | null | undefined): boolean {
  return (motivo ?? '').trim().length >= MOTIVO_CORTE_MIN;
}

/** ¿De este ciclo se muestran solo las entradas? (quedó antes de un corte de inventario) */
export function esSoloEntradas(
  m: { totales?: { solo_entradas?: boolean | null } | null } | null | undefined,
): boolean {
  return m?.totales?.solo_entradas === true;
}

/** Lo que el corte le agrega a los totales del ciclo que cierra. */
export interface MarcaCorte {
  solo_entradas: true;
  /** Instante del corte (ISO). */
  corte_at: string;
  corte_motivo: string;
  corte_por: string | null;
  corte_por_nombre: string | null;
}

export function marcaCorte(o: { at: string; motivo: string; por?: string | null; porNombre?: string | null }): MarcaCorte {
  return {
    solo_entradas: true,
    corte_at: o.at,
    corte_motivo: o.motivo.trim(),
    corte_por: o.por?.trim() || null,
    corte_por_nombre: o.porNombre?.trim() || null,
  };
}

/* ───────── Lo único que se ve de un ciclo anterior al corte: sus entradas ───────── */

/** Total de entradas de un víver en el ciclo. */
export interface EntradaViver {
  producto_id: string;
  sku: string;
  nombre: string;
  unidad: string | null;
  entradas: number;
}

/** Los víveres que tuvieron entradas en el ciclo, por nombre. Los que no recibieron nada no salen. */
export function entradasPorViver(resumen: ResumenViver[] | null | undefined): EntradaViver[] {
  return (resumen ?? [])
    .map((r) => ({
      producto_id: r.producto_id, sku: r.sku ?? '', nombre: r.nombre, unidad: r.unidad ?? null,
      entradas: r2(Number(r.entradas) || 0),
    }))
    .filter((r) => r.entradas > 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Suma de las entradas, en unidades. */
export function totalEntradas(filas: { entradas: number }[]): number {
  return r2(filas.reduce((a, f) => a + (Number(f.entradas) || 0), 0));
}

/** Una entrada con su fecha y su comprobante, tal como quedó congelada al cerrar. */
export interface EntradaFechada {
  producto_id: string;
  nombre: string;
  unidad: string | null;
  fecha: string;
  cantidad: number;
  /** Comprobante: la orden o solicitud de compra. `null` si fue una entrada manual. */
  ref: string | null;
}

/**
 * Las entradas del ciclo una por una (fecha, comprobante, víver, cantidad), de la más
 * vieja a la más nueva. Salen de la foto congelada al cerrar; un ciclo cerrado antes del
 * 28/09/2026 no la trae y devuelve una lista vacía (queda el total por víver).
 */
export function entradasFechadas(
  resumen: ResumenViver[] | null | undefined,
  mov: MovimientosCiclo | null | undefined,
): EntradaFechada[] {
  const porId = new Map((resumen ?? []).map((r) => [r.producto_id, r] as const));
  return (mov?.entradas ?? [])
    .filter((e) => (Number(e.cantidad) || 0) > 0)
    .map((e) => {
      const v = porId.get(e.producto_id);
      return {
        producto_id: e.producto_id, nombre: v?.nombre ?? '(víver)', unidad: v?.unidad ?? null,
        fecha: e.fecha, cantidad: r2(Number(e.cantidad) || 0), ref: e.ref?.trim() || null,
      };
    })
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime() || a.nombre.localeCompare(b.nombre, 'es'));
}

/* ───────── Las comidas que se ven al entrar: las del mercado en curso ───────── */

/**
 * Las comidas del mercado en curso. Una comida es del ciclo si se sirvió desde su inicio
 * o si se CARGÓ desde su inicio: el stock baja cuando se carga, así que una comida con
 * fecha atrasada cargada hoy también es consumo de este mercado.
 * Sin inicio (no hay mercado abierto) no se filtra nada.
 */
export function comidasDelCiclo<T extends { at: string; created_at?: string | null }>(
  movs: T[], inicioAt: string | null | undefined,
): T[] {
  const ini = Date.parse(inicioAt ?? '');
  if (!Number.isFinite(ini)) return movs;
  return movs.filter((m) => {
    const servida = Date.parse(m.at);
    const cargada = Date.parse(m.created_at ?? '');
    return (Number.isFinite(servida) && servida >= ini) || (Number.isFinite(cargada) && cargada >= ini);
  });
}
