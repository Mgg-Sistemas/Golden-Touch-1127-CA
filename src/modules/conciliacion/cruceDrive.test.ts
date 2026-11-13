import { describe, expect, it } from 'vitest';
import type { FilaConciliacion } from './conciliacion';
import {
  coincidenCodigosDoc,
  cruzarDrive,
  detectarColumnas,
  detectarTipoArchivoDrive,
  esFilaGoldenTouch,
  extraerMovimientosLibroMayor,
  leerMatrizDrive,
  mismaReferencia,
  parseMontoBs,
  parsearCodigoDoc,
  parsearCsv,
} from './cruceDrive';

const fila = (p: Partial<FilaConciliacion> & { codigo: string }): FilaConciliacion => ({
  item: 1, ordenId: p.codigo, origen: 'oc', tipo: 'compra', proveedor: 'P', estado: 'pagada', estadoLabel: 'Pagada', estadoClase: 'success',
  fecha: '2026-11-01', monedaOc: 'Bs', totalUsd: 10, totalBs: 1000, tasa: 100, fuenteTasa: null, pagada: true, fechaPago: '2026-11-02',
  pagadoUsd: 10, pagadoBs: 1000, referencias: [], referenciaManual: null, comprobantesTesoreria: [], comprobantesConciliacion: [],
  facturas: 0, facturaPrincipal: null, llevaRetencion: false, retenciones: [], anulada: false, drive: null, ...p,
});

describe('archivo del Drive - formato estándar', () => {
  it('lee montos en formato venezolano, con punto decimal y números de Excel', () => {
    expect(parseMontoBs('1.234.567,89')).toBe(1234567.89);
    expect(parseMontoBs('Bs 1.250,00')).toBe(1250);
    expect(parseMontoBs('1234567.89')).toBe(1234567.89);
    expect(parseMontoBs('1,234.50')).toBe(1234.5);
    expect(parseMontoBs('1.234')).toBe(1234);
    expect(parseMontoBs('-2.500,00')).toBe(2500);
    expect(parseMontoBs(1500.5)).toBe(1500.5);
    expect(parseMontoBs('abc')).toBeNull();
    expect(parseMontoBs('')).toBeNull();
  });

  it('CSV con punto y coma, comillas y encabezados con acentos', () => {
    const m = parsearCsv('Código OC;Referencia;"Monto Bs"\r\nOC-1;"00123456";"1.250,00"\r\n\r\n');
    expect(m).toEqual([['Código OC', 'Referencia', 'Monto Bs'], ['OC-1', '00123456', '1.250,00']]);
    expect(detectarColumnas(m[0])).toEqual({ oc: 0, referencia: 1, monto: 2 });
  });

  it('encuentra el encabezado aunque arriba venga el banco, y valida las filas', () => {
    const l = leerMatrizDrive([
      ['Banco de Venezuela'], ['Cuenta 0102...'],
      ['Codigo OC', 'Referencia', 'Monto Bs'],
      ['OC-1', '123456', '1.000,00'],
      ['', '', '5.000,00'], // saldo: se ignora
      ['OC-2', '999', 'xx'],
    ]);
    expect(l.tipo).toBe('estandar');
    expect(l.filas.map((f) => [f.fila, f.ignorada, f.errores])).toEqual([
      [4, false, []], [5, true, []], [6, false, ['Monto Bs no es un número']],
    ]);
    expect(() => leerMatrizDrive([['Nombre', 'Fecha'], ['x', 'y']])).toThrow(/columnas/);
  });
});

describe('referencias bancarias y dígitos', () => {
  it('referencias: mismos dígitos, ceros a la izquierda y los últimos 6+', () => {
    expect(mismaReferencia('Bs 00123456', '123456')).toBe(true);
    expect(mismaReferencia('Binance 9988776655', '8776655')).toBe(true);
    expect(mismaReferencia('12345', '2345')).toBe(false);
    expect(mismaReferencia('123456', '654321')).toBe(false);
  });

  it('referencias de 4 dígitos en Tesorería coinciden con 6 a 8 dígitos del banco', () => {
    expect(mismaReferencia('1234', '55661234')).toBe(true);
    expect(mismaReferencia('1234', '001234')).toBe(true);
    expect(mismaReferencia('Bs 1234', 'REF-99881234')).toBe(true);
    expect(mismaReferencia('99881234', '1234')).toBe(true);
    expect(mismaReferencia('123', '5566123')).toBe(false); // menos de 4 dígitos no permite terminación corta
    expect(mismaReferencia('1234', '55664321')).toBe(false);
  });
});

