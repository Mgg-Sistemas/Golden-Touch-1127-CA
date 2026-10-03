/* ============================================================
   Golden Touch · Geodesta · El tablero

   Lo primero que ve el geólogo: lo que tiene por delante. Tres preguntas,
   en orden: qué hay hoy, qué viene esta semana, qué pasó y quedó sin marcar.
   Las listas salen de la lógica pura del calendario y los números de arriba
   se cuentan sobre esas mismas listas, así que nunca discrepan.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MESES, diaDeLaSemana } from '@/shared/lib/dias';
import { useRealtime } from '@/shared/lib/useRealtime';
import { toast } from '@/shared/ui/Toast';
import type { EstadoPlan, InformeGeodesta, PlanificacionGeodesta } from '@/shared/lib/types';
import { deHoy, proximosDias, sinMarcar } from './geodestaCalendario';
import { hoyVE } from './informeModelo';
import { listInformes } from './informes.repository';
import { etiquetaEstado } from './planModelo';
import { listPlanificacion, marcarPlan } from './planificacion.repository';

interface TableroGeodestaProps {
  canWrite: boolean;
  actor: string;
  onVerDia: (fecha: string) => void;
  onIrACalendario: () => void;
  onIrAHistorico: () => void;
  onNuevoInforme: () => void;
}

const MAX_SIN_MARCAR = 10;
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const mensaje = (e: unknown, defecto: string) => (e instanceof Error && e.message ? e.message : defecto);

/** «Lun 5 oct» */
function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${DIAS_CORTO[diaDeLaSemana(iso)]} ${d} ${MESES[m - 1].slice(0, 3).toLowerCase()}`;
}

export function TableroGeodesta({
  canWrite, actor, onVerDia, onIrACalendario, onIrAHistorico, onNuevoInforme,
}: TableroGeodestaProps) {
  const [plan, setPlan] = useState<PlanificacionGeodesta[] | null>(null);
  const [informes, setInformes] = useState<InformeGeodesta[]>([]);
  const [fallo, setFallo] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const marcandoRef = useRef(false);
  const cargaRef = useRef(0);

  const recargar = useCallback(async () => {
    const mia = ++cargaRef.current;
    try {
      const [p, i] = await Promise.all([listPlanificacion(), listInformes()]);
      if (mia !== cargaRef.current) return;
      setPlan(p);
      setInformes(i);
      setFallo(null);
    } catch (e) {
      if (mia === cargaRef.current) setFallo(mensaje(e, 'No se pudo cargar el tablero'));
    }
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['geodesta_planificacion', 'geodesta_informes'], () => { void recargar(); });

  async function marcar(p: PlanificacionGeodesta, estado: EstadoPlan) {
    if (marcandoRef.current) return;
    marcandoRef.current = true;
    setMarcando(p.id);
    try {
      // Sin nota a propósito: un clic es todo su valor. Para explicar, se abre la actividad.
      await marcarPlan(p.id, estado, '', actor);
      await recargar();
    } catch (e) {
      toast(mensaje(e, 'No se pudo marcar la actividad'), 'error');
    } finally {
      marcandoRef.current = false;
      setMarcando(null);
    }
  }

  if (!plan) {
    return fallo ? (
      <div className="geo-tablero">
        <p className="geo-tablero-vacio">
          {fallo}. <button type="button" className="btn btn-ghost btn-sm" onClick={() => void recargar()}>Reintentar</button>
        </p>
      </div>
    ) : (
      <div className="geo-tablero"><p className="geo-tablero-vacio">Cargando tu tablero…</p></div>
    );
  }

  const hoy = hoyVE();
  const deHoyL = deHoy(plan, hoy);
  const semana = proximosDias(plan, hoy);
  const pendientes = sinMarcar(plan, hoy);
  const visibles = pendientes.slice(0, MAX_SIN_MARCAR);
  const mes = hoy.slice(0, 7);
  const informesMes = informes.filter((i) => i.fecha.slice(0, 7) === mes).length;

  // `semana` ya viene ordenada por día: la fecha se muestra solo en la primera de cada día.
  const fila = (a: PlanificacionGeodesta, prefijo?: string) => (
    <button type="button" className="geo-tablero-act" onClick={() => onVerDia(a.desde)}>
      <span className="geo-tablero-titulo">{prefijo ? `${prefijo} · ` : ''}{a.titulo}</span>
      {a.lugar && <span className="geo-dia-meta">{a.lugar}</span>}
      <span className={`geo-dia-estado geo-dia-estado-${a.estado}`}>{etiquetaEstado(a.estado)}</span>
    </button>
  );

  return (
    <div className="geo-tablero">
      {fallo && (
        <p className="geo-tablero-vacio">
          {fallo}. Lo que ves puede estar desactualizado.{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void recargar()}>Reintentar</button>
        </p>
      )}

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Hoy</div><div className="value">{deHoyL.length}</div></div>
        <div className="kpi"><div className="label">Esta semana</div><div className="value">{semana.length}</div></div>
        <div className={`kpi${pendientes.length > 0 ? ' alerta' : ''}`}>
          <div className="label">Sin marcar</div><div className="value">{pendientes.length}</div>
        </div>
        <div className="kpi"><div className="label">Informes del mes</div><div className="value">{informesMes}</div></div>
      </div>

      <section className="geo-tablero-bloque">
        <h3>Hoy</h3>
        {deHoyL.length === 0 ? (
          <p className="geo-tablero-vacio">No tenés nada planificado para hoy.</p>
        ) : (
          <ul className="geo-dia-lista">{deHoyL.map((a) => <li key={a.id}>{fila(a)}</li>)}</ul>
        )}
      </section>

      <section className="geo-tablero-bloque">
        <h3>Esta semana</h3>
        {semana.length === 0 ? (
          <p className="geo-tablero-vacio">No tenés nada planificado para los próximos 7 días.</p>
        ) : (
          <ul className="geo-dia-lista">
            {semana.map((a, i) => (
              <li key={a.id}>{fila(a, i === 0 || semana[i - 1].desde !== a.desde ? fechaCorta(a.desde) : undefined)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="geo-tablero-bloque">
        <h3>⚠ Quedaron sin marcar</h3>
        {pendientes.length === 0 ? (
          <p className="geo-tablero-vacio">Todo lo que pasó está al día.</p>
        ) : (
          <ul className="geo-dia-lista">
            {visibles.map((a) => (
              <li key={a.id} className="geo-tablero-pend">
                {fila(a, fechaCorta(a.hasta))}
                {canWrite && (
                  <span className="geo-dia-acciones">
                    <button type="button" className="btn btn-sm btn-ghost" disabled={marcando !== null}
                      onClick={() => void marcar(a, 'cumplida')}>Cumplida</button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={marcando !== null}
                      onClick={() => void marcar(a, 'no_se_hizo')}>No se hizo</button>
                  </span>
                )}
              </li>
            ))}
            {pendientes.length > visibles.length && (
              <li className="geo-dia-meta">y {pendientes.length - visibles.length} más</li>
            )}
          </ul>
        )}
      </section>

      <div className="geo-tablero-accesos">
        {canWrite && <button type="button" className="btn btn-primary" onClick={onNuevoInforme}>+ Nuevo informe</button>}
        <button type="button" className="btn btn-ghost" onClick={onIrACalendario}>Ver calendario</button>
        <button type="button" className="btn btn-ghost" onClick={onIrAHistorico}>Histórico</button>
      </div>
    </div>
  );
}
