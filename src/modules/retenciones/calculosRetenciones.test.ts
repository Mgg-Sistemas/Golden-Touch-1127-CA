import { describe, it, expect } from 'vitest';
import {
  calcularIgtf, calcularIslr, enBolivares, errorRetencionIva, etiquetaQuincena, formatearRif,
  ivaDeFactura, limiteEntregaComprobante, minimoPersonaNatural, numeroComprobante, periodoFiscal,
  porcentajeIslr, quincena, retencionIva, retencionPorAlicuota, rifValido, sustraendoIslr,
  resumirLibro,
  puedeRetenerLaEmpresa, motivoNoPuedeRetener, TIPOS_SOLO_CONTRIBUYENTE_ESPECIAL,
  type ConceptoIslr, type FilaLibro,
} from './calculosRetenciones';

const honorarios: ConceptoIslr = {
  codigo: '001', concepto: 'Honorarios profesionales', pjd: 5, pjnd: 34, pnr: 3, pnnr: 34, base_pct: 100,
};
const servicios: ConceptoIslr = {
  codigo: '003', concepto: 'Servicios (contratistas)', pjd: 2, pjnd: 34, pnr: 1, pnnr: 34, base_pct: 100,
};
const transporteInt: ConceptoIslr = {
  codigo: '008', concepto: 'Transporte internacional', pjd: 5, pjnd: 5, pnr: 5, pnnr: 5, base_pct: 10,
};

describe('IVA · se retiene sobre el IVA de la factura', () => {
  it('el IVA sale de la base por la alícuota', () => {
    expect(ivaDeFactura(1000, 16)).toBe(160);
    expect(ivaDeFactura(1234.56, 16)).toBe(197.53);
  });

  it('el 75% es del IVA, no de la base (el error que multiplica por seis)', () => {
    expect(retencionIva(160, 75)).toBe(120);
    expect(retencionIva(160, 75)).not.toBe(retencionPorAlicuota(1000, 75));
  });

  it('el 100% retiene todo el IVA', () => {
    expect(retencionIva(160, 100)).toBe(160);
  });

  it('sin IVA no hay retención', () => {
    expect(retencionIva(0, 75)).toBe(0);
  });

  it('solo admite 75 o 100', () => {
    const base = { baseImponible: 1000, ivaFactura: 160, facturaNro: '00123' };
    expect(errorRetencionIva({ ...base, porcentaje: 75 })).toBeNull();
    expect(errorRetencionIva({ ...base, porcentaje: 100 })).toBeNull();
    expect(errorRetencionIva({ ...base, porcentaje: 50 })).toContain('75% o 100%');
  });

  it('exige el IVA y el número de factura', () => {
    expect(errorRetencionIva({ baseImponible: 1000, ivaFactura: 0, porcentaje: 75, facturaNro: '1' }))
      .toContain('IVA de la factura');
    expect(errorRetencionIva({ baseImponible: 1000, ivaFactura: 160, porcentaje: 75, facturaNro: ' ' }))
      .toContain('número de la factura');
  });
});

describe('ISLR · el porcentaje depende de quién cobra', () => {
  it('lo toma del concepto según el sujeto', () => {
    expect(porcentajeIslr(honorarios, 'PJD')).toBe(5);
    expect(porcentajeIslr(honorarios, 'PNR')).toBe(3);
    expect(porcentajeIslr(honorarios, 'PJND')).toBe(34);
    expect(porcentajeIslr(servicios, 'PJD')).toBe(2);
  });

  it('a la jurídica domiciliada se le retiene el porcentaje pleno', () => {
    const r = calcularIslr({ pagoSinIva: 10000, concepto: honorarios, sujeto: 'PJD', unidadTributaria: 9 });
    expect(r.porcentaje).toBe(5);
    expect(r.sustraendo).toBe(0);
    expect(r.monto).toBe(500);
  });

  it('servicios a contratista jurídico: 2%', () => {
    expect(calcularIslr({ pagoSinIva: 4500, concepto: servicios, sujeto: 'PJD', unidadTributaria: 9 }).monto).toBe(90);
  });

  it('el transporte internacional se retiene sobre el 10% del flete', () => {
    const r = calcularIslr({ pagoSinIva: 20000, concepto: transporteInt, sujeto: 'PJD', unidadTributaria: 9 });
    expect(r.baseAplicada).toBe(2000);
    expect(r.monto).toBe(100);
  });

  it('a la persona natural residente se le resta el sustraendo', () => {
    // UT = 9 → mínimo 750,00 y sustraendo de 3% = 22,50
    expect(minimoPersonaNatural(9)).toBe(750);
    expect(sustraendoIslr(3, 9)).toBe(22.5);
    const r = calcularIslr({ pagoSinIva: 10000, concepto: honorarios, sujeto: 'PNR', unidadTributaria: 9 });
    expect(r.sustraendo).toBe(22.5);
    expect(r.monto).toBe(277.5); // 10.000 × 3% − 22,50
  });

  it('por debajo del mínimo exento no se le retiene nada', () => {
    const r = calcularIslr({ pagoSinIva: 700, concepto: honorarios, sujeto: 'PNR', unidadTributaria: 9 });
    expect(r.monto).toBe(0);
    expect(r.aviso).toContain('mínimo exento');
  });

  it('apenas por encima del mínimo se retiene muy poco, que es el sentido del sustraendo', () => {
    // 760 × 3% = 22,80 y el sustraendo es 22,50: se retienen 30 céntimos.
    const r = calcularIslr({ pagoSinIva: 760, concepto: honorarios, sujeto: 'PNR', unidadTributaria: 9 });
    expect(r.monto).toBe(0.3);
    expect(r.aviso).toBeNull();
  });

  it('nunca devuelve una retención negativa', () => {
    const r = calcularIslr({ pagoSinIva: 751, concepto: honorarios, sujeto: 'PNR', unidadTributaria: 9 });
    expect(r.monto).toBeGreaterThanOrEqual(0);
  });

  it('un concepto sin porcentaje para ese sujeto lo dice', () => {
    const solo: ConceptoIslr = { ...honorarios, pnnr: null };
    expect(calcularIslr({ pagoSinIva: 1000, concepto: solo, sujeto: 'PNNR', unidadTributaria: 9 }).aviso)
      .toContain('no prevé retención');
  });

  it('el porcentaje se puede pisar a mano', () => {
    const r = calcularIslr({ pagoSinIva: 1000, concepto: honorarios, sujeto: 'PJD', unidadTributaria: 9, porcentajeManual: 10 });
    expect(r.monto).toBe(100);
  });
});

