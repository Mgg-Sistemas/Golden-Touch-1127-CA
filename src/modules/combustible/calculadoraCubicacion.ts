/* ============================================================
   Golden Touch · Combustible · Calculadora de Cubicación
   Réplica exacta del archivo calculadora.xlsx (supabase/.temp/calculadora.xlsx):
     · TANQUE #1: Cilíndrico horizontal (R=1,19 m, L=8,16 m, Cap=36.302,28 L, h100%=238 cm)
     · TANQUE #2: Cilíndrico horizontal (R=1,335 m, L=7,26 m, Cap=40.643,33 L, h100%=267 cm)
     · TANQUE #3: Rectangular (Camión de Servicio, Cap=1.980 L, h100%=99 cm, Tasa=20 L/cm)
     · GEP-150:   Rectangular (Generador, Cap=319,2 L, h100%=30 cm, Tasa=10,64 L/cm)

   Calcula a partir de los cm de altura leídos con la varilla:
     · Altura en metros
     · Volumen en m³ y Litros
     · Capacidad al 100% y porcentaje de nivel
     · Estado (NORMAL, LLENO AL 100%, SUPERA LA CAPACIDAD)
   ============================================================ */

import type { TanqueCombustible } from '@/shared/lib/types';

export type ClaveTanqueCalculadora = 'TANQUE #1' | 'TANQUE #2' | 'TANQUE #3' | 'GEP-150';

export interface InfoTanqueCalculadora {
  clave: ClaveTanqueCalculadora;
  nombre: string;
  descripcion: string;
  tipoGeometria: 'cilindrico_horizontal' | 'rectangular';
  capacidad100Litros: number;
  altura100Cm: number;
  altura200Cm: number;
  radioM?: number;
  largoM?: number;
  anchoM?: number;
  altoM?: number;
}

export const TANQUES_CALCULADORA: Record<ClaveTanqueCalculadora, InfoTanqueCalculadora> = {
  'TANQUE #1': {
    clave: 'TANQUE #1',
    nombre: 'TANQUE #1',
    descripcion: 'Almacén Principal Diésel · Cilíndrico Horizontal (D=2,38 m | L=8,16 m)',
    tipoGeometria: 'cilindrico_horizontal',
    capacidad100Litros: 36302.284,
    altura100Cm: 238,
    altura200Cm: 476,
    radioM: 1.19,
    largoM: 8.16,
  },
  'TANQUE #2': {
    clave: 'TANQUE #2',
    nombre: 'TANQUE #2',
    descripcion: 'Tanque Cilíndrico Horizontal (D=2,67 m | L=7,26 m)',
    tipoGeometria: 'cilindrico_horizontal',
    capacidad100Litros: 40643.332,
    altura100Cm: 267,
    altura200Cm: 534,
    radioM: 1.335,
    largoM: 7.26,
  },
  'TANQUE #3': {
    clave: 'TANQUE #3',
    nombre: 'TANQUE #3',
    descripcion: 'Camión de Servicio · Tanque Rectangular (Cap=1.980 L | Tasa=20 L/cm)',
    tipoGeometria: 'rectangular',
    capacidad100Litros: 1980,
    altura100Cm: 99,
    altura200Cm: 198,
    largoM: 2.0,
    altoM: 0.99,
  },
  'GEP-150': {
    clave: 'GEP-150',
    nombre: 'GEP-150',
    descripcion: 'Generador GEP-150 · Tanque Rectangular (Cap=319,2 L | Tasa=10,64 L/cm)',
    tipoGeometria: 'rectangular',
    capacidad100Litros: 319.2,
    altura100Cm: 30,
    altura200Cm: 60,
    largoM: 1.064,
    altoM: 0.3,
  },
};

export const LISTA_CLAVES_CALCULADORA: ClaveTanqueCalculadora[] = [
  'TANQUE #1',
  'TANQUE #2',
  'TANQUE #3',
  'GEP-150',
];

export interface ResultadoCubicacion {
  tanqueClave: string;
  tanqueNombre: string;
  tanqueDescripcion: string;
  alturaCm: number;
  alturaM: number;
  volumenM3: number;
  volumenLitros: number;
  capacidad100Litros: number;
  nivelPct: number; // e.g. 0.524 para 52.4%
  estado: 'NORMAL' | 'LLENO AL 100%' | 'SUPERA LA CAPACIDAD (extrapolado al 200%)';
  altura100Cm: number;
  altura200Cm: number;
}

/**
 * Normaliza el nombre de un tanque para vincularlo con las plantillas del Excel.
 */
