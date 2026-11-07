import { describe, it, expect } from 'vitest';
import { construirAvisos } from './administracionAvisos';
import type { Aviso, DocumentoEmpresa, Responsabilidad } from './admin.repository';
import type { ItemAgenda } from './administracionAgenda';

const item = (over: Partial<ItemAgenda>): ItemAgenda => ({
  origen: 'documento', id: 'd1', empresaClave: 'GT', centroAcopioId: null, responsable: null,
  titulo: 'RUPDAE', fecha: '2026-11-01', status: 'vencido', diasRestantes: -6, prioridad: null, ...over,
});
const resp = (over: Partial<Responsabilidad>): Responsabilidad => ({
  id: Math.random().toString(36), empresaClave: 'GT', usuarioEmail: 'ana@gt.com', objetivoTipo: 'documento', objetivoId: 'd1', ...over,
});
const docPorId = new Map<string, DocumentoEmpresa>();

describe('construirAvisos (dedup)', () => {
  it('genera vencido/por_vencer por responsable efectivo; vigente no genera', () => {
    const items = [
      item({ origen: 'documento', id: 'd1', status: 'vencido' }),
      item({ origen: 'gasto', id: 'm1', status: 'por_vencer', titulo: 'Agua' }),
      item({ origen: 'gestion', id: 'g1', status: 'vigente' }),
    ];
    const rs = [resp({ usuarioEmail: 'ana@gt.com', objetivoTipo: 'documento', objetivoId: 'd1' })];
    const nuevos = construirAvisos(items, rs, docPorId, []);
    // d1 vencido → 1 aviso para ana; m1 por_vencer sin responsable → 1 aviso con responsable null; g1 vigente → 0
    expect(nuevos).toHaveLength(2);
    expect(nuevos.find((a) => a.origenId === 'd1')).toMatchObject({ tipo: 'vencido', responsableEmail: 'ana@gt.com', origen: 'documento' });
    expect(nuevos.find((a) => a.origenId === 'm1')).toMatchObject({ tipo: 'por_vencer', responsableEmail: null });
  });

  it('no repite un aviso que ya existe (dedup por origen+origenId+tipo+responsable)', () => {
    const items = [item({ origen: 'documento', id: 'd1', status: 'vencido' })];
    const rs = [resp({ usuarioEmail: 'ana@gt.com', objetivoTipo: 'documento', objetivoId: 'd1' })];
    const existentes: Aviso[] = [{
      id: 'x', empresaClave: 'GT', tipo: 'vencido', origen: 'documento', origenId: 'd1',
      responsableEmail: 'ana@gt.com', fecha: '2026-11-01', texto: 'ya', leido: false,
    }];
    expect(construirAvisos(items, rs, docPorId, existentes)).toHaveLength(0);
  });
});
