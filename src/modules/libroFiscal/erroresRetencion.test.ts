import { describe, expect, it } from 'vitest';
import { codigoRet, errorRetencion } from './erroresRetencion';

describe('errores de la base en texto de pantalla', () => {
  it('reconoce el código RET_* dentro del mensaje', () => {
    expect(codigoRet('RET_NUMERO_FALTA: la serie es manual')).toBe('RET_NUMERO_FALTA');
    expect(codigoRet('duplicate key')).toBeNull();
    expect(codigoRet(undefined)).toBeNull();
  });

  it('RET_NUMERO_FALTA (V2, serie manual) pide escribir el número', () => {
    const e = errorRetencion({ code: 'P0001', message: 'RET_NUMERO_FALTA: la serie de IVA se numera a mano.' });
    expect(e.message).toContain('escribe el número del comprobante');
    expect(e.message).not.toContain('RET_');
  });

  it('los rechazos de la serie (V2) llegan como texto, sin el código', () => {
    const casos: Array<[string, string]> = [
      ['RET_NUMERO_NO_ES_EL_ULTIMO', 'la última retención de su serie'],
      ['RET_NUMERO_NO_EDITABLE', 'declarada o anulada'],
      ['RET_NUMERO_NO_SE_QUITA', 'no se puede quitar'],
      ['RET_SERIE_LLENA', 'último número'],
    ];
    for (const [codigo, texto] of casos) {
      const e = errorRetencion({ code: 'P0001', message: `${codigo}: detalle de la base.` });
      expect(e.message).toContain(texto);
      expect(e.message).not.toContain('RET_');
    }
  });

  it('permiso, régimen y número repetido por su código de Postgres', () => {
    expect(errorRetencion({ code: '42501', message: 'permission denied' }).message).toContain('permiso');
    expect(errorRetencion({ code: '23514', message: 'check_violation' }).message).toContain('régimen');
    expect(errorRetencion({ code: '23505', message: 'duplicate key' }).message).toContain('ya se dio');
  });

  it('un código que no está en la lista deja el texto de la base; sin texto, el de respaldo', () => {
    expect(errorRetencion({ code: 'P0001', message: 'RET_ALGO_NUEVO: detalle' }).message).toBe('RET_ALGO_NUEVO: detalle');
    expect(errorRetencion({ code: 'P0001' }, 'No se pudo.').message).toBe('No se pudo.');
  });

  it('documentos (VF): tipo y factura afectada de una nota', () => {
    expect(errorRetencion({ code: 'P0001', message: 'RET_DOCUMENTO_TIPO: x' }).message).toContain('nota de crédito');
    expect(errorRetencion({ code: 'P0001', message: 'RET_DOCUMENTO_AFECTADO: x' }).message).toContain('la factura que ajusta');
  });
});
