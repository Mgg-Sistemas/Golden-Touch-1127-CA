import { describe, it, expect } from 'vitest';
import {
  esFeriadoBancario,
  esFinDeSemana,
  esDiaNoBancario,
  proximoDiaHabilBancario,
  infoDiaBancario,
  listarFeriadosSudeban,
  diaSemanaNombre,
} from './calendarioBancario';

describe('calendarioBancario (SUDEBAN / BCV Venezuela)', () => {
  it('detecta correctamente el Lunes Bancario de hoy (23 de noviembre de 2026)', () => {
    expect(esFeriadoBancario('2026-11-23')).toBe(true);
    expect(esDiaNoBancario('2026-11-23')).toBe(true);
    const info = infoDiaBancario('2026-11-23');
    expect(info.esBancario).toBe(true);
    expect(info.motivo).toContain('Chiquinquirá');
    // Para el lunes bancario 23-11, la tasa BCV corresponde automáticamente al día siguiente (martes 24-11)
    expect(info.fechaEfectivaBcv).toBe('2026-11-24');
    expect(proximoDiaHabilBancario('2026-11-23')).toBe('2026-11-24');
  });

  it('un día de semana normal no es feriado bancario y toma su propia fecha', () => {
    // Miércoles 25 de noviembre de 2026
    const info = infoDiaBancario('2026-11-25');
    expect(info.esBancario).toBe(false);
    expect(info.esFinDeSemana).toBe(false);
    expect(info.esFeriado).toBe(false);
    expect(info.fechaEfectivaBcv).toBe('2026-11-25');
  });

  it('los fines de semana son días no bancarios y saltan al próximo día hábil bancario', () => {
    // Sábado 21-11-2026 salta al Martes 24-11-2026 (porque el lunes 23 es bancario)
    expect(esFinDeSemana('2026-11-21')).toBe(true);
    expect(esDiaNoBancario('2026-11-21')).toBe(true);
    expect(proximoDiaHabilBancario('2026-11-21')).toBe('2026-11-24');

    // Domingo 22-11-2026 salta al Martes 24-11-2026
    expect(esFinDeSemana('2026-11-22')).toBe(true);
    expect(proximoDiaHabilBancario('2026-11-22')).toBe('2026-11-24');
  });

  it('detecta feriados nacionales clave (Año Nuevo, 19 de Abril, 1 de Mayo, Navidad)', () => {
    expect(esFeriadoBancario('2026-01-01')).toBe(true);
    expect(esFeriadoBancario('2026-05-01')).toBe(true);
    expect(esFeriadoBancario('2026-12-25')).toBe(true);
  });

  it('listarFeriadosSudeban devuelve la lista estructurada con tipos y fecha valor BCV', () => {
    const todos2026 = listarFeriadosSudeban(2026);
    expect(todos2026.length).toBeGreaterThanOrEqual(20);
    const hoyFeriado = todos2026.find((f) => f.fecha === '2026-11-23');
    expect(hoyFeriado).toBeDefined();
    expect(hoyFeriado?.motivo).toContain('Chiquinquirá');
    expect(hoyFeriado?.tipo).toBe('bancario');
    expect(hoyFeriado?.diaNombre).toBe('Lunes');
    expect(hoyFeriado?.fechaEfectivaBcv).toBe('2026-11-24');
    expect(hoyFeriado?.diaEfectivoNombre).toBe('Martes');
  });

  it('diaSemanaNombre devuelve el nombre del día en español', () => {
    expect(diaSemanaNombre('2026-11-23')).toBe('Lunes');
    expect(diaSemanaNombre('2026-11-24')).toBe('Martes');
    expect(diaSemanaNombre('2026-11-29')).toBe('Domingo');
  });
});
