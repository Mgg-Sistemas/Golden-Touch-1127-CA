import { describe, expect, it } from 'vitest';
import {
  FILTRO_BITACORA_VACIO, conteoPorSegmento, errorEntregaMantenimiento, errorRegistroEntrega, filtrarBitacora,
  filtrarSurtidos, resumenEntrega, segmentosDe, type RegistroBitacora,
} from './entregasAlmacen';

const et = (t: string) => t.replace('_', ' ');
const reg = (p: Partial<RegistroBitacora> & { id: string }): RegistroBitacora => ({ fecha: '2026-11-10', tipo: null, ...p });

describe('Entregas del almacén para mantenimiento', () => {
  it('resume la entrega como la ve Maquinaria', () => {
    const items = [1, 2, 3, 4].map((i) => ({ producto_id: `p${i}`, producto_nombre: `FILTRO ${i}`, unidad: 'UND', cantidad: 1, almacen: 'Depósito Mina' }));
    expect(resumenEntrega({ items, equipo_nombre: 'EXCAVADORA 320', entregado_por_nombre: 'Pedro', entregado_por: 'p@x.com' }))
      .toBe('Pedro entrega 4 ítems para la máquina EXCAVADORA 320');
  });

  it('el almacenista tiene que elegir la máquina si marca mantenimiento', () => {
    expect(errorEntregaMantenimiento(false, '')).toBeNull();
    expect(errorEntregaMantenimiento(true, '')).toBe('Elige la máquina a la que va el material.');
    expect(errorEntregaMantenimiento(true, 'eq1')).toBeNull();
  });

  it('Maquinaria tiene que decir qué hizo y cuándo', () => {
    const ok = { tipos: ['cambio_filtro'], fecha: '2026-11-10', horometro: '1250', kilometraje: '' };
    expect(errorRegistroEntrega(ok)).toBeNull();
    expect(errorRegistroEntrega({ ...ok, tipos: [] })).toMatch(/al menos un tipo/);
    expect(errorRegistroEntrega({ ...ok, fecha: '' })).toMatch(/fecha/);
    expect(errorRegistroEntrega({ ...ok, fecha: '2999-01-01' })).toMatch(/futura/);
    expect(errorRegistroEntrega({ ...ok, horometro: 'abc' })).toMatch(/horómetro/);
  });
});

describe('Bitácora por segmentos', () => {
  const rows = [
    reg({ id: '1', tipo: 'cambio_filtro', tipos: ['cambio_filtro', 'cambio_aceite'], fecha: '2026-11-01', mecanico: 'JOSE' }),
    reg({ id: '2', tipo: 'repuestos', consumibles: 'MANGUERA HIDRÁULICA 1/2', fecha: '2026-11-05' }),
    reg({ id: '3', tipo: 'otro', trabajo: 'Cambio de cauchos delanteros', fecha: '2026-10-20' }),
    reg({ id: '4', tipo: 'lectura', fecha: '2026-11-09' }),
  ];

  it('clasifica por tipo y, en registros viejos, por las palabras del trabajo', () => {
    expect(segmentosDe(rows[0])).toEqual(['filtros', 'aceite']);
    expect(segmentosDe(rows[1])).toEqual(['mangueras', 'hidraulico', 'piezas']);
    expect(segmentosDe(rows[2])).toContain('cauchos');
    expect(segmentosDe(rows[3])).toEqual(['otros']);
  });

  it('cada switch filtra su bitácora por fechas y por buscador', () => {
    expect(filtrarBitacora(rows, { ...FILTRO_BITACORA_VACIO, segmento: 'filtros' }, et).map((r) => r.id)).toEqual(['1']);
    expect(filtrarBitacora(rows, { ...FILTRO_BITACORA_VACIO, desde: '2026-11-01', hasta: '2026-11-06' }, et).map((r) => r.id)).toEqual(['1', '2']);
    expect(filtrarBitacora(rows, { ...FILTRO_BITACORA_VACIO, texto: 'jose' }, et).map((r) => r.id)).toEqual(['1']);
    expect(filtrarBitacora(rows, { ...FILTRO_BITACORA_VACIO, texto: 'hidraulica 1/2' }, et).map((r) => r.id)).toEqual(['2']);
    const c = conteoPorSegmento(rows);
    expect(c.todos).toBe(4);
    expect(c.filtros).toBe(1);
    expect(c.mangueras).toBe(1);
  });

  it('el segmento Combustible filtra los surtidos por fecha y texto', () => {
    const surtidos = [
      { fecha: '2026-11-02', litros: 120, horometro_fin: 1500, kilometraje: null, ubicacion: 'MINA', autorizado_por: 'ANA' },
      { fecha: '2026-10-02', litros: 80, horometro_fin: 1400, kilometraje: null, ubicacion: 'PLANTA', autorizado_por: 'LUIS' },
    ];
    expect(filtrarSurtidos(surtidos, { ...FILTRO_BITACORA_VACIO, desde: '2026-11-01' })).toHaveLength(1);
    expect(filtrarSurtidos(surtidos, { ...FILTRO_BITACORA_VACIO, texto: 'luis' })[0].litros).toBe(80);
  });
});
