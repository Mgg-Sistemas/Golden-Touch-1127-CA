/* ============================================================
   Golden Touch · Geodesta · Panel del día

   Todo lo de una fecha en un solo lugar: actividades planificadas, informes
   e imágenes subidas ese día. Se abre desde el calendario y desde el tablero.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MESES, diaDeLaSemana, sumarDias } from '@/shared/lib/dias';
import { date } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { toast } from '@/shared/ui/Toast';
import type { EstadoPlan, ImagenGeodesta, InformeGeodesta, PlanificacionGeodesta } from '@/shared/lib/types';
import { actividadesDelDia } from './geodestaCalendario';
import { getInforme, listInformesDelDia } from './informes.repository';
import { listImagenesDelDia, urlImagen } from './informeImagenes.repository';
import { PlanEditorModal } from './PlanEditorModal';
import { ESTADOS_PLAN, etiquetaEstado } from './planModelo';
import { listPlanDelMes, marcarPlan } from './planificacion.repository';

interface DiaPanelProps {
  fecha: string;
  canWrite: boolean;
  actor: string;
  onCerrar: () => void;
  onCambiarDia: (fecha: string) => void;
  onVerInforme: (inf: InformeGeodesta) => void;
}

/** `DIAS_SEMANA` de la librería son iniciales (D, L, M…): para el título hacen falta los nombres. */
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

