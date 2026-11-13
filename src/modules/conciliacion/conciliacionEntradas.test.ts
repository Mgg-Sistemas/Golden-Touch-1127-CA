import { describe, expect, it } from 'vitest';
import type { FilaConciliacion } from './conciliacion';
import {
  extraerCodigoOc,
  extraerCuentaBanco,
  extraerEntradasDrive,
  extraerFacturas,
  extraerProveedor,
  extraerReferencia,
  extraerTipoRetencion,
  indicadoresEntradas,
  obtenerOrdenesEsperandoReintegro,
  parsearFecha,
  type FilaConciliacionEntrada,
} from './conciliacionEntradas';
import type { Orden } from '@/shared/lib/types';
import type { CamposRetencionesCompras } from '@/modules/pedidos/retencionesCompras';

const filaSalidaMock = (p: Partial<FilaConciliacion> & { codigo: string }): FilaConciliacion => ({
  item: 1,
  ordenId: p.codigo,
  origen: 'oc',
  tipo: 'compra',
  proveedor: 'PROVEEDOR MOCK',
  estado: 'pagada',
  estadoLabel: 'Pagada',
  estadoClase: 'success',
  fecha: '2026-11-01',
  monedaOc: 'Bs',
  totalUsd: 100,
  totalBs: 5000,
  tasa: 50,
  fuenteTasa: 'pago',
  pagada: true,
  fechaPago: '2026-11-02',
  pagadoUsd: 100,
  pagadoBs: 5000,
  referencias: [],
  referenciaManual: null,
  comprobantesTesoreria: [],
  comprobantesConciliacion: [],
  facturas: 1,
  facturaPrincipal: null,
  llevaRetencion: true,
  retenciones: [{ tipo: 'ISAE', comprobante: '001' }],
  anulada: false,
  drive: null,
  ...p,
});

describe('Conciliación Entradas · Extracción de Código de Orden (OC / ODC)', () => {
  it("extrae 'ODC 181 GT' cuando hay ODC compartida entre empresas 'ODC 236 MGG Y ODC 181 GT'", () => {
    const texto =
      'REINTEGRO DE RETENCION DE ISAE + IVA SEGUN FACTURA #00003010 SUPER HOME CORRESPONDIENTE A ODC 236 MGG Y ODC 181 GT';
    expect(extraerCodigoOc(texto)).toBe('ODC 181 GT');
  });

  it("convierte 'ODC 201' al formato estándar 'OC-2026-0201'", () => {
    expect(extraerCodigoOc('REINTEGRO RETENCION ISLR SUPER HOME ODC 201')).toBe('OC-2026-0201');
    expect(extraerCodigoOc('ODC 83')).toBe('OC-2026-0083');
  });

  it('respeta códigos ya formateados como OC-2026-0181 o CS-2026-0012', () => {
    expect(extraerCodigoOc('Reintegro OC-2026-0181')).toBe('OC-2026-0181');
    expect(extraerCodigoOc('Reintegro CS-2026-0012')).toBe('CS-2026-0012');
  });

  it('retorna null si no contiene código de orden', () => {
    expect(extraerCodigoOc('COBRO DE CLIENTE GENERICO')).toBeNull();
  });
});