export function detectarClaveTanque(nombre?: string | null): ClaveTanqueCalculadora {
  const n = (nombre ?? '').toUpperCase().trim();
  if (n.includes('GEP') || n.includes('150')) return 'GEP-150';
  if (n.includes('3') || n.includes('CAMIÓN') || n.includes('CAMION')) return 'TANQUE #3';
  if (n.includes('2')) return 'TANQUE #2';
  return 'TANQUE #1';
}

/**
 * Calcula la cubicación rápida a partir del tanque y los cm leídos en varilla.
 * Réplica exacta de la hoja CALCULADORA del Excel.
 */
export function calcularCubicacionTanque(
  claveOTanque: ClaveTanqueCalculadora | string,
  alturaCm: number,
  tanqueDb?: TanqueCombustible | null,
): ResultadoCubicacion {
  const claveNorm = (claveOTanque in TANQUES_CALCULADORA)
    ? (claveOTanque as ClaveTanqueCalculadora)
    : detectarClaveTanque(claveOTanque);

  const plantilla = TANQUES_CALCULADORA[claveNorm];
  const cm = Math.max(0, Number(alturaCm) || 0);
  const hM = cm / 100;

  let volM3 = 0;
  let cap100L = plantilla.capacidad100Litros;
  let h100Cm = plantilla.altura100Cm;
  let h200Cm = plantilla.altura200Cm;

  if (claveNorm === 'TANQUE #1') {
    const R = 1.19;
    const L = 8.16;
    if (hM <= 2.38) {
      const acosArg = Math.min(1, Math.max(-1, (R - hM) / R));
      const bajoRaiz = Math.max(2 * R * hM - hM * hM, 0);
      volM3 = L * (R * R * Math.acos(acosArg) - (R - hM) * Math.sqrt(bajoRaiz));
    } else {
      // Extrapolación lineal al sobrellenado
      volM3 = (36.302284 * hM) / 2.38;
    }
  } else if (claveNorm === 'TANQUE #2') {
    const R = 1.335;
    const L = 7.26;
    if (hM <= 2.67) {
      const acosArg = Math.min(1, Math.max(-1, (R - hM) / R));
      const bajoRaiz = Math.max(2 * R * hM - hM * hM, 0);
      volM3 = L * (R * R * Math.acos(acosArg) - (R - hM) * Math.sqrt(bajoRaiz));
    } else {
      volM3 = (40.643332 * hM) / 2.67;
    }
  } else if (claveNorm === 'TANQUE #3') {
    volM3 = 2.0 * hM;
  } else if (claveNorm === 'GEP-150') {
    volM3 = 1.064 * hM;
  }

  // Si se pasó un tanque de la base de datos que tiene dimensiones propias no estándar:
  if (tanqueDb && tanqueDb.tipo && !claveOTanque.startsWith('TANQUE #') && claveOTanque !== 'GEP-150') {
    if (tanqueDb.capacidad_litros && Number(tanqueDb.capacidad_litros) > 0) {
      cap100L = Number(tanqueDb.capacidad_litros);
    }
  }

  const volLitros = Math.round(volM3 * 1000 * 100) / 100;
  const nivelPct = cap100L > 0 ? volLitros / cap100L : 0;

  let estado: ResultadoCubicacion['estado'] = 'NORMAL';
  if (nivelPct > 1.0005) {
    estado = 'SUPERA LA CAPACIDAD (extrapolado al 200%)';
  } else if (Math.abs(nivelPct - 1) <= 0.0005) {
    estado = 'LLENO AL 100%';
  }

  return {
    tanqueClave: claveNorm,
    tanqueNombre: tanqueDb?.nombre || plantilla.nombre,
    tanqueDescripcion: plantilla.descripcion,
    alturaCm: cm,
    alturaM: Math.round(hM * 1000) / 1000,
    volumenM3: Math.round(volM3 * 10000) / 10000,
    volumenLitros: volLitros,
    capacidad100Litros: Math.round(cap100L * 100) / 100,
    nivelPct: Math.round(nivelPct * 10000) / 10000,
    estado,
    altura100Cm: h100Cm,
    altura200Cm: h200Cm,
  };
}

/**
 * Genera la tabla de varilla (cm → Litros) para consulta rápida del operador.
 */
export function generarTablaVarilla(clave: ClaveTanqueCalculadora, maxCm?: number): Array<{ cm: number; litros: number; pct: number }> {
  const plantilla = TANQUES_CALCULADORA[clave];
  const tope = maxCm || plantilla.altura100Cm;
  const filas: Array<{ cm: number; litros: number; pct: number }> = [];

  for (let cm = 1; cm <= tope; cm++) {
    const res = calcularCubicacionTanque(clave, cm);
    filas.push({
      cm,
      litros: res.volumenLitros,
      pct: res.nivelPct,
    });
  }
  return filas;
}
