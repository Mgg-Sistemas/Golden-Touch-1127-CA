import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { SearchCreateSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { date, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { CatalogoAcopio, ContratoAcopio, TipoCatalogoAcopio } from '@/shared/lib/types';
import {
  nextSeqContrato, numeroContrato, crearContrato, actualizarContrato, horaSistema, formulasContrato,
  formulasMinero, aplicarMaterialDeMesa, type TipoContrato,
  listCatalogosAcopio, addCatalogoAcopio, updateCatalogoAcopio, setCatalogoAcopioActivo, eliminarCatalogoAcopio,
} from './contratos.repository';

/** Formatea un ratio (0.123) como porcentaje «12,30 %»; null/no-finito → «—». */
export const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

/* ───────────── Modal: crear / editar contrato de producción ───────────── */

export function ContratosModal({ contrato, canWrite, actor, actorName, onClose, onSaved }: {
  contrato: ContratoAcopio | null;
  canWrite: boolean; actor: string; actorName: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const editando = !!contrato;
  const ro = !canWrite || (editando && contrato!.estado === 'cerrado');

  const [lugares, setLugares] = useState<CatalogoAcopio[]>([]);
  const [supervisores, setSupervisores] = useState<CatalogoAcopio[]>([]);
  const [proxSeq, setProxSeq] = useState<number>(1);
  // Encabezado: en alta, fecha+hora automáticas; en edición, las del contrato.
  const [fecha] = useState(() => contrato?.fecha ?? new Date().toISOString().slice(0, 10));
  const [hora] = useState(() => contrato?.hora ?? horaSistema());

  // Tipo (switch): producción / minero. Determina el prefijo del número y los campos extra.
  const [tipo, setTipo] = useState<TipoContrato>(contrato?.tipo === 'minero' ? 'minero' : 'produccion');
  const [supervisor, setSupervisor] = useState(contrato?.supervisor ?? '');
  const [lugar, setLugar] = useState(contrato?.lugar_extraccion ?? '');
  const [molino, setMolino] = useState(contrato?.molino ?? '');
  const [ton, setTon] = useState(contrato?.ton_procesadas ? String(contrato.ton_procesadas) : '');
  const [kgHum, setKgHum] = useState(contrato?.kg_humedo ? String(contrato.kg_humedo) : '');
  const [kgSec, setKgSec] = useState(contrato?.kg_secos ? String(contrato.kg_secos) : '');
  const [kgLim, setKgLim] = useState(contrato?.kg_seco_limpio ? String(contrato.kg_seco_limpio) : '');
  // Contrato minero: sacos (UND), precio de la casiterita ($/Kg) y tasa establecida.
  const [sacos, setSacos] = useState(contrato?.cantidad_sacos ? String(contrato.cantidad_sacos) : '');
  const [precioCas, setPrecioCas] = useState(contrato?.precio_casiterita ? String(contrato.precio_casiterita) : '');
  const [tasa, setTasa] = useState(contrato?.tasa ? String(contrato.tasa) : '');
  // N° de contrato editable la PRIMERA vez (luego se prellena incremental).
  const [numeroManual, setNumeroManual] = useState('');
  // En contratos nuevos la observación arranca con "Material de Mesa:" (como en el Excel).
  // En existentes, se muestra el «Material de Mesa: X» según el Pesos Mojado de KG Mesas
  // (así el valor cargado allí siempre se ve, no solo al cerrar el contrato).
  const [obs, setObs] = useState(() => contrato
    ? aplicarMaterialDeMesa(contrato.observaciones ?? '', contrato.mesa_peso_mojado ?? null)
    : 'Material de Mesa: ');
  const [busy, setBusy] = useState(false);

  const recargar = useCallback(async () => {
    const [lg, sv] = await Promise.all([listCatalogosAcopio('lugar_extraccion'), listCatalogosAcopio('supervisor')]);
    setLugares(lg); setSupervisores(sv);
    if (!editando) setProxSeq(await nextSeqContrato());
  }, [editando]);
  useEffect(() => { recargar().catch(() => {}); }, [recargar]);
  useRealtime(['acopio_catalogos'], () => { void recargar(); });

  const lugaresActivos = useMemo(() => lugares.filter((l) => l.activo), [lugares]);
  const supervisoresActivos = useMemo(() => supervisores.filter((s) => s.activo), [supervisores]);
  const esMinero = tipo === 'minero';
  const numeroSugerido = numeroContrato(proxSeq, tipo);
  // Al crear: prellenar el N° editable con el sugerido (cambia con el tipo/secuencia)
  // mientras el usuario no lo haya tocado.
  useEffect(() => { if (!editando) setNumeroManual(numeroSugerido); }, [numeroSugerido, editando]);
  const numero = editando ? contrato!.numero : (numeroManual || numeroSugerido);

  // Preview en vivo de las fórmulas (idénticas a la BD / al Excel).
  const f = useMemo(() => formulasContrato({
    tonProcesadas: Number(ton) || 0, kgHumedo: Number(kgHum) || 0, kgSecos: Number(kgSec) || 0, kgSecoLimpio: Number(kgLim) || 0,
  }), [ton, kgHum, kgSec, kgLim]);
  // Cálculos del contrato minero (utilidad minero 70% / GT 30% / monto a pagar).
  const fm = useMemo(() => formulasMinero({ kgSecoLimpio: Number(kgLim) || 0, precioCasiterita: Number(precioCas) || 0 }), [kgLim, precioCas]);

  async function guardar() {
    if (!lugar.trim()) { toast('Indicá el lugar de extracción.', 'error'); return; }
    if (!supervisor.trim()) { toast('El supervisor de producción es obligatorio.', 'error'); return; }
    setBusy(true);
    try {
      const input = {
        tipo, supervisor, lugarExtraccion: lugar, molino,
        tonProcesadas: Number(ton) || 0, kgHumedo: Number(kgHum) || 0, kgSecos: Number(kgSec) || 0,
        kgSecoLimpio: Number(kgLim) || 0, observaciones: obs,
        cantidadSacos: Number(sacos) || 0, precioCasiterita: Number(precioCas) || 0, tasa: Number(tasa) || 0,
      };
      if (editando) { await actualizarContrato(contrato!.id, input); toast('Contrato actualizado', 'success'); }
      else { const c = await crearContrato({ ...input, numeroManual, actor, actorName }); toast(`Contrato ${c.numero} creado`, 'success'); }
      onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar el contrato', 'error'); }
    finally { setBusy(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cerrar</button>
      {!ro && <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={busy}>{busy ? 'Guardando…' : editando ? 'Guardar cambios' : '+ Crear contrato'}</button>}
    </>
  );

  // Tarjeta de un resultado calculado (no editable).
  const Calc = ({ label, value }: { label: string; value: string }) => (
    <div className="card" style={{ background: 'var(--surface-2)', padding: '.5rem .7rem' }}>
      <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 700 }}>{value}</div>
    </div>
  );

  return (
    <Modal title={editando ? `Contrato ${contrato!.numero}` : `Nuevo contrato de ${esMinero ? 'minero' : 'producción'}`} size="xl" onClose={onClose} footer={footer}>
      <div className="card" style={{ padding: '1rem' }}>
        <div className="card-title">
          <span>Datos del contrato · <strong className="mono" style={{ color: 'var(--primary-3)' }}>{numero}</strong>
            {editando && (contrato!.estado === 'cerrado' ? <span className="badge" style={{ marginLeft: '.4rem' }}>✔ Cerrado</span> : <span className="badge success" style={{ marginLeft: '.4rem' }}>● Activo</span>)}
          </span>
        </div>

        {/* Switch de tipo: Producción / Minero (solo al crear). */}
        {!editando && (
          <div className="view-toggle" role="tablist" style={{ marginBottom: '.6rem' }}>
            <button type="button" className={tipo === 'produccion' ? 'active' : ''} onClick={() => setTipo('produccion')} disabled={ro}>⚙ Contrato producción</button>
            <button type="button" className={tipo === 'minero' ? 'active' : ''} onClick={() => setTipo('minero')} disabled={ro}>⛏ Contrato minero</button>
          </div>
        )}

        {/* Encabezado */}
        <div className="form-grid" style={{ gap: '.6rem 1rem' }}>
          <div className="form-row">
            <label>N° de contrato {editando ? '' : '(editá el primero; luego es incremental)'}</label>
            <input className="input mono" value={editando ? numero : numeroManual} onChange={(e) => setNumeroManual(e.target.value)} readOnly={editando || ro} placeholder={numeroSugerido} />
          </div>
          <div className="form-row"><label>Fecha (automática)</label><input className="input" value={date(fecha)} readOnly /></div>
          <div className="form-row"><label>Hora (automática)</label><input className="input mono" value={hora} readOnly /></div>
        </div>
        <div className="form-grid" style={{ gap: '.6rem 1rem' }}>
          <div className="form-row">
            <label>Supervisor de Producción <span style={{ color: 'var(--danger)' }}>*</span></label>
            <SearchCreateSelect options={supervisoresActivos.map((s) => s.valor)} value={supervisor} onChange={setSupervisor} disabled={ro} placeholder="Escribí o elegí…" />
            <small className="muted">Si es nuevo, se guarda solo en el catálogo de supervisores.</small>
          </div>
          <div className="form-row">
            <label>Lugar de extracción <span style={{ color: 'var(--danger)' }}>*</span></label>
            <SearchCreateSelect options={lugaresActivos.map((l) => l.valor)} value={lugar} onChange={setLugar} disabled={ro} placeholder="Escribí o elegí…" />
            <small className="muted">Si es nuevo, se guarda solo en el catálogo de lugares.</small>
          </div>
          <div className="form-row">
            <label>Molino utilizado</label>
            <input className="input" name="f-molino" defaultValue={molino} onChange={(e) => setMolino(e.target.value)} placeholder="Ej. H-66" disabled={ro} />
          </div>
        </div>

        {/* Inputs principales (los que mueven las fórmulas) */}
        <div className="card-title" style={{ marginTop: '.4rem' }}><span>Producción (datos medidos)</span></div>
        <div className="form-grid" style={{ gap: '.6rem 1rem' }}>
          <div className="form-row"><label>Ton procesadas (material primario)</label><input className="input mono" name="f-ton" type="number" min={0} step="any" defaultValue={ton} onChange={(e) => setTon(e.target.value)} disabled={ro} /></div>
          <div className="form-row"><label>Kg Peso húmedo</label><input className="input mono" name="f-kg-humedo" type="number" min={0} step="any" defaultValue={kgHum} onChange={(e) => setKgHum(e.target.value)} disabled={ro} /></div>
          <div className="form-row"><label>Kg secos</label><input className="input mono" name="f-kg-secos" type="number" min={0} step="any" defaultValue={kgSec} onChange={(e) => setKgSec(e.target.value)} disabled={ro} /></div>
          <div className="form-row"><label>Kg seco, limpio (Casiterita)</label><input className="input mono" name="f-kg-seco-limpio" type="number" min={0} step="any" defaultValue={kgLim} onChange={(e) => setKgLim(e.target.value)} disabled={ro} /></div>
          <div className="form-row">
            <label>Kg seco, Limpio Finales (automático)</label>
            <input className="input mono" value={num(Number(kgLim) || 0)} readOnly
              style={{ color: 'var(--primary-3)', fontWeight: 800, borderColor: 'var(--primary)' }} />
            <small className="muted">Igual a «Kg seco, limpio (Casiterita)». No se modifica.</small>
          </div>
        </div>

        {/* Contrato MINERO: sacos + precio + tasa y el pago al minero. */}
        {esMinero && (
          <>
            <div className="card-title" style={{ marginTop: '.4rem' }}><span>⛏ Contrato minero</span></div>
            <div className="form-grid" style={{ gap: '.6rem 1rem' }}>
              <div className="form-row"><label>Cantidad de sacos (UND)</label><input className="input mono" name="f-sacos" type="number" min={0} step="1" defaultValue={sacos} onChange={(e) => setSacos(e.target.value)} disabled={ro} /></div>
              <div className="form-row"><label>Precio Casiterita ($/Kg)</label><input className="input mono" name="f-precio-cas" type="number" min={0} step="any" defaultValue={precioCas} onChange={(e) => setPrecioCas(e.target.value)} disabled={ro} /></div>
              <div className="form-row"><label>Tasa establecida ($/Kg al acopio)</label><input className="input mono" name="f-tasa" type="number" min={0} step="any" defaultValue={tasa} onChange={(e) => setTasa(e.target.value)} disabled={ro} /><small className="muted">Todo el peso limpio pasa al centro de acopio a esta tasa.</small></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '.6rem', marginTop: '.4rem' }}>
              <Calc label="Utilidad del minero (Kg × 70%)" value={`${num(fm.utilidadMinero)} Kg`} />
              <Calc label="Golden Touch (Kg × 30%)" value={`${num(fm.utilidadGt)} Kg`} />
              <Calc label="Monto a pagar minero (util. × precio)" value={`$ ${num(fm.montoPagarMinero)}`} />
            </div>
          </>
        )}

        {/* Resultados automáticos (fórmulas del Excel) */}
        <div className="card-title" style={{ marginTop: '.4rem' }}><span>🧮 Resultados automáticos</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '.6rem' }}>
          <Calc label="Tolva (Ton ÷ 1,2)" value={num(f.tolva)} />
          <Calc label="% recup. por ton c/ impurezas" value={pct(f.pctRecuperadoImpurezas)} />
          <Calc label="% de humedad" value={pct(f.pctHumedad)} />
          <Calc label="% Recuperación Final Casiterita" value={pct(f.pctRecuperacionCasiterita)} />
          <Calc label="Kg hierro (seco limpio − secos)" value={num(f.kgHierro)} />
          <Calc label="% de hierro" value={pct(f.pctHierro)} />
        </div>

        <div className="form-row" style={{ marginTop: '.6rem' }}>
          <label>Observación</label>
          <textarea className="input" name="f-obs" rows={2} defaultValue={obs} onChange={(e) => setObs(e.target.value)} disabled={ro} />
        </div>
        {ro && editando && contrato!.estado === 'cerrado' && (
          <p className="muted" style={{ fontSize: '.8rem' }}>El contrato está <strong>cerrado</strong>. Reabrilo desde la lista para editarlo.</p>
        )}
      </div>
    </Modal>
  );
}

