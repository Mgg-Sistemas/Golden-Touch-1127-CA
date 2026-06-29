/* ============================================================
   Golden Touch · Salidas / Traslados · Campos de transporte
   Bloque reutilizable para la creación de solicitudes: chofer
   (responsable) y vehículo buscables desde catálogo, alta rápida,
   gestión (editar / desactivar / eliminar) y direcciones de
   despacho y destino (campos del formato "Salida en tránsito").
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import {
  type Chofer, type Vehiculo, nombreChofer,
  listChoferes, addChofer, updateChofer, setChoferActivo, eliminarChofer,
  listVehiculos, addVehiculo, updateVehiculo, setVehiculoActivo, eliminarVehiculo,
} from './transporte.repository';

/** Dirección de despacho por defecto (galpón de Golden Touch). */
export const DIRECCION_DESPACHO_DEFAULT = 'GALPON LOS PINOS GT';

export interface TransporteSeleccion {
  choferId: string | null;
  choferNombre: string | null;
  choferCedula: string | null;
  vehiculoId: string | null;
  vehiculoDescripcion: string | null;
  vehiculoPlaca: string | null;
  direccionDespacho: string;
  direccionDestino: string;
}

export const transporteVacio = (): TransporteSeleccion => ({
  choferId: null, choferNombre: null, choferCedula: null,
  vehiculoId: null, vehiculoDescripcion: null, vehiculoPlaca: null,
  direccionDespacho: DIRECCION_DESPACHO_DEFAULT, direccionDestino: '',
});

