/* El Cierre diario: períodos (día, semana, mes, rango), qué cuenta cada cifra y los formatos de salida. */
import { describe, it, expect, vi } from 'vitest';
import {
  calcularCierre, etiquetaPeriodo, fechaCaracas, horaCaracas, momentoImpresion, periodoDe, TITULOS_CIERRE,
  type FilaCierre,
} from './cierreDiario';
import { textoCierreDiarioWhatsapp } from './cierreDiarioWhatsapp';
import { construirCierreDiarioExcel } from './cierreDiarioExcel';
import { construirCierreDiarioPdf } from './cierreDiarioPdf';

vi.mock('@/shared/lib/reportePreview', () => ({ previewPdf: vi.fn(), previewExcelArchivo: vi.fn() }));

// 21/10/2026 08:45 a. m. en Venezuela (UTC-4) = 12:45 UTC.
const AHORA = new Date('2026-10-21T12:45:00Z');

const fila = (o: Partial<FilaCierre>): FilaCierre => ({
  id: Math.random().toString(36).slice(2), estado: 'pendiente', created_at: '2026-10-21T13:00:00Z',
  op_padre_id: null, oc_creada_en: null, oc_aprobada_en: null, aprobada_en: null, pagada_en: null,
  oc_codigo: null, codigo: 'SP-1', proveedor_id: null, total: 0, condiciones_pago: null, recibido_total: null, ...o,
} as FilaCierre);

describe('fechas de Venezuela', () => {
  it('a las 11 p. m. de Caracas sigue siendo el mismo día aunque en UTC ya sea el siguiente', () => {
    expect(fechaCaracas('2026-10-22T03:30:00Z')).toBe('2026-10-21');
    expect(fechaCaracas('2026-10-21T04:00:00Z')).toBe('2026-10-21');
    expect(fechaCaracas('2026-10-21T03:59:00Z')).toBe('2026-10-20');
  });
  it('una fecha sin hora no se corre, y lo vacío o inválido da vacío', () => {
    expect(fechaCaracas('2026-10-21')).toBe('2026-10-21');
    expect(fechaCaracas(null)).toBe('');
    expect(fechaCaracas('no es fecha')).toBe('');
  });
  it('la hora sale como 08:45 a. m. y el momento con la fecha', () => {
    expect(horaCaracas(AHORA)).toBe('08:45 a. m.');
    expect(horaCaracas(new Date('2026-10-21T19:05:00Z'))).toBe('03:05 p. m.');
    expect(momentoImpresion(AHORA)).toBe('21/10/2026 · 08:45 a. m.');
  });
});

