import { describe, it, expect } from 'vitest';
import {
  cantidadEnLetras, cedulaConPuntos, errorFotosActa, errorNumeroActa, fechaCartaVE, listaItemsActa, nombreArchivoSeguro,
  parrafoActa, siguienteNumeroActa, textoItemActa,
} from './actas';

describe('número del acta', () => {
  it('sin ninguna acta: la primera se escribe a mano (no se propone nada)', () => {
    expect(siguienteNumeroActa([], 2026)).toBe('');
  });
  it('después de la primera, propone la siguiente del año', () => {
    expect(siguienteNumeroActa(['026-2026'], 2026)).toBe('027-2026');
    expect(siguienteNumeroActa(['026-2026', '031-2026', '009-2026'], 2026)).toBe('032-2026');
  });
  it('con actas solo de años anteriores, empieza en 001 del año', () => {
    expect(siguienteNumeroActa(['140-2025'], 2026)).toBe('001-2026');
  });
  it('ignora lo que no tiene formato', () => {
    expect(siguienteNumeroActa(['basura'], 2026)).toBe('');
  });
  it('vacío es error: si se borra el propuesto, se escribe a mano', () => {
    expect(errorNumeroActa('')).toMatch(/Escribe el número/);
    expect(errorNumeroActa('  ')).toMatch(/Escribe el número/);
  });
  it('valida el formato NNN-AAAA', () => {
    expect(errorNumeroActa('026-2026')).toBeNull();
    expect(errorNumeroActa('26/2026')).toMatch(/026-2026/);
  });
});

describe('texto de la carta', () => {
  it('cédula con puntos', () => {
    expect(cedulaConPuntos('V12874838')).toBe('V-12.874.838');
    expect(cedulaConPuntos('V-12.874.838')).toBe('V-12.874.838');
  });
  it('cantidad en letras', () => {
    expect(cantidadEnLetras(1)).toBe('un (1)');
    expect(cantidadEnLetras(35)).toBe('treinta y cinco (35)');
    expect(cantidadEnLetras(150)).toBe('150');
  });
  it('fecha de la carta', () => {
    expect(fechaCartaVE('2026-10-12')).toBe('Puerto Ordaz, 12 de octubre del 2026');
  });
  it('ítems en una frase', () => {
    const it1 = { descripcion: 'laptop', cantidad: 1, serial: 'ABC', numero_linea: null, unidad: 'und' };
    const it2 = { descripcion: 'cargador', cantidad: 2, serial: null, numero_linea: null, unidad: null };
    expect(textoItemActa(it1)).toBe('un (1) LAPTOP, serial ABC');
    expect(listaItemsActa([it1, it2])).toBe('un (1) LAPTOP, serial ABC y dos (2) CARGADOR');
  });
  it('sin quien suscribe, deja la línea en blanco para escribirlo a mano', () => {
    const p = parrafoActa({ empresa: 'Golden Touch 1127 C.A.', entregaNombre: '', entregaCedula: '', entregaCargo: '', recibeNombre: 'Ana Pérez', items: [{ descripcion: 'radio', cantidad: 1, serial: null, numero_linea: null, unidad: null, retornable: true }] });
    expect(p).toMatch(/^Quien suscribe, _{10,}/);
    expect(p).toMatch(/PROPIEDAD de Golden Touch 1127 C\.A\./);
    expect(p).toMatch(/devolución inmediata/);
  });
  it('una dotación (no retorna) no pide devolución', () => {
    const p = parrafoActa({ empresa: 'Golden Touch 1127 C.A.', entregaNombre: 'Maria Lopez', entregaCedula: 'V1234567', entregaCargo: 'Gerente General', recibeNombre: 'Ana', items: [{ descripcion: 'botas', cantidad: 1, serial: null, numero_linea: null, unidad: null, retornable: false }] });
    expect(p).not.toMatch(/devolución inmediata/);
    expect(p).toMatch(/MARIA LOPEZ, titular de la cédula de identidad N° V-1.234.567, Gerente General/);
  });
});

describe('archivos del acta', () => {
  it('máximo 4 fotos y solo imágenes', () => {
    const foto = { name: 'a.jpg', type: 'image/jpeg', size: 1000 };
    expect(errorFotosActa([foto], 4)).toMatch(/hasta 4/);
    expect(errorFotosActa([{ name: 'a.pdf', type: 'application/pdf', size: 10 }])).toMatch(/no es una imagen/);
    expect(errorFotosActa([foto, foto])).toBeNull();
  });
  it('nombre de archivo seguro', () => {
    expect(nombreArchivoSeguro('Acta firmada Ñandú #2.pdf')).toBe('Acta_firmada_Nandu_2.pdf');
  });
});
