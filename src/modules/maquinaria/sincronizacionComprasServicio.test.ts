import { describe, it, expect } from 'vitest';
import {
  codigosOrdenServicioEnOrdenCompra,
  ordenServicioDebeEliminarsePorCompras,
  ordenServicioMaquinariaHuerfana,
} from './sincronizacionComprasServicio';

describe('sincronizacionComprasServicio', () => {
  it('extrae códigos OS-AAAA-#### desde items y notas de la solicitud de servicio', () => {
    expect(
      codigosOrdenServicioEnOrdenCompra({
        tipo: 'servicio',
        items: [
          { sku: 'SRV-1', nombre: 'FILTRO', orden_servicio: 'os-2026-0045' },
          { sku: 'SRV-2', nombre: 'CORREA', orden_servicio: 'OS-2026-0045' },
        ],
        notas: 'Orden de servicio OS-2026-0045 · EXC-01.',
      }),
    ).toEqual(['OS-2026-0045']);

    expect(
      codigosOrdenServicioEnOrdenCompra({
        tipo: 'servicio',
        items: [{ sku: 'SRV-9', nombre: 'RECARGA DE GAS' }],
        notas: 'Recarga mensual de cocina',
      }),
    ).toEqual([]);
  });

  it('detecta cuándo una orden de Maquinaria debe eliminarse porque Compras canceló o eliminó la solicitud', () => {
    expect(
      ordenServicioDebeEliminarsePorCompras(
        { estado: 'repuestos', orden_compra_id: 'ss-1' },
        { estado: 'cancelada', eliminado_en: null },
      ),
    ).toBe(true);

    expect(
      ordenServicioDebeEliminarsePorCompras(
        { estado: 'repuestos', orden_compra_id: 'ss-1' },
        { estado: 'pendiente', eliminado_en: '2026-11-18T12:00:00Z' },
      ),
    ).toBe(true);

    expect(
      ordenServicioDebeEliminarsePorCompras(
        { estado: 'anulada', nota_cierre: 'Cancelada desde Compras (SS-2026-0012): sin presupuesto' },
        null,
      ),
    ).toBe(true);

    expect(
      ordenServicioDebeEliminarsePorCompras(
        { estado: 'repuestos', orden_compra_id: 'ss-1' },
        { estado: 'aprobada', eliminado_en: null },
      ),
    ).toBe(false);
  });

  it('marca como huérfana para cancelar una SS activa cuya OS ya fue eliminada en Control de Maquinaria', () => {
    const osVivas = new Set(['OS-2026-0001']);

    expect(
      ordenServicioMaquinariaHuerfana(
        {
          tipo: 'servicio',
          estado: 'pendiente',
          items: [{ nombre: 'FILTRO', orden_servicio: 'OS-2026-0099' }],
        },
        osVivas,
      ),
    ).toEqual({ cancelar: true, codigosEliminados: ['OS-2026-0099'] });

    // Si la OS sigue viva, no se cancela
    expect(
      ordenServicioMaquinariaHuerfana(
        {
          tipo: 'servicio',
          estado: 'pendiente',
          items: [{ nombre: 'FILTRO', orden_servicio: 'OS-2026-0001' }],
        },
        osVivas,
      ),
    ).toEqual({ cancelar: false, codigosEliminados: [] });

    // Si ya está pagada/finalizada o no proviene de Maquinaria, no se toca
    expect(
      ordenServicioMaquinariaHuerfana(
        {
          tipo: 'servicio',
          estado: 'pagada',
          items: [{ nombre: 'FILTRO', orden_servicio: 'OS-2026-0099' }],
        },
        osVivas,
      ),
    ).toEqual({ cancelar: false, codigosEliminados: [] });
  });
});
