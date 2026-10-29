import type { ModuleKey } from '@/modules/usuarios/permisos.repository';
import type { Notificacion } from '@/shared/lib/types';

export type NotificacionLike = Pick<Notificacion, 'link' | 'title' | 'message'> & {
  destino?: string | null;
  read?: boolean;
};

/**
 * Normaliza un texto para búsqueda de palabras clave sin tildes y en minúsculas.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Mapeo de prefijos de ruta canónicos a ModuleKey.
 */
const RUTA_A_MODULO: Record<string, ModuleKey> = {
  dashboard: 'dashboard',
  pedidos: 'pedidos',
  solicitudes: 'pedidos',
  proveedores: 'proveedores',
  inventario: 'inventario',
  produccion: 'produccion',
  salidas: 'salidas',
  combustible: 'combustible',
  acopio: 'acopio',
  cocina: 'cocina',
  tesoreria: 'tesoreria',
  ventas: 'ventas',
  retenciones: 'retenciones',
  documentacion: 'documentacion',
  recepciones: 'recepciones',
  rrhh: 'rrhh',
  geodesta: 'geodesta',
  asignaciones: 'asignaciones',
  choferes: 'choferes',
  maquinaria: 'maquinaria',
  usuarios: 'usuarios',
  ajustes: 'ajustes',
};

/**
 * Infiere el módulo asociado a una notificación según su link o su contenido textual.
 * Devuelve `null` si es una notificación general del sistema (sin módulo asignado).
 */
export function moduloDeNotificacion(n: Pick<Notificacion, 'link' | 'title' | 'message'>): ModuleKey | null {
  // 1. Extraer módulo del link si está presente (#/app/<modulo> o /app/<modulo>)
  if (n.link) {
    const raw = n.link.startsWith('#') ? n.link.slice(1) : n.link;
    const match = raw.match(/\/app\/([a-z0-9_-]+)/i);
    if (match && match[1]) {
      const segmento = match[1].toLowerCase();
      if (RUTA_A_MODULO[segmento]) {
        return RUTA_A_MODULO[segmento];
      }
    }
  }

  // 2. Si no tiene link, inferir a partir del título y el cuerpo del mensaje
  const texto = normalizar(`${n.title ?? ''} ${n.message ?? ''}`);
  if (!texto.trim()) return null;

  if (/\bretencion|\bseniat\b|comprobante.*retencion/.test(texto)) {
    return 'retenciones';
  }
  if (/\bcombustible|\btanque|\bsurtidor|\bdiesel|\bgasolina\b/.test(texto)) {
    return 'combustible';
  }
  if (/\bstock\b|\binventario\b|\bdeposito\b|\balmacen\b|\breabastecimiento\b/.test(texto)) {
    return 'inventario';
  }
  if (/orden.*compra|orden.*pedido|\boc\b|solicitud.*pedido|compra directa|servicio directo|\bcompras\b/.test(texto)) {
    return 'pedidos';
  }
  if (/tesoreria|\bcaja\b|pago.*oc|\babono\b|gasto registrado|\bdivisas\b|\btasa\b/.test(texto)) {
    return 'tesoreria';
  }
  if (/\bsalida\b|\btraslado\b/.test(texto)) {
    return 'salidas';
  }
  if (/\brrhh\b|nomina|prestamo|\bpersonal\b|\basistencia\b|\breposo\b/.test(texto)) {
    return 'rrhh';
  }
  if (/\bmaquinaria\b|\bvehiculo\b|\baveria\b|mantenimiento.*(?:equipo|maquinaria|vehiculo|flota|taller)|\bflota\b/.test(texto)) {
    return 'maquinaria';
  }
  if (/\bproveedor/.test(texto)) {
    return 'proveedores';
  }
  if (/\bventa\b|\bcliente\b/.test(texto)) {
    return 'ventas';
  }
  if (/\bcocina\b|\bcomida\b|\bmercado\b/.test(texto)) {
    return 'cocina';
  }
  if (/\busuario\b|\bclave\b|\brol\b/.test(texto)) {
    return 'usuarios';
  }

  return null;
}

/**
 * Evalúa si una notificación debe ser visible para un usuario dado según sus permisos y rol.
 *
 * Reglas:
 * 1. Los administradores (`isAdmin = true`) ven absolutamente todas las notificaciones.
 * 2. Si `destino === 'admin'`, solo los administradores pueden verla.
 * 3. Si la notificación pertenece a un módulo específico (ej. `retenciones`), el usuario
 *    debe tener permiso de lectura en ese módulo (`can(modulo) === true`).
 * 4. Si la notificación es global del sistema (sin módulo asociado y `destino === 'all'`),
 *    es visible para todos los usuarios.
 */
export function notificacionPermitidaParaUsuario(
  n: NotificacionLike,
  can: (module: ModuleKey) => boolean,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;

  // Destino exclusivo para administradores
  if (n.destino === 'admin') return false;

  const modulo = moduloDeNotificacion(n);
  if (modulo) {
    return can(modulo);
  }

  // Notificación general sin módulo asignado
  return n.destino === 'all' || !n.destino;
}
