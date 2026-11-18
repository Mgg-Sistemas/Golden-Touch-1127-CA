import { describe, expect, it } from 'vitest';
import {
  generarReporteContableDinamico, calcularRangoPreset, CAMPOS_REPORTE_CONTABLE,
  type FuenteReporteContable, type ConfiguracionFiltroContable,
} from './reporteContableDinamico';
import type { ContComprobante, ContComprobanteLinea, ContCuenta } from '../tipos';

describe('Motor de Reporte Dinámico Contable', () => {
  const cuentasMock: ContCuenta[] = [
    {
      id: 'cta-1', empresa_clave: 'GT', codigo: '1.1.01.01.001', nombre: 'Caja Principal',
      nivel: 5, padre_id: 'cta-padre', clase: 'activo', naturaleza: 'deudora', es_movimiento: true,
      exige_centro_costo: false, exige_auxiliar: false, tipo_auxiliar: null, moneda: null,
      es_monetaria: true, rubro: 'efectivo', activa: true, notas: null, created_at: '', created_by: null,
    },
    {
      id: 'cta-2', empresa_clave: 'GT', codigo: '2.1.01.01.001', nombre: 'Proveedores Nacionales',
      nivel: 5, padre_id: 'cta-padre-2', clase: 'pasivo', naturaleza: 'acreedora', es_movimiento: true,
      exige_centro_costo: false, exige_auxiliar: true, tipo_auxiliar: 'proveedor', moneda: null,
      es_monetaria: true, rubro: 'cuentas_por_pagar', activa: true, notas: null, created_at: '', created_by: null,
    },
  ];

  const comprobantesMock: ContComprobante[] = [
    {
      id: 'cbte-1', empresa_clave: 'GT', ejercicio_id: 'ej-2026', tipo_id: 'tipo-01', periodo_id: 'per-2026-10',
      numero: 1, codigo: '10-000001', fecha: '2026-10-15', concepto: 'Pago factura proveedor A',
      moneda_documento: 'USD', tasa: 40, origen_ref: 'FAC-001', origen: 'automatico', origen_modulo: 'compras',
      origen_tabla: null, origen_id: null, numero_lote: null, modificado: false, regla_id: null,
      total_debe_ves: 4000, total_haber_ves: 4000, total_debe_usd: 100, total_haber_usd: 100,
      reverso_de_id: null, estado: 'contabilizado', created_by: 'sistema', updated_by: null,
      created_at: '2026-10-15T10:00:00Z', updated_at: null, historial: [],
    },
    {
      id: 'cbte-2', empresa_clave: 'GT', ejercicio_id: 'ej-2026', tipo_id: 'tipo-09', periodo_id: 'per-2026-10',
      numero: 2, codigo: '10-000002', fecha: '2026-10-20', concepto: 'Ajuste de caja',
      moneda_documento: 'VES', tasa: 40, origen_ref: null, origen: 'manual', origen_modulo: null,
      origen_tabla: null, origen_id: null, numero_lote: null, modificado: false, regla_id: null,
      total_debe_ves: 0, total_haber_ves: 0, total_debe_usd: 0, total_haber_usd: 0,
      reverso_de_id: null, estado: 'contabilizado', created_by: 'usuario', updated_by: null,
      created_at: '2026-10-20T10:00:00Z', updated_at: null, historial: [],
    },
  ];

  const lineasMock: ContComprobanteLinea[] = [
    {
      id: 'lin-1', comprobante_id: 'cbte-1', renglon: 1, cuenta_id: 'cta-2',
      centro_costo_id: null, auxiliar_id: 'aux-1', descripcion: 'Cargo pasivo', referencia: 'FAC-001',
      moneda: 'USD', monto_moneda: 100, tasa: 40, debe_ves: 4000, haber_ves: 0,
      debe_usd: 100, haber_usd: 0, fecha_referencia: null,
    },
    {
      id: 'lin-2', comprobante_id: 'cbte-1', renglon: 2, cuenta_id: 'cta-1',
      centro_costo_id: null, auxiliar_id: null, descripcion: 'Salida de caja', referencia: null,
      moneda: 'USD', monto_moneda: 100, tasa: 40, debe_ves: 0, haber_ves: 4000,
      debe_usd: 0, haber_usd: 100, fecha_referencia: null,
    },
  ];

  const fuente: FuenteReporteContable = {
    comprobantes: comprobantesMock,
    lineas: lineasMock,
    cuentas: cuentasMock,
    centros: [{ id: 'cen-1', empresa_clave: 'GT', codigo: 'OP-01', nombre: 'Planta Mina', padre_id: null, tipo: 'area', origen_clave: null, activo: true }],
    auxiliares: [{ id: 'aux-1', empresa_clave: 'GT', tipo: 'proveedor', codigo: 'PRV-01', nombre: 'Ferretería Industrial', rif: 'J-12345678-9', origen_tabla: null, origen_id: null, activo: true }],
    tipos: [{ id: 'tipo-01', codigo: '01', nombre: 'Cheques', origen: 'ambos', activo: true, sistema: false }],
  };

  it('catálogo de columnas disponibles está debidamente definido', () => {
    expect(CAMPOS_REPORTE_CONTABLE.length).toBeGreaterThan(10);
    expect(CAMPOS_REPORTE_CONTABLE.some((c) => c.clave === 'debe_ves')).toBe(true);
    expect(CAMPOS_REPORTE_CONTABLE.some((c) => c.clave === 'haber_usd')).toBe(true);
  });

  it('filtra y calcula totales con partida doble cuadrada', () => {
    const config: ConfiguracionFiltroContable = {
      empresaClave: 'GT',
      desde: '2026-10-01',
      hasta: '2026-10-31',
      agrupacion: 'comprobante',
      columnasVisibles: ['fecha', 'comprobante', 'cuenta_codigo', 'debe_ves', 'haber_ves'],
      monedaVista: 'todas',
    };

    const reporte = generarReporteContableDinamico(fuente, config);

    expect(reporte.filas.length).toBe(2);
    expect(reporte.resumen.totalComprobantes).toBe(1);
    expect(reporte.resumen.totalDebeVes).toBe(4000);
    expect(reporte.resumen.totalHaberVes).toBe(4000);
    expect(reporte.resumen.totalDebeUsd).toBe(100);
    expect(reporte.resumen.totalHaberUsd).toBe(100);
    expect(reporte.resumen.cuadra).toBe(true);
  });

  it('agrupa por cuenta contable correctamente', () => {
    const config: ConfiguracionFiltroContable = {
      empresaClave: 'GT',
      desde: '2026-10-01',
      hasta: '2026-10-31',
      agrupacion: 'cuenta',
      columnasVisibles: ['fecha', 'comprobante', 'debe_ves', 'haber_ves'],
      monedaVista: 'todas',
    };

    const reporte = generarReporteContableDinamico(fuente, config);

    expect(reporte.grupos.length).toBe(2);
    expect(reporte.grupos.some((g) => g.clave === '1.1.01.01.001')).toBe(true);
    expect(reporte.grupos.some((g) => g.clave === '2.1.01.01.001')).toBe(true);
  });

  it('ignora comprobantes de otra empresa (aislamiento estricto)', () => {
    const config: ConfiguracionFiltroContable = {
      empresaClave: 'GL',
      desde: '2026-10-01',
      hasta: '2026-10-31',
      agrupacion: 'comprobante',
      columnasVisibles: ['fecha', 'comprobante'],
      monedaVista: 'todas',
    };

    const reporte = generarReporteContableDinamico(fuente, config);
    expect(reporte.filas.length).toBe(0);
    expect(reporte.resumen.totalComprobantes).toBe(0);
  });

  it('calcula los rangos de presets de período', () => {
    const p1 = calcularRangoPreset('este_ano');
    expect(p1.desde).toMatch(/^\d{4}-01-01$/);
    const p2 = calcularRangoPreset('mes_actual');
    expect(p2.desde).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
