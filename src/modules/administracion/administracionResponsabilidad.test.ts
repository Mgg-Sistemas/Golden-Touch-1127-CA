import { describe, it, expect } from 'vitest';
import {
  responsablesDeObjetivo,
  responsablesEfectivosDocumento,
  imputacion,
} from './administracionResponsabilidad';
import type { DocumentoEmpresa, Responsabilidad } from './admin.repository';
import type { ItemAgenda } from './administracionAgenda';

const resp = (over: Partial<Responsabilidad>): Responsabilidad => ({
  id: Math.random().toString(36), empresaClave: 'GT', usuarioEmail: 'ana@gt.com', objetivoTipo: 'carpeta', objetivoId: 'legal', ...over,
});
const doc = (over: Partial<DocumentoEmpresa>): DocumentoEmpresa => ({ id: 'd1', empresaClave: 'GT', carpeta: 'legal', ...over } as DocumentoEmpresa);
const item = (over: Partial<ItemAgenda>): ItemAgenda => ({
  origen: 'documento', id: 'd1', empresaClave: 'GT', centroAcopioId: null, responsable: null,
  titulo: 'x', fecha: null, status: 'vigente', diasRestantes: 10, prioridad: null, ...over,
});

describe('responsablesDeObjetivo', () => {
  it('devuelve los emails distintos de un objetivo', () => {
    const rs = [resp({ usuarioEmail: 'ana@gt.com' }), resp({ usuarioEmail: 'bea@gt.com' }), resp({ usuarioEmail: 'ana@gt.com' })];
    expect(responsablesDeObjetivo('carpeta', 'legal', rs).sort()).toEqual(['ana@gt.com', 'bea@gt.com']);
  });
});

describe('responsablesEfectivosDocumento (herencia de carpeta)', () => {
  const rs = [
    resp({ usuarioEmail: 'carp@gt.com', objetivoTipo: 'carpeta', objetivoId: 'legal' }),
    resp({ usuarioEmail: 'prop@gt.com', objetivoTipo: 'documento', objetivoId: 'd1' }),
  ];
  it('usa los propios cuando existen (heredado=false)', () => {
    expect(responsablesEfectivosDocumento(doc({ id: 'd1', carpeta: 'legal' }), rs)).toEqual({ emails: ['prop@gt.com'], heredado: false });
  });
  it('hereda los de la carpeta cuando no tiene propios (heredado=true)', () => {
    expect(responsablesEfectivosDocumento(doc({ id: 'd2', carpeta: 'legal' }), rs)).toEqual({ emails: ['carp@gt.com'], heredado: true });
  });
  it('sin propios ni de carpeta → vacío, sin crashear', () => {
    expect(responsablesEfectivosDocumento(doc({ id: 'd3', carpeta: 'otra' }), rs)).toEqual({ emails: [], heredado: false });
  });
});

describe('imputacion (solo al vencer/incumplir)', () => {
  const rs = [resp({ usuarioEmail: 'ana@gt.com', objetivoTipo: 'documento', objetivoId: 'd1' })];
  const docPorId = new Map([['d1', doc({ id: 'd1', carpeta: 'legal' })]]);
  it('un item vigente NO se imputa', () => {
    expect(imputacion(item({ status: 'vigente' }), rs, docPorId)).toEqual([]);
  });
  it('un documento vencido se imputa a sus responsables efectivos', () => {
    expect(imputacion(item({ origen: 'documento', id: 'd1', status: 'vencido' }), rs, docPorId)).toEqual(['ana@gt.com']);
  });
  it('un gasto vencido usa responsabilidad directa', () => {
    const rg = [resp({ usuarioEmail: 'g@gt.com', objetivoTipo: 'gasto', objetivoId: 'mov9' })];
    expect(imputacion(item({ origen: 'gasto', id: 'mov9', status: 'vencido_en_tramite' }), rg, docPorId)).toEqual(['g@gt.com']);
  });
});
