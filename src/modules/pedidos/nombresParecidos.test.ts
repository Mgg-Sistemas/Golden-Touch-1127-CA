import { describe, expect, it } from 'vitest';
import { palabrasClave, parecido, productoMismoNombre, productosParecidos } from './nombresParecidos';

const f = (id: string, nombre: string, estado = 'activo') => ({ id, sku: `SKU-${id}`, nombre, unidad: 'UND', estado });

describe('nombres parecidos del inventario', () => {
  it('palabras clave: sin acentos, sin palabras vacías y en singular', () => {
    expect(palabrasClave('Carpetas de Oficio lomo ancho')).toEqual(['CARPETA', 'OFICIO', 'LOMO', 'ANCHO']);
    expect(palabrasClave('SEPARADORES')).toEqual(['SEPARADOR']);
    expect(palabrasClave('Lápices')).toEqual(['LAPIZ']);
    expect(palabrasClave('  ')).toEqual([]);
  });

  it('plural y singular se parecen; palabras sueltas distintas no', () => {
    expect(parecido('CARPETAS OFICIO', 'CARPETA OFICIO MARRON')).toBeGreaterThan(0.8);
    expect(parecido('MARCA PAGINAS', 'TALONARIO DE RECIBO')).toBe(0);
    // Una palabra que empieza igual (mínimo 4 letras) cuenta.
    expect(parecido('TALONARIO RECIBO', 'TALONARIOS DE RECIBOS GRANDES')).toBeGreaterThan(0.8);
  });

  it('sugiere los más parecidos, sin el de nombre exacto ni los inactivos', () => {
    const fichas = [
      f('1', 'CARPETA OFICIO MARRON'), f('2', 'CARPETA CARTA'), f('3', 'FILTRO SEPARADOR DE AGUA'),
      f('4', 'CARPETAS OFICIO'), f('5', 'CARPETA OFICIO AZUL', 'inactivo'),
    ];
    const r = productosParecidos('carpetas oficio', fichas).map((x) => x.id);
    expect(r[0]).toBe('1');
    expect(r).not.toContain('4'); // exacto: ya se liga solo
    expect(r).not.toContain('5');
    expect(productoMismoNombre('Carpetas  Oficio', fichas)?.id).toBe('4');
    // «MARCA PAGINAS» no comparte ninguna palabra con nada del inventario.
    expect(productosParecidos('MARCA PAGINAS', fichas)).toEqual([]);
  });

  it('respeta el máximo', () => {
    const fichas = Array.from({ length: 10 }, (_, i) => f(String(i), `GUANTE TALLA ${i}`));
    expect(productosParecidos('GUANTES', fichas, 3)).toHaveLength(3);
  });
});
