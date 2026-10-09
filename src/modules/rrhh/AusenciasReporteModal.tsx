/* ============================================================
   Golden Touch · RRHH · Ventana del reporte de vacaciones / descansos
   Rango de fechas (arranca en el mes que se está viendo), un trabajador o
   todos, búsqueda, y salida en PDF o Excel con vista previa.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { money, date } from '@/shared/lib/format';
import type { EmpresaRrhh } from '@/shared/lib/types';
import {
  filasAusencias, nombrePersona, rangoDelMes, totalesAusencias,
  type AusenciaBase, type PersonaAusencia, type TipoAusencia,
} from './ausenciasReporte';

export function AusenciasReporteModal({ tipo, empresa, items, personas, mes, onClose }: {
  tipo: TipoAusencia;
  empresa: EmpresaRrhh;
  items: AusenciaBase[];
  personas: PersonaAusencia[];
  /** Mes que se está viendo en el calendario (mes 0-based). */
  mes: { y: number; m: number };
  onClose: () => void;
}) {
  const inicial = rangoDelMes(mes.y, mes.m);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [personalId, setPersonalId] = useState('');
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState<'pdf' | 'xlsx' | null>(null);

  const filas = useMemo(
    () => filasAusencias(items, personas, { desde: desde || null, hasta: hasta || null, personalId: personalId || null, texto }),
    [items, personas, desde, hasta, personalId, texto],
  );
  const t = totalesAusencias(filas);
  const esVac = tipo === 'vacaciones';
  const persona = personas.find((p) => p.id === personalId) ?? null;

  async function bajar(formato: 'pdf' | 'xlsx') {
    setOcupado(formato);
    try {
      const m = await import('./ausenciasReporteArchivos');
      const meta = { tipo, empresa, desde: desde || null, hasta: hasta || null, persona: persona ? nombrePersona(persona) : null };
      if (formato === 'pdf') await m.descargarAusenciasPdf(filas, meta);
      else await m.descargarAusenciasExcel(filas, meta);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el archivo', 'error');
    } finally { setOcupado(null); }
  }

  function rangoRapido(r: 'mes' | 'anio' | 'todo') {
    if (r === 'mes') { setDesde(inicial.desde); setHasta(inicial.hasta); }
    else if (r === 'anio') { setDesde(`${mes.y}-01-01`); setHasta(`${mes.y}-12-31`); }
    else { setDesde(''); setHasta(''); }
  }

  return (
    <Modal
      title={esVac ? 'Reporte de vacaciones' : 'Reporte de descansos'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn-ghost" disabled={!filas.length || !!ocupado} onClick={() => void bajar('xlsx')}>
            {ocupado === 'xlsx' ? 'Generando…' : '📊 Excel'}
          </button>
          <button className="btn btn-primary" disabled={!filas.length || !!ocupado} onClick={() => void bajar('pdf')}>
            {ocupado === 'pdf' ? 'Generando…' : '📄 PDF'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-row">
          <label htmlFor="aus-desde">Desde</label>
          <input id="aus-desde" className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="aus-hasta">Hasta</label>
          <input id="aus-hasta" className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Trabajador</label>
          <SearchSelect
            value={personalId}
            onChange={(v) => setPersonalId(v)}
            options={[{ value: '', label: 'Todos' }, ...personas.map((p) => ({ value: p.id, label: `${nombrePersona(p)}${p.cedula ? ` · ${p.cedula}` : ''}` }))]}
            placeholder="Todos"
          />
        </div>
        <div className="form-row">
          <label htmlFor="aus-texto">Buscar</label>
          <input id="aus-texto" className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, cédula, cargo o departamento" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', margin: '.5rem 0' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => rangoRapido('mes')}>Mes del calendario</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => rangoRapido('anio')}>Año {mes.y}</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => rangoRapido('todo')}>Todas las fechas</button>
      </div>

      <div className="muted" style={{ margin: '.4rem 0 .6rem', fontSize: '.86rem' }}>
        {t.registros} registro(s) de {t.personas} persona(s) · {t.dias} día(s)
        {esVac && <> · {t.procesadas} procesada(s), {t.pendientes} pendiente(s) · {money(t.monto)}</>}
      </div>

      {!filas.length ? <EmptyState icon={esVac ? '🏖' : '🛌'} message="No hay registros con esos filtros." /> : (
        <div className="table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead>
              <tr>
                <th>Trabajador</th><th>Departamento</th><th>Desde</th><th>Hasta</th><th style={{ textAlign: 'center' }}>Días</th>
                <th>{esVac ? 'Estado' : 'Origen'}</th>{esVac && <th style={{ textAlign: 'right' }}>Monto</th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{nombrePersona(f.persona)}{f.cruce && <span title="Se cruza con alguien del mismo departamento" style={{ color: 'var(--warning)' }}> ⚠</span>}</td>
                  <td className="muted">{f.persona?.departamento ?? ''}</td>
                  <td className="mono">{date(f.desde)}</td>
                  <td className="mono">{date(f.hasta)}</td>
                  <td className="mono" style={{ textAlign: 'center' }}>{f.diasTotal}</td>
                  <td>{f.estado}{f.nota && <div className="muted" style={{ fontSize: '.74rem' }}>{f.nota}</div>}</td>
                  {esVac && <td className="mono" style={{ textAlign: 'right' }}>{money(Number(f.monto) || 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
