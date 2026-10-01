import { describe, expect, it } from 'vitest';
import { filasAGuardar } from './minutas.repository';
import type { BorradorMinuta } from './minutaModelo';

const base: BorradorMinuta = {
  fecha: '2026-10-01', lugar: '', hora_inicio: '', objetivo: 'Revisión',
  orden_dia: ['  Presupuesto  ', '', '   '],
  participantes: [{ personal_id: null, nombre: 'Ana', cargo: 'Gerente' },
                  { personal_id: null, nombre: '', cargo: '' }],
  acuerdos: [{ responsable: '', actividad: '', fecha_compromiso: null }],
  otros_asuntos: '', proxima_fecha: null, proximos_puntos: [],
  avances: [], observaciones: '', estado: 'borrador', anexar_adjuntos_pdf: false,
};

describe('filasAGuardar', () => {
  it('descarta las filas vacías que el usuario dejó sin llenar', () => {
    const fila = filasAGuardar(base);
    expect(fila.orden_dia).toEqual(['Presupuesto']);
    expect(fila.participantes).toHaveLength(1);
    expect(fila.acuerdos).toEqual([]);
  });
  it('los textos vacíos se guardan como null, no como cadena vacía', () => {
    const fila = filasAGuardar(base);
    expect(fila.lugar).toBeNull();
    expect(fila.hora_inicio).toBeNull();
  });
  it('incluye el texto de búsqueda ya armado', () => {
    const fila = filasAGuardar(base) as { busq: string };
    expect(fila.busq).toContain('revision');
    expect(fila.busq).toContain('ana');
  });
});