export function TransporteFields({
  value, onChange, actor,
}: {
  value: TransporteSeleccion;
  onChange: (v: TransporteSeleccion) => void;
  actor?: string;
}) {
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [gestionar, setGestionar] = useState<'chofer' | 'vehiculo' | null>(null);

  // Alta rápida de chofer.
  const chNombreRef = useRef<HTMLInputElement>(null);
  const chApellidoRef = useRef<HTMLInputElement>(null);
  const chCedulaRef = useRef<HTMLInputElement>(null);
  const [addingCh, setAddingCh] = useState(false);
  const [nuevoChoferOn, setNuevoChoferOn] = useState(false);

  // Alta rápida de vehículo.
  const veDescRef = useRef<HTMLInputElement>(null);
  const vePlacaRef = useRef<HTMLInputElement>(null);
  const [addingVe, setAddingVe] = useState(false);
  const [nuevoVehiculoOn, setNuevoVehiculoOn] = useState(false);

  const cargar = useCallback(async () => {
    const [chs, ves] = await Promise.all([
      listChoferes().catch(() => [] as Chofer[]),
      listVehiculos().catch(() => [] as Vehiculo[]),
    ]);
    setChoferes(chs);
    setVehiculos(ves);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['choferes', 'vehiculos'], () => { void cargar(); });

  const choferesActivos = useMemo(() => choferes.filter((c) => c.activo), [choferes]);
  const vehiculosActivos = useMemo(() => vehiculos.filter((v) => v.activo), [vehiculos]);

  function elegirChofer(id: string) {
    const c = choferes.find((x) => x.id === id) ?? null;
    onChange({
      ...value,
      choferId: c?.id ?? null,
      choferNombre: c ? nombreChofer(c) : null,
      choferCedula: c?.cedula || null,
    });
  }
  function elegirVehiculo(id: string) {
    const v = vehiculos.find((x) => x.id === id) ?? null;
    onChange({
      ...value,
      vehiculoId: v?.id ?? null,
      vehiculoDescripcion: v?.descripcion ?? null,
      vehiculoPlaca: v?.placa ?? null,
    });
  }

  async function guardarChofer() {
    const nombre = (chNombreRef.current?.value ?? '').trim();
    if (!nombre) { toast('Escribí al menos el nombre del chofer', 'error'); return; }
    try {
      setAddingCh(true);
      const c = await addChofer({
        nombre,
        apellido: (chApellidoRef.current?.value ?? '').trim(),
        cedula: (chCedulaRef.current?.value ?? '').trim(),
        actor,
      });
      await cargar();
      onChange({ ...value, choferId: c.id, choferNombre: nombreChofer(c), choferCedula: c.cedula || null });
      if (chNombreRef.current) chNombreRef.current.value = '';
      if (chApellidoRef.current) chApellidoRef.current.value = '';
      if (chCedulaRef.current) chCedulaRef.current.value = '';
      setNuevoChoferOn(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo agregar el chofer', 'error');
    } finally {
      setAddingCh(false);
    }
  }

  async function guardarVehiculo() {
    const descripcion = (veDescRef.current?.value ?? '').trim();
    const placa = (vePlacaRef.current?.value ?? '').trim();
    if (!descripcion) { toast('Escribí la descripción del vehículo', 'error'); return; }
    if (!placa) { toast('Escribí la placa del vehículo', 'error'); return; }
    try {
      setAddingVe(true);
      const v = await addVehiculo({ descripcion, placa, actor });
      await cargar();
      onChange({ ...value, vehiculoId: v.id, vehiculoDescripcion: v.descripcion, vehiculoPlaca: v.placa });
      if (veDescRef.current) veDescRef.current.value = '';
      if (vePlacaRef.current) vePlacaRef.current.value = '';
      setNuevoVehiculoOn(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo agregar el vehículo', 'error');
    } finally {
      setAddingVe(false);
    }
  }

  return (
    <>
      <label style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, margin: '.4rem 0 .35rem' }}>
        Transporte y destino
      </label>

      <div className="form-grid">
        {/* ── Chofer / responsable ── */}
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Chofer / responsable</label>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'flex-start' }}>
            <SearchSelect value={value.choferId ?? ''} onChange={elegirChofer} style={{ flex: 1, minWidth: 0 }}
              placeholder="🔍 Buscar chofer…"
              options={choferesActivos.map((c) => ({ value: c.id, label: `${nombreChofer(c)}${c.cedula ? ` · C.I. ${c.cedula}` : ''}` }))} />
            <button type="button" className="btn btn-ghost" title="Gestionar choferes" onClick={() => setGestionar('chofer')}>⚙</button>
          </div>
          {!nuevoChoferOn ? (
            <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.35rem' }} onClick={() => setNuevoChoferOn(true)}>＋ Nuevo chofer</button>
          ) : (
            <div className="card" style={{ marginTop: '.4rem', padding: '.5rem .6rem', background: 'var(--bg-1)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
                <input className="input" ref={chNombreRef} defaultValue="" placeholder="Nombre"
                  onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }} />
                <input className="input" ref={chApellidoRef} defaultValue="" placeholder="Apellido"
                  onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }} />
              </div>
              <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
                <input className="input mono" ref={chCedulaRef} defaultValue="" placeholder="Cédula (V-…)" style={{ flex: 1 }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void guardarChofer(); } }} />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void guardarChofer()} disabled={addingCh}>
                  {addingCh ? '…' : 'Guardar'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNuevoChoferOn(false)} disabled={addingCh}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Vehículo ── */}
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Vehículo</label>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'flex-start' }}>
            <SearchSelect value={value.vehiculoId ?? ''} onChange={elegirVehiculo} style={{ flex: 1, minWidth: 0 }}
              placeholder="🔍 Buscar vehículo…"
              options={vehiculosActivos.map((v) => ({ value: v.id, label: `${v.descripcion} · ${v.placa}` }))} />
            <button type="button" className="btn btn-ghost" title="Gestionar vehículos" onClick={() => setGestionar('vehiculo')}>⚙</button>
          </div>
          {!nuevoVehiculoOn ? (
            <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.35rem' }} onClick={() => setNuevoVehiculoOn(true)}>＋ Nuevo vehículo</button>
          ) : (
            <div className="card" style={{ marginTop: '.4rem', padding: '.5rem .6rem', background: 'var(--bg-1)' }}>
              <input className="input" ref={veDescRef} defaultValue="" placeholder="Descripción (marca / modelo)"
                onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }} />
              <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
                <input className="input mono" ref={vePlacaRef} defaultValue="" placeholder="Placa" style={{ flex: 1 }}
                  onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void guardarVehiculo(); } }} />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void guardarVehiculo()} disabled={addingVe}>
                  {addingVe ? '…' : 'Guardar'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNuevoVehiculoOn(false)} disabled={addingVe}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Direcciones ── */}
      <div className="form-grid" style={{ marginTop: '.6rem' }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Dirección de despacho</label>
          <input className="input" value={value.direccionDespacho}
            onChange={(e) => onChange({ ...value, direccionDespacho: e.target.value })}
            placeholder="Desde dónde sale" />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Dirección de destino</label>
          <input className="input" value={value.direccionDestino}
            onChange={(e) => onChange({ ...value, direccionDestino: e.target.value })}
            placeholder="Empresa / taller / dirección de destino" />
        </div>
      </div>

      {gestionar === 'chofer' && (
        <GestionarChoferesModal choferes={choferes} onClose={() => setGestionar(null)} onCambio={cargar} />
      )}
      {gestionar === 'vehiculo' && (
        <GestionarVehiculosModal vehiculos={vehiculos} onClose={() => setGestionar(null)} onCambio={cargar} />
      )}
    </>
  );
}

