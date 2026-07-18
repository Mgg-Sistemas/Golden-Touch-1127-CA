import { useCallback, useEffect, useRef, useState, type FormEvent, type ChangeEvent, type CSSProperties } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { money, date, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { Personal, NominaRenglon } from '@/shared/lib/types';
import {
  listPersonal, crearPersonal, actualizarPersonal, setPersonalActivo, eliminarPersonal, type PersonalInput,
  subirFotoPersonal, borrarFotoPersonal, fotoPersonalDataUrl,
} from './personal.repository';
import { listHistoricoPersona } from './nomina.repository';
import { listCargos, listDepartamentos, addCargo, addDepartamento } from './catalogos';
import { generarCarnetPersonalDataUrl, generarCarnetReversoDataUrl, nombreArchivoCarnet } from './carnetPersonal';

const VACIO: PersonalInput = { nombre: '', apellido: '', cedula: '', cargo: '', departamento: '', sueldo_base: 0, fecha_ingreso: '', telefono: '', contacto_emergencia: '', telefono_emergencia: '' };

/** Limita la cédula a formato venezolano: prefijo opcional (V/E/J/G/P) + hasta 8 dígitos. */
function sanitizarCedula(v: string): string {
  const limpio = (v || '').toUpperCase().replace(/[^VEJGP0-9]/g, '');
  const letra = /^[VEJGP]/.test(limpio) ? limpio[0] : '';
  const digitos = limpio.replace(/[^0-9]/g, '').slice(0, 8);
  return letra && digitos ? `${letra}-${digitos}` : letra + digitos;
}

export function PersonalTab({ canWrite, actor }: { canWrite: boolean; actor: string }) {
  const [lista, setLista] = useState<Personal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonalInput>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [histPersona, setHistPersona] = useState<Personal | null>(null);
  const [carnetPersona, setCarnetPersona] = useState<Personal | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [cargos, setCargos] = useState<string[]>([]);
  const [departamentos, setDepartamentos] = useState<string[]>([]);
  // Campos de texto NO controlados (DOM = fuente de verdad): inmunes a re-renders
  // que de otro modo "cortan" lo tecleado. Se leen del DOM al guardar.
  const formRef = useRef<HTMLFormElement>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    try { setLista(await listPersonal(false)); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar el personal', 'error'); }
    finally { setLoading(false); }
  }, []);
  const cargarCatalogos = useCallback(() => {
    listCargos().then(setCargos).catch(() => { /* catálogo opcional */ });
    listDepartamentos().then(setDepartamentos).catch(() => { /* catálogo opcional */ });
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  useEffect(() => { cargarCatalogos(); }, [cargarCatalogos]);
  useRealtime(['personal'], () => { void recargar(); });

  function abrirNuevo() { setEditId(null); setForm(VACIO); setError(null); setFormOpen(true); }
  function editar(p: Personal) {
    setEditId(p.id);
    setForm({ nombre: p.nombre, apellido: p.apellido, cedula: p.cedula ?? '', cargo: p.cargo ?? '', departamento: p.departamento ?? '', sueldo_base: Number(p.sueldo_base) || 0, fecha_ingreso: p.fecha_ingreso ?? '', telefono: p.telefono ?? '', contacto_emergencia: p.contacto_emergencia ?? '', telefono_emergencia: p.telefono_emergencia ?? '' });
    setError(null); setFormOpen(true);
  }
  function cerrarForm() { setEditId(null); setForm(VACIO); setError(null); setFormOpen(false); }

  async function guardar(e: FormEvent) {
    e.preventDefault(); setError(null);
    // Campos de texto: se leen del DOM (no controlados). Cargo/Departamento/Fecha vienen del estado.
    const root = formRef.current;
    const val = (name: string) => (root?.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value ?? '';
    const datos: PersonalInput = {
      ...form,
      nombre: val('p-nombre').trim(),
      apellido: val('p-apellido').trim(),
      cedula: sanitizarCedula(val('p-cedula')),
      sueldo_base: Number(val('p-sueldo')) || 0,
      telefono: val('p-telefono').trim(),
      contacto_emergencia: val('p-contacto-emergencia').trim(),
      telefono_emergencia: val('p-telefono-emergencia').trim(),
    };
    if (!datos.nombre) { setError('Indicá el nombre.'); return; }
    setGuardando(true);
    try {
      if (editId) await actualizarPersonal(editId, datos);
      else await crearPersonal(datos, actor);
      // Si el cargo/departamento es nuevo, lo agregamos al catálogo compartido.
      const cargo = (datos.cargo ?? '').trim();
      const depto = (datos.departamento ?? '').trim();
      if (cargo && !cargos.includes(cargo)) await addCargo(cargo, actor).catch(() => {});
      if (depto && !departamentos.includes(depto)) await addDepartamento(depto, actor).catch(() => {});
      cargarCatalogos();
      toast(editId ? 'Personal actualizado' : 'Personal agregado', 'success');
      cerrarForm();
      await recargar();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  }

  async function toggleActivo(p: Personal) {
    try { await setPersonalActivo(p.id, !p.activo); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }
  async function borrar(p: Personal) {
    if (!window.confirm(`¿Eliminar a ${p.nombre} ${p.apellido} de la nómina? (no afecta los pagos ya hechos)`)) return;
    try { await eliminarPersonal(p.id); await recargar(); toast('Eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  return (
    <div>
      {canWrite && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.75rem' }}>
          <button className="btn btn-primary" onClick={abrirNuevo}>+ Ingresar Registro de Personal</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead><tr><th>Persona</th><th>Departamento</th><th>Cargo</th><th style={{ textAlign: 'right' }}>Sueldo base</th><th style={{ textAlign: 'center' }}>Estado</th><th style={{ textAlign: 'center' }}>Acciones</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !lista.length && <tr><td colSpan={6}><EmptyState message="Sin personal. Usá “+ Ingresar Registro de Personal”." icon="👥" /></td></tr>}
            {!loading && lista.map((p) => (
              <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.55 }}>
                <td>{p.nombre} {p.apellido}{p.cedula ? <span className="muted"> · {p.cedula}</span> : null}</td>
                <td className="muted">{p.departamento || '—'}</td>
                <td className="muted">{p.cargo || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{Number(p.sueldo_base) > 0 ? money(p.sueldo_base) : '—'}</td>
                <td style={{ textAlign: 'center' }}><span className="badge" style={{ color: p.activo ? 'var(--success)' : 'var(--muted)' }}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setHistPersona(p)} title="Histórico de pagos">🧾</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setCarnetPersona(p)} title="Generar carnet con QR">🪪</button>
                  {canWrite && <>
                    <button className="btn btn-sm btn-ghost" onClick={() => editar(p)} title="Editar">✎</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggleActivo(p)} title={p.activo ? 'Desactivar' : 'Activar'}>{p.activo ? '⏸' : '▶'}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => borrar(p)} title="Eliminar" style={{ color: 'var(--danger)' }}>🗑</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <Modal
          title={editId ? 'Editar registro de personal' : 'Ingresar registro de personal'}
          size="lg"
          onClose={() => { if (!guardando) cerrarForm(); }}
          footer={
            <>
              <button className="btn btn-ghost" onClick={cerrarForm} disabled={guardando}>Cancelar</button>
              <button type="submit" form="rrhh-personal-form" className="btn btn-primary" disabled={guardando}>
                {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : '+ Agregar'}
              </button>
            </>
          }
        >
          <form id="rrhh-personal-form" ref={formRef} onSubmit={guardar}>
            {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.6rem' }}><strong>Error:</strong> {error}</div>}
            <div className="form-grid">
              <div className="form-row"><label>Nombre *</label><input className="input" name="p-nombre" autoFocus defaultValue={form.nombre} required /></div>
              <div className="form-row"><label>Apellido</label><input className="input" name="p-apellido" defaultValue={form.apellido ?? ''} /></div>
              <div className="form-row"><label>Cédula</label><input className="input" name="p-cedula" defaultValue={form.cedula ?? ''} onChange={(e) => { e.target.value = sanitizarCedula(e.target.value); }} placeholder="V-12345678" maxLength={11} inputMode="numeric" /></div>
              <ComboConAgregar
                label="Cargo" valor={form.cargo ?? ''} opciones={cargos}
                onChange={(v) => setForm((f) => ({ ...f, cargo: v }))}
                hint="Elegí de la lista o agregá uno nuevo (queda guardado)." />
              <ComboConAgregar
                label="Departamento" valor={form.departamento ?? ''} opciones={departamentos}
                onChange={(v) => setForm((f) => ({ ...f, departamento: v }))}
                hint="Toma los de Usuarios; podés agregar uno nuevo." />
              <div className="form-row"><label>Sueldo base mensual (USD)</label><input className="input mono" name="p-sueldo" type="number" min={0} step="any" defaultValue={form.sueldo_base ?? 0} placeholder="0,00" /></div>
              <div className="form-row"><label>Fecha de ingreso</label><input className="input" type="date" value={form.fecha_ingreso ?? ''} onChange={(e) => setForm((f) => ({ ...f, fecha_ingreso: e.target.value }))} /></div>
              <div className="form-row"><label>Teléfono</label><input className="input" name="p-telefono" defaultValue={form.telefono ?? ''} placeholder="0412-1234567" inputMode="tel" /></div>
              <div className="form-row"><label>Contacto de emergencia (nombre)</label><input className="input" name="p-contacto-emergencia" defaultValue={form.contacto_emergencia ?? ''} placeholder="Ej. María Pérez (madre)" /></div>
              <div className="form-row"><label>Teléfono de emergencia</label><input className="input" name="p-telefono-emergencia" defaultValue={form.telefono_emergencia ?? ''} placeholder="0414-7654321" inputMode="tel" /></div>
            </div>
            <small className="muted" style={{ display: 'block', marginTop: '.35rem' }}>📇 El <strong>teléfono</strong> y el <strong>contacto de emergencia</strong> se incluyen en el <strong>QR del carnet</strong> (botón 🪪 en la lista).</small>
            <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>El sueldo base es <strong>mensual</strong>; la quincena = 15 días (mitad). Queda guardado para precargar la nómina.</small>
          </form>
        </Modal>
      )}

      {histPersona && <HistoricoPersonaModal persona={histPersona} onClose={() => setHistPersona(null)} />}
      {carnetPersona && <CarnetModal persona={carnetPersona} canWrite={canWrite} onClose={() => setCarnetPersona(null)} onFotoCambio={() => void recargar()} />}
    </div>
  );
}

/* ───────── Carnet con QR + foto (imagen PNG, 54×86 mm @ 300 DPI) ───────── */
function CarnetModal({ persona, canWrite, onClose, onFotoCambio }: {
  persona: Personal; canWrite: boolean; onClose: () => void; onFotoCambio: () => void;
}) {
  const [fotoPath, setFotoPath] = useState<string | null>(persona.foto_path ?? null);
  const [frente, setFrente] = useState<string | null>(null);
  const [reverso, setReverso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Regenera frente (con la foto actual) y reverso cada vez que cambia la foto.
  useEffect(() => {
    let cancel = false;
    setFrente(null); setReverso(null); setError(null);
    (async () => {
      try {
        const fotoData = fotoPath ? await fotoPersonalDataUrl(fotoPath).catch(() => null) : null;
        const [f, r] = await Promise.all([
          generarCarnetPersonalDataUrl({ ...persona, foto_path: fotoPath }, fotoData),
          generarCarnetReversoDataUrl(),
        ]);
        if (!cancel) { setFrente(f); setReverso(r); }
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : 'No se pudo generar el carnet');
      }
    })();
    return () => { cancel = true; };
  }, [persona, fotoPath]);

  function descargar(dataUrl: string | null, cara: 'frente' | 'reverso') {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = nombreArchivoCarnet(persona, cara);
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function onElegirFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (!file) return;
    setSubiendo(true); setError(null);
    try {
      const nuevo = await subirFotoPersonal(persona.id, file, fotoPath);
      setFotoPath(nuevo);
      onFotoCambio();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo subir la foto'); }
    finally { setSubiendo(false); }
  }

  async function quitarFoto() {
    if (!fotoPath) return;
    if (!window.confirm('¿Quitar la foto de esta persona?')) return;
    setSubiendo(true); setError(null);
    try {
      await borrarFotoPersonal(persona.id, fotoPath);
      setFotoPath(null);
      onFotoCambio();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo quitar la foto'); }
    finally { setSubiendo(false); }
  }

  const imgStyle: CSSProperties = { width: 240, maxWidth: '100%', height: 'auto', borderRadius: 12, boxShadow: 'var(--shadow-md)' };

  return (
    <Modal
      title={`Carnet · ${persona.nombre} ${persona.apellido}`}
      size="lg"
      onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.6rem' }}><strong>Error:</strong> {error}</div>}

      {canWrite && (
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.8rem' }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onElegirFoto} />
          <button className="btn btn-sm btn-primary" disabled={subiendo} onClick={() => fileRef.current?.click()}>
            {subiendo ? 'Subiendo…' : fotoPath ? '🖼 Cambiar foto' : '🖼 Añadir foto'}
          </button>
          {fotoPath && <button className="btn btn-sm btn-danger" disabled={subiendo} onClick={quitarFoto}>🗑 Quitar foto</button>}
          <span className="muted" style={{ fontSize: '.76rem' }}>La foto va en el frente del carnet. Máx. 5 MB.</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: '.75rem', marginBottom: '.3rem', fontWeight: 700 }}>FRENTE</div>
          {frente ? <img src={frente} alt="Frente del carnet" style={imgStyle} /> : <p className="muted">Generando…</p>}
          <div style={{ marginTop: '.4rem' }}>
            <button className="btn btn-sm btn-ghost" disabled={!frente} onClick={() => descargar(frente, 'frente')}>⬇ Frente (PNG)</button>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: '.75rem', marginBottom: '.3rem', fontWeight: 700 }}>REVERSO</div>
          {reverso ? <img src={reverso} alt="Reverso del carnet" style={imgStyle} /> : <p className="muted">Generando…</p>}
          <div style={{ marginTop: '.4rem' }}>
            <button className="btn btn-sm btn-ghost" disabled={!reverso} onClick={() => descargar(reverso, 'reverso')}>⬇ Reverso (PNG)</button>
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: '.78rem', marginTop: '.8rem', textAlign: 'center' }}>
        54 × 86 mm · 300 DPI (638 × 1016 px) · imágenes PNG listas para imprimir.
        {!persona.telefono && !persona.contacto_emergencia && ' Cargá el teléfono y el contacto de emergencia (✎ Editar) para que el QR los incluya.'}
      </p>
    </Modal>
  );
}

/* ───────── Combo estilizado (select del sistema) con opción de agregar nuevo ───────── */
function ComboConAgregar({ label, valor, opciones, onChange, hint }: {
  label: string; valor: string; opciones: string[]; onChange: (v: string) => void; hint?: string;
}) {
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState('');
  // Si el valor actual no está en el catálogo (p. ej. al editar), lo incluimos.
  const opts = valor && !opciones.includes(valor) ? [valor, ...opciones] : opciones;
  function confirmar() {
    const v = nuevo.trim();
    if (v) onChange(v);
    setNuevo(''); setAgregando(false);
  }
  return (
    <div className="form-row">
      <label>{label}</label>
      {agregando ? (
        <div style={{ display: 'flex', gap: '.3rem' }}>
          <input className="input" autoFocus name="combo-nuevo" defaultValue={nuevo} placeholder={`Nuevo ${label.toLowerCase()}…`}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } if (e.key === 'Escape') { setAgregando(false); setNuevo(''); } }} />
          <button type="button" className="btn btn-sm btn-primary" onClick={confirmar} title="Agregar">✓</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setAgregando(false); setNuevo(''); }} title="Cancelar">✕</button>
        </div>
      ) : (
        <select className="select" value={valor}
          onChange={(e) => { if (e.target.value === '__nuevo__') setAgregando(true); else onChange(e.target.value); }}>
          <option value="">— elegir —</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="__nuevo__">+ Agregar nuevo…</option>
        </select>
      )}
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