describe('Conciliación Entradas · Extracción de Proveedores y Retenciones', () => {
  it('reconoce proveedores clave como SUPER HOME, AMLV CREATIVO, HIERRO SAN FELIX y TECNO PUNTO', () => {
    expect(extraerProveedor('REINTEGRO RETENCION SUPER HOME ODC 201')).toBe('SUPER HOME');
    expect(extraerProveedor('REINTEGRO ISAE + IVA AMLV CREATIVO REF 1234')).toBe('AMLV CREATIVO');
    expect(extraerProveedor('DESCUENTO COMPRA HIERRO SAN FELIX ODC 150')).toBe('HIERRO SAN FELIX');
    expect(extraerProveedor('REINTEGRO TECNO PUNTO ODC 83')).toBe('TECNO PUNTO');
  });

  it('extrae el proveedor por patrón entre factura y correspondiente/odc', () => {
    const texto = 'REINTEGRO SEGUN FACTURA #1234 FERRETERIA BOLIVAR CORRESPONDIENTE A ODC 99';
    expect(extraerProveedor(texto)).toBe('FERRETERIA BOLIVAR');
  });

  it('extrae tipos de retención y descuentos combinados', () => {
    expect(extraerTipoRetencion('REINTEGRO DE RETENCION DE ISAE + IVA SEGUN FACTURA')).toBe('ISAE + IVA');
    expect(extraerTipoRetencion('REINTEGRO ISLR + ISAE + IVA TECNO PUNTO')).toBe('ISLR + ISAE + IVA');
    expect(extraerTipoRetencion('DESCUENTO COMPRA HIERRO SAN FELIX')).toBe('Descuento compra');
    expect(extraerTipoRetencion('REINTEGRO RETENCION ISLR SUPER HOME')).toBe('ISLR');
    expect(extraerTipoRetencion('REINTEGRO RETENCION')).toBe('Retención');
  });

  it('extrae facturas con y sin hashtag', () => {
    expect(
      extraerFacturas('REINTEGRO SEGUN FACTURA #00003010 SUPER HOME Y #00322'),
    ).toEqual(['#00003010', '#00322']);
    expect(extraerFacturas('FACTURA 123456')).toEqual(['#123456']);
  });

  it('extrae referencias bancarias y banco', () => {
    expect(extraerReferencia('TRANSF BANESCO REF: 88776655 REINTEGRO')).toBe('88776655');
    expect(extraerReferencia('', '12345678')).toBe('12345678');
    expect(extraerCuentaBanco('ENTRADA BANESCO')).toBe('Banesco');
    expect(extraerCuentaBanco('PAGO MOVIL BANCO DE VENEZUELA')).toBe('Banco de Venezuela');
    expect(extraerCuentaBanco('TRANSFERENCIA BNC')).toBe('BNC');
  });

  it('parsea fechas en varios formatos incluyendo número serial de Excel', () => {
    expect(parsearFecha('2026-11-05')).toBe('2026-11-05');
    expect(parsearFecha('05/11/2026')).toBe('2026-11-05');
    expect(parsearFecha('05-11-2026')).toBe('2026-11-05');
    // 46332 serial de Excel aprox 6 de noviembre de 2026
    const fechaExcel = parsearFecha(46332);
    expect(fechaExcel).toMatch(/^2026-11-/);
  });
});