/* ───────────── Modal: CATÁLOGO (Lugares + Supervisores) ───────────── */

const TABS_CAT: { key: TipoCatalogoAcopio; label: string; singular: string }[] = [
  { key: 'lugar_extraccion', label: 'Lugares de extracción', singular: 'lugar de extracción' },
  { key: 'supervisor', label: 'Supervisores', singular: 'supervisor' },
];

export function CatalogoAcopioModal({ canWrite, onClose }: { canWrite: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TipoCatalogoAcopio>('lugar_extraccion');
  const [items, setItems] = useState<CatalogoAcopio[]>([]);
  const [valor, setValor] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');
  const [borrarId, setBorrarId] = useState<string | null>(null);

  const tabActual = TABS_CAT.find((t) => t.key === tab)!;
  const recargar = useCallback(async () => { setItems(await listCatalogosAcopio()); }, []);
  useEffect(() => { recargar().catch(() => {}); }, [recargar]);
  useRealtime(['acopio_catalogos'], () => { void recargar(); });

  const lista = useMemo(() => items.filter((i) => i.tipo === tab), [items, tab]);

  async function agregar() {
    if (!valor.trim()) { toast(`Indicá el ${tabActual.singular}`, 'error'); return; }
    setBusy(true);
    try { await addCatalogoAcopio(tab, valor); setValor(''); await recargar(); toast('Agregado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
    finally { setBusy(false); }
  }
  async function guardarEdicion(id: string) {
    try { await updateCatalogoAcopio(id, editValor); setEditId(null); await recargar(); toast('Actualizado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo editar', 'error'); }
  }
  async function toggle(id: string, activo: boolean) {
    try { await setCatalogoAcopioActivo(id, !activo); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }
  async function borrar(id: string) {
    try { await eliminarCatalogoAcopio(id); await recargar(); toast('Eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  return (
    <Modal title="Catálogo" size="md" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="view-toggle" role="tablist" style={{ marginBottom: '.75rem' }}>
        {TABS_CAT.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => { setTab(t.key); setEditId(null); setValor(''); }}>{t.label}</button>
        ))}
      </div>

      {canWrite && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
          <input className="input" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={`Nuevo ${tabActual.singular}…`}
            onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }} />
          <button className="btn btn-primary" onClick={() => void agregar()} disabled={busy}>+ Agregar</button>
        </div>
      )}
      <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: '.84rem' }}>
          <thead><tr><th>{tabActual.label}</th><th>Estado</th>{canWrite && <th></th>}</tr></thead>
          <tbody>
            {!lista.length && <tr><td colSpan={canWrite ? 3 : 2} className="muted" style={{ textAlign: 'center' }}>Sin elementos cargados.</td></tr>}
            {lista.map((l) => (
              <tr key={l.id} style={{ opacity: l.activo ? 1 : 0.5 }}>
                <td>
                  {editId === l.id ? (
                    <input className="input" value={editValor} autoFocus onChange={(e) => setEditValor(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void guardarEdicion(l.id); if (e.key === 'Escape') setEditId(null); }} />
                  ) : l.valor}
                </td>
                <td>{l.activo ? '🟢 Activo' : '⚪ Inactivo'}</td>
                {canWrite && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {editId === l.id ? (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => void guardarEdicion(l.id)}>Guardar</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => { setEditId(l.id); setEditValor(l.valor); }}>✎</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => void toggle(l.id, l.activo)}>{l.activo ? 'Desactivar' : 'Activar'}</button>
                        <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => setBorrarId(l.id)}>🗑</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {borrarId && (
        <ConfirmDialog
          title="Eliminar del catálogo"
          message={`¿Eliminar este ${tabActual.singular} del catálogo?`}
          confirmText="Eliminar"
          danger
          onCancel={() => setBorrarId(null)}
          onConfirm={() => { const id = borrarId; setBorrarId(null); void borrar(id); }}
        />
      )}
    </Modal>
  );
}
