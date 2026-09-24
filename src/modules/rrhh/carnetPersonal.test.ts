import { describe, expect, it } from 'vitest';
import {
  PALETA_CARNET, TEMAS_CARNET, nombreArchivoCarnet, nombreParaCarnet, primeraParte,
  textoQrPersona, type TemaCarnet,
} from './carnetPersonal';
import type { Personal } from '@/shared/lib/types';

/* ============================================================
   El carnet se imprime: un color que no contrasta no es un detalle
   estético, es una tarjeta que hay que volver a mandar a imprimir.
   Por eso el contraste se verifica acá y no a ojo.

   Se usa la fórmula de WCAG 2.1 (luminancia relativa). Umbrales:
   · 4.5 para texto normal (AA)
   · 7.0 para el nombre, que es lo que se lee de lejos
   ============================================================ */

function canalLineal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * canalLineal(r) + 0.7152 * canalLineal(g) + 0.0722 * canalLineal(b);
}

function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, oscuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

const TEMAS: TemaCarnet[] = ['oscuro', 'claro'];

describe('las dos versiones del carnet', () => {
  it('son exactamente dos: fondo negro y fondo blanco', () => {
    expect(TEMAS_CARNET.map((t) => t.valor)).toEqual(['oscuro', 'claro']);
    expect(TEMAS_CARNET.map((t) => t.sufijo)).toEqual(['negro', 'blanco']);
  });

  it('cada tema define todos los colores, sin heredar del otro', () => {
    for (const tema of TEMAS) {
      const p = PALETA_CARNET[tema];
      for (const [clave, valor] of Object.entries(p)) {
        if (clave === 'bordePanelQr') continue; // puede ser null a propósito
        expect(valor, `${tema}.${clave}`).toBeTruthy();
      }
    }
  });

  it('el fondo claro es blanco de verdad, no gris', () => {
    expect(PALETA_CARNET.claro.fondo0).toBe('#ffffff');
    expect(PALETA_CARNET.claro.fondo1).toBe('#ffffff');
  });

  it('el fondo oscuro es oscuro de verdad en los dos extremos del degradado', () => {
    expect(luminancia(PALETA_CARNET.oscuro.fondo0)).toBeLessThan(0.05);
    expect(luminancia(PALETA_CARNET.oscuro.fondo1)).toBeLessThan(0.05);
  });
});