describe('Municipal, estadal e IGTF', () => {
  it('la alícuota municipal es plana sobre el pago sin IVA', () => {
    expect(retencionPorAlicuota(10000, 1)).toBe(100);
    expect(retencionPorAlicuota(10000, 2.5)).toBe(250);
  });
  it('el IGTF es el 3% de lo pagado en divisas', () => {
    expect(calcularIgtf(1000, 3)).toBe(30);
  });
  it('sin alícuota no hay monto', () => {
    expect(retencionPorAlicuota(10000, 0)).toBe(0);
  });
});

describe('Comprobante y quincena', () => {
  it('el período es AAAAMM', () => {
    expect(periodoFiscal('2026-09-21')).toBe('202609');
  });

  it('el comprobante es el período más ocho dígitos', () => {
    expect(numeroComprobante('2026-09-21', 1)).toBe('20260900000001');
    expect(numeroComprobante('2026-09-21', 137)).toBe('20260900000137');
  });

  it('el día 15 todavía es primera quincena', () => {
    expect(quincena('2026-09-15')).toBe(1);
    expect(quincena('2026-09-16')).toBe(2);
  });

  it('la quincena se lee en palabras', () => {
    expect(etiquetaQuincena('2026-09-03')).toBe('1ra quincena de septiembre 2026');
    expect(etiquetaQuincena('2026-09-30')).toBe('2da quincena de septiembre 2026');
  });

  it('el plazo de entrega son 5 días continuos', () => {
    expect(limiteEntregaComprobante('2026-09-03')).toBe('2026-09-20'); // 15 + 5
    expect(limiteEntregaComprobante('2026-09-30')).toBe('2026-10-05'); // fin de mes + 5
  });
});

describe('Bolívares', () => {
  it('lo que ya está en Bs no se convierte', () => {
    expect(enBolivares(1000, 'Bs', 0)).toBe(1000);
  });
  it('los dólares se llevan a Bs con la tasa', () => {
    expect(enBolivares(120, 'USD', 849.56)).toBe(101947.2);
  });
  it('sin tasa no inventa el equivalente', () => {
    expect(enBolivares(120, 'USD', 0)).toBe(0);
  });
});

describe('RIF', () => {
  it('valida el dígito verificador', () => {
    expect(rifValido('J-50129993-5')).toBe(true);
    expect(rifValido('J501299935')).toBe(true);
    expect(rifValido('J-50129993-4')).toBe(false);
  });
  it('rechaza lo que no tiene forma de RIF', () => {
    expect(rifValido('')).toBe(false);
    expect(rifValido('12345678')).toBe(false);
    expect(rifValido('X-12345678-9')).toBe(false);
  });
  it('lo escribe con guiones', () => {
    expect(formatearRif('J501299935')).toBe('J-50129993-5');
    expect(formatearRif('')).toBe('');
  });
});