/* ════════════════ Gestión de choferes ════════════════ */
function GestionarChoferesModal({ choferes, onClose, onCambio }: {
  choferes: Chofer[]; onClose: () => void; onCambio: () => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<Chofer | null>(null);
  const [busy, setBusy] = useState(false);
  const nRef = useRef<HTMLInputElement>(null);
  const aRef = useRef<HTMLInputElement>(null);
  const cRef = useRef<HTMLInputElement>(null);

  async function guardar(c: Chofer) {
    try {
      setBusy(true);
      await updateChofer(c.id, { nombre: (nRef.current?.value ?? '').trim(), apellido: (aRef.current?.value ?? '').trim(), cedula: (cRef.current?.value ?? '').trim() });
      setEditId(null);
      await onCambio();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  }
  async function toggle(c: Chofer) {
    try { await setChoferActivo(c.id, !c.activo); await onCambio(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }
  async function quitar() {
    if (!aEliminar) return;
    try { setBusy(true); await eliminarChofer(aEliminar.id); setAEliminar(null); await onCambio(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Gestionar choferes" size="md" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>Editá, desactivá o eliminá choferes. Los desactivados no aparecen en el formulario.</p>
      {choferes.length === 0 && <div className="muted" style={{ padding: '.5rem 0' }}>Sin choferes cargados.</div>}
      {choferes.map((c) => (
        <div key={c.id} className="card" style={{ padding: '.5rem .7rem', margin: '0 0 .45rem', background: 'var(--bg-1)', opacity: c.activo ? 1 : 0.55 }}>
          {editId === c.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem' }}>
                <input className="input" ref={nRef} defaultValue={c.nombre} placeholder="Nombre" />
                <input className="input" ref={aRef} defaultValue={c.apellido} placeholder="Apellido" />
              </div>
              <div style={{ display: 'flex', gap: '.35rem' }}>
                <input className="input mono" ref={cRef} defaultValue={c.cedula} placeholder="Cédula" style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={() => void guardar(c)} disabled={busy}>Guardar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)} disabled={busy}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
              <div>
                <strong>{nombreChofer(c)}</strong>
                {c.cedula && <span className="muted mono" style={{ marginLeft: '.5rem', fontSize: '.8rem' }}>C.I. {c.cedula}</span>}
                {!c.activo && <span className="badge" style={{ marginLeft: '.45rem', fontSize: '.62rem' }}>INACTIVO</span>}
              </div>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(c.id); }}>✎</button>
                <button className="btn btn-ghost btn-sm" onClick={() => void toggle(c)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
                <button className="btn btn-ghost btn-sm" title="Eliminar" onClick={() => setAEliminar(c)}>🗑</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {aEliminar && (
        <ConfirmDialog title="Eliminar chofer" confirmText="Eliminar" danger
          message={`Se eliminará "${nombreChofer(aEliminar)}" del catálogo. ¿Continuar?`}
          onCancel={() => setAEliminar(null)} onConfirm={() => void quitar()} />
      )}
    </Modal>
  );
}

/* ════════════════ Gestión de vehículos ════════════════ */
function GestionarVehiculosModal({ vehiculos, onClose, onCambio }: {
  vehiculos: Vehiculo[]; onClose: () => void; onCambio: () => Promise<void>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<Vehiculo | null>(null);
  const [busy, setBusy] = useState(false);
  const dRef = useRef<HTMLInputElement>(null);
  const pRef = useRef<HTMLInputElement>(null);

  async function guardar(v: Vehiculo) {
    try {
      setBusy(true);
      await updateVehiculo(v.id, { descripcion: (dRef.current?.value ?? '').trim(), placa: (pRef.current?.value ?? '').trim() });
      setEditId(null);
      await onCambio();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  }
  async function toggle(v: Vehiculo) {
    try { await setVehiculoActivo(v.id, !v.activo); await onCambio(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }
  async function quitar() {
    if (!aEliminar) return;
    try { setBusy(true); await eliminarVehiculo(aEliminar.id); setAEliminar(null); await onCambio(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Gestionar vehículos" size="md" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>Editá, desactivá o eliminá vehículos. Los desactivados no aparecen en el formulario.</p>
      {vehiculos.length === 0 && <div className="muted" style={{ padding: '.5rem 0' }}>Sin vehículos cargados.</div>}
      {vehiculos.map((v) => (
        <div key={v.id} className="card" style={{ padding: '.5rem .7rem', margin: '0 0 .45rem', background: 'var(--bg-1)', opacity: v.activo ? 1 : 0.55 }}>
          {editId === v.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              <input className="input" ref={dRef} defaultValue={v.descripcion} placeholder="Descripción (marca / modelo)" />
              <div style={{ display: 'flex', gap: '.35rem' }}>
                <input className="input mono" ref={pRef} defaultValue={v.placa} placeholder="Placa" style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={() => void guardar(v)} disabled={busy}>Guardar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)} disabled={busy}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
              <div>
                <strong>{v.descripcion}</strong>
                <span className="muted mono" style={{ marginLeft: '.5rem', fontSize: '.8rem' }}>{v.placa}</span>
                {!v.activo && <span className="badge" style={{ marginLeft: '.45rem', fontSize: '.62rem' }}>INACTIVO</span>}
              </div>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(v.id); }}>✎</button>
                <button className="btn btn-ghost btn-sm" onClick={() => void toggle(v)}>{v.activo ? 'Desactivar' : 'Activar'}</button>
                <button className="btn btn-ghost btn-sm" title="Eliminar" onClick={() => setAEliminar(v)}>🗑</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {aEliminar && (
        <ConfirmDialog title="Eliminar vehículo" confirmText="Eliminar" danger
          message={`Se eliminará "${aEliminar.descripcion} · ${aEliminar.placa}" del catálogo. ¿Continuar?`}
          onCancel={() => setAEliminar(null)} onConfirm={() => void quitar()} />
      )}
    </Modal>
  );
}
