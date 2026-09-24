import { describe, expect, it } from 'vitest';
import {
  LABEL_DOCUMENTO, NOMBRE_DOC_MAX, NOMBRE_DOC_MIN, TIPOS_DOCUMENTO,
  errorNombreDocumento, nombreSugerido,
} from './documentos.repository';

describe('errorNombreDocumento', () => {
  it('un nombre normal está bien', () => {
    expect(errorNombreDocumento('Título universitario')).toBeNull();
  });

  it('vacío no: es lo único que distingue un documento de otro', () => {
    expect(errorNombreDocumento('')).toMatch(/al menos 3 caracteres/);
    expect(errorNombreDocumento('   ')).toMatch(/al menos 3 caracteres/);
  });

  it('los espacios no cuentan para llegar al mínimo', () => {
    expect(errorNombreDocumento('  ab  ')).toMatch(/al menos 3 caracteres/);
  });

  it('justo en el mínimo, pasa', () => {
    expect(errorNombreDocumento('CV2')).toBeNull();
  });

  it('el mensaje explica POR QUÉ hace falta, no solo que falta', () => {
    expect(errorNombreDocumento('a')).toMatch(/distingue un documento de otro/);
  });

  it('no deja un nombre interminable', () => {
    expect(errorNombreDocumento('A'.repeat(NOMBRE_DOC_MAX))).toBeNull();
    expect(errorNombreDocumento('A'.repeat(NOMBRE_DOC_MAX + 1))).toMatch(/no puede pasar de/);
  });

  it('el mínimo y el máximo no se cruzan', () => {
    expect(NOMBRE_DOC_MIN).toBeLessThan(NOMBRE_DOC_MAX);
  });
});

describe('nombreSugerido · el nombre del archivo como punto de partida', () => {
  it('saca la extensión', () => {
    expect(nombreSugerido('titulo.pdf')).toBe('titulo');
  });

  it('cambia guiones y guiones bajos por espacios', () => {
    expect(nombreSugerido('certificado_medico_2026.pdf')).toBe('certificado medico 2026');
    expect(nombreSugerido('referencia-laboral.jpg')).toBe('referencia laboral');
  });

  it('el caso real: una captura de pantalla queda legible, aunque haya que corregirla', () => {
    // Este es el nombre que salía en pantalla y no le decía nada a nadie.
    const sugerido = nombreSugerido('Captura de pantalla 2026-09-24 a la(s) 2.41.57 p. m..png');
    expect(sugerido).not.toMatch(/\.png$/);
    expect(errorNombreDocumento(sugerido)).toBeNull();
  });

  it('solo saca la ÚLTIMA extensión, no todos los puntos', () => {
    expect(nombreSugerido('acta.notariada.pdf')).toBe('acta.notariada');
  });

  it('un nombre larguísimo se recorta al máximo permitido', () => {
    expect(nombreSugerido(`${'A'.repeat(200)}.pdf`).length).toBe(NOMBRE_DOC_MAX);
  });

  it('un archivo sin nombre no rompe', () => {
    expect(nombreSugerido('')).toBe('');
  });
});

describe('el catálogo de tipos', () => {
  it('los tres fijos siguen siendo los que se piden siempre', () => {
    expect(TIPOS_DOCUMENTO.map((t) => t.tipo)).toEqual(['rif', 'ci', 'cv']);
  });

  it('«otro» NO está en el catálogo: no es un casillero a llenar sino un agregado', () => {
    expect(TIPOS_DOCUMENTO.some((t) => t.tipo === 'otro')).toBe(false);
  });

  it('pero sí tiene etiqueta, para cuando hay que nombrarlo', () => {
    expect(LABEL_DOCUMENTO.otro).toBeTruthy();
  });
});
