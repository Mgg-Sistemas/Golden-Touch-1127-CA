import { describe, it, expect } from 'vitest';
import { resumenAgenda, type ItemAgenda } from './administracionAgenda';

const item = (status: ItemAgenda['status']): ItemAgenda => ({
  origen: 'documento', id: Math.random().toString(36), empresaClave: 'GT', centroAcopioId: null,
  responsable: null, titulo: 'x', fecha: null, status, diasRestantes: null, prioridad: null,
});

describe('resumenAgenda', () => {
  it('cuenta vencidos (incluye en trámite), por vencer y vigentes', () => {
    const r = resumenAgenda([
      item('vencido'), item('vencido_en_tramite'), item('por_vencer'),
      item('vigente'), item('vigente'), item('no_vence'),
    ]);
    expect(r).toEqual({ vencidos: 2, porVencer: 1, vigentes: 2 });
  });
});
