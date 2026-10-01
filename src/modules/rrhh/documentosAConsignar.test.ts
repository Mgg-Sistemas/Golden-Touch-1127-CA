import { describe, expect, it } from 'vitest';
import { SEGMENTOS_DOCUMENTOS, todosLosDocumentos, totalDocumentos } from './documentosAConsignar';

describe('SEGMENTOS_DOCUMENTOS · la hoja de documentos a consignar', () => {
  it('están los segmentos que pidió el usuario', () => {
    const titulos = SEGMENTOS_DOCUMENTOS.map((s) => s.titulo.toLowerCase());
    expect(titulos.some((t) => t.includes('personales'))).toBe(true);
    expect(titulos.some((t) => t.includes('académicos'))).toBe(true);
    expect(titulos.some((t) => t.includes('salud'))).toBe(true);
    expect(titulos.some((t) => t.includes('matrimonio'))).toBe(true);
  });

  it('ningún segmento queda vacío: un título sin casilleros es una hoja a medio hacer', () => {
    for (const s of SEGMENTOS_DOCUMENTOS) {
      expect(s.titulo.trim().length).toBeGreaterThan(0);
      expect(s.documentos.length).toBeGreaterThan(0);
    }
  });

  it('no hay documentos repetidos: tildar dos veces lo mismo confunde el expediente', () => {
    const todos = todosLosDocumentos();
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('ningún renglón viene vacío ni con espacios de sobra', () => {
    for (const d of todosLosDocumentos()) {
      expect(d).toBe(d.trim());
      expect(d.length).toBeGreaterThan(3);
    }
  });

  it('no se pide nada bancario: la hoja de ingreso se armó sin datos de transferencia', () => {
    const texto = todosLosDocumentos().join(' | ').toLowerCase();
    for (const palabra of ['banco', 'bancaria', 'cuenta bancaria', 'transferencia']) {
      expect(texto).not.toContain(palabra);
    }
  });

  it('el total coincide con lo que hay en los segmentos', () => {
    expect(totalDocumentos()).toBe(todosLosDocumentos().length);
    expect(totalDocumentos()).toBe(
      SEGMENTOS_DOCUMENTOS.reduce((n, s) => n + s.documentos.length, 0));
  });
});