describe('extraerEntradasDrive · Procesamiento del Libro Mayor / Banco', () => {
  const salidas: FilaConciliacion[] = [
    filaSalidaMock({
      ordenId: 'ord-181',
      codigo: 'OC-2026-0181',
      proveedor: 'SUPER HOME',
      tasa: 50,
      pagadoBs: 4500,
    }),
    filaSalidaMock({
      ordenId: 'ord-201',
      codigo: 'OC-2026-0201',
      proveedor: 'SUPER HOME',
      tasa: 52,
      pagadoBs: 1200.5,
    }),
    filaSalidaMock({
      ordenId: 'ord-150',
      codigo: 'OC-2026-0150',
      proveedor: 'HIERRO SAN FELIX',
      tasa: 50,
    }),
    filaSalidaMock({
      ordenId: 'ord-083',
      codigo: 'OC-2026-0083',
      proveedor: 'TECNO PUNTO',
      tasa: 50,
    }),
  ];

  it('procesa filas de ENTRADA (RECIBO) y cruza con filasSalidas', () => {
    const matriz = [
      ['Banco Banesco - Octubre 2026'],
      ['Cuenta 0134-123456...'],
      ['Fecha', 'Banco', 'Movimiento', 'Concepto', 'Referencia', 'Monto Bs'],
      [
        '2026-11-05',
        'Banesco',
        'ENTRADA (RECIBO)',
        'REINTEGRO DE RETENCION DE ISAE + IVA SEGUN FACTURA #00003010 SUPER HOME CORRESPONDIENTE A ODC 236 MGG Y ODC 181 GT',
        '12345678',
        '4.500,00',
      ],
      [
        '2026-11-06',
        'Banesco',
        'SALIDA (PAGO)',
        'PAGO A PROVEEDOR ODC 181',
        '88776655',
        '10.000,00',
      ],
      [
        '2026-11-07',
        'BDV',
        'ENTRADA',
        'REINTEGRO RETENCION ISLR SUPER HOME ODC 201',
        '55443322',
        '1.200,50',
      ],
      [
        '2026-11-08',
        'Mercantil',
        'ENTRADA (RECIBO)',
        'DESCUENTO COMPRA HIERRO SAN FELIX SEGUN FACTURA #00322 ODC 150',
        '99887766',
        '850,00',
      ],
      [
        '2026-11-09',
        'BNC',
        'ENTRADA (RECIBO)',
        'REINTEGRO RETENCION ISLR + ISAE + IVA TECNO PUNTO ODC 83',
        '33221100',
        '600,00',
      ],
      [
        '2026-11-10',
        'Banesco',
        'ENTRADA (RECIBO)',
        'COBRO DE CLIENTE COORPORATIVO POR SERVICIOS',
        '77665544',
        '50.000,00',
      ],
    ];

    const entradas = extraerEntradasDrive(matriz, salidas);

    // Debe extraer 4 entradas (excluyendo la salida y el cobro no relacionado con reintegro/retención/descuento/GT)
    expect(entradas).toHaveLength(4);

    // 1. ODC 181 GT
    const e1 = entradas[0];
    expect(e1.codigoOc).toBe('ODC 181 GT');
    expect(e1.proveedor).toBe('SUPER HOME');
    expect(e1.tipoRetencion).toBe('ISAE + IVA');
    expect(e1.facturas).toEqual(['#00003010']);
    expect(e1.referencia).toBe('12345678');
    expect(e1.montoBs).toBe(4500);
    expect(e1.ordenId).toBe('ord-181');
    expect(e1.tasa).toBe(50);
    expect(e1.montoUsd).toBe(90);
    expect(e1.estado).toBe('reintegrado');
    expect(e1.drive?.estado).toBe('cuadra');
    expect(e1.cuentaBanco).toBe('Banesco');

    // 2. ODC 201 -> OC-2026-0201
    const e2 = entradas[1];
    expect(e2.codigoOc).toBe('OC-2026-0201');
    expect(e2.proveedor).toBe('SUPER HOME');
    expect(e2.tipoRetencion).toBe('ISLR');
    expect(e2.referencia).toBe('55443322');
    expect(e2.montoBs).toBe(1200.5);
    expect(e2.ordenId).toBe('ord-201');
    expect(e2.tasa).toBe(52);
    expect(e2.montoUsd).toBe(23.09);

    // 3. Descuento compra HIERRO SAN FELIX
    const e3 = entradas[2];
    expect(e3.codigoOc).toBe('OC-2026-0150');
    expect(e3.proveedor).toBe('HIERRO SAN FELIX');
    expect(e3.tipoRetencion).toBe('Descuento compra');
    expect(e3.facturas).toEqual(['#00322']);
    expect(e3.montoBs).toBe(850);
    expect(e3.ordenId).toBe('ord-150');

    // 4. TECNO PUNTO ODC 83 con ISLR + ISAE + IVA
    const e4 = entradas[3];
    expect(e4.codigoOc).toBe('OC-2026-0083');
    expect(e4.proveedor).toBe('TECNO PUNTO');
    expect(e4.tipoRetencion).toBe('ISLR + ISAE + IVA');
    expect(e4.montoBs).toBe(600);
    expect(e4.ordenId).toBe('ord-083');
  });

  it('ignora filas vacías o matrices inválidas', () => {
    expect(extraerEntradasDrive([], [])).toEqual([]);
    expect(extraerEntradasDrive([['sin datos']], [])).toEqual([]);
  });
});

describe('indicadoresEntradas', () => {
  it('calcula correctamente los indicadores de entradas, reintegros y montos equivalentes', () => {
    const filas: FilaConciliacionEntrada[] = [
      {
        item: 1,
        id: 'e-1',
        ordenId: 'ord-1',
        codigoOc: 'OC-2026-0001',
        proveedor: 'SUPER HOME',
        fechaReintegro: '2026-11-05',
        moneda: 'Bs',
        montoBs: 4500,
        montoUsd: 90,
        tasa: 50,
        referencia: '1234',
        cuentaBanco: 'Banesco',
        tipoRetencion: 'ISAE + IVA',
        facturas: ['#00003010'],
        motivo: 'Reintegro',
        estado: 'reintegrado',
        estadoLabel: 'Reintegrado',
        drive: { estado: 'cuadra', detalle: 'Cuadra', archivo: null, archivoPath: null, en: null, por: null },
      },
      {
        item: 2,
        id: 'e-2',
        ordenId: 'ord-2',
        codigoOc: 'OC-2026-0002',
        proveedor: 'SUPER HOME',
        fechaReintegro: '2026-11-07',
        moneda: 'Bs',
        montoBs: 1200.5,
        montoUsd: 24.01,
        tasa: 50,
        referencia: '5544',
        cuentaBanco: 'BDV',
        tipoRetencion: 'ISLR',
        facturas: [],
        motivo: 'Reintegro',
        estado: 'reintegrado',
        estadoLabel: 'Reintegrado',
        drive: { estado: 'cuadra', detalle: 'Cuadra', archivo: null, archivoPath: null, en: null, por: null },
      },
      {
        item: 3,
        id: 'e-3',
        ordenId: 'ord-3',
        codigoOc: 'OC-2026-0003',
        proveedor: 'AMLV CREATIVO',
        fechaReintegro: '',
        moneda: 'Bs',
        montoBs: 800,
        montoUsd: 16,
        tasa: 50,
        referencia: null,
        cuentaBanco: null,
        tipoRetencion: 'ISAE',
        facturas: [],
        motivo: 'Esperando reintegro',
        estado: 'esperando_reintegro',
        estadoLabel: 'Esperando reintegro',
        drive: null,
      },
    ];

    const ind = indicadoresEntradas(filas);

    expect(ind.totalEntradas.cantidad).toBe(3);
    expect(ind.totalEntradas.bs).toBe(6500.5);
    expect(ind.totalEntradas.usd).toBe(130.01);

    expect(ind.totalBsReintegrado).toBe(5700.5);
    expect(ind.totalUsdEquivalente).toBe(114.01);

    expect(ind.esperandoReintegro.cantidad).toBe(1);
    expect(ind.esperandoReintegro.bs).toBe(800);
    expect(ind.esperandoReintegro.usd).toBe(16);

    expect(ind.reintegrosCruzados.cantidad).toBe(2);
    expect(ind.reintegrosCruzados.bs).toBe(5700.5);
  });
});