describe('detección de tipo de archivo Drive', () => {
  it('detecta archivo estándar con Código OC, Referencia y Monto Bs', () => {
    const matriz = [
      ['Codigo OC', 'Referencia', 'Monto Bs'],
      ['OC-2026-0001', '123456', '1.000,00'],
    ];
    expect(detectarTipoArchivoDrive(matriz)).toBe('estandar');
  });

  it('detecta libro mayor con columnas estándar de caja', () => {
    const matriz = [
      ['fecha', 'Año-Mes', 'Movimiento', 'Moneda', 'Monto', 'Tasa', 'Conversion a $USD', 'Nombre @ Descripción', 'Desde (Proviene)', 'Hacia (Destino)', 'Clasificación', 'Sub-clasificación'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '1.000,00', '100', '10', 'PAGO ODC 183 REF 123456', 'BDT GT', 'PROV', 'COMPRAS', 'REPUESTOS'],
    ];
    expect(detectarTipoArchivoDrive(matriz)).toBe('libro_mayor');
  });

  it('detecta tabla resumen diaria con Bs Salidas y Banco capture', () => {
    const matriz = [
      ['FECHA', 'TOTAL $ A LA TASA USDT', 'TASA USDT', 'Bs. Entradas', 'Bs Salidas', 'Banco de donde sale el capture', 'Tasa Recibida para el pago', 'Nombre @ Descripción'],
      ['01/11/2026', '10.00', '100', '', '1.000,00', 'BDT JURIDICO GT REF 123456', '100', 'PAGO ODC 183'],
    ];
    expect(detectarTipoArchivoDrive(matriz)).toBe('libro_mayor');
  });

  it('devuelve desconocido si no coincide con ninguno', () => {
    expect(detectarTipoArchivoDrive([['Columna A', 'Columna B'], ['1', '2']])).toBe('desconocido');
    expect(detectarTipoArchivoDrive([])).toBe('desconocido');
  });
});

describe('filtro de operaciones Golden Touch (GT)', () => {
  it('incluye operaciones válidas que mencionan GT en destino, origen, moneda o descripción', () => {
    expect(esFilaGoldenTouch({
      descripcion: 'PAGO ODC 183 REF 123456', moneda: 'BDT JURIDICO GT', banco: '', desde: '', hacia: '', clasificacion: '', subclasificacion: '',
    }).valida).toBe(true);

    expect(esFilaGoldenTouch({
      descripcion: 'PAGO ODC 183 GT REF 123456', moneda: 'Bs', banco: '', desde: '', hacia: '', clasificacion: '', subclasificacion: '',
    }).valida).toBe(true);

    expect(esFilaGoldenTouch({
      descripcion: 'PAGO ODC 183 REF 123456', moneda: 'Bs', banco: '', desde: '', hacia: 'GOLDEN TOUCH', clasificacion: '', subclasificacion: '',
    }).valida).toBe(true);
  });

  it('excluye comisiones bancarias', () => {
    const res = esFilaGoldenTouch({
      descripcion: 'COMISION BANCARIA BDT GT', moneda: 'BDT JURIDICO GT', banco: '', desde: '', hacia: '', clasificacion: 'COMISIONES', subclasificacion: '',
    });
    expect(res.valida).toBe(false);
    expect(res.motivo).toBe('comision_bancaria');
  });

  it('excluye traspasos internos entre cuentas propias', () => {
    const res = esFilaGoldenTouch({
      descripcion: 'TRASPASO BDT A BANESCO GT', moneda: 'BDT JURIDICO GT', banco: '', desde: 'BDT GT', hacia: 'BANESCO GT', clasificacion: '', subclasificacion: '',
    });
    expect(res.valida).toBe(false);
    expect(res.motivo).toBe('traspaso_interno');
  });

  it('excluye gastos personales de directiva (Cheli personal, Bethania)', () => {
    expect(esFilaGoldenTouch({
      descripcion: 'PAGO CHELI PERSONAL GT', moneda: 'BDT JURIDICO GT', banco: '', desde: '', hacia: '', clasificacion: '', subclasificacion: '',
    }).valida).toBe(false);

    expect(esFilaGoldenTouch({
      descripcion: 'TRANSFERENCIA BETHANIA GT', moneda: 'BDT JURIDICO GT', banco: '', desde: '', hacia: '', clasificacion: '', subclasificacion: '',
    }).valida).toBe(false);
  });

  it('excluye viáticos de choferes', () => {
    const res = esFilaGoldenTouch({
      descripcion: 'VIATICOS CHOFER CARLOS GT', moneda: 'BDT JURIDICO GT', banco: '', desde: '', hacia: '', clasificacion: 'VIATICO', subclasificacion: '',
    });
    expect(res.valida).toBe(false);
    expect(res.motivo).toBe('viaticos_chofer');
  });

  it('excluye compras de casiterita/mineras', () => {
    const res = esFilaGoldenTouch({
      descripcion: 'COMPRA CASITERITA GT', moneda: 'BDT JURIDICO GT', banco: '', desde: '', hacia: '', clasificacion: 'MINERIA', subclasificacion: '',
    });
    expect(res.valida).toBe(false);
    expect(res.motivo).toBe('casiterita_minera');
  });

  it('excluye operaciones estrictamente de MGG que no mencionan GT', () => {
    const res = esFilaGoldenTouch({
      descripcion: 'PAGO REPUESTOS MGG', moneda: 'BDT MGG', banco: '', desde: 'MGG', hacia: 'PROVEEDOR', clasificacion: '', subclasificacion: '',
    });
    expect(res.valida).toBe(false);
    expect(res.motivo).toBe('estrictamente_mgg');
  });
});

