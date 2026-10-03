/* ============================================================
   Golden Touch · Geodesta · Rejilla del mes
   Presentación pura: todo llega por props. Tocar un día solo avisa.
   ============================================================ */
import { useMemo } from 'react';
import { DIAS_SEMANA } from '@/shared/lib/dias';
import { date as fmtDate } from '@/shared/lib/format';
import type { PlanificacionGeodesta } from '@/shared/lib/types';
import { actividadesDelDia, rejillaDelMes } from './geodestaCalendario';

interface CalendarioRejillaProps {
  anio: number;
  mes: number; // 1-12
  hoy: string; // AAAA-MM-DD, ya en hora de Venezuela
  actividades: PlanificacionGeodesta[];
  informesPorDia: Map<string, number>;
  imagenesPorDia: Map<string, number>;
  onDia: (fecha: string) => void;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function CalendarioRejilla({
  anio, mes, hoy, actividades, informesPorDia, imagenesPorDia, onDia,
}: CalendarioRejillaProps) {
  const celdas = useMemo(() => rejillaDelMes(anio, mes, hoy), [anio, mes, hoy]);

  return (
    <div className="geo-rejilla" role="group" aria-label="Calendario del mes">
      {DIAS_SEMANA.map((d, i) => (
        <div key={i} className="geo-rejilla-cab" aria-hidden="true">{d}</div>
      ))}
      {celdas.map((c) => {
        const clases = ['geo-dia'];
        if (c.diaSemana === 0) clases.push('domingo');
        if (c.esHoy) clases.push('hoy');
        const numero = Number(c.fecha.slice(8, 10));

        if (!c.delMes) {
          return (
            <div key={c.fecha} className={`${clases.join(' ')} fuera`} aria-hidden="true">
              <span className="geo-dia-num">{numero}</span>
            </div>
          );
        }

        const nAct = actividadesDelDia(actividades, c.fecha).length;
        const nInf = informesPorDia.get(c.fecha) ?? 0;
        const nImg = imagenesPorDia.get(c.fecha) ?? 0;
        const tiene: string[] = [];
        if (nAct) tiene.push(plural(nAct, 'actividad', 'actividades'));
        if (nInf) tiene.push(plural(nInf, 'informe', 'informes'));
        if (nImg) tiene.push(plural(nImg, 'imagen', 'imágenes'));
        const label = `${fmtDate(c.fecha)}${c.esHoy ? ', hoy' : ''}: ${tiene.length ? tiene.join(', ') : 'sin nada cargado'}`;

        return (
          <button key={c.fecha} type="button" className={clases.join(' ')}
            aria-label={label} aria-current={c.esHoy ? 'date' : undefined} onClick={() => onDia(c.fecha)}>
            <span className="geo-dia-num">{numero}</span>
            <span className="geo-dia-marcas" aria-hidden="true">
              {nAct > 0 && <span className="geo-marca-act">{nAct}</span>}
              {nInf > 0 && <span>📄</span>}
              {nImg > 0 && <span>🖼</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
