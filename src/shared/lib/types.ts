/**
 * Los roles ahora se manejan dinámicamente vía la tabla `custom_roles` en Supabase.
 * Se mantiene el alias `string` para conservar la firma histórica sin restringir nuevos valores.
 */
export type Role = string;
export type EstadoGenerico = 'activo' | 'inactivo';
export type EstadoOrden = 'pendiente' | 'aprobada' | 'oc_creada' | 'oc_aprobada' | 'pagada' | 'oc_emitida' | 'rechazada' | 'recibida' | 'finalizada' | 'cancelada' | 'desistida_proveedor' | 'reasignada';
export type EstadoFactura = 'pendiente' | 'pagada' | 'anulada';
export type TipoMovimiento = 'creacion' | 'entrada' | 'salida' | 'consumo' | 'transferencia' | 'ajuste' | 'fundicion' | 'fin_fundicion';
export type NotifKind = 'info' | 'success' | 'warning' | 'error';
export type TipoInventario = 'inicial' | 'proceso' | 'final';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  apellido?: string | null;
  role: Role;
  ci?: string | null;
  telefono?: string | null;
  departamento?: string | null;
  estado: EstadoGenerico;
  must_change_password?: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface Almacen {
  id: string;
  nombre: string;
  ubicacion?: string | null;
  estado: EstadoGenerico;
  created_at: string;
  created_by?: string | null;
  updated_at?: string | null;
}

/** Horno de fundición/producción. Se administra como las categorías:
 *  alta, renombrado e inhabilitación (con motivo). */
export interface Horno {
  id: string;
  nombre: string;
  estado: EstadoGenerico;
  /** Motivo por el cual se deshabilitó (obligatorio al inhabilitar). */
  motivo_inhabilitacion?: string | null;
  created_at: string;
  created_by?: string | null;
  updated_at?: string | null;
}

/** Moneda de la tesorería. */
export type Moneda = 'USD' | 'Bs';

/** Moneda con tasa de cambio referenciada al BCV. */
export type MonedaTasa = 'USD' | 'EUR';

/** Fila del historial de tasas de cambio (BCV). */
export interface TasaCambio {
  id: string;
  fecha: string;        // YYYY-MM-DD
  moneda: MonedaTasa;
  tasa: number;         // Bs por 1 unidad de la moneda
  fuente: string;       // 'bcv' | 'manual'
  created_by?: string | null;
  at: string;
}

/** Tasa del día (snapshot): Bs por 1 USD y por 1 EUR. */
export interface TasaHoy {
  usd: number | null;
  eur: number | null;
  fecha: string | null;
}

/** Caja de la tesorería (cuenta de dinero con saldo). */
export interface Caja {
  id: string;
  nombre: string;
  moneda: Moneda;
  saldo: number;
  estado: EstadoGenerico;
  created_at: string;
  created_by?: string | null;
  updated_at?: string | null;
}

export type TipoMovimientoCaja = 'ingreso' | 'salida' | 'traslado_salida' | 'traslado_entrada' | 'ajuste';
export type EstadoMineral = 'pendiente' | 'conciliada';

/** Movimiento del libro de una caja. Para `tipo='salida'` puede llevar la
 *  conciliación con la recepción de mineral equivalente al dinero enviado. */
export interface MovimientoCaja {
  id: string;
  caja_id: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  moneda: Moneda;
  saldo_antes: number;
  saldo_despues: number;
  motivo?: string | null;
  destino?: string | null;
  /** Texto de la nota de entrega (se imprime en el PDF cuando está marcada). */
  nota_entrega?: string | null;
  ref_caja_id?: string | null;
  estado_mineral?: EstadoMineral | null;
  mineral_producto_id?: string | null;
  mineral_producto_nombre?: string | null;
  mineral_cantidad?: number | null;
  mineral_unidad?: string | null;
  mineral_costo_unit?: number | null;
  mineral_descripcion?: string | null;
  mineral_mov_id?: string | null;
  conciliada_at?: string | null;
  /** Tesorería: etiqueta del egreso ('gasto' / 'pago_personal' / 'pago_oc'). */
  categoria?: string | null;
  beneficiario?: string | null;
  beneficiario_id?: string | null;
  ref_orden_id?: string | null;
  actor: string;
  actor_name?: string | null;
  at: string;
  /** Solo en consultas con join: la caja de este movimiento. */
  caja?: { nombre: string; moneda: Moneda } | null;
}

/* ───────────── Retenciones e impuestos (Tesorería) ───────────── */

export type TipoRetencion = 'IVA' | 'ISLR' | 'MUNICIPAL';