describe('normalización y coincidencia de códigos de orden', () => {
  it('parsea y hace coincidir ODC 183 con OC-2026-0183, OC-2026-183 y OC-183', () => {
    expect(coincidenCodigosDoc('ODC 183', 'OC-2026-0183')).toBe(true);
    expect(coincidenCodigosDoc('ODC183', 'OC-2026-0183')).toBe(true);
    expect(coincidenCodigosDoc('ODC 183', 'OC-2026-183')).toBe(true);
    expect(coincidenCodigosDoc('ODC 183', 'OC-183')).toBe(true);
    expect(coincidenCodigosDoc('ORDEN #183', 'OC-2026-0183')).toBe(true);
  });

  it('reconoce compras directas y servicios (CS, SERV, OSV)', () => {
    expect(coincidenCodigosDoc('CS 10', 'CS-2026-0010')).toBe(true);
    expect(coincidenCodigosDoc('SERV 42', 'SERV-2026-0042')).toBe(true);
    expect(coincidenCodigosDoc('OSV-5', 'SERV-2026-0005')).toBe(true);
    expect(coincidenCodigosDoc('SV 12', 'SERV-2026-0012')).toBe(true);
  });

  it('no coincide si los números o tipos son distintos', () => {
    expect(coincidenCodigosDoc('ODC 183', 'OC-2026-0184')).toBe(false);
    expect(coincidenCodigosDoc('ODC 183', 'CS-2026-0183')).toBe(false);
  });

  it('parsearCodigoDoc extrae tipo, número y año correctamente', () => {
    expect(parsearCodigoDoc('OC-2026-0183')).toEqual({ tipo: 'OC', numero: 183, anio: 2026, raw: 'OC-2026-0183' });
    expect(parsearCodigoDoc('ODC 183')).toEqual({ tipo: 'OC', numero: 183, anio: undefined, raw: 'ODC 183' });
    expect(parsearCodigoDoc('CS-10')).toEqual({ tipo: 'CS', numero: 10, anio: undefined, raw: 'CS-10' });
  });
});

