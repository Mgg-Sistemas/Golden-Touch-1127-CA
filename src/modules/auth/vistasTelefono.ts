/* ============================================================
   Golden Touch · Pantallas de teléfono por rol

   Cada pantalla de teléfono se da por rol, una por una (02/10/2026). Se
   guarda en `roles_permisos.vistas_telefono`. Para abrir una hace falta la
   pantalla Y lectura en su módulo: la pantalla no da permiso sobre los datos,
   eso lo sigue dando el módulo (y la base lo exige con puede('modulo')).

   «Solo teléfono» (`roles_permisos.solo_telefono`): el rol trabaja solo desde
   sus pantallas de teléfono y no ve las de PC, salvo Ajustes. Antes eso
   dependía del NOMBRE del rol (combustible, cocina), y un usuario no podía
   tener dos pantallas de teléfono.

   Para sumar una pantalla nueva: agregarla a VISTAS_TELEFONO con su ruta y su
   módulo, y envolver su ruta en <RequireVistaTelefono>.
   ============================================================ */
import type { ModuleKey } from '@/modules/usuarios/permisos.repository';

export type VistaTelefonoKey = 'surtidor' | 'comidas' | 'inventario' | 'deposito_mina' | 'maquinaria' | 'retenciones' | 'solicitudes' | 'delivery';

export interface VistaTelefono {
  key: VistaTelefonoKey;
  label: string;
  descripcion: string;
  /** Módulo del que salen los datos: hace falta lectura en él para abrirla. */
  modulo: ModuleKey;
  ruta: string;
  icono: string;
}

export const VISTAS_TELEFONO: VistaTelefono[] = [
  {
    key: 'maquinaria', label: 'Maquinaria y Flota', icono: '🚜', modulo: 'maquinaria',
    ruta: '/app/maquinaria/telefono', descripcion: 'Servicios, lavados, averías y reportes por WhatsApp',
  },
  {
    key: 'surtidor', label: 'Surtidor de combustible', icono: '⛽', modulo: 'combustible',
    ruta: '/app/combustible/surtidor', descripcion: 'Surtir a un equipo, pasar a otro tanque y entradas',
  },
  {
    key: 'comidas', label: 'Comidas', icono: '🍽', modulo: 'cocina',
    ruta: '/app/cocina/telefono', descripcion: 'Desayuno, almuerzo y cena, con lo consumido y las personas',
  },
  {
    // 29/10/2026 · la misma pantalla del Depósito Mina, para el Inventario General.
    key: 'inventario', label: 'Inventario General', icono: '📦', modulo: 'inventario',
    ruta: '/app/inventario/telefono', descripcion: 'Productos nuevos, entradas, traslados al Depósito Mina y reporte de stock',
  },
  {
    key: 'deposito_mina', label: 'Depósito Mina', icono: '⛏', modulo: 'inventario',
    ruta: '/app/inventario/deposito-mina/telefono', descripcion: 'Productos nuevos, entradas, salidas, traslados y reporte de stock',
  },
  {
    key: 'retenciones', label: 'Buzón de Facturas', icono: '🧾', modulo: 'retenciones',
    ruta: '/app/retenciones/telefono', descripcion: 'Carga rápida de facturas externas y soportes',
  },
  {
    // 29/10/2026 · Almacén revisa las SP antes de Compras (se activa con el interruptor compras_revision_almacen).
    key: 'solicitudes', label: 'Solicitudes de Pedido', icono: '📋', modulo: 'inventario',
    ruta: '/app/solicitudes/telefono', descripcion: 'Validar si Almacén tiene lo que piden y avisar por WhatsApp',
  },
  {
    // 30/10/2026 · el motorizado acepta, busca y entrega las OC pagadas (interruptor compras_delivery).
    key: 'delivery', label: 'Delivery', icono: '🛵', modulo: 'delivery',
    ruta: '/app/delivery/telefono', descripcion: 'Aceptar, ir a buscar y entregar pedidos pagados',
  },
];

/** La pantalla de inicio de quien tiene más de una pantalla de teléfono. */
export const RUTA_TELEFONO = '/app/telefono';

const CLAVES = new Set<string>(VISTAS_TELEFONO.map((v) => v.key));

/** Lo guardado en la base, limpio: solo claves conocidas y sin repetir. */
export function normalizarVistas(v: unknown): VistaTelefonoKey[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is VistaTelefonoKey => typeof x === 'string' && CLAVES.has(x)))];
}

/**
 * Las pantallas que el usuario puede abrir: las de su rol que además tengan lectura
 * en su módulo. El administrador las tiene todas.
 */
export function vistasPermitidas(
  vistasDelRol: readonly string[], can: (m: ModuleKey) => boolean, isAdmin: boolean,
): VistaTelefono[] {
  return VISTAS_TELEFONO.filter((v) => isAdmin || (vistasDelRol.includes(v.key) && can(v.modulo)));
}

/** Adónde entra un rol «solo teléfono»: directo a su pantalla si tiene una, o al menú si tiene varias. */
export function inicioTelefono(vistas: readonly VistaTelefono[]): string {
  return vistas.length === 1 ? vistas[0].ruta : RUTA_TELEFONO;
}
