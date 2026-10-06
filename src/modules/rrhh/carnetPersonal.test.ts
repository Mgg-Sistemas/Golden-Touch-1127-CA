import { describe, expect, it } from 'vitest';
import {
  PALETA_CARNET, QR_OSCURO, TEMAS_CARNET, cedulaConPuntos, enTitulo, nombreArchivoCarnet, nombreParaCarnet,
  primeraParte, textoQrPersona, type TemaCarnet,
} from './carnetPersonal';
import type { Personal } from '@/shared/lib/types';

/* ============================================================
   El carnet se imprime: un color que no contrasta no es un detalle
   estético, es una tarjeta que hay que volver a mandar a imprimir.
   Por eso el contraste se verifica aquí y no a ojo.

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

const TEMAS: TemaCarnet[] = ['claro', 'oscuro'];

describe('las dos versiones del carnet', () => {
  it('son blanca (la del impreso, primero) y negra', () => {
    expect(TEMAS_CARNET.map((t) => t.valor)).toEqual(['claro', 'oscuro']);
    expect(TEMAS_CARNET.map((t) => t.sufijo)).toEqual(['blanco', 'negro']);
  });
  it('la blanca es blanca de verdad y la negra oscura de verdad', () => {
    expect(PALETA_CARNET.claro.fondo).toBe('#ffffff');
    expect(luminancia(PALETA_CARNET.oscuro.fondo)).toBeLessThan(0.05);
  });
  for (const tema of TEMAS) {
    const p = PALETA_CARNET[tema];
    it(`${tema}: nombre, cédula y texto legal se leen de lejos (≥ 7:1)`, () => {
      expect(contraste(p.texto, p.fondo)).toBeGreaterThanOrEqual(7);
    });
    it(`${tema}: el marco dorado y el borde naranja se distinguen del fondo`, () => {
      expect(contraste(p.marco, p.fondo)).toBeGreaterThanOrEqual(2);
      expect(contraste(p.naranja, p.fondo)).toBeGreaterThanOrEqual(2);
    });
    it(`${tema}: los puntos del recuadro se ven`, () => {
      expect(contraste(p.puntos, p.fondo)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('el QR va siempre oscuro sobre blanco', () => {
    expect(contraste(QR_OSCURO, '#ffffff')).toBeGreaterThanOrEqual(7);
  });
});

describe('cedulaConPuntos · como se imprime', () => {
  it('pone los puntos de miles', () => {
    expect(cedulaConPuntos('V-26830892')).toBe('V-26.830.892');
    expect(cedulaConPuntos('v26830892')).toBe('V-26.830.892');
    expect(cedulaConPuntos('E-1234567')).toBe('E-1.234.567');
  });
  it('si ya los tiene, no los duplica', () => { expect(cedulaConPuntos('V-26.830.892')).toBe('V-26.830.892'); });
  it('lo que no reconoce lo deja como está', () => { expect(cedulaConPuntos('PASAPORTE X1')).toBe('PASAPORTE X1'); });
});

describe('enTitulo · nombre y cargo como en el carnet impreso', () => {
  it('primera letra en mayúscula', () => {
    expect(enTitulo('HECTOR LUIS ALAGAL SANCHEZ')).toBe('Hector Luis Alagal Sanchez');
    expect(enTitulo('AUXILIAR MOTORIZADO')).toBe('Auxiliar Motorizado');
  });
  it('las partículas del medio van en minúscula', () => { expect(enTitulo('MARIA DE LOS ANGELES')).toBe('Maria de los Angeles'); });
  it('vacío no rompe', () => { expect(enTitulo(null)).toBe(''); });
});

describe('nombreArchivoCarnet · una cara o versión no pisa a la otra', () => {
  const p = { nombre: 'PRUEBA', apellido: 'PRUEBA' } as Personal;
  it('el nombre dice la cara y la versión', () => {
    expect(nombreArchivoCarnet(p, 'frente', 'claro')).toBe('carnet_PRUEBA_PRUEBA_frente_blanco.png');
    expect(nombreArchivoCarnet(p, 'reverso', 'oscuro')).toBe('carnet_PRUEBA_PRUEBA_reverso_negro.png');
  });
  it('las cuatro combinaciones dan cuatro archivos distintos', () => {
    const nombres = new Set<string>();
    for (const cara of ['frente', 'reverso'] as const) for (const tema of TEMAS) nombres.add(nombreArchivoCarnet(p, cara, tema));
    expect(nombres.size).toBe(4);
  });
  it('sin nombre no queda un archivo sin nombre', () => {
    expect(nombreArchivoCarnet({ nombre: '', apellido: '' } as Personal, 'frente')).toBe('carnet_personal_frente_blanco.png');
  });
});

describe('textoQrPersona · el texto de respaldo del QR', () => {
  it('lleva empresa y cédula', () => {
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
