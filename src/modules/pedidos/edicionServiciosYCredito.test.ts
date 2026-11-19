import { describe, expect, test } from 'vitest';
import type { Orden } from '@/shared/lib/types';
import type { ServicioDirecto } from './serviciosDirectos.repository';
import { puedeEditarOrdenCompleta, puedeEditarPreciosOrden } from './pedidos.repository';
import {
  extraerCuentasCreditoCompras,
  filtrarCuentasCreditoCompras,
  resumenCompras,
  CAMPOS_DETALLE_POR_AMBITO,
  type ContextoCompras,
} from './comprasMoldeable';
import { textoWhatsappCompras } from './whatsappCompras';
import { construirComprasExcel, construirComprasPdf, type MetadatosExportacionCompras } from './exportarComprasMoldeable';

function makeOrden(over: Partial<Orden> = {}): Orden {
  return {
    id: 'ord-1',
    codigo: 'SP-2026-0001',
    oc_codigo: 'OC-2026-0001',
    estado: 'oc_creada',
    tipo: 'producto',
    proveedor_id: 'prov-1',
    unidad_solicitante: 'MINA',
    items: [{ sku: 'SKU-1', nombre: 'Repuesto', cantidad: 1, precio: 100, comprar: true }],
    total: 100,
    total_moneda: 'USD',
    abonado_total: 0,
    created_at: '2026-11-05T15:11:00Z',
    ...over,
  } as unknown as Orden;
}

describe('Edición completa y de precios en órdenes de servicio vs producto', () => {
  test('en órdenes de servicio permite editar todo y precios en cuenta_abierta y demás estados activos, salvo cancelada', () => {
    const estadosActivos: Orden['estado'][] = [
      'pendiente',
      'aprobada',
      'oc_creada',
      'confirmada_metodo',
      'oc_aprobada',
      'cuenta_abierta',
      'por_recibir',
      'pagada',
      'recibida',
      'finalizada',
    ];
    for (const estado of estadosActivos) {
      const srv = makeOrden({
        tipo: 'servicio',
        codigo: 'SS-2026-0062',
        oc_codigo: 'CS-2026-0028',
        estado,
        total: 240,
        abonado_total: 120,
      });
      expect(puedeEditarOrdenCompleta(srv)).toBe(true);
      expect(puedeEditarPreciosOrden(srv)).toBe(true);
    }

    const cancelada = makeOrden({ tipo: 'servicio', estado: 'cancelada', total: 240 });
    expect(puedeEditarOrdenCompleta(cancelada)).toBe(false);
    expect(puedeEditarPreciosOrden(cancelada)).toBe(false);
  });

  test('en órdenes de producto mantiene las restricciones originales por etapa', () => {
    expect(puedeEditarOrdenCompleta(makeOrden({ tipo: 'producto', estado: 'oc_creada' }))).toBe(true);
    expect(puedeEditarOrdenCompleta(makeOrden({ tipo: 'producto', estado: 'cuenta_abierta' }))).toBe(false);
    expect(puedeEditarOrdenCompleta(makeOrden({ tipo: 'producto', estado: 'pagada' }))).toBe(false);

    expect(puedeEditarPreciosOrden(makeOrden({ tipo: 'producto', estado: 'oc_aprobada', total: 100 }))).toBe(true);
    expect(puedeEditarPreciosOrden(makeOrden({ tipo: 'producto', estado: 'cuenta_abierta', total: 100 }))).toBe(false);
  });
});

