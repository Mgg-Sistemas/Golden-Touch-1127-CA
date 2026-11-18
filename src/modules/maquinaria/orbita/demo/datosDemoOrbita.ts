/* ============================================================
   Golden Touch · Control de Maquinaria · la Órbita · datos de demostración
   (31/10/2026; tomado de la demo del mapa v1, 372b47b, de Secundario)

   Flota FICTICIA para ver la Órbita en local (SOLO la página de prueba de
   DEV, D22): ningún dato de la maqueta original, cuya veracidad se
   desconoce (D21). El repo es
   público: empresas «EMPRESA A…J», equipos «RETRO-01», «CAM-01»…, sin
   placas y con seriales «DEMO-…». Determinista: sin Math.random ni la
   fecha de hoy; dos llamadas dan exactamente lo mismo.

   Reparto (89 equipos): EMPRESA A 32 (3 escritos «Empresa  A»), B 22,
   C 13, D 9; E a J 1 o 2 cada una (caen en «Otros» con umbral 3);
   4 sin propietario. Los cinco apartados, todos los estados, 40 % sin
   ubicación, 6 avisos vencidos y 8 próximos. Categorías de ejemplo en A–D.
   ============================================================ */
import type { MaquinariaEquipo } from '../../maquinariaEquipos.repository';
import { FRECUENCIA_HRS_DEFAULT, avisoServicio, statusDeEstado, type AvisoServicio, type EstadoEquipo } from '../../flota';
import type { CategoriaEquipo } from '../orbitaDatos';

export interface DatosDemoOrbita {
  equipos: MaquinariaEquipo[];
  /** Horómetro vigente por equipo (las herramientas, sin lectura). */
  lecturas: Map<string, { horometro: number | null; kilometraje: number | null }>;
  avisos: Map<string, AvisoServicio | null>;
  /** Categorías de ejemplo, para que la barra de mezcla tenga algo que mostrar. */
  categorias: Record<string, CategoriaEquipo>;
}

interface Plantilla {
  prefijo: string;
  tipo: string;
  clase: 'maquinaria' | 'vehiculo' | 'moto' | 'lancha' | 'herramienta';
  marcas: string[];
  modelos: string[];
  combustible: string | null;
}

const PLANTILLAS: Record<string, Plantilla> = {
  RETRO: { prefijo: 'RETRO', tipo: 'Retroexcavadora', clase: 'maquinaria', marcas: ['CAT', 'JOHN DEERE'], modelos: ['420F', '310L'], combustible: 'Gasoil' },
  EXC: { prefijo: 'EXC', tipo: 'Excavadora', clase: 'maquinaria', marcas: ['CAT', 'VOLVO'], modelos: ['320D', 'EC210'], combustible: 'Gasoil' },
  PAY: { prefijo: 'PAY', tipo: 'Payloader', clase: 'maquinaria', marcas: ['VOLVO', 'CAT'], modelos: ['L120', '950H'], combustible: 'Gasoil' },
  PLANTA: { prefijo: 'PLANTA', tipo: 'Planta eléctrica', clase: 'maquinaria', marcas: ['CAT'], modelos: ['C9'], combustible: 'Gasoil' },
  CAM: { prefijo: 'CAM', tipo: 'Camioneta', clase: 'vehiculo', marcas: ['TOYOTA', 'FORD'], modelos: ['HILUX', 'RANGER'], combustible: 'Gasolina' },
  CAMION: { prefijo: 'CAMION', tipo: 'Camión', clase: 'vehiculo', marcas: ['VOLVO', 'FORD'], modelos: ['FMX', 'CARGO'], combustible: 'Gasoil' },
  MOTO: { prefijo: 'MOTO', tipo: 'MOTO', clase: 'moto', marcas: ['YAMAHA'], modelos: ['XTZ 125'], combustible: 'Gasolina' },
  LANCHA: { prefijo: 'LANCHA', tipo: 'Lancha', clase: 'lancha', marcas: ['YAMAHA'], modelos: ['F40'], combustible: 'Gasolina' },
  HERR: { prefijo: 'HERR', tipo: 'Hidrolavadora', clase: 'herramienta', marcas: ['GENERICA'], modelos: ['HL-200'], combustible: null },
};

/** Empresa → cuántos de cada plantilla. El orden fija los códigos (RETRO-01, RETRO-02…). */
const REPARTO: [string | null, [keyof typeof PLANTILLAS, number][]][] = [
  ['EMPRESA A', [['RETRO', 6], ['EXC', 5], ['PAY', 3], ['PLANTA', 2], ['CAM', 7], ['CAMION', 3], ['MOTO', 3], ['LANCHA', 1], ['HERR', 2]]],
  ['EMPRESA B', [['EXC', 4], ['RETRO', 3], ['CAM', 6], ['CAMION', 4], ['MOTO', 3], ['HERR', 2]]],
  ['EMPRESA C', [['RETRO', 3], ['CAM', 4], ['LANCHA', 2], ['MOTO', 2], ['PLANTA', 2]]],
  ['EMPRESA D', [['CAM', 3], ['EXC', 2], ['MOTO', 2], ['HERR', 2]]],
  ['EMPRESA E', [['CAM', 2]]],
  ['EMPRESA F', [['RETRO', 1]]],
  ['EMPRESA G', [['CAMION', 1], ['MOTO', 1]]],
  ['EMPRESA H', [['LANCHA', 1]]],
  ['EMPRESA I', [['HERR', 1]]],
  ['EMPRESA J', [['CAM', 1], ['PLANTA', 1]]],
  [null, [['CAM', 2], ['HERR', 2]]],
];

