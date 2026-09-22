/* ============================================================
   Golden Touch · RRHH · Carga familiar (alta y edición)

   Quiénes dependen del trabajador. Mismo criterio que la documentación: en un
   registro que YA existe cada familiar se guarda en el momento; en uno nuevo
   todavía no hay a qué colgarlos, así que quedan pendientes y viajan con el alta.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import type { PersonalFamiliar } from '@/shared/lib/types';
import { PARENTESCOS, edad, labelParentesco } from './fichaPersonal';
import {
  agregarFamiliar, borrarFamiliar, listFamiliares, type FamiliarInput,
} from './familiares.repository';

const VACIO: FamiliarInput = {
  nombre: '', parentesco: 'hijo', fecha_nacimiento: '', cedula: '',
  genero: null, estudia: false, discapacidad: false, observacion: '',
};

export function CargaFamiliarPersona({
  personalId, canWrite, pendientes, onPendientes, onCambio,
}: {
  /** `null` = la persona todavía no existe (alta). */
  personalId: string | null;
  canWrite: boolean;
  /** Los familiares elegidos antes de que la persona exista. */
  pendientes?: FamiliarInput[];
  onPendientes?: (lista: FamiliarInput[]) => void;
  onCambio?: () => void;
}) {
  const [lista, setLista] = useState<PersonalFamiliar[]>([]);
  const [form, setForm] = useState<FamiliarInput>(VACIO);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!personalId) { setLista([]); return; }
    try { setLista(await listFamiliares(personalId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la carga familiar'); }
  }, [personalId]);

  useEffect(() => { void recargar(); }, [recargar]);

  async function agregar() {
    setError(null);
    if (!form.nombre.trim()) { setError('Indicá el nombre del familiar.'); return; }
    if (!personalId) {
      onPendientes?.([...(pendientes ?? []), { ...form }]);
      setForm(VACIO); setAbierto(false);
      return;
    }
    setOcupado(true);
    try {
      await agregarFamiliar(personalId, form);
      setForm(VACIO); setAbierto(false);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar');
    } finally { setOcupado(false); }
  }

  async function quitar(f: PersonalFamiliar) {
    if (!window.confirm(`¿Quitar a ${f.nombre} de la carga familiar?`)) return;
    setOcupado(true);
    try {
      await borrarFamiliar(f.id);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar');
    } finally { setOcupado(false); }
  }

  function quitarPendiente(idx: number) {
    onPendientes?.((pendientes ?? []).filter((_, i) => i !== idx));
  }

  const hijos = [...lista, ...(pendientes ?? []).map((p) => ({ parentesco: p.parentesco }))]
    .filter((f) => f.parentesco === 'hijo').length;
  const totales = lista.length + (pendientes?.length ?? 0);

  return (
    <div>
      {error && (
        <div className="aviso danger sm" style={{ marginBottom: '.5rem' }}>
          <span className="aviso-icono">⛔</span><div>{error}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <span className="muted" style={{ fontSize: '.82rem' }}>
          {totales ? `${totales} familiar(es)${hijos ? ` · ${hijos} hijo(s)` : ''}` : 'Sin carga familiar cargada.'}
        </span>
        {canWrite && !abierto && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setForm(VACIO); setAbierto(true); }}>
            + Agregar familiar
          </button>
        )}
      </div>

      {abierto && (
        <div className="card" style={{ padding: '.7rem', marginBottom: '.6rem' }}>
          <div className="form-grid">
            <div className="form-row">
              <label>Nombre y apellido *</label>
              <input className="input" autoFocus value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value.toUpperCase() }))} />
            </div>
            <div className="form-row">
              <label>Parentesco *</label>
              <select className="input" value={form.parentesco}
                onChange={(e) => setForm((f) => ({ ...f, parentesco: e.target.value as FamiliarInput['parentesco'] }))}>
                {PARENTESCOS.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Fecha de nacimiento</label>
              <input className="input" type="date" value={form.fecha_nacimiento ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))} />
              <small className="muted">De acá sale la edad; no se guarda un número que envejece.</small>
            </div>
            <div className="form-row">
              <label>Cédula (si tiene)</label>
              <input className="input" value={form.cedula ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, cedula: e.target.value.toUpperCase() }))}
                placeholder="V-12345678" />
            </div>
            <div className="form-row">
              <label>Observación</label>
              <input className="input" value={form.observacion ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))}
                placeholder="Opcional" />
            </div>
            <div className="form-row">
              <label>Marcas</label>
              <div style={{ display: 'flex', gap: '.9rem', flexWrap: 'wrap', paddingTop: '.35rem' }}>
                <label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', fontSize: '.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.estudia}
                    onChange={(e) => setForm((f) => ({ ...f, estudia: e.target.checked }))} /> Estudia
                </label>
                <label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', fontSize: '.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.discapacidad}
                    onChange={(e) => setForm((f) => ({ ...f, discapacidad: e.target.checked }))} /> Discapacidad
                </label>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem' }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={ocupado} onClick={() => void agregar()}>
              {ocupado ? 'Guardando…' : 'Agregar'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setAbierto(false); setError(null); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {(!!lista.length || !!pendientes?.length) && (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead>
              <tr>
                <th>Nombre</th><th>Parentesco</th><th>Nacimiento</th>
                <th style={{ textAlign: 'right' }}>Edad</th><th>Marcas</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.id}>
                  <td>{f.nombre}{f.cedula ? <span className="muted"> · {f.cedula}</span> : null}</td>
                  <td>{labelParentesco(f.parentesco)}</td>
                  <td className="mono">{f.fecha_nacimiento ?? '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{edad(f.fecha_nacimiento) ?? '—'}</td>
                  <td className="muted" style={{ fontSize: '.76rem' }}>
                    {[f.estudia ? 'estudia' : '', f.discapacidad ? 'discapacidad' : '', f.observacion]
                      .filter(Boolean).join(' · ') || '—'}
                  </td>
                  {canWrite && (
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                        disabled={ocupado} onClick={() => void quitar(f)}>🗑</button>
                    </td>
                  )}
                </tr>
              ))}
              {(pendientes ?? []).map((f, i) => (
                <tr key={`p-${i}`} style={{ opacity: .75 }}>
                  <td>{f.nombre}{f.cedula ? <span className="muted"> · {f.cedula}</span> : null}</td>
                  <td>{labelParentesco(f.parentesco)}</td>
                  <td className="mono">{f.fecha_nacimiento || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{edad(f.fecha_nacimiento) ?? '—'}</td>
                  <td className="muted" style={{ fontSize: '.76rem' }}>se guarda con el registro</td>
                  {canWrite && (
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                        onClick={() => quitarPendiente(i)}>🗑</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
