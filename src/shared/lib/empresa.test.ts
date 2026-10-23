import { describe, it, expect } from 'vitest';
import {
  identidadEmpresa, registrarEmpresas, empresasRrhh, razonSocialTexto, ciudadCorta, claveEmpresaValida, etiquetaNomina, IDENTIDAD_GT, monedaPagoValida,
} from './empresa';

describe('empresas de RRHH creadas por el usuario (14/10/2026)', () => {
  it('sin cargar: GT y MTO de siempre; desconocida cae en GT', () => {
    expect(empresasRrhh().map((e) => e.clave)).toEqual(['GT', 'MTO']);
    expect(identidadEmpresa('MTO').nombre).toBe('MINERÍA TIN OXIDE, C.A.');
    expect(identidadEmpresa('XYZ').clave).toBe('GT');
  });

  it('una empresa nueva toma sus datos de la base y, sin logo, el de Golden Touch', () => {
    registrarEmpresas([
      { clave: 'GT', nombre: 'GOLDEN TOUCH 1127 C.A.', rif: null, domicilio: null, ciudad: null, email: null, whatsapp: null, logo_path: null, icono: '🏢', activa: true, orden: 1 },
      { clave: 'SERV', nombre: 'SERVICIOS EJEMPLO, C.A.', rif: 'J-1', domicilio: 'Calle 1', ciudad: 'Upata, Estado Bolívar', email: null, whatsapp: null, logo_path: null, icono: '⛏️', activa: true, orden: 3 },
      { clave: 'LOG', nombre: 'LOGOS, C.A.', rif: null, domicilio: null, ciudad: null, email: 'a@b.com', whatsapp: null, logo_path: 'LOG/1.png', logo_url: 'https://x/LOG/1.png', icono: null, activa: false, orden: 2 },
    ]);
    expect(empresasRrhh().map((e) => e.clave)).toEqual(['GT', 'LOG', 'SERV']);
    const s = identidadEmpresa('SERV');
    expect([s.nombre, s.rif, s.logoPdf, s.logoPropio, s.icono]).toEqual(['SERVICIOS EJEMPLO, C.A.', 'J-1', IDENTIDAD_GT.logoPdf, false, '⛏️']);
    // GT conserva RIF y domicilio de siempre si la fila los trae vacíos.
    expect(identidadEmpresa('GT').rif).toBe(IDENTIDAD_GT.rif);
    const l = identidadEmpresa('LOG');
    expect([l.logoPdf, l.logoPropio, l.email, l.activa]).toEqual(['https://x/LOG/1.png', true, 'a@b.com', false]);
    expect(ciudadCorta(s)).toBe('Upata');
    expect(razonSocialTexto(s)).toBe('SERVICIOS EJEMPLO, C.A.');
    expect(razonSocialTexto({ clave: 'MTO', nombre: 'X' })).toBe('Minería Tin Oxide, C.A.');
  });

  it('valida la clave y arma la etiqueta de la nómina', () => {
    expect(claveEmpresaValida('SERV')).toBe(true);
    expect(claveEmpresaValida('G')).toBe(false);
    expect(claveEmpresaValida('mto')).toBe(false);
    expect(claveEmpresaValida('ABCDEFGHI')).toBe(false);
    expect(etiquetaNomina('SERV')).toBe('Nómina SERV');
    expect(etiquetaNomina(null)).toBe('Nómina GT');
  });
});

describe('moneda de pago de la empresa (23/10/2026)', () => {
  it('GT y MTO pagan en dólares; una empresa con BRL lo dice; lo desconocido es dólares', () => {
    expect(IDENTIDAD_GT.monedaPago).toBe('USD');
    registrarEmpresas([
      { clave: 'GT', nombre: 'GOLDEN TOUCH 1127 C.A.', rif: null, domicilio: null, ciudad: null, email: null, whatsapp: null, logo_path: null, icono: '🏢', activa: true, orden: 1 },
      { clave: 'BRA', nombre: 'MINERAÇÃO BRASIL', rif: 'J-9', domicilio: null, ciudad: null, email: null, whatsapp: null, logo_path: null, icono: '🏭', activa: true, orden: 4, moneda_pago: 'BRL' },
      { clave: 'RAR', nombre: 'RARA, C.A.', rif: null, domicilio: null, ciudad: null, email: null, whatsapp: null, logo_path: null, icono: '🏢', activa: true, orden: 5, moneda_pago: 'EUR' },
    ]);
    expect(identidadEmpresa('BRA').monedaPago).toBe('BRL');
    expect(identidadEmpresa('GT').monedaPago).toBe('USD');
    expect(identidadEmpresa('RAR').monedaPago).toBe('USD');
    expect(monedaPagoValida('BRL')).toBe('BRL');
    expect(monedaPagoValida(null)).toBe('USD');
    expect(monedaPagoValida('USD')).toBe('USD');
  });
});
