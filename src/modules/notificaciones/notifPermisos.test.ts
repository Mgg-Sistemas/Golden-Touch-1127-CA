import { describe, it, expect } from 'vitest';
import { moduloDeNotificacion, modulosDeNotificacion, notificacionPermitidaParaUsuario } from './notifPermisos';
import type { ModuleKey } from '@/modules/usuarios/permisos.repository';

describe('moduloDeNotificacion', () => {
  it('extrae el módulo desde el link con hash', () => {
    expect(moduloDeNotificacion({ link: '#/app/retenciones', title: 'Comprobante', message: '' })).toBe('retenciones');
    expect(moduloDeNotificacion({ link: '#/app/pedidos', title: 'Nueva OC', message: '' })).toBe('compras');
    expect(moduloDeNotificacion({ link: '#/app/pedidos?tab=servicios', title: 'Servicio', message: '' })).toBe('compras');
    expect(moduloDeNotificacion({ link: '#/app/inventario', title: 'Aviso', message: '' })).toBe('inventario');
    expect(moduloDeNotificacion({ link: '#/app/combustible', title: 'Tanque bajo', message: '' })).toBe('combustible');
  });

  it('la Revisión de Almacén (dentro de Pedidos o por su atajo) es de Inventario, no de Compras', () => {
    expect(moduloDeNotificacion({ link: '#/app/pedidos?tab=almacen', title: 'Nueva solicitud', message: '' })).toBe('inventario');
    expect(moduloDeNotificacion({ link: '#/app/solicitudes', title: 'Pedido', message: '' })).toBe('inventario');
    expect(moduloDeNotificacion({ link: '#/app/solicitudes-almacen', title: 'Pedido', message: '' })).toBe('inventario');
  });

  it('el chat de una orden es de Compras y de Tesorería', () => {
    const chat = { link: '#/app/pedidos', title: '💬 Mensaje en OC-0012', message: 'Ana: ya pagué' };
    expect(modulosDeNotificacion(chat)).toEqual(['compras', 'tesoreria']);
    expect(modulosDeNotificacion({ link: '#/app/pedidos', title: 'Orden aprobada', message: '' })).toEqual(['compras']);
    expect(modulosDeNotificacion({ link: null, title: 'Sistema actualizado', message: '' })).toEqual([]);
  });

  it('extrae el módulo desde el link sin hash', () => {
    expect(moduloDeNotificacion({ link: '/app/tesoreria', title: 'Pago', message: '' })).toBe('tesoreria');
    expect(moduloDeNotificacion({ link: '/app/ventas', title: 'Factura', message: '' })).toBe('ventas');
  });

  it('infiere el módulo por texto si no hay link', () => {
    expect(moduloDeNotificacion({ link: null, title: 'Retención de IVA aplicada', message: 'Comprobante emitido' })).toBe('retenciones');
    expect(moduloDeNotificacion({ link: null, title: 'Stock crítico', message: 'Falta aceite en almacén' })).toBe('inventario');
    expect(moduloDeNotificacion({ link: null, title: 'Orden de compra aprobada', message: 'Listo para recibir' })).toBe('compras');
    expect(moduloDeNotificacion({ link: null, title: 'Nómina pagada', message: 'Transferencia realizada' })).toBe('rrhh');
    expect(moduloDeNotificacion({ link: null, title: 'Combustible bajo', message: 'Tanque general bajo' })).toBe('combustible');
  });

  it('devuelve null si es una notificación general del sistema', () => {
    expect(moduloDeNotificacion({ link: null, title: 'Sistema actualizado', message: 'Versión 2.5 desplegada' })).toBeNull();
    expect(moduloDeNotificacion({ link: null, title: 'Mantenimiento programado', message: 'A las 11:00 PM' })).toBeNull();
  });
});

describe('notificacionPermitidaParaUsuario', () => {
  const soloRetenciones = (mod: ModuleKey) => mod === 'retenciones';
  const soloPedidosEInventario = (mod: ModuleKey) => mod === 'compras' || mod === 'inventario';
  // Tesorería / Recepción / Impuestos: conservan el viejo `pedidos` (base) pero no tienen Compras.
  const baseSinCompras = (mod: ModuleKey) => mod === 'pedidos' || mod === 'solicitud_pedido' || mod === 'tesoreria';
  const sinPermisos = (_mod: ModuleKey) => false;

  it('administrador ve absolutamente todas las notificaciones', () => {
    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/retenciones', title: 'Retención', message: '', destino: 'all' },
      sinPermisos,
      true,
    )).toBe(true);

    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/inventario', title: 'Stock crítico', message: '', destino: 'admin' },
      sinPermisos,
      true,
    )).toBe(true);
  });

  it('usuario con solo RETENCIONES solo ve notificaciones de retenciones', () => {
    // Retención permitida por link
    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/retenciones', title: 'Comprobante SENIAT', message: 'Retención generada', destino: 'all' },
      soloRetenciones,
      false,
    )).toBe(true);

    // Retención permitida por texto
    expect(notificacionPermitidaParaUsuario(
      { link: null, title: 'Retención declarada', message: 'Listo en portal fiscal', destino: 'all' },
      soloRetenciones,
      false,
    )).toBe(true);

    // Bloqueadas: Inventario, Compras, Combustible
    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/inventario', title: 'Stock crítico', message: '', destino: 'all' },
      soloRetenciones,
      false,
    )).toBe(false);

    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/pedidos', title: 'OC Aprobada', message: '', destino: 'all' },
      soloRetenciones,
      false,
    )).toBe(false);

    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/combustible', title: 'Combustible bajo', message: '', destino: 'all' },
      soloRetenciones,
      false,
    )).toBe(false);
  });

  it('oculta notificaciones destinadas exclusivamente a admin si el usuario no es admin', () => {
    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/retenciones', title: 'Aviso confidencial', message: '', destino: 'admin' },
      soloRetenciones,
      false,
    )).toBe(false);
  });

  it('usuario con pedidos e inventario ve ambas pero no retenciones', () => {
    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/pedidos', title: 'OC Lista', message: '', destino: 'all' },
      soloPedidosEInventario,
      false,
    )).toBe(true);

    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/inventario', title: 'Material recibido', message: '', destino: 'all' },
      soloPedidosEInventario,
      false,
    )).toBe(true);

    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/retenciones', title: 'Retención', message: '', destino: 'all' },
      soloPedidosEInventario,
      false,
    )).toBe(false);
  });

  it('con el viejo `pedidos` (base) pero sin Compras, no le llegan los avisos de Compras; el chat y Tesorería sí', () => {
    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/pedidos', title: 'Orden aprobada: SP-0001', message: '', destino: 'all' },
      baseSinCompras,
      false,
    )).toBe(false);

    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/pedidos', title: '💬 Mensaje en OC-0012', message: 'Compras: ¿ya salió el pago?', destino: 'all' },
      baseSinCompras,
      false,
    )).toBe(true);

    expect(notificacionPermitidaParaUsuario(
      { link: '#/app/tesoreria', title: 'OC enviada para pagar', message: '', destino: 'all' },
      baseSinCompras,
      false,
    )).toBe(true);
  });

  it('notificaciones globales del sistema sin módulo son visibles para todos', () => {
    expect(notificacionPermitidaParaUsuario(
      { link: null, title: 'Aviso del sistema', message: 'Servidor operativo', destino: 'all' },
      soloRetenciones,
      false,
    )).toBe(true);
  });
});
