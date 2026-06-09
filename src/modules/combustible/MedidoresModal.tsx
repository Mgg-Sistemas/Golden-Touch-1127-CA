import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import type { CatalogoCombustible, MedidorCombustible } from '@/shared/lib/types';
import { listMedidores, ultimoHorometroEquipo, crearMedidor, eliminarMedidor } from './tanques.repository';
import { descargarMedidoresPdf } from './medidoresPdf';
import { descargarMedidoresExcel } from './medidoresExcel';
import { enviarMedidoresPorCorreo } from './enviarMedidores';

/**
 * Medidores por equipo (horómetro del equipo + contador del surtidor), como log
 * independiente del consumo. El HI de un alta autocarga con el último HF del
 * equipo. Lista filtrable con reportes PDF / Excel / correo.
 */
export function MedidoresModal({ catalogos, canWrite, actor, actorName, defaultEmail, onClose }: {
  catalogos: CatalogoCombustible[]; canWrite: boolean; actor: string; actorName: string | null; defaultEmail: string; onClose: () => void;
}) {
  const [rows, setRows] = useState<MedidorCombustible[]>([]);
  const [loading, setLoading] = useState(true);
  // Filtros
  const [fTexto, setFTexto] = useState('');
  const [fEquipo, setFEquipo] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  // Alta
  const [agregando, setAgregando] = useState(false);
  const [equipo, setEquipo] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [hi, setHi] = useState('');
  const [hf, setHf] = useState('');
  const [ci, setCi] = useState('');
  const [cf, setCf] = useState('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);
  // Correo
  const [correoOpen, setCorreoOpen] = useState(false);

  const equiposCat = catalogos.filter((c) => c.tipo === 'equipo' && c.activo);

  const recargar = useCallback(async () => {
    setLoading(true);
    try { setRows(await listMedidores()); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['combustible_medidores'], () => { void recargar(); });

  // Al elegir equipo en el alta, autocargamos el HI con el último HF de ese equipo.
  useEffect(() => {
    if (!agregando || !equipo) return;
    let cancel = false;
    ultimoHorometroEquipo(equipo).then((ult) => { if (!cancel && ult != null) setHi(String(ult)); }).catch(() => {});
    return () => { cancel = true; };
  }, [equipo, agregando]);

  const filtrados = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    return rows.filter((m) => {
      if (fEquipo && m.equipo !== fEquipo) return false;
      if (fDesde && (m.fecha ?? '') < fDesde) return false;
      if (fHasta && (m.fecha ?? '') > fHasta) return false;
      if (q) {
        const hay = [m.fecha, m.equipo, m.observacion].map((x) => (x ?? '').toString().toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, fTexto, fEquipo, fDesde, fHasta]);

  const hayFiltro = !!(fTexto || fEquipo || fDesde || fHasta);
  const equiposEnLista = useMemo(
    () => Array.from(new Set(rows.map((m) => m.equipo))).sort((a, b) => a.localeCompare(b, 'es')),
    [rows],
  );

  function limpiarAlta() { setEquipo(''); setHi(''); setHf(''); setCi(''); setCf(''); setObs(''); setFecha(new Date().toISOString().slice(0, 10)); }

  async function guardar() {
    if (!equipo) { toast('Elegí el equipo', 'error'); return; }
    setSaving(true);
    try {
      await crearMedidor({
        equipo, fecha,
        horometroIni: hi === '' ? null : Number(hi), horometroFin: hf === '' ? null : Number(hf),
        contadorIni: ci === '' ? null : Number(ci), contadorFin: cf === '' ? null : Number(cf),
        observacion: obs || null, actor, actorName,
      });
      toast('Medidor registrado', 'success');
      limpiarAlta(); setAgregando(false);
      await recargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setSaving(false); }
  }
  async function borrar(id: string) {
    if (!confirm('¿Eliminar esta lectura?')) return;
    try { await eliminarMedidor(id); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }
  const filtroTxt = () => (hayFiltro ? 'filtrado' : undefined);

  const v = (x: number | null | undefined) => (x == null ? '—' : num(x));

  return (
    <Modal title="Medidores por equipo" size="xl" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      {/* Registro de medidores — barra de filtros estilo Tesorería */}
      <div className="card" style={{ marginBottom: '.6rem' }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
          <span>Registro de medidores</span>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input className="input" type="search" value={fTexto} onChange={(e) => setFTexto(e.target.value)}
                placeholder="🔍 Buscar (equipo, observación…)" style={{ width: 240, paddingRight: fTexto ? '1.6rem' : undefined }} />
              {fTexto && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFTexto('')} title="Limpiar búsqueda"
                  style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>
              )}
            </div>
            <SearchSelect value={fEquipo} onChange={setFEquipo} placeholder="🔍 Equipo…" style={{ width: 200 }}
              options={[{ value: '', label: 'Todo equipo' }, ...equiposEnLista.map((e) => ({ value: e, label: e }))]} />
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Desde <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ width: 'auto' }} />
            </label>
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Hasta <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ width: 'auto' }} />
            </label>
            {hayFiltro && <button className="btn btn-sm btn-ghost" onClick={() => { setFTexto(''); setFEquipo(''); setFDesde(''); setFHasta(''); }}>✕ Limpiar</button>}
            <span className="muted" style={{ fontSize: '.8rem' }}>{filtrados.length}/{rows.length}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={() => { setAgregando((a) => !a); limpiarAlta(); }}>{agregando ? '✕ Cancelar' : '+ Agregar medidor'}</button>}
          <button className="btn btn-ghost btn-sm" disabled={!filtrados.length} onClick={() => void descargarMedidoresPdf(filtrados, { filtro: filtroTxt() }).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'))}>↓ PDF</button>
          <button className="btn btn-ghost btn-sm" disabled={!filtrados.length} onClick={() => void descargarMedidoresExcel(filtrados).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el Excel', 'error'))}>📊 Excel</button>
          <button className="btn btn-ghost btn-sm" disabled={!filtrados.length} onClick={() => setCorreoOpen(true)}>✉ Correo</button>
        </div>
      </div>

      {/* Alta */}
      {agregando && canWrite && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="form-grid">
            <div className="form-row">
              <label>Equipo</label>
              <SearchSelect value={equipo} onChange={setEquipo} placeholder="🔍 Buscar equipo…"
                options={[{ value: '', label: '— elegí el equipo —' }, ...equiposCat.map((c) => ({ value: c.valor, label: c.valor }))]} />
            </div>
            <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Horómetro inicial (HI)</label>
              <input className="input mono" type="number" step="any" value={hi} onChange={(e) => setHi(e.target.value)} placeholder="auto: último del equipo" />
              <small className="muted">Trae el último horómetro final registrado para el equipo.</small>
            </div>
            <div className="form-row"><label>Horómetro final (HF)</label><input className="input mono" type="number" step="any" value={hf} onChange={(e) => setHf(e.target.value)} /></div>
          </div>
          <div className="form-grid">
            <div className="form-row"><label>Contador global inicial</label><input className="input mono" type="number" step="any" value={ci} onChange={(e) => setCi(e.target.value)} /></div>
            <div className="form-row"><label>Contador global final</label><input className="input mono" type="number" step="any" value={cf} onChange={(e) => setCf(e.target.value)} /></div>
          </div>
          <div className="form-row"><label>Observación</label><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar medidor'}</button>
        </div>
      )}

      {/* Lista */}
      {loading ? <EmptyState message="Cargando…" icon="◔" /> : !rows.length ? (
        <EmptyState message="Sin lecturas de medidores. Agregá la primera." icon="🕒" />
      ) : (
        <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Fecha</th><th>Equipo</th><th>Horóm. ini</th><th>Horóm. fin</th><th>Horas</th><th>Cont. ini</th><th>Cont. fin</th><th>Dif</th><th>Observación</th>{canWrite && <th></th>}</tr></thead>
            <tbody>
              {!filtrados.length && <tr><td colSpan={canWrite ? 10 : 9} className="muted" style={{ textAlign: 'center' }}>Ninguna lectura coincide con el filtro.</td></tr>}
              {filtrados.map((m) => (
                <tr key={m.id}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{m.fecha}</td>
                  <td>{m.equipo}</td>
                  <td className="mono">{v(m.horometro_ini)}</td>
                  <td className="mono">{v(m.horometro_fin)}</td>
                  <td className="mono"><strong>{m.horas ? num(m.horas) : '—'}</strong></td>
                  <td className="mono">{v(m.contador_ini)}</td>
                  <td className="mono">{v(m.contador_fin)}</td>
                  <td className="mono">{m.contador_dif ? num(m.contador_dif) : '—'}</td>
                  <td className="muted">{m.observacion || '—'}</td>
                  {canWrite && <td><button className="btn btn-sm btn-ghost" onClick={() => void borrar(m.id)}>🗑</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {correoOpen && (
        <CorreoReporteModal
          titulo="Enviar medidores por correo"
          descripcion={`Se enviará el PDF con ${filtrados.length} lectura(s)${hayFiltro ? ', con el filtro aplicado' : ''}.`}
          defaultEmail={defaultEmail}
          onEnviar={async (lista) => {
            const { destinatarios } = await enviarMedidoresPorCorreo(filtrados, lista, { filtro: filtroTxt() });
            return destinatarios;
          }}
          onClose={() => setCorreoOpen(false)}
        />
      )}
    </Modal>
  );
}