describe('Reporte dinámico de Compras · Cuentas a crédito desde Compras (OC y OS)', () => {
  const ctx: ContextoCompras = {
    tasaBcv: 50,
    categoriasPorSku: new Map(),
    nombreProveedor: new Map([
      ['prov-oc', 'FERRETERIA BOLIVAR'],
      ['prov-os', 'JOSE GARCIA'],
    ]),
  };

  const ocCredito = makeOrden({
    id: 'oc-cred-1',
    tipo: 'producto',
    codigo: 'SP-2026-0110',
    oc_codigo: 'OC-2026-0210',
    estado: 'cuenta_abierta',
    proveedor_id: 'prov-oc',
    unidad_solicitante: 'MINA',
    total: 300,
    abonado_total: 50,
    items: [{ sku: 'ROD-01', nombre: 'Rodamiento SKF', cantidad: 2, precio: 150, comprar: true }],
  });

  const osCredito = makeOrden({
    id: 'os-cred-1',
    tipo: 'servicio',
    codigo: 'SS-2026-0062',
    oc_codigo: 'CS-2026-0028',
    estado: 'cuenta_abierta',
    proveedor_id: 'prov-os',
    unidad_solicitante: 'PRODUCCION',
    total: 240,
    abonado_total: 120,
    items: [{ sku: 'SRV-01', nombre: 'Reparación contadores de combustible', cantidad: 1, precio: 240, comprar: true, es_servicio: true }],
  });

  const sdCredito = {
    id: 'sd-cred-1',
    codigo: 'SD-2026-0045',
    estado: 'por_pagar',
    con_abonos: true,
    gasto: 100,
    abonado_total: 40,
    moneda: 'USD',
    proveedor_id: null,
    proveedor_nombre: 'TALLER EL CALLAO',
    unidad_solicitante: 'TALLER',
    descripcion: 'Rectificación de cabezote',
    items: [{ descripcion: 'Rectificación de cabezote', cantidad: 1, unidad: 'SERV', gasto: 100 }],
    created_at: '2026-11-10T12:00:00Z',
  } as unknown as ServicioDirecto;

  const gastoFijoAdmin = {
    ...sdCredito,
    id: 'sd-admin-1',
    codigo: 'GF-2026-0001',
    empresa_clave: 'GT',
  } as unknown as ServicioDirecto;

  test('extrae cuentas a crédito OC y OS excluyendo gastos fijos de administración y calcula saldos exactos', () => {
    const cuentas = extraerCuentasCreditoCompras([ocCredito, osCredito], [sdCredito, gastoFijoAdmin], ctx);
    expect(cuentas).toHaveLength(3);

    const resumen = resumenCompras([], [], [], 50, cuentas);
    expect(resumen.creditoCount).toBe(3);
    expect(resumen.creditoOcCount).toBe(1);
    expect(resumen.creditoOsCount).toBe(2);
    expect(resumen.creditoTotalUsd).toBe(640); // 300 + 240 + 100
    expect(resumen.creditoAbonadoUsd).toBe(210); // 50 + 120 + 40
    expect(resumen.creditoSaldoUsd).toBe(430); // 250 + 120 + 60
    expect(resumen.creditoSaldoBs).toBe(21500); // 430 * 50

    // Filtro por departamento
    const soloProduccion = filtrarCuentasCreditoCompras(cuentas, { departamentosSel: ['PRODUCCION'] });
    expect(soloProduccion).toHaveLength(1);
    expect(soloProduccion[0].origen).toBe('OS');
    expect(soloProduccion[0].codigo).toBe('CS-2026-0028');
  });

  test('incluye el desglose de cuentas a crédito OC y OS en el mensaje de WhatsApp', () => {
    const cuentas = extraerCuentasCreditoCompras([ocCredito, osCredito], [sdCredito], ctx);
    const resumen = resumenCompras([], [], [], 50, cuentas);
    const wsp = textoWhatsappCompras(resumen, {
      desde: '2026-11-01',
      hasta: '2026-11-19',
      mostrarUsd: true,
      mostrarBs: true,
      tasaBcv: 50,
    });

    expect(wsp).toContain('Cuentas a crédito · Compras (3 · 1 OC + 2 OS)');
    expect(wsp).toContain('[OC] OC-2026-0210 (SP-2026-0110)');
    expect(wsp).toContain('FERRETERIA BOLIVAR');
    expect(wsp).toContain('[OS] CS-2026-0028 (SS-2026-0062)');
    expect(wsp).toContain('JOSE GARCIA');
    expect(wsp).toContain('[OS] SD-2026-0045');
    expect(wsp).toContain('Saldo pendiente por pagar:');
  });

  test('genera PDF (Resumen, Detallado, Consolidado) y Excel incluyendo las cuentas a crédito OC y OS', async () => {
    const cuentas = extraerCuentasCreditoCompras([ocCredito, osCredito], [sdCredito], ctx);
    const resumen = resumenCompras([], [], [], 50, cuentas);
    const metaBase: MetadatosExportacionCompras = {
      desde: '2026-11-01',
      hasta: '2026-11-19',
      ambito: 'ordenes',
      agrupacion: 'detallado',
      formato: 'hibrido',
      mostrarUsd: true,
      mostrarBs: true,
      tasaBcv: 50,
    };

    for (const formato of ['resumen', 'detallado', 'hibrido'] as const) {
      const doc = await construirComprasPdf([], resumen, CAMPOS_DETALLE_POR_AMBITO.ordenes, { ...metaBase, formato });
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    }

    const excelBytes = await construirComprasExcel([], resumen, CAMPOS_DETALLE_POR_AMBITO.ordenes, metaBase);
    expect(excelBytes.byteLength).toBeGreaterThan(0);
  }, 20000);
});
