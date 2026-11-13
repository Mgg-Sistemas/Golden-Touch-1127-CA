/* ============================================================
   Golden Touch · Maquinaria · aviso de mantenimiento de UN equipo
   Regla ÚNICA (actualizada 13/11/2026): la misma del catálogo (PC y móvil),
   el expediente, Servicio de Mantenimiento y Alertas de Mantenimiento.
   - En maquinaria pesada y plantas eléctricas: medidor principal en horas
     (250 h por defecto o la de la empresa).
   - En vehículos de carga (camionetas, camiones, Encavas, pickups...):
     el medidor principal es en KILÓMETROS (5.000 km por defecto o la de la
     ficha). Si la lectura de combustible vino en el campo de horómetro pero
     es odómetro (> 500), se reconoce como kilometraje y no como horas.
   - Considera la lectura del último mantenimiento registrado en la bitácora
     si es superior a la base fija guardada.
   ============================================================ */
import { num as fmtNum } from '@/shared/lib/format';
import { norm } from '@/shared/lib/texto';
import { avisoServicio, avisoMasUrgente, frecuenciaHrs, FRECUENCIA_HRS_DEFAULT, type AvisoServicio } from './flota';

/** Campos de la ficha que intervienen en el aviso. */
export interface EquipoConIntervalos {
  id?: string;
  equipo?: string | null;
  tipo?: string | null;
  grupo_mantenimiento?: string | null;
  mantenimiento_cada_hrs?: number | null;
  mantenimiento_base_hrs?: number | null;
  mantenimiento_cada_km?: number | null;
  mantenimiento_base_km?: number | null;
}

/** Lectura vigente (horómetro y/o km). null = sin lectura. */
export interface LecturaParaAviso {
  horometro: number | null;
  kilometraje: number | null;
}

export interface UltimoMantenimientoParaAviso {
  horometro?: number | null;
  kilometraje?: number | null;
  fecha?: string | null;
}

export interface AvisoEquipo {
  avisoH: AvisoServicio | null;
  avisoK: AvisoServicio | null;
  /** El más urgente de los dos; null = sin lectura con la que avisar. */
  aviso: AvisoServicio | null;
  /** Frecuencia por horas efectiva (la de la ficha o la de la empresa). */
  frecuenciaH: number;
  /** Frecuencia por km efectiva (la de la ficha o 5000 por defecto para vehículos). */
  frecuenciaK: number | null;
  /** Lectura correspondiente a la unidad del aviso principal. */
  lecturaPrincipal: number | null;
  /** Unidad del aviso principal ('h' o 'km'). */
  unidadPrincipal: 'h' | 'km';
  esVehiculo: boolean;
}

/** Determina si un equipo es un vehículo de carga / rodante (camioneta, camión, encava, etc.). */
export function esVehiculoDeCarga(eq: { tipo?: string | null; equipo?: string | null; grupo_mantenimiento?: string | null }): boolean {
  if (eq.grupo_mantenimiento === 'VEHÍCULOS DE CARGA') return true;
  const t = norm(eq.tipo);
  if (/vehiculo|carro|camion|gandola|camioneta|pickup|\bauto|van\b|autobus|\bbus|encava|jeep|chuto|remolque|moto/.test(t)) return true;
  const n = norm(eq.equipo);
  if (/vehiculo|carro|camion|gandola|camioneta|pickup|\bauto|van\b|autobus|\bbus|encava|jeep|chuto|remolque|moto/.test(n)) return true;
  return false;
}

/** Frecuencia estándar por km para vehículos cuando no tienen una definida (5.000 km). */
export const FRECUENCIA_KM_VEHICULOS_DEFAULT = 5000;

