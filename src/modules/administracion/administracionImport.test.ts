import { describe, expect, it } from 'vitest';
import { parseImportacion, type ContextoImport } from './administracionImport';

const ctx: ContextoImport = {
  empresas: [{ clave: 'GT', nombre: 'Golden Touch 1127, C.A.' }, { clave: 'DEMO1', nombre: 'Minera Demo Norte, C.A.' }],
  categorias: [{ id: 'cat-serv', nombre: 'Servicios públicos' }, { id: 'cat-alq', nombre: 'Alquiler' }],
};

describe('parseImportacion', () => {
  it('mapea columnas por nombre, no por orden; deriva período y estado', () => {
    const csv = [
      'fecha,empresa,concepto,moneda,monto,categoria',
      '2026-10-05,GT,Agua,Bs,"1.800,00",Servicios públicos',
      '05/10/2026,DEMO1,Internet,USD,95.50,',
    ].join('\n');
    const { filas, errores } = parseImportacion(csv, ctx);
    expect(errores).toEqual([]);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ empresaClave: 'GT', concepto: 'Agua', moneda: 'Bs', monto: 1800, periodo: '2026-10', estadoPago: 'pagado', origen: 'importado', categoriaGastoId: 'cat-serv' });
    expect(filas[1]).toMatchObject({ empresaClave: 'DEMO1', monto: 95.5, moneda: 'USD', categoriaGastoId: null });
  });

  it('rechaza filas inválidas con su motivo, sin frenar las demás', () => {
    const csv = [
      'empresa,fecha,concepto,monto,moneda',
      'NOEXISTE,2026-10-01,X,10,USD',
      'GT,fecha-mala,X,10,USD',
      'GT,2026-10-01,,10,USD',
      'GT,2026-10-01,Y,abc,USD',
      'GT,2026-10-01,Z,10,EUR',
      'GT,2026-10-01,Bien,10,USD',
    ].join('\n');
    const { filas, errores } = parseImportacion(csv, ctx);
    expect(filas).toHaveLength(1);
    expect(filas[0].concepto).toBe('Bien');
    expect(errores.map((e) => e.fila)).toEqual([2, 3, 4, 5, 6]);
    expect(errores[0].motivo).toMatch(/Empresa/);
  });

  it('falla claro si falta una columna obligatoria o no hay datos', () => {
    expect(parseImportacion('empresa,fecha,concepto,monto\n...', ctx).errores[0].motivo).toMatch(/moneda/);
    expect(parseImportacion('empresa,fecha,concepto,monto,moneda', ctx).errores[0].motivo).toMatch(/no tiene datos/);
  });
});
