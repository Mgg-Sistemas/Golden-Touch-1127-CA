/* ============================================================
   Buscador del menú lateral (12/11/2026).
   Se escribe el nombre del módulo y quedan solo los que coinciden, sin
   importar tildes ni mayúsculas. También entiende los otros nombres con que
   la gente llama a cada módulo («compras», «almacén», «caja»…).
   ============================================================ */

export function normalizarMenu(s: string): string {
  let t = (s ?? '').toLowerCase().trim();
  try { t = t.normalize('NFD').replace(/\p{Diacritic}/gu, ''); } catch { /* sin normalizar */ }
  return t.replace(/\s+/g, ' ');
}

/** Otras palabras con que se busca cada módulo (por ruta). */
export const ALIAS_MENU: Record<string, string> = {
  '/app/pedidos': 'compras solicitud pedido oc orden de compra cotizacion compras fijas mercado',
  '/app/delivery': 'carga pesada motorizado entregas',
  '/app/inventario': 'almacen los pinos stock existencias productos kardex',
  '/app/inventario/deposito-mina': 'almacen mina deposito stock existencias',
  '/app/salidas': 'traslados despacho salida de material',
  '/app/combustible': 'gasoil diesel gasolina surtidos tanques',
  '/app/acopio': 'peramanal centro de costo',
  '/app/recepciones': 'recepcion material mineral',
  '/app/cocina': 'alimentacion comida comedor',
  '/app/tesoreria': 'caja pagos bancos dinero egresos ingresos',
  '/app/administracion': 'gastos fijos nomina empresas',
  '/app/ventas': 'facturacion clientes',
  '/app/retenciones': 'iva islr fiscal libro',
  '/app/conciliacion': 'pagos referencias facturas comprobantes',
  '/app/documentacion': 'documentos papeles',
  '/app/rrhh': 'nomina empleados trabajadores personal recursos humanos',
  '/app/asignaciones': 'dotacion entregas personal',
  '/app/choferes': 'conductores viajes',
  '/app/maquinaria': 'vehiculos equipos mantenimiento bitacora averias lavados repuestos',
  '/app/usuarios': 'permisos roles accesos',
  '/app/ajustes': 'configuracion',
  '/app/auditoria': 'historial registros',
};

/** ¿El módulo (nombre y ruta) entra con lo escrito? Cada palabra tiene que aparecer. */
export function coincideMenu(filtro: string, label: string, to: string): boolean {
  const f = normalizarMenu(filtro);
  if (!f) return true;
  const heno = normalizarMenu(`${label} ${ALIAS_MENU[to] ?? ''}`);
  return f.split(' ').every((palabra) => heno.includes(palabra));
}
