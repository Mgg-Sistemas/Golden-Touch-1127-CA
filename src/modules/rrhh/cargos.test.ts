import { describe, expect, it } from 'vitest';
import { errorCambioCargo, motivoCargoFinal, textoCambioCargo } from './cargos';

const base = { cargoActual: 'OPERADOR', deptoActual: 'MINA', cargoNuevo: 'SUPERVISOR', deptoNuevo: '', motivo: 'Ascenso', fecha: '2026-11-04', hoy: '2026-11-04' };

describe('RRHH · cambio de cargo', () => {
  it('pide cargo nuevo distinto, motivo y fecha', () => {
    expect(errorCambioCargo(base)).toBeNull();
    expect(errorCambioCargo({ ...base, cargoNuevo: ' ' })).toBe('Indica el cargo nuevo.');
    expect(errorCambioCargo({ ...base, cargoNuevo: 'operador' })).toBe('Es el mismo cargo que ya tiene.');
    expect(errorCambioCargo({ ...base, cargoNuevo: 'operador', deptoNuevo: 'PLANTA' })).toBeNull();
    expect(errorCambioCargo({ ...base, motivo: '' })).toBe('Indica el motivo del cambio de cargo.');
    expect(errorCambioCargo({ ...base, fecha: '' })).toBe('Indica desde cuándo rige el cargo nuevo.');
    expect(errorCambioCargo({ ...base, fecha: '2027-01-15' })).toBe('La fecha no puede pasar de un mes adelante.');
  });

  it('motivo «Otro» y el texto del cambio', () => {
    expect(motivoCargoFinal('Otro', ' cubrir vacaciones ')).toBe('cubrir vacaciones');
    expect(motivoCargoFinal('Ascenso', 'x')).toBe('Ascenso');
    expect(textoCambioCargo({ cargo_anterior: 'OPERADOR', cargo_nuevo: 'SUPERVISOR', departamento_anterior: 'MINA', departamento_nuevo: 'MINA' })).toBe('OPERADOR → SUPERVISOR');
    expect(textoCambioCargo({ cargo_anterior: null, cargo_nuevo: 'COCINERO', departamento_anterior: 'MINA', departamento_nuevo: 'COCINA' })).toBe('— → COCINERO (depto. MINA → COCINA)');
  });
});