describe('extracción de movimientos de libro mayor', () => {
  const mockConciliacion = [
    fila({ codigo: 'OC-2026-0183', totalBs: 1000, pagadoBs: 1000, referencias: ['123456'] }),
    fila({ codigo: 'OC-2026-0189', totalBs: 1000, pagadoBs: 1000, referencias: ['998877'] }),
    fila({ codigo: 'OC-2026-0191', totalBs: 2000, pagadoBs: 2000, referencias: ['998877'] }),
  ];

  it('extrae movimientos válidos de GT, ignora comisiones y MGG, y genera dos registros para órdenes agrupadas', () => {
    const matriz = [
      ['fecha', 'Año-Mes', 'Movimiento', 'Moneda', 'Monto', 'Tasa', 'Conversion a $USD', 'Nombre @ Descripción', 'Desde (Proviene)', 'Hacia (Destino)', 'Clasificación', 'Sub-clasificación'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '1.000,00', '100', '10', 'PAGO ODC 183 REF 123456', 'BDT GT', 'PROVEEDOR 1', 'COMPRAS', 'REPUESTOS'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '3.000,00', '100', '30', 'ODC 189 Y 191 REF: 998877', 'BDT GT', 'PROVEEDOR 2', 'COMPRAS', 'MATERIALES'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '50,00', '100', '0.5', 'COMISION BANCARIA BDT GT', 'BDT GT', 'BANCO', 'COMISION', 'BANCARIA'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT MGG', '500,00', '100', '5', 'PAGO REPUESTOS MGG', 'BDT MGG', 'PROVEEDOR MGG', 'COMPRAS', 'REPUESTOS'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '200,00', '100', '2', 'VIATICOS CHOFER GT', 'BDT GT', 'CHOFER', 'GASTO', 'VIATICO'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '1.000,00', '100', '10', 'CHELI PERSONAL GT', 'BDT GT', 'DIRECTIVA', 'GASTO', 'PERSONAL'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '5.000,00', '100', '50', 'TRASPASO ENTRE CUENTAS GT', 'BDT GT', 'BANESCO GT', 'TRASPASO', 'INTERNO'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '4.000,00', '100', '40', 'COMPRA CASITERITA GT', 'BDT GT', 'MINEROS', 'MINERIA', 'CASITERITA'],
      ['2026-11-02', '2026-11', 'Entrada', 'BDT JURIDICO GT', '150,00', '100', '1.5', 'REINTEGRO RETENCION ODC 183 REF 776655', 'PROVEEDOR 1', 'BDT GT', 'RETENCIONES', 'IVA'],
    ];

    const movs = extraerMovimientosLibroMayor(matriz, mockConciliacion);
    expect(movs.length).toBe(4);

    // Fila 2: ODC 183 individual
    expect(movs[0].fila).toBe(2);
    expect(movs[0].oc).toBe('OC-2026-0183');
    expect(movs[0].referencia).toBe('123456');
    expect(movs[0].montoBs).toBe(1000);
    expect(movs[0].movimiento).toBe('salida');
    expect(movs[0].fecha).toBe('2026-11-01');

    // Fila 3: ODC 189 Y 191 agrupadas -> genera dos registros vinculados con montos repartidos según lo esperado
    expect(movs[1].fila).toBe(3);
    expect(movs[1].oc).toBe('OC-2026-0189');
    expect(movs[1].referencia).toBe('998877');
    expect(movs[1].montoBs).toBe(1000);
    expect(movs[1].movimiento).toBe('salida');

    expect(movs[2].fila).toBe(3);
    expect(movs[2].oc).toBe('OC-2026-0191');
    expect(movs[2].referencia).toBe('998877');
    expect(movs[2].montoBs).toBe(2000);
    expect(movs[2].movimiento).toBe('salida');

    // Fila 10: Reintegro de retención (Entrada)
    expect(movs[3].fila).toBe(10);
    expect(movs[3].oc).toBe('OC-2026-0183');
    expect(movs[3].referencia).toBe('776655');
    expect(movs[3].montoBs).toBe(150);
    expect(movs[3].movimiento).toBe('entrada');
  });

  it('extrae monto del texto de la descripción si la celda numérica viene vacía', () => {
    const matriz = [
      ['fecha', 'Movimiento', 'Moneda', 'Monto', 'Nombre @ Descripción'],
      ['2026-11-01', 'Salida', 'BDT GT', '', 'PAGO ODC 183 POR BS. 1.250,50 REF 123456'],
    ];
    const movs = extraerMovimientosLibroMayor(matriz, mockConciliacion);
    expect(movs.length).toBe(1);
    expect(movs[0].montoBs).toBe(1250.5);
    expect(movs[0].oc).toBe('OC-2026-0183');
    expect(movs[0].referencia).toBe('123456');
  });
});

describe('cruce por código de OC y por referencia', () => {
  const sistema = [
    fila({ codigo: 'OC-1', referencias: ['Bs 123456'], pagadoBs: 1000, totalBs: 1000 }),
    fila({ codigo: 'OC-2', ordenId: 'b', referencias: ['Bs 777777'], pagadoBs: 2000, totalBs: 2000 }),
    fila({ codigo: 'OC-3', ordenId: 'c', referencias: ['Bs 555555', 'Bs 666666'], pagadoBs: 3000, totalBs: 3000 }),
    fila({ codigo: 'OC-2026-0183', ordenId: 'oc183', referencias: ['1234'], pagadoBs: 1250, totalBs: 1250 }),
  ];
  const leer = (filas: unknown[][]) => leerMatrizDrive([['Codigo OC', 'Referencia', 'Monto Bs'], ...filas]);

  it('CUADRA con referencia y monto; NO CUADRA si falla alguno', () => {
    const c = cruzarDrive(leer([
      ['OC-1', '123456', '1.000,50'], // dentro de la tolerancia de 1 Bs
      ['OC-2', '777777', '2.500,00'], // monto distinto
    ]), sistema);
    expect(c.porDoc.get('oc:OC-1')?.estado).toBe('cuadra');
    expect(c.porDoc.get('oc:b')?.estado).toBe('no_cuadra');
    expect(c.porDoc.get('oc:b')?.detalle).toMatch(/monto/);
    expect(c.estado).toBe('Con observaciones');
  });

  it('sin código: cruza por referencia; referencia distinta = NO CUADRA', () => {
    const c = cruzarDrive(leer([['', '777777', '2000'], ['OC-1', '000111', '1000']]), sistema);
    expect(c.filas[0].por).toBe('referencia');
    expect(c.porDoc.get('oc:b')?.estado).toBe('cuadra');
    expect(c.porDoc.get('oc:OC-1')?.estado).toBe('no_cuadra');
    expect(c.porDoc.get('oc:OC-1')?.detalle).toMatch(/referencia 000111/);
  });

  it('pago en dos partes: cuadra si la suma da el monto', () => {
    const c = cruzarDrive(leer([['OC-3', '555555', '1.000,00'], ['OC-3', '666666', '2.000,00']]), sistema);
    expect(c.porDoc.get('oc:c')?.estado).toBe('cuadra');
    expect(c.cuadran).toBe(2);
  });

  it('lo que no está en Conciliación y las filas con error se informan', () => {
    const c = cruzarDrive(leer([['OC-99', '', '10'], ['OC-1', '123456', '']]), sistema);
    expect(c.noEncontradas).toBe(1);
    expect(c.conError).toBe(1);
    expect(c.estado).toBe('Error');
    expect(c.porDoc.size).toBe(0);
  });

  it('cruza ODC 183 con OC-2026-0183 y referencia de 4 dígitos en sistema con 8 dígitos del archivo', () => {
    const c = cruzarDrive(leer([
      ['ODC 183', '55661234', '1.250,00'],
    ]), sistema);
    expect(c.porDoc.get('oc:oc183')?.estado).toBe('cuadra');
    expect(c.cuadran).toBe(1);
  });

  it('cruce completo con archivo Libro Mayor del Drive', () => {
    const sistemaLm = [
      fila({ codigo: 'OC-2026-0189', ordenId: 'ord189', referencias: ['998877'], pagadoBs: 1000, totalBs: 1000 }),
      fila({ codigo: 'OC-2026-0191', ordenId: 'ord191', referencias: ['998877'], pagadoBs: 2000, totalBs: 2000 }),
    ];
    const matrizLibroMayor = [
      ['fecha', 'Año-Mes', 'Movimiento', 'Moneda', 'Monto', 'Nombre @ Descripción', 'Desde (Proviene)', 'Hacia (Destino)'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '3.000,00', 'ODC 189 Y 191 REF: 998877', 'BDT GT', 'PROVEEDOR'],
      ['2026-11-01', '2026-11', 'Salida', 'BDT JURIDICO GT', '50,00', 'COMISION BANCARIA BDT GT', 'BDT GT', 'BANCO'],
    ];
    const lectura = leerMatrizDrive(matrizLibroMayor, sistemaLm);
    expect(lectura.tipo).toBe('libro_mayor');
    expect(lectura.filas.length).toBe(2); // Dos registros vinculados para 189 y 191 (la comisión fue excluida)

    const c = cruzarDrive(lectura, sistemaLm);
    expect(c.porDoc.get('oc:ord189')?.estado).toBe('cuadra');
    expect(c.porDoc.get('oc:ord191')?.estado).toBe('cuadra');
    expect(c.cuadran).toBe(2);
    expect(c.estado).toBe('Validado');
  });
});