export interface Retencion {
  id: string;
  tipo: TipoRetencion;
  proveedor_id?: string | null;
  orden_id?: string | null;
  base: number;
  porcentaje: number;
  monto: number;
  moneda: string;
  comprobante_nro?: string | null;
  fecha: string;
  descripcion?: string | null;
  actor?: string | null;
  actor_name?: string | null;
  created_at: string;
}

/* ───────────── Combustible ───────────── */

/** Tipo de combustible con su stock (litros) y costo promedio por litro. */
export interface Combustible {
  id: string;
  nombre: string;
  litros: number;
  costo_litro: number;
  estado: EstadoGenerico;
  /** Producto del inventario al que está vinculado este combustible. */
  producto_id?: string | null;
  /** Almacén "casa" del combustible (el del producto vinculado). Derivado al listar. */
  home_almacen?: string | null;
  created_at: string;
  created_by?: string | null;
  updated_at?: string | null;
}

export type TipoMovCombustible = 'ingreso' | 'salida' | 'ajuste';

export interface MovimientoCombustible {
  id: string;
  combustible_id: string;
  tipo: TipoMovCombustible;
  litros: number;
  costo_litro?: number | null;
  litros_antes: number;
  litros_despues: number;
  ref_solicitud_id?: string | null;
  detalle?: string | null;
  actor?: string | null;
  actor_name?: string | null;
  at: string;
}

export type EstadoSolicitudCombustible = 'por_aprobar' | 'aprobada' | 'finalizada' | 'cancelada';

/** Solicitud de salida de combustible (flujo por aprobar → aprobada → finalizada). */
export interface SolicitudCombustible {
  id: string;
  codigo: string;
  combustible_id: string | null;
  combustible_nombre: string;
  solicitante: string;
  destino: string;
  /** Almacén del inventario de donde sale el combustible al finalizar. */
  almacen?: string | null;
  litros: number;
  estado: EstadoSolicitudCombustible;
  motivo?: string | null;
  historial: EventoHistorial[];
  aprobada_por?: string | null;
  aprobada_en?: string | null;
  finalizada_por?: string | null;
  finalizada_en?: string | null;
  mov_id?: string | null;
  actor?: string | null;
  actor_name?: string | null;
  created_at: string;
}

/** Stock y costo (PMP) de un producto en un almacén concreto. */
export interface Existencia {
  producto_id: string;
  almacen: string;
  stock: number;
  costo_promedio: number;
  updated_at?: string | null;
}

export interface Proveedor {
  id: string;
  rif: string;
  razon_social: string;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  categorias: string[];
  estado: EstadoGenerico;
  created_at: string;
  updated_at?: string | null;
}

export type RecetaFundicion = 'RECETA 1' | 'RECETA 2' | 'RECETA 3';
export const RECETAS_FUNDICION: RecetaFundicion[] = ['RECETA 1', 'RECETA 2', 'RECETA 3'];

export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: number;
  stock_min: number;
  precio: number;
  almacen: string;
  estado: EstadoGenerico;
  restock_pct?: number | null;
  tipo?: TipoInventario | null;
  receta_fundicion?: RecetaFundicion | null;
  precio_promedio?: number | null;
  /** Precio de venta (para calcular posible ganancia en producción). */
  precio_venta?: number | null;
  /** Es un insumo de receta (aparece en el checklist de producción). */
  es_receta?: boolean;
  /** Es un producto terminado producible (catálogo de "qué producir"). */
  es_producible?: boolean;
  en_fundicion?: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface Movimiento {
  id: string;
  producto_id: string;
  tipo: TipoMovimiento;
  delta: number;
  stock_antes: number;
  stock_despues: number;
  actor: string;
  actor_name?: string | null;
  ref_tipo?: string | null;
  ref_id?: string | null;
  ref_codigo?: string | null;
  proveedor_id?: string | null;
  detalle?: string | null;
  /** A quién va dirigida la salida/traslado de material. */
  destino?: string | null;
  /** Texto de la nota de entrega (se imprime en el PDF cuando está marcada). */
  nota_entrega?: string | null;
  /** Fecha en que se entregó la salida/traslado de material al destino (YYYY-MM-DD). */
  fecha_entrega?: string | null;
  /** Almacén donde ocurrió el movimiento. */
  almacen?: string | null;
  /** Solo en consultas con join: el producto del movimiento. */
  producto?: { sku: string; nombre: string; unidad: string } | null;
  /** Costo unitario informado en este movimiento (lo pagado al proveedor en una entrada). */
  precio_unitario?: number | null;
  /** Costo base resultante (PMP) del producto tras aplicar este movimiento. */
  costo_promedio?: number | null;
  at: string;
  created_at: string;
}