/** «Sábado 3 de Octubre de 2026», armada con las partes del ISO (nunca `new Date(fecha)`). */
function fechaLarga(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number);
  return `${NOMBRES_DIA[diaDeLaSemana(fecha)]} ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

const mensaje = (e: unknown, defecto: string) => (e instanceof Error && e.message ? e.message : defecto);

/** Lo del día que se pidió. `fecha` dice a cuál pertenece: nada de otro día se pinta. */
interface DatosDia {
  fecha: string;
  actividades: PlanificacionGeodesta[];
  informes: InformeGeodesta[];
  imagenes: ImagenGeodesta[];
  /** id de informe -> código, para decir a cuál pertenece cada imagen. */
  codigos: Record<string, string>;
}

export function DiaPanel({ fecha, canWrite, actor, onCerrar, onCambiarDia, onVerInforme }: DiaPanelProps) {
  const [datos, setDatos] = useState<DatosDia | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [editor, setEditor] = useState(false);
  const [editando, setEditando] = useState<PlanificacionGeodesta | null>(null);

  // El día que se ve AHORA, y un número por carga: lo que llegue de otro día o tarde se descarta.
  const fechaRef = useRef(fecha);
  fechaRef.current = fecha;
  const cargaRef = useRef(0);
  const cargaActRef = useRef(0);

  const cargar = useCallback(async (dia: string) => {
    const mia = ++cargaRef.current;
    cargaActRef.current += 1; // una recarga de solo actividades en camino ya no vale
    setFallo(null);
    try {
      const [plan, informes, imagenes] = await Promise.all([
        listPlanDelMes(dia, dia), listInformesDelDia(dia), listImagenesDelDia(dia),
      ]);
      const codigos: Record<string, string> = {};
      for (const i of informes) codigos[i.id] = i.codigo;
      // Una imagen subida hoy puede ser de un informe de otra fecha.
      const otros = [...new Set(imagenes.map((i) => i.informe_id))].filter((id) => !(id in codigos));
      await Promise.all(otros.map(async (id) => {
        try { const inf = await getInforme(id); if (inf) codigos[id] = inf.codigo; } catch { /* sin código: se dice igual */ }
      }));
      if (mia !== cargaRef.current || dia !== fechaRef.current) return;
      setDatos({ fecha: dia, actividades: actividadesDelDia(plan, dia), informes, imagenes, codigos });
    } catch (e) {
      if (mia !== cargaRef.current) return;
      setFallo(mensaje(e, 'No se pudo cargar el día'));
    }
  }, []);

  useEffect(() => {
    void cargar(fecha);
    return () => { cargaRef.current += 1; cargaActRef.current += 1; };
  }, [fecha, cargar]);

  // Igual que el tablero de abajo: si algo cambia (acá o en otra sesión) el día se vuelve a leer.
  useRealtime(['geodesta_planificacion', 'geodesta_informes', 'geodesta_imagenes'], () => { void cargar(fechaRef.current); });

  // Al abrir o cambiar de día el panel se trae a la vista (en el celular suele montarse
  // por encima de lo que se está mirando). Si ya está arriba, no se pelea con el usuario.
  const seccionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = seccionRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const { top } = el.getBoundingClientRect();
    if (top >= 0 && top < 120) return;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [fecha]);

  /** Tras marcar solo se vuelve a leer lo que cambia: las actividades. */
  const recargarActividades = useCallback(async (dia: string) => {
    const mia = ++cargaActRef.current;
    try {
      const plan = await listPlanDelMes(dia, dia);
      if (mia !== cargaActRef.current || dia !== fechaRef.current) return;
      setDatos((d) => (d && d.fecha === dia ? { ...d, actividades: actividadesDelDia(plan, dia) } : d));
    } catch (e) {
      if (mia === cargaActRef.current) toast(mensaje(e, 'No se pudo actualizar las actividades'), 'error');
    }
  }, []);

  async function marcar(p: PlanificacionGeodesta, estado: EstadoPlan) {
    if (marcando) return;
    setMarcando(p.id);
    try {
      await marcarPlan(p.id, estado, p.estado_nota ?? '', actor);
      await recargarActividades(fechaRef.current);
    } catch (e) {
      toast(mensaje(e, 'No se pudo marcar la actividad'), 'error');
    } finally {
      setMarcando(null);
    }
  }

  const cerrarEditor = () => { setEditor(false); setEditando(null); };
  const trasEditar = () => { cerrarEditor(); void cargar(fechaRef.current); };

  // Miniaturas: id de imagen -> URL firmada. Se firman una sola vez por id.
  const [urls, setUrls] = useState<Record<string, string>>({});
  const pedidas = useRef<Set<string>>(new Set());
  // Ids que no se pudieron resolver (la imagen ya no existe): "no disponible", no "cargando".
  const [noDisponibles, setNoDisponibles] = useState<Set<string>>(new Set());

  const imagenes = datos?.imagenes;
  useEffect(() => {
    if (!imagenes) return;
    const faltan = imagenes.filter((i) => !pedidas.current.has(i.id));
    if (faltan.length === 0) return;
    faltan.forEach((i) => pedidas.current.add(i.id));
    let vivo = true;
    const resueltas = new Set<string>();
    const cache = pedidas.current;
    (async () => {
      const nuevas: Record<string, string> = {};
      const sinImagen: string[] = [];
      // En paralelo: con veinte fotos no van llegando de a una. Solo se da por
      // resuelta la que firmó; si falla (una caída de red) se reintenta en la próxima pasada.
      await Promise.all(faltan.map(async (img) => {
        try {
          nuevas[img.id] = await urlImagen(img.path);
          resueltas.add(img.id);
        } catch {
          sinImagen.push(img.id);
        }
      }));
      // Se aplica aunque el efecto ya se haya limpiado: esos ids quedaron como
      // resueltos y no se volverían a pedir. (Actualizar estado tras desmontar es inocuo.)
      setUrls((p) => ({ ...p, ...nuevas }));
      if (sinImagen.length > 0) {
        setNoDisponibles((p) => new Set([...p, ...sinImagen]));
        if (vivo) toast('No se pudieron cargar algunas miniaturas.', 'error');
      }
    })();
    return () => {
      vivo = false;
      // Lo que esta pasada no alcanzó a resolver se vuelve a pedir en la próxima.
      faltan.forEach((i) => { if (!resueltas.has(i.id)) cache.delete(i.id); });
    };
  }, [imagenes]);

  // Mientras llegan los datos del día nuevo no se pinta nada del anterior.
  const d = datos && datos.fecha === fecha ? datos : null;

  return (
    <section ref={seccionRef} className="geo-dia-panel" aria-label={`Panel del ${fechaLarga(fecha)}`}>
      <header className="geo-dia-cab">
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Día anterior"
          onClick={() => onCambiarDia(sumarDias(fecha, -1))}>‹</button>
        <h2 className="geo-dia-titulo" aria-live="polite">{fechaLarga(fecha)}</h2>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Día siguiente"
          onClick={() => onCambiarDia(sumarDias(fecha, 1))}>›</button>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Cerrar el panel del día"
          onClick={onCerrar}>✕</button>
      </header>

      {fallo && !d ? (
        <p className="geo-dia-vacio" role="alert">
          {fallo}. <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cargar(fecha)}>Reintentar</button>
        </p>
      ) : !d ? (
        <p className="geo-dia-vacio" aria-busy="true">Cargando…</p>
      ) : (
        <>
          <div className="geo-dia-bloque">
            <h3>Actividades</h3>
            {d.actividades.length === 0 ? (
              <p className="geo-dia-vacio">No hay actividades planificadas para este día</p>
            ) : (
              <ul className="geo-dia-lista">
                {d.actividades.map((p) => (
                  <li key={p.id} className="geo-dia-item">
                    <div>
                      <strong>{p.titulo}</strong>{' '}
                      <span className={`geo-dia-estado geo-dia-estado-${p.estado}`}>{etiquetaEstado(p.estado)}</span>
                      <div className="geo-dia-meta">
                        {p.desde === p.hasta ? date(p.desde) : `${date(p.desde)} al ${date(p.hasta)}`}{p.lugar ? ` · ${p.lugar}` : ''}
                      </div>
                      {p.estado_nota && <div className="geo-dia-meta">{p.estado_nota}</div>}
                    </div>
                    {canWrite && (
                      <div className="geo-dia-acciones">
                        {ESTADOS_PLAN.filter((e) => e.valor !== p.estado).map((e) => (
                          <button key={e.valor} type="button" className="btn btn-sm btn-ghost"
                            disabled={marcando !== null} onClick={() => void marcar(p, e.valor)}>
                            {marcando === p.id ? 'Guardando…' : `Marcar: ${e.label}`}
                          </button>
                        ))}
                        <button type="button" className="btn btn-sm btn-ghost"
                          disabled={marcando !== null} onClick={() => setEditando(p)}>Editar</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="geo-dia-bloque">
            <h3>Informes</h3>
            {d.informes.length === 0 ? (
              <p className="geo-dia-vacio">No hay informes de este día</p>
            ) : (
              <ul className="geo-dia-lista">
                {d.informes.map((inf) => (
                  <li key={inf.id}>
                    <button type="button" className="geo-dia-informe" onClick={() => onVerInforme(inf)}>
                      <strong>{inf.codigo}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="geo-dia-bloque">
            <h3>Imágenes subidas ese día</h3>
            {d.imagenes.length === 0 ? (
              <p className="geo-dia-vacio">No se subieron imágenes este día</p>
            ) : (
              <ul className="geo-dia-miniaturas">
                {d.imagenes.map((img) => (
                  <li key={img.id} className="geo-dia-miniatura">
                    {urls[img.id]
                      ? <img src={urls[img.id]} alt={img.nombre} />
                      : <span className="geo-dia-meta">{noDisponibles.has(img.id) ? 'Imagen no disponible' : 'Cargando…'}</span>}
                    <span className="geo-dia-meta">
                      {d.codigos[img.informe_id] ? `Informe ${d.codigos[img.informe_id]}` : 'Informe no disponible'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canWrite && (
            <button type="button" className="btn btn-primary" onClick={() => setEditor(true)}>+ Planificar algo este día</button>
          )}
        </>
      )}

      {canWrite && (editor || editando) && (
        <PlanEditorModal plan={editando} diaInicial={fecha} actor={actor}
          onClose={cerrarEditor} onGuardado={trasEditar} onBorrado={trasEditar} />
      )}
    </section>
  );
}
