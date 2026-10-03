/* ============================================================
   Golden Touch · Geodesta · Pestaña Calendario

   El cascarón de las dos vistas: navega los meses, elige el modo, carga los
   datos del mes (una consulta por tabla, no una por día) y abre el editor de
   actividades. El panel del día no es de esta pantalla: se pide con `onVerDia`.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MESES, mesAnterior, mesSiguiente } from '@/shared/lib/dias';
import { useRealtime } from '@/shared/lib/useRealtime';
import { toast } from '@/shared/ui/Toast';
import type { PlanificacionGeodesta } from '@/shared/lib/types';
import { CalendarioBarra } from './CalendarioBarra';
import { CalendarioRejilla } from './CalendarioRejilla';
import { limitesDelMes } from './geodestaCalendario';
import { hoyVE } from './informeModelo';
import { listDiasDeImagenes } from './informeImagenes.repository';
import { listFechasInformes } from './informes.repository';
import { PlanEditorModal } from './PlanEditorModal';
import { listPlanDelMes } from './planificacion.repository';

interface CalendarioGeodestaProps {
  canWrite: boolean;
  actor: string;
  onVerDia: (fecha: string) => void;
}

type Modo = 'rejilla' | 'barra';
const CLAVE_MODO = 'geodesta-modo-calendario';

function modoGuardado(): Modo {
  try {
    return localStorage.getItem(CLAVE_MODO) === 'barra' ? 'barra' : 'rejilla';
  } catch {
    return 'rejilla'; // modo incógnito o almacenamiento bloqueado
  }
}

function contarPorDia(fechas: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of fechas) m.set(f, (m.get(f) ?? 0) + 1);
  return m;
}

/** Qué está abierto en el editor: una actividad existente o un alta (con su día). */
type Editor = { plan: PlanificacionGeodesta | null; dia?: string } | null;

export function CalendarioGeodesta({ canWrite, actor, onVerDia }: CalendarioGeodestaProps) {
  const hoy = hoyVE();
  const anioHoy = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));
  const [{ anio, mes }, setMesVisto] = useState({ anio: anioHoy, mes: mesHoy });
  const [modo, setModo] = useState<Modo>(modoGuardado);
  const [actividades, setActividades] = useState<PlanificacionGeodesta[]>([]);
  const [fechasInformes, setFechasInformes] = useState<string[]>([]);
  const [diasImagenes, setDiasImagenes] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editor, setEditor] = useState<Editor>(null);

  // El mes que se ve AHORA: el realtime recarga ese y no el que había al montar.
  // `cargaRef` numera las cargas para descartar las respuestas que llegan tarde.
  const mesRef = useRef({ anio, mes });
  mesRef.current = { anio, mes };
  const cargaRef = useRef(0);

  const recargar = useCallback(async () => {
    const { anio: a, mes: m } = mesRef.current;
    const { ini, fin } = limitesDelMes(a, m);
    const mia = ++cargaRef.current;
    try {
      const [plan, informes, imagenes] = await Promise.all([
        listPlanDelMes(ini, fin), listFechasInformes(ini, fin), listDiasDeImagenes(ini, fin),
      ]);
      if (mia !== cargaRef.current) return; // llegó una carga más nueva: esta ya no vale
      setActividades(plan);
      setFechasInformes(informes);
      setDiasImagenes(imagenes);
    } catch (err) {
      if (mia !== cargaRef.current) return;
      toast(err instanceof Error ? err.message : 'No se pudo cargar el calendario', 'error');
    } finally {
      if (mia === cargaRef.current) setCargando(false);
    }
  }, []);

  /** Lo que esté en camino deja de valer: se usa al cambiar de mes y al desmontar. */
  const descartarEnCamino = useCallback(() => { cargaRef.current += 1; }, []);

  useEffect(() => {
    setCargando(true);
    void recargar();
    return descartarEnCamino;
  }, [anio, mes, recargar, descartarEnCamino]);

  useRealtime(['geodesta_planificacion', 'geodesta_informes', 'geodesta_imagenes'], () => { void recargar(); });

  const informesPorDia = useMemo(() => contarPorDia(fechasInformes), [fechasInformes]);
  const imagenesPorDia = useMemo(() => contarPorDia(diasImagenes), [diasImagenes]);

  const cambiarModo = (m: Modo) => {
    setModo(m);
    try { localStorage.setItem(CLAVE_MODO, m); } catch { /* sin almacenamiento: dura solo esta sesión */ }
  };
  const esteMes = anio === anioHoy && mes === mesHoy;
  const cerrarYRecargar = () => { setEditor(null); void recargar(); };

  return (
    <div className="geo-calendario">
      <div className="geo-cal-barra">
        <div className="geo-cal-nav">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMesVisto(mesAnterior(anio, mes))}
            aria-label="Mes anterior">‹</button>
          <h2 className="geo-cal-titulo" aria-live="polite">{MESES[mes - 1]} {anio}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMesVisto(mesSiguiente(anio, mes))}
            aria-label="Mes siguiente">›</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={esteMes}
            onClick={() => setMesVisto({ anio: anioHoy, mes: mesHoy })}>Hoy</button>
        </div>
        <div className="geo-cal-modos" role="group" aria-label="Vista del calendario">
          <button type="button" className={`btn btn-sm ${modo === 'rejilla' ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={modo === 'rejilla'} onClick={() => cambiarModo('rejilla')}>Rejilla</button>
          <button type="button" className={`btn btn-sm ${modo === 'barra' ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={modo === 'barra'} onClick={() => cambiarModo('barra')}>Barra</button>
        </div>
      </div>

      <div className={cargando ? 'geo-cal-cuerpo cargando' : 'geo-cal-cuerpo'} aria-busy={cargando}>
        {modo === 'rejilla' ? (
          <CalendarioRejilla anio={anio} mes={mes} hoy={hoy} actividades={actividades}
            informesPorDia={informesPorDia} imagenesPorDia={imagenesPorDia} onDia={onVerDia} />
        ) : (
          <CalendarioBarra anio={anio} mes={mes} hoy={hoy} actividades={actividades}
            puedeCrear={canWrite}
            onActividad={(p) => { if (canWrite) setEditor({ plan: p }); else onVerDia(p.desde); }}
            onDiaVacio={(f) => { if (canWrite) setEditor({ plan: null, dia: f }); }}
            onDia={onVerDia} />
        )}
      </div>

      {editor && canWrite && (
        <PlanEditorModal plan={editor.plan} diaInicial={editor.dia} actor={actor}
          onClose={() => setEditor(null)} onGuardado={cerrarYRecargar} onBorrado={cerrarYRecargar} />
      )}
    </div>
  );
}
