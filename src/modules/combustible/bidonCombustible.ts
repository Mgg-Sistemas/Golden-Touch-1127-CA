/* ============================================================
   Golden Touch · Combustible · Regla de BIDONES
   El flujo real en mina / campo:
     Se llena un bidón (habitualmente de 20 L) desde el Tanque 1 o Tanque 3
     y se lo llevan inmediatamente para consumo en campo (generadores,
     máquinas o apoyo).

   Por sistema no debe quedar el bidón lleno ni acumular saldo (antes quedaba
   en 20 L como si fuera un tanque de almacenamiento). Tanto por PC como por
   teléfono, cualquier surtido o traspaso hacia un bidón se convierte y marca
   como una SALIDA (uso directo), y los bidones quedan sin saldo (0 L).
   ============================================================ */

import type { TanqueCombustible } from '@/shared/lib/types';
import { etiquetaTanque } from './saldoSuficiente';

export interface CamposMovimientoBidon {
  fecha?: string;
  hora?: string | null;
  equipo?: string | null;
  autorizado_por?: string | null;
  ubicacion?: string | null;
  observacion?: string | null;
  horometroIni?: number | null;
  horometroFin?: number | null;
  kilometraje?: number | null;
  contadorGlobalIni?: number | null;
  contadorGlobalFin?: number | null;
}

/**
 * Detecta si el nombre corresponde a un bidón (ej. "BIDON", "BIDÓN", "BIDONES",
 * "BIDON 20L", "BIDON DE 20L", "BIDÓN #1").
 */
export function esBidon(nombre?: string | null): boolean {
  if (!nombre) return false;
  return /bid[oó]n/i.test(nombre.trim());
}

/**
 * Etiqueta para selectores de destino en traslados. Si es un bidón, aclara que es
 * salida directa y no acumula saldo.
 */
export function etiquetaTanqueDestino(t: TanqueCombustible): string {
  if (esBidon(t.nombre)) {
    return `🪣 ${t.nombre} · salida directa (sin saldo)`;
  }
  return etiquetaTanque(t.nombre, t.saldo_litros);
}

/**
 * Adapta los campos del movimiento al surtir o trasladar hacia un bidón:
 * se asegura de que el equipo sea el nombre del bidón y que la observación
 * indique claramente que es una salida directa hacia el bidón.
 */
export function prepararCamposSalidaBidon<T extends CamposMovimientoBidon>(
  _origenNombre: string,
  bidonNombre: string,
  campos?: T,
): T & CamposMovimientoBidon {
  const c: T & CamposMovimientoBidon = { ...(campos ?? {}) } as T & CamposMovimientoBidon;
  if (!c.equipo?.trim()) {
    c.equipo = bidonNombre;
  }
  const notaExtra = `Salida a ${bidonNombre}`;
  if (!c.observacion?.trim()) {
    c.observacion = notaExtra;
  } else if (!c.observacion.toLowerCase().includes('bid')) {
    c.observacion = `${c.observacion.trim()} · ${notaExtra}`;
  }
  return c;
}
