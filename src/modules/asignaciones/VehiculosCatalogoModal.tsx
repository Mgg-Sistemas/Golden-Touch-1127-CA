/* ============================================================
   Golden Touch · Asignaciones · 🚙 Catálogo de vehículos

   Lista buscable de los vehículos que se pueden autorizar, con agregar,
   editar y borrar. Un vehículo con asignaciones en el historial no se
   borra (lo impide la base): se marca inactivo y deja de ofrecerse.
   ============================================================ */
import { useMemo, useState, type FormEvent } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { toast } from '@/shared/ui/Toast';
import { eliminarVehiculo, guardarVehiculo } from './asignaciones.repository';
import {
  TIPOS_VEHICULO, erroresVehiculo, filtrarVehiculos, formVehiculoDesde, formVehiculoVacio, marcaModelo, payloadVehiculo,
  type FormVehiculo, type VehiculoCatalogo,
} from './vehiculosCatalogo';

export interface UsoVehiculo {
  /** A quién está autorizado hoy («Ana Pérez (ASG-2026-0003)»), si lo está. */
  autorizadoA?: string;
  /** Cuántas asignaciones tiene en el historial (si > 0 no se puede borrar). */
  total: number;
}

export function VehiculosCatalogoModal({ vehiculos, uso, canWrite, actor, onClose, onChanged }: {
  vehiculos: VehiculoCatalogo[];
  uso: Map<string, UsoVehiculo>;
  canWrite: boolean;
  actor: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState<{ id: string | null; f: FormVehiculo } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [borrar, setBorrar] = useState<VehiculoCatalogo | null>(null);
  const filas = useMemo(() => filtrarVehiculos(vehiculos, q), [vehiculos, q]);

  const set = <K extends keyof FormVehiculo>(k: K, val: FormVehiculo[K]) =>
    setEditando((e) => (e ? { ...e, f: { ...e.f, [k]: val } } : e));

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    if (!editando) return;
    const errs = erroresVehiculo(editando.f, vehiculos, editando.id);
    setErrores(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      await guardarVehiculo(editando.id, payloadVehiculo(editando.f), actor);
      toast(editando.id ? 'Vehículo actualizado' : 'Vehículo agregado al catálogo', 'success');
      setEditando(null);
      onChanged();
    } catch (e) { setErrores([e instanceof Error ? e.message : 'No se pudo guardar']); }
    finally { setSaving(false); }
  }

  async function confirmarBorrar() {
    if (!borrar) return;
    const v = borrar;
    setBorrar(null); setSaving(true);
    try { await eliminarVehiculo(v.id); toast(`Placa ${v.placa} borrada del catálogo`, 'success'); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo borrar', 'error'); }
    finally { setSaving(false); }
  }

  if (editando) {
    const f = editando.f;
    return (
      <Modal title={editando.id ? `✏ Editar vehículo · ${f.placa}` : '🚙 Agregar vehículo'} size="lg" onClose={() => !saving && setEditando(null)} footer={
        <>
          <button className="btn btn-ghost" onClick={() => { setEditando(null); setErrores([]); }} disabled={saving}>Volver</button>
          <button type="submit" form="veh-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </>
      }>
        {!!errores.length && (
          <div className="aviso danger" style={{ marginBottom: '.7rem' }}>
            <span className="aviso-icono">⛔</span>
            <div>{errores.map((e) => <div key={e}>{e}</div>)}</div>
          </div>
        )}
        <form id="veh-form" onSubmit={guardar}>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="veh-placa">Placa *</label>
              <input id="veh-placa" className="input mono" value={f.placa} onChange={(e) => set('placa', e.target.value.toUpperCase())} placeholder="AB381AA" autoFocus />
            </div>
            <div className="form-row">
              <label htmlFor="veh-alias">Nombre / alias</label>
              <input id="veh-alias" className="input" value={f.alias} onChange={(e) => set('alias', e.target.value)} placeholder="Machito plata, Hilux de compras…" />
            </div>
            <div className="form-row">
              <label htmlFor="veh-tipo">Tipo</label>
              <select id="veh-tipo" className="select" value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
                <option value="">—</option>
                {[...new Set([...TIPOS_VEHICULO, ...(f.tipo ? [f.tipo] : [])])].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="veh-marca">Marca *</label>
              <input id="veh-marca" className="input" value={f.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Toyota" />
            </div>
            <div className="form-row">
              <label htmlFor="veh-modelo">Modelo</label>
              <input id="veh-modelo" className="input" value={f.modelo} onChange={(e) => set('modelo', e.target.value)} placeholder="Hilux" />
            </div>
            <div className="form-row">
              <label htmlFor="veh-anio">Año</label>
              <input id="veh-anio" className="input mono" inputMode="numeric" value={f.anio} onChange={(e) => set('anio', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2015" />
            </div>
            <div className="form-row">
              <label htmlFor="veh-color">Color</label>
              <input id="veh-color" className="input" value={f.color} onChange={(e) => set('color', e.target.value)} placeholder="Blanco" />
            </div>
            <div className="form-row">
              <label htmlFor="veh-sc">Serial de carrocería</label>
              <input id="veh-sc" className="input mono" value={f.serial_carroceria} onChange={(e) => set('serial_carroceria', e.target.value.toUpperCase())} />
            </div>
            <div className="form-row">
              <label htmlFor="veh-sm">Serial de motor</label>
              <input id="veh-sm" className="input mono" value={f.serial_motor} onChange={(e) => set('serial_motor', e.target.value.toUpperCase())} />
            </div>
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="veh-obs">Observación</label>
              <input id="veh-obs" className="input" value={f.observacion} onChange={(e) => set('observacion', e.target.value)} placeholder="Título a nombre de…, póliza vence…" />
            </div>
          </div>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.8rem' }}>
            <input type="checkbox" checked={f.activo} onChange={(e) => set('activo', e.target.checked)} />
            <span><strong>Activo</strong>: se ofrece al asignar. Desmárcalo si se vendió o ya no se usa (su historial se conserva).</span>
          </label>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title={`🚙 Catálogo de vehículos (${vehiculos.length})`} size="lg" onClose={onClose} footer={
      <>
        {canWrite && <button className="btn btn-primary" onClick={() => { setErrores([]); setEditando({ id: null, f: formVehiculoVacio() }); }}>+ Agregar vehículo</button>}
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      </>
    }>
      <input className="input" style={{ marginBottom: '.7rem' }} placeholder="🔍 Buscar por placa, nombre, marca, modelo, serial…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!filas.length ? <EmptyState icon="🚙" message={vehiculos.length ? 'Ningún vehículo coincide.' : 'Todavía no hay vehículos en el catálogo.'} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Placa</th><th>Vehículo</th><th>Color</th><th>Seriales</th><th>Autorizado a</th>{canWrite && <th />}</tr></thead>
            <tbody>
              {filas.map((v) => {
                const u = uso.get(v.id);
                return (
                  <tr key={v.id} style={v.activo ? undefined : { opacity: 0.55 }}>
                    <td className="mono"><strong>{v.placa}</strong>{!v.activo && <span className="lt-pill gris" style={{ marginLeft: '.35rem' }}>Inactivo</span>}</td>
                    <td>
                      {v.alias || marcaModelo(v) || '—'}
                      <span className="lt-sub">{[v.tipo, v.alias ? marcaModelo(v) : null].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td>{v.color || '—'}</td>
                    <td className="mono" style={{ fontSize: '.8rem' }}>
                      {v.serial_carroceria ? <div>Carr. {v.serial_carroceria}</div> : null}
                      {v.serial_motor ? <div>Motor {v.serial_motor}</div> : null}
                      {!v.serial_carroceria && !v.serial_motor ? '—' : null}
                    </td>
                    <td>{u?.autorizadoA ? <span className="lt-pill ambar">{u.autorizadoA}</span> : <span className="muted">Libre</span>}</td>
                    {canWrite && (
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button className="btn btn-sm btn-ghost" title="Editar" disabled={saving}
                          onClick={() => { setErrores([]); setEditando({ id: v.id, f: formVehiculoDesde(v) }); }}>✏</button>
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Borrar del catálogo" disabled={saving}
                          onClick={() => setBorrar(v)}>🗑</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {borrar && (() => {
        const u = uso.get(borrar.id);
        const usado = (u?.total ?? 0) > 0;
        return (
          <ConfirmDialog
            title={usado ? 'No se puede borrar' : 'Borrar vehículo del catálogo'} danger={!usado} confirmText={usado ? 'Entendido' : 'Sí, borrar'}
            message={usado
              ? <>Este vehículo tiene <strong>{u?.total} asignación(es)</strong> en el historial, así que <strong>no se puede borrar</strong>. Edítalo y desmarca <em>Activo</em> para que deje de ofrecerse.</>
              : <>Se borra del catálogo. Esta acción no se puede deshacer.</>}
            preview={
              <VistaPrevia titulo="Se va a borrar">
                <Dato label="Placa">{borrar.placa}</Dato>
                <Dato label="Nombre">{borrar.alias}</Dato>
                <Dato label="Tipo">{borrar.tipo}</Dato>
                <Dato label="Marca / modelo">{marcaModelo(borrar)}</Dato>
                <Dato label="Color">{borrar.color}</Dato>
                <Dato label="Autorizado a">{u?.autorizadoA}</Dato>
              </VistaPrevia>
            }
            onConfirm={() => { if (usado) setBorrar(null); else void confirmarBorrar(); }}
            onCancel={() => setBorrar(null)}
          />
        );
      })()}
    </Modal>
  );
}
