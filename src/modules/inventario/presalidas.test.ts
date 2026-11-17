import { describe, expect, it } from 'vitest';
import {
  desempaquetarPreSalidaPng,
  empaquetarPreSalidaPng,
  filtrarPreSalidas,
  mensajePreSalidaWhatsapp,
  siguienteCodigoPreSalida,
  validarPreSalida,
  type PreSalida,
} from './presalidas';

describe('presalidas de inventario (flujo MGG en vista teléfono)', () => {
  it('genera correlativos de pre-salida correctamente', () => {
    expect(siguienteCodigoPreSalida([], 2026)).toBe('PRE-2026-0001');
    expect(siguienteCodigoPreSalida([{ codigo: 'PRE-2026-0001' }], 2026)).toBe('PRE-2026-0002');
    expect(siguienteCodigoPreSalida([{ codigo: 'PRE-2026-0009' }, { codigo: 'PRE-2026-0010' }], 2026)).toBe('PRE-2026-0011');
    expect(siguienteCodigoPreSalida([{ codigo: 'PRE-0045' }], 2026)).toBe('PRE-2026-0046');
  });

  it('valida la pre-salida antes de guardar', () => {
    expect(validarPreSalida({ lineas: [], motivo: 'Prueba' })).toMatch(/al menos un material/);
    expect(validarPreSalida({ lineas: [{ cantidad: 0, productoNombre: 'Tornillo' }], motivo: 'Prueba' })).toMatch(/cantidad válida/);
    expect(validarPreSalida({ lineas: [{ cantidad: 5, productoNombre: 'Tornillo' }], motivo: '' })).toMatch(/motivo/);
    expect(validarPreSalida({ lineas: [{ cantidad: 5, productoNombre: 'Tornillo' }], motivo: 'Mantenimiento' })).toBeNull();
  });

  it('arma el mensaje de WhatsApp para el grupo de autorización idéntico a MGG', () => {
    const pre: PreSalida = {
      id: 'p1',
      codigo: 'PRE-2026-0005',
      almacen: 'General',
      motivo: 'Cambio de filtros Payloader 966',
      retorna: false,
      equipo: { id: 'eq1', nombre: 'PAYLOADER 966' },
      tipoMant: 'Preventivo',
      lineas: [
        { productoId: '1', productoNombre: 'FILTRO DE ACEITE', sku: 'FIL-01', unidad: 'UND', cantidad: 2 },
        { productoId: '2', productoNombre: 'ACEITE 15W40', sku: 'LUB-01', unidad: 'CUÑETE', cantidad: 1 },
      ],
      estado: 'pendiente',
      actor: 'carlos@gt.com',
      actorName: 'Carlos Almacén',
      createdAt: '2026-11-17T10:00:00.000Z',
      updatedAt: '2026-11-17T10:00:00.000Z',
    };

    const msg = mensajePreSalidaWhatsapp(pre, 'Carlos Almacén');
    expect(msg).not.toContain('\uFE0F');
    expect(msg).toContain('⏳ *SOLICITUD DE SALIDA DE ALMACÉN (POR AUTORIZAR)*');
    expect(msg).toContain('PRE-2026-0005');
    expect(msg).toContain('Inventario Los Pinos');
    expect(msg).toContain('• FILTRO DE ACEITE: 2 UND');
    expect(msg).toContain('• ACEITE 15W40: 1 CUÑETE');
    expect(msg).toContain('Cambio de filtros Payloader 966');
    expect(msg).toContain('PAYLOADER 966 (Preventivo)');
    expect(msg).toContain('❌ *Retorna:* NO (consumo)');
    expect(msg).toContain('Carlos Almacén');
    expect(msg).toContain('Favor responder a este mensaje indicando si está APROBADA');
  });

  it('soporta materiales con retorno y empaque PNG sin pérdida de UTF-8', () => {
    const pre: PreSalida = {
      id: 'p2',
      codigo: 'PRE-2026-0006',
      almacen: 'Depósito Mina',
      motivo: 'Reparación bomba · cigüeñal',
      retorna: true,
      lineas: [{ productoId: '1', productoNombre: 'JUEGOS DE CONCHAS DE BANCADA A 0.25', sku: 'HER-01', unidad: 'UND', cantidad: 5 }],
      estado: 'pendiente',
      actor: 'pedro@gt.com',
      actorName: 'José Pérez',
      createdAt: '2026-11-17T10:00:00.000Z',
      updatedAt: '2026-11-17T10:00:00.000Z',
    };
    const msg = mensajePreSalidaWhatsapp(pre);
    expect(msg).toContain('🔄 *Retorna:* SÍ (temporal)');

    const pngBytes = empaquetarPreSalidaPng(pre);
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50); // 'P'
    expect(pngBytes[2]).toBe(0x4e); // 'N'
    expect(pngBytes[3]).toBe(0x47); // 'G'
    const recuperada = desempaquetarPreSalidaPng(pngBytes);
    expect(recuperada?.codigo).toBe('PRE-2026-0006');
    expect(recuperada?.motivo).toBe('Reparación bomba · cigüeñal');
    expect(recuperada?.actorName).toBe('José Pérez');
  });

  it('filtra pre-salidas por código, material o motivo', () => {
    const lista: PreSalida[] = [
      {
        id: '1', codigo: 'PRE-2026-0001', almacen: 'General', motivo: 'Taller', retorna: false,
        lineas: [{ productoId: 'p1', productoNombre: 'BOMBA DE AGUA', sku: 'BOM-01', unidad: 'UND', cantidad: 1 }],
        estado: 'pendiente', actor: 'a', actorName: 'Juan', createdAt: '', updatedAt: '',
      },
      {
        id: '2', codigo: 'PRE-2026-0002', almacen: 'General', motivo: 'Planta trituración', retorna: false,
        lineas: [{ productoId: 'p2', productoNombre: 'CORREA C-120', sku: 'COR-01', unidad: 'UND', cantidad: 3 }],
        estado: 'pendiente', actor: 'b', actorName: 'Pedro', createdAt: '', updatedAt: '',
      },
    ];

    expect(filtrarPreSalidas(lista, 'bomba')).toHaveLength(1);
    expect(filtrarPreSalidas(lista, 'bomba')[0].codigo).toBe('PRE-2026-0001');
    expect(filtrarPreSalidas(lista, 'correa')).toHaveLength(1);
    expect(filtrarPreSalidas(lista, 'trituracion')).toHaveLength(1);
    expect(filtrarPreSalidas(lista, '0002')).toHaveLength(1);
    expect(filtrarPreSalidas(lista, 'inexistente')).toHaveLength(0);
  });
});