describe('resumen del libro', () => {
  const fila = (o: Partial<FilaLibro> & { tipo: FilaLibro['tipo'] }): FilaLibro => ({
    rol: 'sufrida', estado: 'registrada', monto: 0, moneda: 'Bs', ...o,
  });

  it('suma en bolívares y separa lo que vuelve de lo que no', () => {
    const r = resumirLibro([
      fila({ tipo: 'IVA', monto: 120, moneda: 'Bs', monto_bs: 120, comprobante_nro: 'A1' }),
      fila({ tipo: 'ISLR', monto: 500, moneda: 'Bs', monto_bs: 500, comprobante_nro: 'A2' }),
      fila({ tipo: 'IGTF', monto: 30, moneda: 'USD', monto_bs: 25486.8, comprobante_nro: 'A3' }),
      fila({ tipo: 'MUNICIPAL', rol: 'practicada', monto: 100, monto_bs: 100, comprobante_nro: 'A4' }),
    ]);
    expect(r.aFavorBs).toBe(620);          // IVA + ISLR que nos retuvieron
    expect(r.igtfBs).toBe(25486.8);        // el IGTF no vuelve: va aparte
    expect(r.porEnterarBs).toBe(100);      // lo que retuvimos y falta declarar
    expect(r.porTipo.get('IVA')).toEqual({ cantidad: 1, bs: 120 });
  });

  it('lo anulado no suma', () => {
    const r = resumirLibro([
      fila({ tipo: 'IVA', monto: 120, monto_bs: 120, estado: 'anulada', comprobante_nro: 'A1' }),
    ]);
    expect(r.aFavorBs).toBe(0);
    expect(r.porTipo.size).toBe(0);
  });

  it('lo ya declarado deja de estar por enterar', () => {
    const r = resumirLibro([
      fila({ tipo: 'ISLR', rol: 'practicada', estado: 'declarada', monto: 90, monto_bs: 90, comprobante_nro: 'A5' }),
    ]);
    expect(r.porEnterarBs).toBe(0);
    expect(r.porTipo.get('ISLR')).toEqual({ cantidad: 1, bs: 90 });
  });

  it('cuenta las que no tienen papel', () => {
    const r = resumirLibro([
      fila({ tipo: 'IVA', monto: 10, monto_bs: 10 }),
      fila({ tipo: 'IVA', monto: 10, monto_bs: 10, comprobante_nro: 'B1' }),
    ]);
    expect(r.sinComprobante).toBe(1);
  });

  it('una fila en dólares sin equivalente en Bs no ensucia el total', () => {
    const r = resumirLibro([fila({ tipo: 'IVA', monto: 50, moneda: 'USD', monto_bs: null, comprobante_nro: 'C1' })]);
    expect(r.aFavorBs).toBe(0);
  });
});

describe('quién puede retener · Golden Touch no es contribuyente especial', () => {
  const NO_ESPECIAL = false;
  const ESPECIAL = true;

  it('sin ser especial, la empresa NO puede retener IVA', () => {
    expect(puedeRetenerLaEmpresa('IVA', NO_ESPECIAL)).toBe(false);
  });

  it('sin ser especial, la empresa NO puede percibir IGTF', () => {
    expect(puedeRetenerLaEmpresa('IGTF', NO_ESPECIAL)).toBe(false);
  });

  it('el ISLR sí se retiene igual: sale del Decreto 1808, no de ser especial', () => {
    expect(puedeRetenerLaEmpresa('ISLR', NO_ESPECIAL)).toBe(true);
  });

  it('municipal y estadal salen de la ordenanza, tampoco dependen de ser especial', () => {
    expect(puedeRetenerLaEmpresa('MUNICIPAL', NO_ESPECIAL)).toBe(true);
    expect(puedeRetenerLaEmpresa('ESTADAL', NO_ESPECIAL)).toBe(true);
  });

  it('si el SENIAT la designa, se habilita todo', () => {
    for (const t of ['IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF'] as const) {
      expect(puedeRetenerLaEmpresa(t, ESPECIAL)).toBe(true);
    }
  });

  it('esto NO limita lo que le retienen a la empresa: solo el lado «practicada»', () => {
    // `puedeRetenerLaEmpresa` responde por el rol «practicada». El libro tiene
    // que poder registrar SIEMPRE un IVA que un cliente le retuvo a Golden
    // Touch: ese comprobante es un anticipo a favor y perderlo es pagar dos veces.
    expect(TIPOS_SOLO_CONTRIBUYENTE_ESPECIAL).toContain('IVA');
    expect(TIPOS_SOLO_CONTRIBUYENTE_ESPECIAL).toContain('IGTF');
    expect(TIPOS_SOLO_CONTRIBUYENTE_ESPECIAL).toHaveLength(2);
  });
});

describe('motivoNoPuedeRetener · explica en vez de solo bloquear', () => {
  it('cuando sí puede, no dice nada', () => {
    expect(motivoNoPuedeRetener('ISLR', false)).toBeNull();
    expect(motivoNoPuedeRetener('IVA', true)).toBeNull();
  });

  it('nombra la norma que lo impide', () => {
    expect(motivoNoPuedeRetener('IVA', false)).toMatch(/SNAT\/2015\/0049/);
    expect(motivoNoPuedeRetener('IGTF', false)).toMatch(/Ley del IGTF/);
  });

  it('dice qué hacer si en realidad se la practicaron a la empresa', () => {
    expect(motivoNoPuedeRetener('IVA', false)).toMatch(/Nos la practicaron/);
  });

  it('dice dónde se cambia si el SENIAT la designa', () => {
    expect(motivoNoPuedeRetener('IVA', false)).toMatch(/Parámetros fiscales/);
  });
});
