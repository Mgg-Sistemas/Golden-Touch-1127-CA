import { describe, it, expect } from 'vitest';
import type { NominaRenglon } from '@/shared/lib/types';
import {
  SIN_PAGAR, agruparRecibosPorFecha, alternarGrupo, alternarRenglon,
  grupoAMedias, grupoCompleto, renglonesAImprimir,
} from './recibosLote';

/** Un renglón con lo mínimo que mira este módulo. */
function ren(id: string, nombre: string, pagada_en: string | null): NominaRenglon {
  return { id, nombre, pagada_en } as unknown as NominaRenglon;
}

describe('agruparRecibosPorFecha', () => {
  it('junta en un grupo a los que cobraron el mismo día', () => {
    const g = agruparRecibosPorFecha([
      ren('1', 'ANA', '2026-09-15T14:00:00Z'),
      ren('2', 'BETO', '2026-09-15T18:30:00Z'),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].fecha).toBe('2026-09-15');
    expect(g[0].renglones.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('ordena los grupos del pago más viejo al más nuevo', () => {
    const g = agruparRecibosPorFecha([
      ren('1', 'ANA', '2026-09-20T10:00:00Z'),
      ren('2', 'BETO', '2026-09-15T10:00:00Z'),
    ]);
    expect(g.map((x) => x.fecha)).toEqual(['2026-09-15', '2026-09-20']);
  });

  it('los que no cobraron van al final, en su propio grupo', () => {
    const g = agruparRecibosPorFecha([
      ren('1', 'ANA', null),
      ren('2', 'BETO', '2026-09-15T10:00:00Z'),
      ren('3', 'CARLA', null),
    ]);
    expect(g.map((x) => x.clave)).toEqual(['2026-09-15', SIN_PAGAR]);
    expect(g[1].renglones).toHaveLength(2);
    expect(g[1].fecha).toBeNull();
  });

  it('un pago de la noche no se pasa al día siguiente', () => {
    // 22:00 en Caracas es el día siguiente en UTC si se arma un Date. Acá se
    // corta el texto, así que el día es el que dice el dato.
    const g = agruparRecibosPorFecha([ren('1', 'ANA', '2026-09-15T22:00:00Z')]);
    expect(g[0].fecha).toBe('2026-09-15');
  });

  it('dentro del grupo, por nombre', () => {
    const g = agruparRecibosPorFecha([
      ren('1', 'ZULEIMA', '2026-09-15T10:00:00Z'),
      ren('2', 'ANDRÉS', '2026-09-15T10:00:00Z'),
    ]);
    expect(g[0].renglones.map((r) => r.nombre)).toEqual(['ANDRÉS', 'ZULEIMA']);
  });

  it('sin renglones no hay grupos', () => {
    expect(agruparRecibosPorFecha([])).toEqual([]);
  });
});

describe('renglonesAImprimir', () => {
  const lista = [ren('1', 'ANA', null), ren('2', 'BETO', null), ren('3', 'CARLA', null)];

  it('sin nada desmarcado, se imprimen todos', () => {
    expect(renglonesAImprimir(lista, new Set()).map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('lo desmarcado queda afuera', () => {
    expect(renglonesAImprimir(lista, new Set(['2'])).map((r) => r.id)).toEqual(['1', '3']);
  });

  it('un renglón que nadie tocó entra solo', () => {
    // Se guardan los EXCLUIDOS, no los incluidos: si aparece un renglón nuevo
    // después de abrir la pantalla, entra a la impresión sin marcarlo.
    const conNuevo = [...lista, ren('4', 'DANIEL', null)];
    expect(renglonesAImprimir(conNuevo, new Set(['2'])).map((r) => r.id)).toEqual(['1', '3', '4']);
  });

  it('se pueden desmarcar todos', () => {
    expect(renglonesAImprimir(lista, new Set(['1', '2', '3']))).toEqual([]);
  });
});

describe('estado de la casilla del grupo', () => {
  const grupo = agruparRecibosPorFecha([
    ren('1', 'ANA', '2026-09-15T10:00:00Z'),
    ren('2', 'BETO', '2026-09-15T10:00:00Z'),
  ])[0];

  it('completo cuando no hay ninguno desmarcado', () => {
    expect(grupoCompleto(grupo, new Set())).toBe(true);
    expect(grupoAMedias(grupo, new Set())).toBe(false);
  });

  it('a medias cuando falta uno', () => {
    expect(grupoCompleto(grupo, new Set(['1']))).toBe(false);
    expect(grupoAMedias(grupo, new Set(['1']))).toBe(true);
  });

  it('ni completo ni a medias cuando están todos desmarcados', () => {
    expect(grupoCompleto(grupo, new Set(['1', '2']))).toBe(false);
    expect(grupoAMedias(grupo, new Set(['1', '2']))).toBe(false);
  });
});

describe('alternar', () => {
  const grupo = agruparRecibosPorFecha([
    ren('1', 'ANA', '2026-09-15T10:00:00Z'),
    ren('2', 'BETO', '2026-09-15T10:00:00Z'),
  ])[0];

  it('desmarcar el grupo excluye a todos los suyos', () => {
    expect([...alternarGrupo(grupo, new Set(), false)].sort()).toEqual(['1', '2']);
  });

  it('marcar el grupo saca a los suyos de la exclusión y no toca a los demás', () => {
    const proximo = alternarGrupo(grupo, new Set(['1', '2', '9']), true);
    expect([...proximo]).toEqual(['9']);
  });

  it('no modifica el conjunto que recibe', () => {
    // React compara por referencia: si se mutara el Set, la pantalla no se
    // enteraría de que cambió.
    const antes = new Set(['1']);
    const proximo = alternarGrupo(grupo, antes, false);
    expect([...antes]).toEqual(['1']);
    expect(proximo).not.toBe(antes);
  });

  it('un renglón suelto se marca y se desmarca', () => {
    expect([...alternarRenglon('5', new Set(), false)]).toEqual(['5']);
    expect([...alternarRenglon('5', new Set(['5']), true)]).toEqual([]);
  });
});
