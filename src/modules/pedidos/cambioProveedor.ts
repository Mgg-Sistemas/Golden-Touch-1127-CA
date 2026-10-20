/* ============================================================
   Golden Touch · Pedidos · evento «Cambio de proveedor» de la traza

   Al indicar el método de pago se puede cambiar el proveedor: la OC vuelve a
   aprobación del Gerente General y el cambio queda en el historial. Este módulo
   lee ese evento para mostrarlo igual en la línea de tiempo de la orden y en el
   PDF de trazabilidad.

   Formatos que conviven:
     · actual:  proveedorAnteriorId / proveedorNuevoId + nombres guardados
                (proveedorAnterior / proveedorNuevo) + la aprobación que se anuló.
     · antiguo: proveedorAnteriorId / proveedorId (= el nuevo) y la razón en `nota`.
       La línea de tiempo buscaba `proveedorNuevoId`, que nunca se escribía, así que
       el «de X → Y» no salía; aquí se leen los dos nombres de campo.
   ============================================================ */

/** Campos que puede traer el evento `proveedor_cambiado` (todos opcionales). */
export interface EventoCambioProveedor {
  at?: string;
  actor?: string;
  motivo?: string;
  /** Formato antiguo del motivo. */
  nota?: string;
  proveedorAnteriorId?: string | null;
  proveedorNuevoId?: string | null;
  /** Formato antiguo: aquí se guardaba el proveedor NUEVO. */
  proveedorId?: string | null;
  /** Nombres tal como eran al momento del cambio (no cambian si el proveedor se renombra). */
  proveedorAnterior?: string | null;
  proveedorNuevo?: string | null;
  /** La aprobación de la OC que este cambio dejó sin efecto. */
  aprobacionAnteriorPor?: string | null;
  aprobacionAnteriorEn?: string | null;
}

export interface CambioProveedorLeido {
  anteriorId: string | null;
  nuevoId: string | null;
  /** Nombre del proveedor anterior (guardado en el evento o, si no, el de la ficha). */
  anterior: string | null;
  nuevo: string | null;
  motivo: string | null;
  aprobacionAnteriorPor: string | null;
  aprobacionAnteriorEn: string | null;
}

/** Lee un evento `proveedor_cambiado`. `nombreDe` resuelve un id contra las fichas de proveedores. */
export function leerCambioProveedor(
  h: EventoCambioProveedor,
  nombreDe: (id: string) => string | null | undefined = () => null,
): CambioProveedorLeido {
  const anteriorId = h.proveedorAnteriorId || null;
  const nuevoId = h.proveedorNuevoId || h.proveedorId || null;
  return {
    anteriorId,
    nuevoId,
    anterior: h.proveedorAnterior || (anteriorId ? nombreDe(anteriorId) ?? null : null),
    nuevo: h.proveedorNuevo || (nuevoId ? nombreDe(nuevoId) ?? null : null),
    motivo: h.motivo || h.nota || null,
    aprobacionAnteriorPor: h.aprobacionAnteriorPor || null,
    aprobacionAnteriorEn: h.aprobacionAnteriorEn || null,
  };
}

/** « · de A → B · motivo» para el título del evento en la línea de tiempo ('' si no hay nada). */
export function textoCambioProveedor(c: CambioProveedorLeido): string {
  const partes: string[] = [];
  if (c.anterior || c.nuevo) partes.push(`de ${c.anterior ?? '—'} → ${c.nuevo ?? '—'}`);
  if (c.motivo) partes.push(c.motivo);
  return partes.length ? ` · ${partes.join(' · ')}` : '';
}
