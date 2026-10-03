/* ============================================================
   Golden Touch · Geodesta · Calendario en modo barra

   Una fila por actividad que toca el mes; una columna por día. La
   columna 1 es la del título, así que el día i (0-based) es la columna
   i + 2. Presentación pura: nada de fetch ni de `new Date()`.
   ============================================================ */
import { MESES, DIAS_SEMANA, diaDeLaSemana, fechasEntre } from '@/shared/lib/dias';
import type { PlanificacionGeodesta } from '@/shared/lib/types';
import { limitesDelMes, tramoEnElMes } from './geodestaCalendario';
import { etiquetaEstado } from './planModelo';

interface CalendarioBarraProps {
  anio: number;
  mes: number;
  hoy: string;
  actividades: PlanificacionGeodesta[];
  onActividad: (p: PlanificacionGeodesta) => void;
  onDiaVacio: (fecha: string) => void;
  onDia: (fecha: string) => void;
}

/** «28 de septiembre» */
function diaYMes(iso: string): string {
  return `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1].toLowerCase()}`;
}

export function CalendarioBarra({ anio, mes, hoy, actividades, onActividad, onDiaVacio, onDia }: CalendarioBarraProps) {
  const { ini, fin } = limitesDelMes(anio, mes);
  const dias = fechasEntre(ini, fin);
  const D = dias.length;

  const filas = actividades
    .map((a) => ({ a, t: tramoEnElMes(a, ini, fin) }))
    .flatMap((f) => (f.t ? [{ a: f.a, t: f.t }] : []))
    .sort((x, y) => x.a.desde.localeCompare(y.a.desde));

  if (!filas.length) {
    return (
      <div className="card geo-vacio">
        <strong>No hay actividades planificadas en {MESES[mes - 1].toLowerCase()}.</strong>
        <span className="muted">Tocá un día para cargar la primera.</span>
        <div className="geo-vacio-dias">
          {dias.map((f) => (
            <button key={f} type="button" className={`btn btn-ghost geo-vacio-dia${f === hoy ? ' hoy' : ''}`}
              onClick={() => onDiaVacio(f)} aria-label={`Cargar una actividad el ${diaYMes(f)}`}>
              {Number(f.slice(8))}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card desc-scroll">
      <div className="desc-grid geo-barra-grid"
        style={{ gridTemplateColumns: `minmax(150px, 190px) repeat(${D}, minmax(28px, 1fr))`, minWidth: 170 + D * 28 }}>
        <div className="desc-nombre desc-cab">Actividad</div>
        {dias.map((f) => {
          const ds = diaDeLaSemana(f);
          return (
            <button key={f} type="button" onClick={() => onDia(f)}
              className={`desc-cab desc-dia geo-cab-dia${f === hoy ? ' hoy' : ''}${ds === 0 ? ' domingo' : ''}`}
              aria-label={`Ver el ${diaYMes(f)}`}>
              <small>{DIAS_SEMANA[ds]}</small>{Number(f.slice(8))}
            </button>
          );
        })}

        {filas.map(({ a, t }, i) => {
          const row = i + 2;
          const avisos = [
            t.cortaIzq ? `viene del ${diaYMes(a.desde)}` : '',
            t.cortaDer ? `sigue hasta el ${diaYMes(a.hasta)}` : '',
          ].filter(Boolean);
          const title = [`${a.titulo} · ${etiquetaEstado(a.estado)}`, a.lugar, ...avisos].filter(Boolean).join(' · ');
          return (
            <div key={a.id} className="geo-fila" style={{ display: 'contents' }}>
              <div className="desc-nombre" style={{ gridRow: row }} title={a.titulo}>
                <span className="desc-nombre-txt">{a.titulo}</span>
                {a.lugar && <small className="muted">{a.lugar}</small>}
              </div>
              {dias.map((f, d) => (
                <button key={f} type="button" className={`desc-celda${f === hoy ? ' hoy' : ''}`}
                  style={{ gridColumn: d + 2, gridRow: row }}
                  onClick={() => onDiaVacio(f)} aria-label={`Cargar una actividad el ${diaYMes(f)}`} />
              ))}
              <button type="button" className={`desc-bar geo-bar ${a.estado}`}
                style={{ gridColumn: `${t.col0 + 2} / ${t.col1 + 3}`, gridRow: row }}
                onClick={() => onActividad(a)} title={title}
                aria-label={`${a.titulo}, ${etiquetaEstado(a.estado)}${avisos.length ? `, ${avisos.join(', ')}` : ''}`}>
                {t.cortaIzq && <span className="geo-corte" aria-hidden="true">‹</span>}
                <span className="geo-bar-txt">{a.titulo}</span>
                {t.cortaDer && <span className="geo-corte" aria-hidden="true">›</span>}
              </button>
            </div>
          );
        })}
      </div>
      <div className="desc-leyenda muted geo-leyenda">
        <span><i className="desc-muestra geo-muestra planificada" /> Planificada</span>
        <span><i className="desc-muestra geo-muestra cumplida" /> Cumplida</span>
        <span><i className="desc-muestra geo-muestra no_se_hizo" /> No se hizo</span>
      </div>
    </div>
  );
}
