/* ============================================================
   Golden Touch · Choferes / Conductores · Guías (14/10/2026)

   Se cargan las guías en PDF (fecha, número, descripción y, si aplica, chofer
   y vehículo). Se buscan por cualquier dato, se filtran por fecha y se abren
   en vista previa (👁) sin salir del sistema. Al cargar, el PDF elegido se ve
   antes de guardarlo.
   ============================================================ */
import { Quien } from '@/shared/ui/Quien';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { megas } from './archivosChofer';
import { fechaCorta } from './choferes';
import { filtrarGuias, ordenarGuias, tituloGuia, validarArchivoGuia, type Guia } from './guias';
import { T_GUIAS, editarGuia, eliminarGuia, listGuias, subirGuia, urlGuia } from './guias.repository';
import type { Conductor, VehiculoFlota } from './choferes.repository';
import { fechaHora, nombreConductor, textoVehiculo, type PropsTab } from './ChoferesPage';

export function GuiasTab({ datos, canWrite, actor, actorName }: PropsTab) {
  const { conductores, flota, hoy } = datos;
  const [guias, setGuias] = useState<Guia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [form, setForm] = useState<Guia | 'nueva' | null>(null);
  const [borrar, setBorrar] = useState<Guia | null>(null);

  const recargar = useCallback(async () => {
    try { setGuias(await listGuias()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar las guías', 'error'); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime([T_GUIAS], () => { void recargar(); });

  const porId = useMemo(() => new Map(conductores.map((c) => [c.id, c])), [conductores]);
  const vehPorId = useMemo(() => new Map(flota.map((v) => [v.id, v])), [flota]);
  const chofer = useCallback((g: Guia) => (g.conductor_id ? nombreConductor(porId.get(g.conductor_id)) : ''), [porId]);
  const vehiculo = useCallback((g: Guia) => (g.vehiculo_id ? textoVehiculo(vehPorId.get(g.vehiculo_id)) : ''), [vehPorId]);

  const filas = useMemo(
    () => ordenarGuias(filtrarGuias(guias, { texto, desde, hasta }, (g) => `${chofer(g)} ${vehiculo(g)}`)),
    [guias, texto, desde, hasta, chofer, vehiculo],
  );
  const hayFiltro = !!(texto.trim() || desde || hasta);

  async function ver(g: Guia) {
    try { previewArchivo(await urlGuia(g.path), g.nombre); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo abrir la guía', 'error'); }
  }

  return (
    <div>
      <div className="toolbar" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.75rem' }}>
        <input className="input" style={{ flex: '1 1 220px', maxWidth: 360 }} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="🔍 Buscar por N°, descripción, chofer, placa, archivo…" aria-label="Buscar guía" />
        <input className="input" type="date" style={{ width: 'auto' }} value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" title="Desde" />
        <input className="input" type="date" style={{ width: 'auto' }} value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" title="Hasta" />
        {hayFiltro && <button className="btn btn-sm btn-ghost" onClick={() => { setTexto(''); setDesde(''); setHasta(''); }}>Limpiar</button>}
        <div className="desc-acciones">
          <span className="chip">📑 {filas.length}{hayFiltro ? ` de ${guias.length}` : ''} guía{filas.length === 1 ? '' : 's'}</span>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={() => setForm('nueva')}>+ Cargar guía</button>}
        </div>
      </div>

      {cargando ? <div className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Cargando…</div>
        : !guias.length ? <EmptyState icon="📑" message="Todavía no hay guías. Carga la primera con «+ Cargar guía» (en PDF)." />
        : !filas.length ? <EmptyState icon="🔍" message="Ninguna guía coincide con la búsqueda o las fechas." />
        : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr><th>Fecha</th><th>N° guía</th><th>Descripción</th><th>Chofer</th><th>Vehículo</th><th>Archivo</th><th>Cargada por</th><th></th></tr></thead>
              <tbody>
                {filas.map((g) => (
                  <tr key={g.id}>
                    <td className="mono">{fechaCorta(g.fecha)}</td>
                    <td className="mono">{g.numero ?? '—'}</td>
                    <td>{g.descripcion ?? '—'}{g.nota ? <div className="muted" style={{ fontSize: '.75rem' }}>{g.nota}</div> : null}</td>
                    <td>{chofer(g) || '—'}</td>
                    <td style={{ fontSize: '.8rem' }}>{vehiculo(g) || '—'}</td>
                    <td style={{ fontSize: '.8rem' }}>
                      <button type="button" className="btn btn-sm btn-ghost" style={{ padding: 0, textAlign: 'left' }} onClick={() => void ver(g)} title="Ver en vista previa">📄 {g.nombre}</button>
                      {g.tamano ? <span className="muted"> · {megas(g.tamano)}</span> : null}
                    </td>
                    <td style={{ fontSize: '.78rem' }}><Quien nombre={g.subido_por_nombre} correo={g.subido_por} vacio="—" /><div className="muted">{fechaHora(g.created_at)}</div></td>
                    <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => void ver(g)} title="Vista previa">👁</button>
                      {canWrite && <button className="btn btn-sm btn-ghost" onClick={() => setForm(g)} title="Corregir datos">✎</button>}
                      {canWrite && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setBorrar(g)} title="Eliminar">🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {form && (
        <GuiaModal inicial={form === 'nueva' ? null : form} conductores={conductores} flota={flota} hoy={hoy}
          actor={actor} actorName={actorName} onClose={() => setForm(null)} onSaved={recargar} />
      )}
      {borrar && (
        <ConfirmDialog title="Eliminar guía" danger confirmText="Sí, eliminar"
          message="Se borran la guía y su PDF. No se puede deshacer."
          preview={<VistaPrevia>
            <Dato label="Guía">{tituloGuia(borrar)}</Dato>
            <Dato label="Fecha">{fechaCorta(borrar.fecha)}</Dato>
            <Dato label="Chofer">{chofer(borrar) || undefined}</Dato>
            <Dato label="Archivo">{borrar.nombre}</Dato>
          </VistaPrevia>}
          onCancel={() => setBorrar(null)}
          onConfirm={() => {
            const g = borrar; setBorrar(null);
            void eliminarGuia(g).then(async () => { toast('Guía eliminada', 'success'); await recargar(); })
              .catch((e) => toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'));
          }} />
      )}
    </div>
  );
}

function GuiaModal({ inicial, conductores, flota, hoy, actor, actorName, onClose, onSaved }: {
  inicial: Guia | null; conductores: Conductor[]; flota: VehiculoFlota[]; hoy: string;
  actor: string; actorName: string | null; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy);
  const [numero, setNumero] = useState(inicial?.numero ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [conductorId, setConductorId] = useState(inicial?.conductor_id ?? '');
  const [vehiculoId, setVehiculoId] = useState(inicial?.vehiculo_id ?? '');
  const [nota, setNota] = useState(inicial?.nota ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  // Vista previa del PDF elegido, antes de guardarlo.
  const [urlLocal, setUrlLocal] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrlLocal(null); return; }
    const u = URL.createObjectURL(file);
    setUrlLocal(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const elegir = (f: File | null) => {
    setError(null);
    if (f) { const falla = validarArchivoGuia(f); if (falla) { setError(falla); setFile(null); setInputKey((k) => k + 1); return; } }
    setFile(f);
  };

  async function guardar(otra: boolean) {
    setError(null);
    if (!fecha) { setError('Pon la fecha de la guía.'); return; }
    const datos = { fecha, numero, descripcion, conductor_id: conductorId || null, vehiculo_id: vehiculoId || null, nota };
    setSaving(true);
    try {
      if (inicial) {
        await editarGuia(inicial.id, datos);
        toast('Guía actualizada', 'success');
      } else {
        const falla = validarArchivoGuia(file);
        if (falla) { setError(falla); setSaving(false); return; }
        await subirGuia(datos, file as File, { actor, actorName });
        toast('Guía cargada', 'success');
      }
      await onSaved();
      if (otra && !inicial) {
        // Misma fecha, chofer y vehículo: lo usual es cargar varias del mismo día.
        setNumero(''); setDescripcion(''); setNota(''); setFile(null); setInputKey((k) => k + 1);
      } else onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la guía'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={inicial ? '✎ Corregir guía' : '📑 Cargar guía'} size="lg" onClose={() => !saving && onClose()} footer={<>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      {!inicial && <button className="btn btn-ghost" onClick={() => void guardar(true)} disabled={saving || !file}>Guardar y cargar otra</button>}
      <button className="btn btn-primary" onClick={() => void guardar(false)} disabled={saving || (!inicial && !file)}>{saving ? 'Guardando…' : 'Guardar'}</button>
    </>}>
      <div style={{ display: 'grid', gap: '.7rem' }}>
        {error && <div className="aviso danger sm"><span className="aviso-icono">⛔</span><div>{error}</div></div>}
        <div className="form-grid">
          <div className="form-row"><label htmlFor="guia-fecha">Fecha de la guía *</label>
            <input id="guia-fecha" className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="form-row"><label htmlFor="guia-numero">N° de guía</label>
            <input id="guia-numero" className="input mono" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej. 000123" /></div>
          <div className="form-row"><label htmlFor="guia-desc">Descripción</label>
            <input id="guia-desc" className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Despacho de mineral, movilización…" /></div>
          <div className="form-row"><label htmlFor="guia-chofer">Chofer (opcional)</label>
            <SearchSelect id="guia-chofer" value={conductorId} onChange={setConductorId} placeholder="🔍 Chofer…"
              options={[{ value: '', label: '— Sin chofer —' }, ...conductores.map((c) => ({ value: c.id, label: nombreConductor(c) }))]} /></div>
          <div className="form-row"><label htmlFor="guia-vehiculo">Vehículo (opcional)</label>
            <SearchSelect id="guia-vehiculo" value={vehiculoId} onChange={setVehiculoId} placeholder="🔍 Placa o modelo…"
              options={[{ value: '', label: '— Sin vehículo —' }, ...flota.map((v) => ({ value: v.id, label: textoVehiculo(v) }))]} /></div>
          <div className="form-row"><label htmlFor="guia-nota">Nota</label>
            <input id="guia-nota" className="input" value={nota} onChange={(e) => setNota(e.target.value)} /></div>
        </div>
        {inicial ? (
          <div className="muted" style={{ fontSize: '.82rem' }}>📄 {inicial.nombre} · el PDF no se cambia; si es otro, elimina esta guía y cárgala de nuevo.</div>
        ) : (
          <div className="form-row">
            <label htmlFor="guia-pdf">Archivo PDF * <span className="muted" style={{ fontWeight: 400 }}>(hasta 10 MB)</span></label>
            <input key={inputKey} id="guia-pdf" className="input" type="file" accept="application/pdf,.pdf"
              onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
          </div>
        )}
        {urlLocal && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="muted" style={{ fontSize: '.78rem', padding: '.35rem .6rem' }}>Vista previa · {file?.name} · {megas(file?.size)}</div>
            <iframe src={urlLocal} title="Vista previa de la guía" style={{ width: '100%', height: 380, border: 0, background: '#fff' }} />
          </div>
        )}
      </div>
    </Modal>
  );
}