describe('obtenerOrdenesEsperandoReintegro', () => {
  const ordenBase: Orden & CamposRetencionesCompras = {
    id: 'ord-10',
    codigo: 'SP-0010',
    oc_codigo: 'OC-2026-0010',
    proveedor_id: 'p-1',
    solicitante_email: 'test@gt.com',
    items: [],
    total: 1000,
    total_moneda: 'Bs',
    estado: 'pagada',
    historial: [],
    created_at: '2026-11-01T10:00:00Z',
    comprobante_tipo: 'factura',
    retencion_momento: 'despues_de_pagar',
    retencion_compras_total: 150,
    retencion_iva_monto: 100,
    retencion_iva_pct: 75,
    retencion_isae_monto: 50,
    retencion_isae_pct: 1,
  };

  const proveedores = new Map([['p-1', 'SUPER HOME']]);

  it("identifica órdenes con 'despues_de_pagar' que aún no han sido reintegradas", () => {
    const ordenes = [
      ordenBase,
      // Orden que retiene antes de pagar -> no espera reintegro
      {
        ...ordenBase,
        id: 'ord-11',
        oc_codigo: 'OC-2026-0011',
        retencion_momento: 'antes_de_pagar' as const,
      },
      // Orden cancelada -> se ignora
      {
        ...ordenBase,
        id: 'ord-12',
        oc_codigo: 'OC-2026-0012',
        estado: 'cancelada' as const,
      },
    ];

    const esperando = obtenerOrdenesEsperandoReintegro(ordenes, [], { proveedores });
    expect(esperando).toHaveLength(1);
    expect(esperando[0].ordenId).toBe('ord-10');
    expect(esperando[0].codigoOc).toBe('OC-2026-0010');
    expect(esperando[0].proveedor).toBe('SUPER HOME');
    expect(esperando[0].montoBs).toBe(150);
    expect(esperando[0].tipoRetencion).toBe('IVA + ISAE');
    expect(esperando[0].estado).toBe('esperando_reintegro');
    expect(esperando[0].estadoLabel).toBe('Esperando reintegro');
  });

  it('excluye órdenes que ya fueron reintegradas en el banco / Drive', () => {
    const yaReintegrada: FilaConciliacionEntrada = {
      item: 1,
      id: 'e-1',
      ordenId: 'ord-10',
      codigoOc: 'OC-2026-0010',
      proveedor: 'SUPER HOME',
      fechaReintegro: '2026-11-05',
      moneda: 'Bs',
      montoBs: 150,
      montoUsd: 3,
      tasa: 50,
      referencia: '1234',
      cuentaBanco: 'Banesco',
      tipoRetencion: 'ISAE + IVA',
      facturas: [],
      motivo: 'Reintegro',
      estado: 'reintegrado',
      estadoLabel: 'Reintegrado',
      drive: null,
    };

    const esperando = obtenerOrdenesEsperandoReintegro([ordenBase], [yaReintegrada], { proveedores });
    expect(esperando).toHaveLength(0);
  });
});