export interface ItemOrden {
  sku: string;
  nombre: string;
  cantidad: number;
  precio: number;
  productoId?: string;
}

export interface EventoHistorial {
  at: string;
  evento: string;
  actor: string;
  motivo?: string;
  /** Documentos adjuntos a la OC (nota de entrega / despacho). */
  documentos?: string[];
}

export interface Orden {
  id: string;
  codigo: string;
  oc_codigo?: string | null;
  proveedor_id: string | null;
  solicitante_email: string;
  solicitante?: string | null;
  ci_solicitante?: string | null;
  items: ItemOrden[];
  total: number;
  estado: EstadoOrden;
  notas?: string | null;
  /** Clasificación del pedido: Producción, Bienes, Servicios (multi-selección). */
  clasificacion?: string[] | null;
  historial: EventoHistorial[];
  aprobada_por?: string | null;
  aprobada_en?: string | null;
  oc_emitida_por?: string | null;
  oc_emitida_en?: string | null;
  /** OC creada (oferta elegida, proveedor casado · sin confirmar). */
  oc_creada_por?: string | null;
  oc_creada_en?: string | null;
  /** OC aprobada/confirmada en lote (checklist). */
  oc_aprobada_por?: string | null;
  oc_aprobada_en?: string | null;
  /** Almacén destino de la mercancía (se elige al confirmar la OC). */
  almacen_destino?: string | null;
  /** Pago de la OC desde Tesorería. */
  pagada_por?: string | null;
  pagada_en?: string | null;
  caja_id?: string | null;
  caja_mov_id?: string | null;
  factura_path?: string | null;
  factura_nombre?: string | null;
  retencion_path?: string | null;
  retencion_nombre?: string | null;
  finalizada_por?: string | null;
  finalizada_en?: string | null;
  rechazada_por?: string | null;
  rechazada_en?: string | null;
  motivo_rechazo?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Factura {
  id: string;
  numero: string;
  orden_id?: string | null;
  proveedor_id: string;
  items: ItemOrden[];
  subtotal: number;
  iva: number;
  total: number;
  estado: EstadoFactura;
  emision: string;
  vencimiento?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Notificacion {
  id: string;
  destino: string;
  kind: NotifKind;
  title: string;
  message?: string | null;
  link?: string | null;
  dedup_key?: string | null;
  read: boolean;
  at: string;
}

export type EstadoOferta = 'pendiente' | 'aceptada' | 'descartada';

export interface OfertaProveedor {
  id: string;
  orden_id: string;
  proveedor_id: string;
  items: ItemOrden[];
  precio_total: number;
  fecha_entrega_prometida?: string | null;
  condiciones_pago?: string | null;
  notas?: string | null;
  estado: EstadoOferta;
  score_calculado?: number | null;
  registrada_por_email: string;
  registrada_en: string;
  decidida_por_email?: string | null;
  decidida_en?: string | null;
  motivo_descarte?: string | null;
  pdf_path?: string | null;
  pdf_filename?: string | null;
}

export interface EvaluacionRecepcion {
  id: string;
  orden_id: string;
  proveedor_id: string;
  calidad: number;                  // 1-5
  puntualidad_dias: number;         // signed
  comentario?: string | null;
  evaluado_por_email: string;
  evaluado_por_rol: string;
  evaluado_en: string;
  ajustado_por_jefe: boolean;
  rating_original?: number | null;
  ajustado_en?: string | null;
}

export type EstadoProduccion = 'produccion' | 'finalizado';

export interface ProduccionMaterial {
  id: string;
  produccion_id: string;
  producto_id?: string | null;
  material_nombre: string;
  almacen: string;
  cantidad: number;
  costo_unitario: number;
  subtotal: number;
}

export interface Produccion {
  id: string;
  producto_id?: string | null;
  producto_nombre: string;
  cantidad: number;
  almacen_destino: string;
  estado: EstadoProduccion;
  costo_material: number;       // CTM
  mano_obra: number;
  costos_indirectos: number;
  costo_unitario: number;       // CP / cantidad
  precio_venta?: number | null;
  ganancia?: number | null;
  receta_num?: number | null;   // nº de receta secuencial por producto (1, 2, 3…)
  horno?: string | null;        // nombre del horno utilizado
  inicio_at: string;
  fin_at?: string | null;
  created_by?: string | null;
  created_at: string;
  materiales?: ProduccionMaterial[];
}

export interface PesosScore {
  precio: number;
  puntualidad: number;
  calidad: number;
  cumplimiento: number;
}

export const DEFAULT_PESOS_SCORE: PesosScore = {
  precio: 0.40,
  puntualidad: 0.25,
  calidad: 0.25,
  cumplimiento: 0.10,
};