/** Índice global del equipo → estado distinto de operativa. */
const ESTADOS: Record<number, EstadoEquipo> = {
  3: 'averiada', 17: 'averiada', 41: 'averiada', 60: 'parada',
  8: 'taller', 29: 'taller', 55: 'taller',
  12: 'repuestos', 47: 'repuestos',
  22: 'espera', 63: 'espera',
  35: 'por_confirmar', 70: 'por_confirmar', 80: 'por_confirmar',
  50: 'retirada', 76: 'retirada',
};
const NOTAS = ['falla hidráulica', 'motor no arranca', 'caucho espichado', 'revisión general'];

/** Horas desde el último servicio: > 250 vence, 225–250 avisa «próximo». */
const VENCIDOS = new Set([2, 9, 19, 33, 44, 58]);
const PROXIMOS = new Set([5, 14, 25, 38, 51, 66, 73, 84]);

const UBICACIONES = ['GARAJE A', 'GARAJE B', 'MINA', 'TALLER CENTRAL'];
const CATEGORIAS_DEMO: Record<string, (CategoriaEquipo | null)[]> = {
  'EMPRESA A': ['propio', 'propio', 'asociado'],
  'EMPRESA B': ['alquilado', 'alquilado', null],
  'EMPRESA C': ['contratista', 'asociado', 'contratista'],
  'EMPRESA D': ['propio', null, 'alquilado'],
};
/** Índices de «EMPRESA A» escritos con la variante «Empresa  A» (doble espacio). */
const VARIANTE_A = new Set([4, 15, 27]);
const FECHA = '2026-10-01T12:00:00.000Z';

const dos = (n: number) => String(n).padStart(2, '0');

/** La flota de demostración: siempre la misma, en objetos nuevos en cada llamada. */
export function datosDemoOrbita(): DatosDemoOrbita {
  const equipos: MaquinariaEquipo[] = [];
  const avisos = new Map<string, AvisoServicio | null>();
  const lecturas = new Map<string, { horometro: number | null; kilometraje: number | null }>();
  const categorias: Record<string, CategoriaEquipo> = {};
  const porPrefijo = new Map<string, number>();
  let i = 0;

  for (const [empresa, lotes] of REPARTO) {
    for (const [clave, cantidad] of lotes) {
      const p = PLANTILLAS[clave];
      for (let k = 0; k < cantidad; k += 1, i += 1) {
        const n = (porPrefijo.get(p.prefijo) ?? 0) + 1;
        porPrefijo.set(p.prefijo, n);
        const id = `demo-${String(i + 1).padStart(3, '0')}`;
        const estado: EstadoEquipo = ESTADOS[i] ?? 'operativa';
        const conLectura = p.clase !== 'herramienta';
        const desdeServicio = VENCIDOS.has(i) ? 280 + (i % 4) * 10 : PROXIMOS.has(i) ? 230 + (i % 3) * 5 : 40 + (i * 37) % 160;
        const horometro = conLectura ? 1000 + i * 113 : null;
        const base = horometro != null ? horometro - desdeServicio : null;
        const propietario = empresa == null
          ? (i % 2 ? '' : null)
          : VARIANTE_A.has(i) ? 'Empresa  A' : empresa;

        equipos.push({
          id,
          equipo: `${p.prefijo}-${dos(n)}`,
          tipo: p.tipo,
          propietario,
          status: statusDeEstado(estado),
          ubicacion: i % 5 < 2 ? null : UBICACIONES[i % UBICACIONES.length],
          anio: 2012 + (i % 12),
          marca: p.marcas[n % p.marcas.length],
          modelo: p.modelos[n % p.modelos.length],
          color: ['AMARILLO', 'BLANCO', 'GRIS'][i % 3],
          serial: `DEMO-S-${String(i + 1).padStart(4, '0')}`,
          placa: null,
          motor_modelo: null,
          motor_serial: null,
          combustible: p.combustible,
          litros_consume: p.combustible ? 20 + (i % 5) * 10 : null,
          ficha_tecnica: null,
          ficha_mantenimiento: null,
          documentacion: null,
          mantenimiento_cada_hrs: FRECUENCIA_HRS_DEFAULT,
          mantenimiento_cada_km: null,
          mantenimiento_base_hrs: base,
          mantenimiento_base_km: null,
          combustible_equipo: null,
          grupo_mantenimiento: null,
          clase: p.clase,
          alias: null,
          doc_fisico: i % 2 === 0,
          ficha_mantt: i % 3 === 0,
          doc_drive: false,
          esp_tecnicas: false,
          revision_mina: i % 4 === 0,
          notas: null,
          encargado_responsable: null,
          estado_operativo: estado,
          estado_nota: estado === 'operativa' || estado === 'retirada' ? null : NOTAS[i % NOTAS.length],
          estado_desde: estado === 'operativa' ? null : `2026-10-${dos(10 + (i % 18))}`,
          activo: estado !== 'retirada',
          created_by: null,
          created_at: FECHA,
          updated_at: null,
        });
        avisos.set(id, conLectura ? avisoServicio(FRECUENCIA_HRS_DEFAULT, horometro, base, 'h') : null);
        lecturas.set(id, { horometro, kilometraje: null });
        // Mezcla de ejemplo: A sobre todo propia, B alquilada, C y D mitad y mitad; el resto, por asignar.
        const cat = CATEGORIAS_DEMO[empresa ?? '']?.[i % 3];
        if (cat) categorias[id] = cat;
      }
    }
  }
  return { equipos, lecturas, avisos, categorias };
}
