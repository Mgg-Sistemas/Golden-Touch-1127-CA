import { describe, it, expect } from 'vitest';
import { errorSaldoInsuficiente, etiquetaTanque, litrosExtraQueSalen, litrosQueSalen, saleDelTanque, tanqueSinLitros } from './saldoSuficiente';

describe('saleDelTanque', () => {
  it('uso, merma y traslado sacan litros', () => {
    expect(saleDelTanque('uso')).toBe(true);
    expect(saleDelTanque('merma')).toBe(true);
    expect(saleDelTanque('traslado')).toBe(true);
  });
  it('entrada y retorno no', () => {
    expect(saleDelTanque('entrada')).toBe(false);
    expect(saleDelTanque('retorno')).toBe(false);
  });
});

describe('litrosQueSalen', () => {
  it('una salida saca sus litros y una entrada los resta', () => {
    expect(litrosQueSalen('uso', 20)).toBe(20);
    expect(litrosQueSalen('entrada', 20)).toBe(-20);
  });
});

describe('tanqueSinLitros', () => {
  it('0, negativo o vacío es sin litros', () => {
    expect(tanqueSinLitros(0)).toBe(true);
    expect(tanqueSinLitros(-15)).toBe(true);
    expect(tanqueSinLitros(null)).toBe(true);
    expect(tanqueSinLitros(0.004)).toBe(true);
  });
  it('con algo de litros, no', () => {
    expect(tanqueSinLitros(0.5)).toBe(false);
  });
});

describe('litrosExtraQueSalen', () => {
  it('un surtido nuevo saca todos sus litros', () => {
    expect(litrosExtraQueSalen(null, { tipo: 'uso', litros: 50 })).toBe(50);
  });
  it('una entrada nueva no se revisa', () => {
    expect(litrosExtraQueSalen(null, { tipo: 'entrada', litros: 50 })).toBe(0);
  });
  it('subir los litros de un surtido solo cuenta la diferencia', () => {
    expect(litrosExtraQueSalen({ tipo: 'uso', litros: 40 }, { tipo: 'uso', litros: 55 })).toBe(15);
  });
  it('bajar los litros de un histórico no saca nada más', () => {
    expect(litrosExtraQueSalen({ tipo: 'uso', litros: 40 }, { tipo: 'uso', litros: 10 })).toBe(-30);
  });
  it('pasar una entrada a uso saca el doble (deja de sumar y empieza a restar)', () => {
    expect(litrosExtraQueSalen({ tipo: 'entrada', litros: 30 }, { tipo: 'uso', litros: 30 })).toBe(60);
  });
  it('moverlo a otro tanque cuenta como nuevo en ese tanque', () => {
    expect(litrosExtraQueSalen({ tipo: 'uso', litros: 30, tanqueId: 'a' }, { tipo: 'uso', litros: 30, tanqueId: 'b' })).toBe(30);
  });
});

describe('errorSaldoInsuficiente', () => {
  it('alcanza justo: no hay error', () => {
    expect(errorSaldoInsuficiente({ nombre: 'Tanque #1', saldo: 18, litros: 18 })).toBeNull();
  });
  it('no alcanza: mensaje claro', () => {
    expect(errorSaldoInsuficiente({ nombre: 'Tanque #1', saldo: 18, litros: 20 }))
      .toBe('El tanque Tanque #1 tiene 18 L; no se pueden surtir 20 L.');
  });
  it('tanque en 0', () => {
    expect(errorSaldoInsuficiente({ nombre: 'T3', saldo: 0, litros: 5 }))
      .toBe('El tanque T3 tiene 0 L; no se pueden surtir 5 L.');
  });
  it('saldo negativo se muestra como 0', () => {
    expect(errorSaldoInsuficiente({ nombre: 'T3', saldo: -40, litros: 5 }))
      .toBe('El tanque T3 tiene 0 L; no se pueden surtir 5 L.');
  });
  it('litros en 0 o negativos (correcciones) no se frenan', () => {
    expect(errorSaldoInsuficiente({ nombre: 'T3', saldo: 0, litros: 0 })).toBeNull();
    expect(errorSaldoInsuficiente({ nombre: 'T3', saldo: 0, litros: -10 })).toBeNull();
  });
  it('tolera el redondeo de 2 decimales', () => {
    expect(errorSaldoInsuficiente({ nombre: 'T1', saldo: 10.004, litros: 10.008 })).toBeNull();
  });
  it('al editar dice cuánto saca de más', () => {
    expect(errorSaldoInsuficiente({ nombre: 'T1', saldo: 8, litros: 9, edicion: true }))
      .toBe('El tanque T1 tiene 8 L; el cambio saca 9 L más y lo dejaría en negativo.');
  });
});

describe('etiquetaTanque', () => {
  it('marca los tanques vacíos', () => {
    expect(etiquetaTanque('T1', 0)).toBe('T1 · sin litros');
    expect(etiquetaTanque('T1', 845)).toBe('T1 · 845 L');
  });
});
