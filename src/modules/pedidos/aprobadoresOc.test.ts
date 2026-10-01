import { describe, expect, it } from 'vitest';
import { APROBADOR_LEYDIS_EMAIL, puedeAprobarOc, puedeCancelarOc } from './aprobadoresOc';

describe('puedeCancelarOc · quién puede cancelar según la etapa', () => {
  it('antes de la firma del GG, Compras cancela (rol normal)', () => {
    for (const e of ['pendiente', 'aprobada', 'oc_creada', 'desistida_proveedor'])
      expect(puedeCancelarOc(e, 'compras', 'x@y.com'), e).toBe(true);
  });
  it('ya aprobada por el GG (espera método o confirmada pagar), solo quien aprueba OC', () => {
    for (const e of ['confirmada_metodo', 'oc_aprobada']) {
      expect(puedeCancelarOc(e, 'compras', 'x@y.com'), e).toBe(false);
      expect(puedeCancelarOc(e, 'admin', 'x@y.com'), e).toBe(true);
      expect(puedeCancelarOc(e, 'jefa_de_administracion', 'x@y.com'), e).toBe(true);
      expect(puedeCancelarOc(e, 'compras', APROBADOR_LEYDIS_EMAIL), e).toBe(true);
    }
  });
  it('pagada, recibida o finalizada no se cancelan (ni el gerente)', () => {
    for (const e of ['pagada', 'recibida', 'finalizada', 'cancelada'])
      expect(puedeCancelarOc(e, 'admin', 'x@y.com'), e).toBe(false);
  });
  it('puedeAprobarOc sigue igual', () => {
    expect(puedeAprobarOc('admin', null)).toBe(true);
    expect(puedeAprobarOc('compras', null)).toBe(false);
  });
});