describe('periodoDe', () => {
  it('día: ese día', () => {
    expect(periodoDe('dia', '2026-10-21')).toEqual({ modo: 'dia', desde: '2026-10-21', hasta: '2026-10-21' });
  });
  it('semana: de lunes a domingo, caiga donde caiga el día elegido', () => {
    // 21/10/2026 es miércoles
    expect(periodoDe('semana', '2026-10-21')).toMatchObject({ desde: '2026-10-19', hasta: '2026-10-25' });
    expect(periodoDe('semana', '2026-10-19')).toMatchObject({ desde: '2026-10-19', hasta: '2026-10-25' }); // lunes
    expect(periodoDe('semana', '2026-10-25')).toMatchObject({ desde: '2026-10-19', hasta: '2026-10-25' }); // domingo
  });
  it('semana que cruza de mes y de año', () => {
    expect(periodoDe('semana', '2026-12-31')).toMatchObject({ desde: '2026-12-28', hasta: '2027-01-03' });
  });
  it('mes: del 1 al último día (febrero bisiesto incluido)', () => {
    expect(periodoDe('mes', '2026-10')).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(periodoDe('mes', '2026-02')).toMatchObject({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(periodoDe('mes', '2028-02-15')).toMatchObject({ desde: '2028-02-01', hasta: '2028-02-29' });
  });
  it('rango: si viene al revés se voltea', () => {
    expect(periodoDe('rango', '2026-10-10', '2026-10-05')).toMatchObject({ desde: '2026-10-05', hasta: '2026-10-10' });
  });
  it('las etiquetas dicen qué período es', () => {
    expect(etiquetaPeriodo(periodoDe('dia', '2026-10-21'), '2026-10-21')).toBe('Hoy · 21/10/2026');
    expect(etiquetaPeriodo(periodoDe('dia', '2026-10-20'), '2026-10-21')).toBe('Día 20/10/2026');
    expect(etiquetaPeriodo(periodoDe('semana', '2026-10-21'))).toBe('Semana del 19/10/2026 al 25/10/2026');
    expect(etiquetaPeriodo(periodoDe('mes', '2026-10'))).toBe('Mes de octubre de 2026');
    expect(etiquetaPeriodo(periodoDe('rango', '2026-10-01', '2026-10-15'))).toBe('Del 01/10/2026 al 15/10/2026');
  });
});

describe('calcularCierre', () => {
  const filas: FilaCierre[] = [
    // Pedidos de hoy y de ayer; una OC hija no es otro pedido
    fila({ created_at: '2026-10-21T14:00:00Z' }),
    fila({ created_at: '2026-10-21T15:00:00Z', estado: 'cancelada' }),
    fila({ created_at: '2026-10-20T15:00:00Z' }),
    fila({ created_at: '2026-10-21T15:00:00Z', op_padre_id: 'padre' }),
    // Pendientes por aprobar: una de hoy, una de otro día
    fila({ estado: 'oc_creada', created_at: '2026-10-10T12:00:00Z', oc_creada_en: '2026-10-21T16:00:00Z' }),
    fila({ estado: 'oc_creada', created_at: '2026-10-10T12:00:00Z', oc_creada_en: '2026-10-15T16:00:00Z' }),
    // Por pagar (aprobada con método y aprobada por indicar método)
    fila({ estado: 'oc_aprobada', created_at: '2026-10-01T12:00:00Z', oc_aprobada_en: '2026-10-21T17:00:00Z' }),
    fila({ estado: 'confirmada_metodo', created_at: '2026-10-01T12:00:00Z', oc_aprobada_en: '2026-10-21T18:00:00Z' }),
    fila({ estado: 'oc_aprobada', created_at: '2026-10-01T12:00:00Z', oc_aprobada_en: '2026-10-12T18:00:00Z' }),
    // Pagadas: una hoy; una cancelada con fecha de pago no cuenta; el crédito abierto tampoco
    fila({ estado: 'finalizada', created_at: '2026-10-01T12:00:00Z', pagada_en: '2026-10-21T19:00:00Z' }),
    fila({ estado: 'por_recibir', created_at: '2026-10-01T12:00:00Z', pagada_en: '2026-10-21T19:30:00Z' }),
    fila({ estado: 'cancelada', created_at: '2026-10-01T12:00:00Z', pagada_en: '2026-10-21T19:00:00Z' }),
    fila({ estado: 'cuenta_abierta', created_at: '2026-10-01T12:00:00Z', pagada_en: '2026-10-21T19:00:00Z' }),
    fila({ estado: 'finalizada', created_at: '2026-10-01T12:00:00Z', pagada_en: '2026-10-14T19:00:00Z' }),
  ];

  it('con HOY solo cuenta lo de hoy', () => {
    expect(calcularCierre(filas, periodoDe('dia', '2026-10-21'))).toMatchObject({ pedidos: 2, porPagar: 2, pagadas: 2 });
  });
  it('con la semana suma también los días anteriores de esa semana', () => {
    // Pedidos: hoy 2 (la hija no cuenta) + ayer 1; oc_creada del 15 queda fuera de la semana 19-25
    expect(calcularCierre(filas, periodoDe('semana', '2026-10-21'))).toMatchObject({ pedidos: 3, porPagar: 2, pagadas: 2 });
  });
  it('con el mes entra todo lo de octubre', () => {
    expect(calcularCierre(filas, periodoDe('mes', '2026-10'))).toMatchObject({ pedidos: 13, porPagar: 3, pagadas: 3 });
  });
  it('un rango sin nada da ceros', () => {
    expect(calcularCierre(filas, periodoDe('dia', '2026-01-05'))).toMatchObject({ pedidos: 0, porPagar: 0, pagadas: 0 });
  });
  it('usa la fecha de Venezuela: lo de las 11 p. m. del 20 no cae en el 21', () => {
    const f = [fila({ created_at: '2026-10-21T03:30:00Z' })]; // 20/10 11:30 p. m. en Caracas
    expect(calcularCierre(f, periodoDe('dia', '2026-10-20')).pedidos).toBe(1);
    expect(calcularCierre(f, periodoDe('dia', '2026-10-21')).pedidos).toBe(0);
  });
  it('calcula cotizaciones cargadas y órdenes finalizadas por analista en el período', () => {
    const cotizaciones = [
      { registrada_por_email: 'nazareth@goldentouch.com', registrada_en: '2026-10-21T14:00:00Z' },
      { registrada_por_email: 'nazareth@goldentouch.com', registrada_en: '2026-10-21T15:00:00Z' },
      { registrada_por_email: 'javier@goldentouch.com', registrada_en: '2026-10-21T16:00:00Z' },
      { registrada_por_email: 'nazareth@goldentouch.com', registrada_en: '2026-10-15T10:00:00Z' }, // fuera de hoy
    ];
    const ordenesFin = [
      fila({ estado: 'finalizada', finalizada_en: '2026-10-21T17:00:00Z', oc_creada_por: 'nazareth@goldentouch.com' }),
      fila({ estado: 'finalizada', finalizada_en: '2026-10-21T18:00:00Z', finalizada_por: 'javier@goldentouch.com' }),
      fila({ estado: 'finalizada', finalizada_en: '2026-10-18T10:00:00Z', oc_creada_por: 'nazareth@goldentouch.com' }), // fuera de hoy
    ];
    const personas = new Map([
      ['nazareth@goldentouch.com', 'Nazareth Salazar'],
      ['javier@goldentouch.com', 'Javier Leiva'],
    ]);
    const res = calcularCierre(ordenesFin, periodoDe('dia', '2026-10-21'), cotizaciones, personas);
    expect(res.analistas).toEqual([
      { email: 'javier@goldentouch.com', nombre: 'Javier Leiva', cotizaciones: 1, finalizadas: 1 },
      { email: 'nazareth@goldentouch.com', nombre: 'Nazareth Salazar', cotizaciones: 2, finalizadas: 1 },
    ]);
  });

  it('detalle de por pagar: proveedor, monto en $ y total; solo las que cuentan en «Órdenes por pagar»', () => {
    const provs = new Map([['p1', 'Zeta Suministros'], ['p2', 'Alfa Repuestos']]);
    const oc = (o: Partial<FilaCierre>) => fila({ created_at: '2026-10-01T12:00:00Z', oc_aprobada_en: '2026-10-21T17:00:00Z', ...o });
    const ordenes = [
      oc({ estado: 'oc_aprobada', oc_codigo: 'OC-0020', proveedor_id: 'p1', total: 100.1 }),
      oc({ estado: 'confirmada_metodo', oc_codigo: 'OC-0003', proveedor_id: 'p2', total: 50.2 }),
      oc({ estado: 'oc_aprobada', oc_codigo: 'OC-0004', proveedor_id: 'p2', total: 10 }),
      // Contra entrega: se debe lo recibido, no el total
      oc({ estado: 'oc_aprobada', oc_codigo: 'OC-0005', proveedor_id: 'p1', total: 500, condiciones_pago: 'contra_entrega', recibido_total: 120 }),
      // Sin proveedor conocido y sin código de OC (cae al de la solicitud)
      oc({ estado: 'oc_aprobada', oc_codigo: null, codigo: 'SP-9', proveedor_id: 'otro', total: 7 }),
      // No cuentan: otro día, ya pagada, pendiente por aprobar
      oc({ estado: 'oc_aprobada', oc_codigo: 'OC-0099', proveedor_id: 'p1', total: 999, oc_aprobada_en: '2026-10-15T17:00:00Z' }),
      oc({ estado: 'finalizada', oc_codigo: 'OC-0098', proveedor_id: 'p1', total: 999, pagada_en: '2026-10-21T19:00:00Z' }),
      oc({ estado: 'oc_creada', oc_codigo: 'OC-0097', proveedor_id: 'p1', total: 999, oc_creada_en: '2026-10-21T16:00:00Z' }),
    ];
    const res = calcularCierre(ordenes, periodoDe('dia', '2026-10-21'), [], undefined, provs);
    expect(res.porPagar).toBe(5);
    expect(res.ocPorPagar.length).toBe(res.porPagar); // el detalle y el número dicen lo mismo
    expect(res.ocPorPagar).toEqual([
      { codigo: 'OC-0003', proveedor: 'Alfa Repuestos', montoUsd: 50.2 },
      { codigo: 'OC-0004', proveedor: 'Alfa Repuestos', montoUsd: 10 },
      { codigo: 'SP-9', proveedor: 'Sin proveedor', montoUsd: 7 },
      { codigo: 'OC-0005', proveedor: 'Zeta Suministros', montoUsd: 120 },
      { codigo: 'OC-0020', proveedor: 'Zeta Suministros', montoUsd: 100.1 },
    ]);
    expect(res.totalPorPagarUsd).toBe(287.3);
  });

  it('sin órdenes por pagar el detalle queda vacío y el total en cero', () => {
    const res = calcularCierre([], periodoDe('dia', '2026-10-21'));
    expect(res.ocPorPagar).toEqual([]);
    expect(res.totalPorPagarUsd).toBe(0);
  });
});

describe('salidas', () => {
  const r = {
    pedidos: 12,
    porPagar: 3,
    pagadas: 7,
    analistas: [
      { email: 'nazareth@goldentouch.com', nombre: 'Nazareth Salazar', cotizaciones: 4, finalizadas: 2 },
    ],
    ocPorPagar: [
      { codigo: 'OC-0102', proveedor: 'Ferretería El Tornillo', montoUsd: 1250.5 },
      { codigo: 'OC-0107', proveedor: 'Ferretería El Tornillo', montoUsd: 300 },
      { codigo: 'OC-0110', proveedor: 'Transporte Rápido', montoUsd: 80.25 },
    ],
    totalPorPagarUsd: 1630.75,
  };
  const p = periodoDe('dia', '2026-10-21');

  it('WhatsApp: títulos y desglose por analista con sus cantidades y espacios entre líneas', () => {
    expect(textoCierreDiarioWhatsapp(r, p, AHORA)).toBe([
      '📊 *CIERRE DIARIO · COMPRAS*',
      '',
      '📅 *Período:* Hoy · 21/10/2026',
      '',
      '🕒 *Impreso:* 21/10/2026 · 08:45 a. m.',
      '',
      '📥 *Pedidos:* 12',
      '',
      '💵 *Órdenes por pagar:* 3',
      '',
      '✅ *Órdenes pagadas:* 7',
      '',
      '🧾 *DETALLE · ÓRDENES POR PAGAR (3)*',
      '',
      '• Ferretería El Tornillo · OC-0102: *$ 1.250,50*',
      '• Ferretería El Tornillo · OC-0107: *$ 300,00*',
      '• Transporte Rápido · OC-0110: *$ 80,25*',
      '',
      '💰 *Total pendiente por pagar:* $ 1.630,75',
      '',
      '👥 *POR ANALISTA*',
      '',
      '👤 *Nazareth Salazar:*',
      'Total de cotizaciones realizadas: *4*',
      'Total de órdenes finalizadas: *2*',
      '',
      '🏢 *GOLDEN TOUCH 1127 C.A.*',
    ].join('\n'));
  });

  it('WhatsApp: ningún emoji necesita el selector invisible', () => {
    expect(textoCierreDiarioWhatsapp(r, p, AHORA)).not.toContain('️');
  });

  it('Excel: título, período, impreso y tablas con analistas', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await construirCierreDiarioExcel(r, p, AHORA));
    const ws = wb.worksheets[0];
    const celda = (f: number, c: number) => String(ws.getCell(f, c).value ?? '');
    expect(celda(1, 1)).toBe('CIERRE DIARIO · COMPRAS');
    expect(celda(3, 1)).toBe('Período: Hoy · 21/10/2026');
    expect(celda(4, 1)).toBe('Impreso: 21/10/2026 · 08:45 a. m.');
    expect([celda(6, 1), celda(6, 2)]).toEqual(['TÍTULO', 'CANTIDAD']);
    TITULOS_CIERRE.forEach((t, i) => {
      expect(celda(7 + i, 1)).toBe(t.titulo);
      expect(Number(ws.getCell(7 + i, 2).value)).toBe(r[t.clave]);
    });
    expect(celda(11, 1)).toBe('DETALLE · ÓRDENES POR PAGAR (3)');
    expect([celda(12, 1), celda(12, 2), celda(12, 3)]).toEqual(['PROVEEDOR', 'OC', 'MONTO ($)']);
    expect([celda(13, 1), celda(13, 2), Number(ws.getCell(13, 3).value)]).toEqual(['Ferretería El Tornillo', 'OC-0102', 1250.5]);
    expect([celda(15, 1), celda(15, 2), Number(ws.getCell(15, 3).value)]).toEqual(['Transporte Rápido', 'OC-0110', 80.25]);
    expect(celda(16, 1)).toBe('TOTAL PENDIENTE POR PAGAR');
    expect(Number(ws.getCell(16, 3).value)).toBe(1630.75);
    expect(celda(18, 1)).toBe('POR ANALISTA');
    expect([celda(19, 1), celda(19, 2), celda(19, 3)]).toEqual(['ANALISTA', 'COTIZACIONES REALIZADAS', 'ÓRDENES FINALIZADAS']);
    expect(celda(20, 1)).toBe('Nazareth Salazar');
    expect(Number(ws.getCell(20, 2).value)).toBe(4);
    expect(Number(ws.getCell(20, 3).value)).toBe(2);
  }, 30000);

  it('PDF: se arma con el título, el período, los números y los analistas', async () => {
    const doc = await construirCierreDiarioPdf(r, p, null, AHORA);
    const pdf = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
    expect(pdf).toContain('CIERRE DIARIO');
    expect(pdf).toContain('21/10/2026');
    expect(pdf).toContain('08:45');
    expect(pdf).not.toContain('pendientes por aprobar');
    expect(pdf).toContain('POR ANALISTA');
    expect(pdf).toContain('Nazareth Salazar');
    // Detalle de las OC por pagar: proveedor, código, monto y total
    expect(pdf).toContain('ÓRDENES POR PAGAR \\(3\\)'); // los paréntesis salen escapados en el PDF
    expect(pdf).toContain('Transporte Rápido');
    expect(pdf).toContain('OC-0102');
    expect(pdf).toContain('1.250,50');
    expect(pdf).toContain('TOTAL PENDIENTE POR PAGAR');
    expect(pdf).toContain('1.630,75');
  }, 30000);
});