/* ───────── Histórico de pagos individuales de una persona ───────── */
function HistoricoPersonaModal({ persona, onClose }: { persona: Personal; onClose: () => void }) {
  const [rows, setRows] = useState<NominaRenglon[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listHistoricoPersona(persona.id).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [persona.id]);

  const pagados = rows.filter((r) => r.estado === 'pagada');
  const totalPagado = pagados.reduce((a, r) => a + (Number(r.neto_usd) || 0), 0);

  return (
    <Modal title={`Histórico de pagos · ${persona.nombre} ${persona.apellido}`} size="lg" onClose={onClose} footer={
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
    }>
      <div className="muted" style={{ marginBottom: '.5rem', fontSize: '.85rem' }}>
        {pagados.length} pago(s) · Total pagado <strong className="mono">{money(totalPagado)}</strong>
      </div>
      <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Nómina</th><th>Período</th><th style={{ textAlign: 'right' }}>Días</th><th style={{ textAlign: 'right' }}>Neto</th><th style={{ textAlign: 'center' }}>Estado</th><th>Pagada</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={6}><EmptyState message="Sin pagos registrados" /></td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.periodo?.codigo ?? '—'}</td>
                <td className="muted">{r.periodo?.periodo_desde ? `${date(r.periodo.periodo_desde)} → ${date(r.periodo.periodo_hasta)}` : '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{r.dias_trabajados}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(r.neto_usd)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className="badge" style={{ color: r.estado === 'pagada' ? 'var(--success)' : 'var(--warning)' }}>{r.estado === 'pagada' ? 'Pagada' : 'Por pagar'}</span>
                </td>
                <td className="muted">{r.pagada_en ? dateTime(r.pagada_en) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
