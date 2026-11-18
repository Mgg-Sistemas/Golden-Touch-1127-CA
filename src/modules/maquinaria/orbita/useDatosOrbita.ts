/* ============================================================
   Golden Touch · Control de Maquinaria · la Órbita · lectura
   SOLO LECTURA: equipos y lecturas vigentes, con los repositorios de
   siempre. El aviso de mantenimiento sale de avisoDeEquipo (la regla del
   catálogo). Sin sesión (p. ej. fuera del sistema) la base no
   responde: se dice, y no se inventan datos (D22).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtime } from '@/shared/lib/useRealtime';
import { listEquipos, type MaquinariaEquipo } from '../maquinariaEquipos.repository';
import { lecturasVigentesPorEquipo, type LecturaVigente } from '../flota.repository';
import { avisoDeEquipo } from '../avisoEquipo';
import type { AvisoServicio } from '../flota';
import type { LecturaOrbita } from './orbitaDatos';

export interface DatosOrbita {
  equipos: MaquinariaEquipo[];
  lecturas: Map<string, LecturaOrbita>;
  avisos: Map<string, AvisoServicio | null>;
  cargando: boolean;
  error: string | null;
}

export function useDatosOrbita(): DatosOrbita {
  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [lecturas, setLecturas] = useState<Map<string, LecturaVigente>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [eqs, lecs] = await Promise.all([
        listEquipos(),
        lecturasVigentesPorEquipo().catch(() => new Map<string, LecturaVigente>()),
      ]);
      setEquipos(eqs);
      setLecturas(lecs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la flota');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['maquinaria_equipos', 'maquinaria_lecturas'], () => { void cargar(); });

  const avisos = useMemo(() => {
    const m = new Map<string, AvisoServicio | null>();
    for (const e of equipos) m.set(e.id, avisoDeEquipo(e, lecturas.get(e.id)).aviso);
    return m;
  }, [equipos, lecturas]);

  const lecturasOrbita = useMemo(() => {
    const m = new Map<string, LecturaOrbita>();
    for (const [id, l] of lecturas) m.set(id, { horometro: l.horometro, kilometraje: l.kilometraje });
    return m;
  }, [lecturas]);

  return { equipos, lecturas: lecturasOrbita, avisos, cargando, error };
}
