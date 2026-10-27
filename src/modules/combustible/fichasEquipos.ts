/* ============================================================
   Golden Touch · Combustible · Fichas de Maquinaria para el buscador de equipos

   Trae una vez (y refresca por realtime) los equipos ACTIVOS de Maquinaria,
   para que el buscador de equipos del surtidor (teléfono y PC) muestre el alias
   y agrupe por apartado (ver opcionesEquipos.ts). El RLS de lectura de
   `maquinaria_equipos` es para cualquier autenticado, así que el surtidor del
   teléfono puede leerlas aunque no tenga permiso de Maquinaria. Si la carga
   falla, la lista sale como antes (solo el catálogo) y no se rompe nada.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { listEquipos, type MaquinariaEquipo } from '@/modules/maquinaria/maquinariaEquipos.repository';
import { useRealtime } from '@/shared/lib/useRealtime';

export function useFichasEquipos(): MaquinariaEquipo[] {
  const [fichas, setFichas] = useState<MaquinariaEquipo[]>([]);
  const cargar = useCallback(() => {
    listEquipos().then((l) => setFichas(l.filter((e) => e.activo !== false))).catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useRealtime(['maquinaria_equipos'], cargar);
  return fichas;
}
