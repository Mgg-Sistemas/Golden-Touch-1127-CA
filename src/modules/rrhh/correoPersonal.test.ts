import { describe, expect, it } from 'vitest';
import { errorCorreo, normalizarCorreo } from './correoPersonal';

describe('normalizarCorreo', () => {
  it('baja a minúsculas y recorta, igual que el trigger de la base', () => {
    expect(normalizarCorreo('  Juan.Perez@GMAIL.com ')).toBe('juan.perez@gmail.com');
  });

  it('vacío es null, no cadena vacía', () => {
    expect(normalizarCorreo('')).toBeNull();
    expect(normalizarCorreo('   ')).toBeNull();
    expect(normalizarCorreo(null)).toBeNull();
    expect(normalizarCorreo(undefined)).toBeNull();
  });
});

describe('errorCorreo', () => {
  it('sin correo no es un error: el campo no es obligatorio', () => {
    expect(errorCorreo('')).toBeNull();
    expect(errorCorreo(null)).toBeNull();
    expect(errorCorreo('   ')).toBeNull();
  });

  it('acepta correos normales', () => {
    for (const c of ['a@b.co', 'juan.perez@gmail.com', 'JUAN@EMPRESA.COM.VE', 'j+etiqueta@dominio.org']) {
      expect(errorCorreo(c)).toBeNull();
    }
  });

  it('rechaza lo que no tiene forma de correo', () => {
    for (const c of ['no-es-correo', 'sin@dominio', '@gmail.com', 'juan@', 'con espacio@gmail.com', 'dos@@gmail.com']) {
      expect(errorCorreo(c)).toContain('no parece válido');
    }
  });
});