describe('contraste · lo que se imprime se tiene que poder leer', () => {
  // El peor caso de un degradado es su extremo más parecido al texto.
  const peorFondo = (tema: TemaCarnet) => {
    const p = PALETA_CARNET[tema];
    return luminancia(p.fondo0) > luminancia(p.fondo1) ? p.fondo0 : p.fondo1;
  };

  for (const tema of TEMAS) {
    it(`${tema}: el nombre se lee de lejos (≥ 7:1)`, () => {
      expect(contraste(PALETA_CARNET[tema].texto, peorFondo(tema))).toBeGreaterThanOrEqual(7);
    });

    it(`${tema}: cargo y leyendas se leen (≥ 4.5:1)`, () => {
      expect(contraste(PALETA_CARNET[tema].tenue, peorFondo(tema))).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tema}: la cédula se lee (≥ 4.5:1)`, () => {
      expect(contraste(PALETA_CARNET[tema].cedula, peorFondo(tema))).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tema}: el correo del reverso se lee (≥ 4.5:1)`, () => {
      expect(contraste(PALETA_CARNET[tema].emailReverso, peorFondo(tema))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('el dorado del tema oscuro NO se usa en el claro: sobre blanco sería ilegible', () => {
    expect(contraste('#ffd54a', '#ffffff')).toBeLessThan(4.5);
    expect(PALETA_CARNET.claro.cedula).not.toBe('#ffd54a');
  });

  it('el panel del QR se distingue del fondo en las dos versiones', () => {
    // En el oscuro el panel blanco ya resalta solo; en el claro, como el fondo
    // también es blanco, hace falta borde o el panel desaparece.
    expect(PALETA_CARNET.oscuro.bordePanelQr).toBeNull();
    expect(PALETA_CARNET.claro.bordePanelQr).toBeTruthy();
  });

  it('el QR siempre va oscuro sobre panel claro, en los dos temas', () => {
    for (const tema of TEMAS) {
      expect(contraste('#161a20', PALETA_CARNET[tema].panelQr)).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('nombreArchivoCarnet · una versión no pisa a la otra', () => {
  const p = { nombre: 'PRUEBA', apellido: 'PRUEBA' } as Personal;

  it('el nombre dice la cara y la versión', () => {
    expect(nombreArchivoCarnet(p, 'frente', 'oscuro')).toBe('carnet_PRUEBA_PRUEBA_frente_negro.png');
    expect(nombreArchivoCarnet(p, 'reverso', 'claro')).toBe('carnet_PRUEBA_PRUEBA_reverso_blanco.png');
  });

  it('las cuatro combinaciones dan cuatro archivos distintos', () => {
    const nombres = new Set<string>();
    for (const cara of ['frente', 'reverso'] as const) {
      for (const tema of TEMAS) nombres.add(nombreArchivoCarnet(p, cara, tema));
    }
    expect(nombres.size).toBe(4);
  });

  it('sin nombre no queda un archivo sin nombre', () => {
    expect(nombreArchivoCarnet({ nombre: '', apellido: '' } as Personal, 'frente', 'claro'))
      .toBe('carnet_personal_frente_blanco.png');
  });
});

describe('textoQrPersona · el QR no depende del tema', () => {
  it('el mismo contenido en las dos versiones', () => {
    const p = { nombre: 'ANA', apellido: 'PÉREZ', cedula: 'V-12345678', cargo: 'ASISTENTE' } as Personal;
    expect(textoQrPersona(p)).toContain('GOLDEN TOUCH 1127 C.A.');
    expect(textoQrPersona(p)).toContain('Cédula: V-12345678');
  });
});

describe('nombreParaCarnet · primer nombre y primer apellido', () => {
  const persona = (nombre: string, apellido: string) => ({ nombre, apellido });

  it('de un nombre y apellido compuestos toma el primero de cada uno', () => {
    expect(nombreParaCarnet(persona('JESÚS EDUARDO', 'PÉREZ GÓMEZ'))).toBe('JESÚS PÉREZ');
  });

  it('un nombre simple queda igual', () => {
    expect(nombreParaCarnet(persona('ANA', 'SILVA'))).toBe('ANA SILVA');
  });

  it('pasa a mayúsculas, como se imprime', () => {
    expect(nombreParaCarnet(persona('ana maría', 'silva rojas'))).toBe('ANA SILVA');
  });

  it('aguanta espacios de más', () => {
    expect(nombreParaCarnet(persona('  JOSÉ   LUIS  ', '  RÍOS  PAZ '))).toBe('JOSÉ RÍOS');
  });

  it('sin apellido no deja un espacio colgando', () => {
    expect(nombreParaCarnet(persona('CARLOS', ''))).toBe('CARLOS');
    expect(nombreParaCarnet({ nombre: 'CARLOS', apellido: null })).toBe('CARLOS');
  });

  it('sin nada devuelve vacío, no «undefined»', () => {
    expect(nombreParaCarnet({ nombre: null, apellido: null })).toBe('');
  });
});

describe('primeraParte · los apellidos con partícula no se cortan mal', () => {
  it('«DE LA CRUZ MARTÍNEZ» es «DE LA CRUZ», no «DE»', () => {
    expect(primeraParte('DE LA CRUZ MARTÍNEZ')).toBe('DE LA CRUZ');
  });

  it('«DEL VALLE ROJAS» es «DEL VALLE»', () => {
    expect(primeraParte('DEL VALLE ROJAS')).toBe('DEL VALLE');
  });

  it('«DOS SANTOS SILVA» es «DOS SANTOS»', () => {
    expect(primeraParte('DOS SANTOS SILVA')).toBe('DOS SANTOS');
  });

  it('«SAN MIGUEL TORRES» es «SAN MIGUEL»', () => {
    expect(primeraParte('SAN MIGUEL TORRES')).toBe('SAN MIGUEL');
  });

  it('un apellido común no arrastra nada de más', () => {
    expect(primeraParte('PÉREZ GÓMEZ')).toBe('PÉREZ');
  });

  it('el carnet de alguien con partícula sale completo', () => {
    expect(nombreParaCarnet({ nombre: 'MARÍA JOSÉ', apellido: 'DE LA CRUZ MARTÍNEZ' }))
      .toBe('MARÍA DE LA CRUZ');
  });

  it('vacío no rompe', () => {
    expect(primeraParte('')).toBe('');
    expect(primeraParte(null)).toBe('');
    expect(primeraParte('   ')).toBe('');
  });
});

describe('el QR conserva el nombre COMPLETO', () => {
  it('lo que se acorta es lo impreso, no la identidad', () => {
    const p = { nombre: 'JESÚS EDUARDO', apellido: 'PÉREZ GÓMEZ', cedula: 'V-12345678' } as Personal;
    expect(textoQrPersona(p)).toContain('JESÚS EDUARDO PÉREZ GÓMEZ');
    expect(nombreParaCarnet(p)).toBe('JESÚS PÉREZ');
  });
});