/** Aviso de un equipo a partir de su ficha y su lectura vigente (regla del catálogo). */
export function avisoDeEquipo(
  equipo: EquipoConIntervalos,
  lectura: LecturaParaAviso | null | undefined,
  ultimoMant?: UltimoMantenimientoParaAviso | null,
): AvisoEquipo {
  const esVeh = esVehiculoDeCarga(equipo);

  // Frecuencia por horas de la ficha o de la empresa (250 h)
  const frecuenciaH = frecuenciaHrs(equipo);

  // Frecuencia por km (de la ficha o 5.000 km para vehículos)
  const frecuenciaK = Number(equipo.mantenimiento_cada_km) > 0
    ? Number(equipo.mantenimiento_cada_km)
    : esVeh ? FRECUENCIA_KM_VEHICULOS_DEFAULT : null;

  if (esVeh) {
    // ─── VEHÍCULOS (Camiones, Encavas, Camionetas) ───
    // El medidor principal es el kilometraje (odómetro).
    // Si combustible o el usuario cargó la lectura en 'horometro' pero es > 500,
    // se trata del odómetro del vehículo (ej. 105.932 km o 53.038 km).
    let kmLectura = lectura?.kilometraje != null ? Number(lectura.kilometraje) : null;
    if (kmLectura == null && lectura?.horometro != null && Number(lectura.horometro) > 500) {
      kmLectura = Number(lectura.horometro);
    }

    // Base de km: la guardada en la ficha, o si la de horas era > 500 (odómetro guardado en horas en migración anterior),
    // o el último mantenimiento registrado si fue mayor.
    let baseK: number | null = equipo.mantenimiento_base_km != null
      ? Number(equipo.mantenimiento_base_km)
      : (Number(equipo.mantenimiento_base_hrs) > 500 ? Number(equipo.mantenimiento_base_hrs) : null);

    if (ultimoMant?.kilometraje != null && Number(ultimoMant.kilometraje) > (baseK ?? 0)) {
      baseK = Number(ultimoMant.kilometraje);
    } else if (ultimoMant?.horometro != null && Number(ultimoMant.horometro) > 500 && Number(ultimoMant.horometro) > (baseK ?? 0)) {
      baseK = Number(ultimoMant.horometro);
    }

    const avisoK = avisoServicio(frecuenciaK, kmLectura, baseK, 'km');

    // Horas en vehículos: solo si la ficha tiene explícitamente horas cargadas (> 0 y distinta de 250 default)
    // y el horómetro es pequeño (< 50.000, medidor de horas auxiliar real).
    let avisoH: AvisoServicio | null = null;
    const tieneHorasPropias = equipo.mantenimiento_cada_hrs != null
      && Number(equipo.mantenimiento_cada_hrs) > 0
      && Number(equipo.mantenimiento_cada_hrs) !== FRECUENCIA_HRS_DEFAULT;

    if (tieneHorasPropias && lectura?.horometro != null && Number(lectura.horometro) < 50000) {
      let baseH = equipo.mantenimiento_base_hrs != null ? Number(equipo.mantenimiento_base_hrs) : null;
      if (ultimoMant?.horometro != null && Number(ultimoMant.horometro) < 50000 && Number(ultimoMant.horometro) > (baseH ?? 0)) {
        baseH = Number(ultimoMant.horometro);
      }
      avisoH = avisoServicio(Number(equipo.mantenimiento_cada_hrs), Number(lectura.horometro), baseH, 'h');
    }

    const aviso = avisoK ?? avisoH;
    const unidadPrincipal: 'h' | 'km' = aviso?.unidad ?? 'km';
    const lecturaPrincipal = unidadPrincipal === 'km' ? kmLectura : (lectura?.horometro != null ? Number(lectura.horometro) : null);

    return { avisoH, avisoK, aviso, frecuenciaH, frecuenciaK, lecturaPrincipal, unidadPrincipal, esVehiculo: true };
  }

  // ─── MAQUINARIA PESADA Y PLANTAS ELÉCTRICAS ───
  // Medidor principal: Horómetro (horas).
  let baseH = equipo.mantenimiento_base_hrs != null ? Number(equipo.mantenimiento_base_hrs) : null;
  if (ultimoMant?.horometro != null && Number(ultimoMant.horometro) > (baseH ?? 0)) {
    baseH = Number(ultimoMant.horometro);
  }
  const avisoH = avisoServicio(frecuenciaH, lectura?.horometro != null ? Number(lectura.horometro) : null, baseH, 'h');

  // Si tiene km (ej. camión articulado o equipo con odómetro)
  let baseK = equipo.mantenimiento_base_km != null ? Number(equipo.mantenimiento_base_km) : null;
  if (ultimoMant?.kilometraje != null && Number(ultimoMant.kilometraje) > (baseK ?? 0)) {
    baseK = Number(ultimoMant.kilometraje);
  }
  const avisoK = avisoServicio(equipo.mantenimiento_cada_km, lectura?.kilometraje != null ? Number(lectura.kilometraje) : null, baseK, 'km');

  const aviso = avisoMasUrgente(avisoH, avisoK);
  const unidadPrincipal: 'h' | 'km' = aviso?.unidad ?? 'h';
  const lecturaPrincipal = unidadPrincipal === 'km'
    ? (lectura?.kilometraje != null ? Number(lectura.kilometraje) : null)
    : (lectura?.horometro != null ? Number(lectura.horometro) : null);

  return { avisoH, avisoK, aviso, frecuenciaH, frecuenciaK, lecturaPrincipal, unidadPrincipal, esVehiculo: false };
}

export type TonoAviso = 'success' | 'warning' | 'danger' | 'retired';

/** Clase del badge: verde OK, ámbar próximo, rojo vencido; gris sin datos. */
export function tonoAviso(aviso: AvisoServicio | null | undefined): TonoAviso {
  if (!aviso) return 'retired';
  return aviso.nivel === 'vencido' ? 'danger' : aviso.nivel === 'proximo' ? 'warning' : 'success';
}

/** Texto del badge, igual que en el catálogo: «OK», «Próximo · faltan 12 h», «Vencido · pasado por 55 h». */
export function textoAviso(aviso: AvisoServicio | null | undefined): string {
  if (!aviso) return 'Sin lectura';
  if (aviso.nivel === 'vencido') return `Vencido · pasado por ${fmtNum(Math.abs(aviso.restante))} ${aviso.unidad}`;
  if (aviso.nivel === 'proximo') return `Próximo · faltan ${fmtNum(aviso.restante)} ${aviso.unidad}`;
  return 'OK';
}
