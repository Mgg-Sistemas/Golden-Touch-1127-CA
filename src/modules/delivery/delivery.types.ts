/* ============================================================
   Golden Touch · Delivery · Contrato común (30/10/2026)

   Una OC de productos, ya PAGADA por Tesorería y con la RETENCIÓN hecha
   (o que no lleva retención), pasa a Delivery: el motorizado la acepta,
   va a buscarla al proveedor (fotos al recibir), sale en ruta y la entrega
   en el almacén (fotos al entregar). Desde la PC se ve el tablero, el mapa
   (Puerto Ordaz) con la ubicación de cada motorizado y el histórico.
   Todo se enciende con el interruptor `compras_delivery` (apagado hasta que
   la gerencia lo indique, junto con el nuevo flujo de Compras).

   Este archivo es el CONTRATO que comparten la base (supabase/2026-10-30-delivery.sql),
   el repositorio, la PC y el teléfono. Cambiarlo es cambiar a los cuatro.
   ============================================================ */

/** por_tomar → aceptado → en_ruta → entregado. Cancelar devuelve a por_tomar (otro lo toma). */
export type EstadoDelivery = 'por_tomar' | 'aceptado' | 'en_ruta' | 'entregado';

export const ESTADOS_DELIVERY: { key: EstadoDelivery; label: string; icono: string }[] = [
  { key: 'por_tomar', label: 'Por tomar', icono: '💰' },
  { key: 'aceptado', label: 'Aceptado', icono: '⚡' },
  { key: 'en_ruta', label: 'En ruta', icono: '🚚' },
  { key: 'entregado', label: 'Entregado', icono: '✅' },
];

/** Motivos de «no puedo buscar el pedido» (la maqueta, adaptada a ir a buscar al proveedor). */
export const MOTIVOS_CANCELACION: string[] = [
  '🔧 Avería mecánica de la moto',
  '📍 Dirección del proveedor errada o zona inaccesible',
  '🏪 El proveedor no tiene el pedido listo / está cerrado',
  '📵 El proveedor no atiende las llamadas',
  '🌧 Lluvia fuerte / condiciones del clima',
  '⛽ Sin combustible',
  '📝 Otro motivo',
];

/** Foto guardada en el bucket privado `delivery-fotos`. */
export interface FotoDelivery {
  path: string;
  nombre: string;
}

/** Fila de `delivery_pedidos` (una por OC). */
export interface PedidoDelivery {
  id: string;
  orden_id: string;
  /** DEL-0001… */
  codigo: string;
  estado: EstadoDelivery;
  repartidor_email: string | null;
  repartidor_nombre: string | null;
  aceptado_en: string | null;
  en_ruta_en: string | null;
  entregado_en: string | null;
  /** Fotos al RECIBIR el pedido del proveedor. */
  fotos_recibido: FotoDelivery[];
  /** Fotos al ENTREGAR en el almacén. */
  fotos_entrega: FotoDelivery[];
  nota_entrega: string | null;
  cancelaciones: number;
  ultima_cancelacion_motivo: string | null;
  ultima_cancelacion_por: string | null;
  ultima_cancelacion_en: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Fila de `delivery_eventos` (el historial de cada pedido). */
export type EventoDelivery = 'creado' | 'aceptado' | 'cancelado' | 'en_ruta' | 'entregado' | 'fotos' | 'reabierto';

export interface EventoDeliveryRow {
  id: string;
  pedido_id: string;
  evento: EventoDelivery;
  actor_email: string | null;
  actor_nombre: string | null;
  motivo: string | null;
  detalle: string | null;
  lat: number | null;
  lng: number | null;
  at: string;
}

/** Fila de `delivery_ubicaciones` (la última posición de cada motorizado). */
export interface UbicacionDelivery {
  repartidor_email: string;
  repartidor_nombre: string | null;
  lat: number;
  lng: number;
  precision_m: number | null;
  pedido_id: string | null;
  updated_at: string;
}

/** Lo que ve la pantalla: el pedido + los datos de su OC que hacen falta para ir a buscarlo. */
export interface PedidoDeliveryVista extends PedidoDelivery {
  orden: {
    id: string;
    codigo: string;
    oc_codigo: string | null;
    total: number;
    total_moneda: string | null;
    urgente: boolean | null;
    notas: string | null;
    unidad_solicitante: string | null;
    items: { nombre: string; cantidad: number; unidad?: string | null; comprar?: boolean }[];
    pagada_en: string | null;
    /** Correo del analista de compras que montó la OC (oc_creada_por || oc_emitida_por). */
    analista_email: string | null;
  };
  proveedor: { razon_social: string | null; rif: string | null; telefono: string | null; direccion: string | null } | null;
  /** Nombre y teléfono del analista (tabla usuarios) para el botón «📞 Llamar al analista». */
  analista: { nombre: string | null; telefono: string | null } | null;
}

/** Centro del mapa de la PC: Puerto Ordaz, estado Bolívar. */
export const PUERTO_ORDAZ: { lat: number; lng: number; zoom: number } = { lat: 8.2967, lng: -62.7114, zoom: 13 };

/** Máximo de fotos por momento (recibir / entregar). */
export const MAX_FOTOS_DELIVERY = 4;

/** Clave del interruptor en `sistema_interruptores`. */
export const INTERRUPTOR_DELIVERY = 'compras_delivery';
