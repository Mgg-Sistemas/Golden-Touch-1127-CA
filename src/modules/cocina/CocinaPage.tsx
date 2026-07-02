import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money, num, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { BarChart, type ChartPoint } from '@/shared/ui/Chart';
import type { Producto } from '@/shared/lib/types';
import {
  listViveres, listMovimientosCocina, crearMovimientoCocina, eliminarMovimientoCocina,
  resumirCocina, TIPOS_COMIDA, labelTipoComida,
  type CocinaMovimiento, type CocinaItem, type TipoComida, type ResumenCocina,
} from './cocina.repository';
import { descargarCocinaPdf } from './cocinaPdf';
import { crearAlertaMercado } from './alertasMercado.repository';

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function hoyISO(): string { return new Date().toISOString().slice(0, 10); }
function inicioSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00`); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString().slice(0, 10);
}
function inicioMes(iso: string): string { return `${iso.slice(0, 7)}-01`; }

export function CocinaPage() {
  const { appUser, can, isAdmin } = usePermissions();
  const actor = appUser?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;
  const canWrite = isAdmin || can('cocina', 'escritura');

  const [movs, setMovs] = useState<CocinaMovimiento[]>([]);
  const [viveres, setViveres] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'none' | 'add' | 'resumen' | 'alerta'>('none');
  const [aEliminar, setAEliminar] = useState<CocinaMovimiento | null>(null);
  const [notaAlerta, setNotaAlerta] = useState('');
  const [enviandoAlerta, setEnviandoAlerta] = useState(false);

  async function enviarAlertaMercado() {
    setEnviandoAlerta(true);
    try {
      await crearAlertaMercado({ nota: notaAlerta || null, actor, actorName });
      notify('Alerta enviada a Compras: hay que restablecer el mercado', 'success', { link: '#/app/pedidos' });
      setNotaAlerta('');
      setModal('none');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo enviar la alerta', 'error');
    } finally {
      setEnviandoAlerta(false);
    }
  }

  // Filtros de la tabla.
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fTipo, setFTipo] = useState<TipoComida | ''>('');
  const [fBuscar, setFBuscar] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, v] = await Promise.all([
        listMovimientosCocina({ desde: fDesde || undefined, hasta: fHasta || undefined, tipo: fTipo || undefined }),
        listViveres().catch(() => [] as Producto[]),
      ]);
      setMovs(m); setViveres(v);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar Cocina', 'error');
    } finally { setLoading(false); }
  }, [fDesde, fHasta, fTipo]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['cocina_movimientos', 'movimientos', 'existencias'], () => { void cargar(); });

  // Búsqueda general (cliente): código, tipo, nota, fecha/hora, productos.
  const movsFiltrados = useMemo(() => {
    const q = norm(fBuscar.trim());
    if (!q) return movs;
    return movs.filter((m) => {
      const campos = [m.codigo ?? '', labelTipoComida(m.tipo_comida), m.nota ?? '', dateTime(m.at),
        ...(m.items ?? []).flatMap((i) => [i.nombre, i.sku])];
      return campos.some((c) => norm(String(c)).includes(q));
    });
  }, [movs, fBuscar]);

  // KPIs de HOY (independiente de los filtros de la tabla).
  const [movsHoy, setMovsHoy] = useState<CocinaMovimiento[]>([]);
  useEffect(() => {
    listMovimientosCocina({ desde: hoyISO(), hasta: hoyISO() }).then(setMovsHoy).catch(() => setMovsHoy([]));
  }, [movs]);
  const resHoy = useMemo(() => resumirCocina(movsHoy), [movsHoy]);

  async function confirmarEliminar(m: CocinaMovimiento) {
    try {
      await eliminarMovimientoCocina(m.id);
      toast('Movimiento eliminado (el stock descontado no se repone automáticamente)', 'success');
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setAEliminar(null); }
  }

  return (
    <div className="page">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>🍽 Control de Alimentación (Cocina)</h1>
          <p className="muted hint" style={{ margin: '.25rem 0 0' }}>Consumo de víveres por comida (desayuno, almuerzo, cena), con platos y costo del inventario.</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setModal('resumen')}>📊 Consumo / Resumen</button>
          {canWrite && <button className="btn btn-warning" onClick={() => setModal('alerta')} title="Avisar a Compras que hay que montar el mercado">🔔 Alerta a Restablecer</button>}
          {canWrite && <button className="btn btn-primary" onClick={() => setModal('add')}>➕ Añadir Movimiento</button>}
        </div>
      </div>

      {/* KPIs de hoy */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', margin: '1rem 0' }}>
        <KpiCard titulo="Platos hoy" valor={num(resHoy.platos)} nota={`${resHoy.movimientos} movimiento(s)`} />
        <KpiCard titulo="Consumo hoy" valor={money(resHoy.valorTotal)} nota="costo de víveres" destacado />
        <KpiCard titulo="Promedio por plato" valor={money(resHoy.promedioPorPlato)} nota="hoy" />
        <KpiCard titulo="Víveres en catálogo" valor={num(viveres.length)} nota="productos disponibles" />
      </div>

      {/* Filtros de la tabla */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ margin: 0 }}>
            <label style={{ fontSize: '.72rem' }}>Desde</label>
            <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label style={{ fontSize: '.72rem' }}>Hasta</label>
            <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label style={{ fontSize: '.72rem' }}>Tipo de comida</label>
            <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value as TipoComida | '')}>
              <option value="">Todas</option>
              {TIPOS_COMIDA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ margin: 0, flex: '1 1 220px' }}>
            <label style={{ fontSize: '.72rem' }}>Búsqueda general</label>
            <input className="input" value={fBuscar} onChange={(e) => setFBuscar(e.target.value)} placeholder="🔍 código, producto, nota, fecha/hora…" />
          </div>
          {(fDesde || fHasta || fTipo || fBuscar) && (
            <button className="btn btn-ghost" onClick={() => { setFDesde(''); setFHasta(''); setFTipo(''); setFBuscar(''); }}>✕ Limpiar</button>
          )}
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }}
            onClick={() => descargarCocinaPdf({ titulo: tituloRango(fDesde, fHasta), resumen: resumirCocina(movsFiltrados), movs: movsFiltrados }).catch(() => toast('No se pudo generar el PDF', 'error'))}>
            ↓ Reporte PDF
          </button>
        </div>
      </div>

      {/* Tabla de movimientos por tipo de comida */}
      {loading ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div>
      ) : movsFiltrados.length === 0 ? (
        <div className="card"><EmptyState message="No hay movimientos de cocina con esos filtros." icon="🍽" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.86rem' }}>
              <thead><tr>
                <th>Código</th><th>Tipo de comida</th><th>Fecha / Hora</th>
                <th style={{ textAlign: 'right' }}>Platos</th><th style={{ textAlign: 'right' }}>Valor</th>
                <th>Víveres</th>{canWrite && <th></th>}
              </tr></thead>
              <tbody>
                {movsFiltrados.map((m) => {
                  const tc = TIPOS_COMIDA.find((t) => t.value === m.tipo_comida);
                  return (
                    <tr key={m.id}>
                      <td className="mono">{m.codigo ?? '—'}</td>
                      <td><span className="badge">{tc?.icono} {labelTipoComida(m.tipo_comida)}</span></td>
                      <td>{dateTime(m.at)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{num(m.platos)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(Number(m.valor_total))}</td>
                      <td className="muted" style={{ fontSize: '.78rem' }}>
                        {(m.items ?? []).map((i) => `${num(i.cantidad)} ${i.nombre}`).join(' · ')}
                        {m.nota ? <div>📝 {m.nota}</div> : null}
                      </td>
                      {canWrite && (
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Eliminar" onClick={() => setAEliminar(m)}>🗑</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Total ({movsFiltrados.length})</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(movsFiltrados.reduce((a, m) => a + (Number(m.platos) || 0), 0))}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(movsFiltrados.reduce((a, m) => a + (Number(m.valor_total) || 0), 0))}</td>
                <td colSpan={canWrite ? 2 : 1}></td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}

      {modal === 'add' && (
        <AddMovimientoModal viveres={viveres} actor={actor} actorName={actorName}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await cargar(); }} />
      )}
      {modal === 'resumen' && (
        <ResumenModal viveres={viveres} onClose={() => setModal('none')} />
      )}
      {modal === 'alerta' && (
        <Modal title="🔔 Alerta a Restablecer el mercado" size="md" onClose={() => !enviandoAlerta && setModal('none')} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal('none')} disabled={enviandoAlerta}>Cancelar</button>
            <button className="btn btn-warning" onClick={() => void enviarAlertaMercado()} disabled={enviandoAlerta}>{enviandoAlerta ? 'Enviando…' : '🔔 Enviar alerta a Compras'}</button>
          </>
        }>
          <p style={{ marginTop: 0 }}>
            Esto le avisa a <strong>Compras</strong> que hay que <strong>montar el mercado</strong>. Aparece como una <strong>tarjeta en Pedidos</strong> para que el analista cree la Solicitud de Pedido de <strong>MERCADO</strong>.
          </p>
          <div className="form-row">
            <label>Nota para Compras <span className="muted">(opcional)</span></label>
            <textarea className="textarea" value={notaAlerta} onChange={(e) => setNotaAlerta(e.target.value)} placeholder="Ej.: falta arroz, pollo y aceite; urge para mañana…" rows={3} />
          </div>
        </Modal>
      )}
      {aEliminar && (
        <ConfirmDialog title="Eliminar movimiento de cocina"
          message={`¿Eliminar ${aEliminar.codigo ?? 'el movimiento'} (${labelTipoComida(aEliminar.tipo_comida)})? El stock ya descontado NO se repone automáticamente.`}
          confirmText="Eliminar" onCancel={() => setAEliminar(null)} onConfirm={() => confirmarEliminar(aEliminar)} />
      )}
    </div>
  );
}

function tituloRango(desde: string, hasta: string): string {
  if (desde && hasta) return `Consumo · ${desde} a ${hasta}`;
  if (desde) return `Consumo · desde ${desde}`;
  if (hasta) return `Consumo · hasta ${hasta}`;
  return 'Consumo · todo el histórico';
}

function KpiCard({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className="card" style={{ borderColor: destacado ? 'var(--brand, #ff8a00)' : undefined }}>
      <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{titulo}</div>
      <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800 }}>{valor}</div>
      {nota && <div className="muted" style={{ fontSize: '.75rem' }}>{nota}</div>}
    </div>
  );
}

/* ───────────── Añadir movimiento (consumo de víveres) ───────────── */
interface FilaUI { uid: string; productoId: string; cantidad: string; }
let _seq = 0;
const nuevaFila = (): FilaUI => ({ uid: `cf-${++_seq}`, productoId: '', cantidad: '1' });

function AddMovimientoModal({ viveres, actor, actorName, onClose, onSaved }: {
  viveres: Producto[]; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<TipoComida>('almuerzo');
  const [platos, setPlatos] = useState('');
  const [nota, setNota] = useState('');
  const [filas, setFilas] = useState<FilaUI[]>([nuevaFila()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prodMap = useMemo(() => new Map(viveres.map((p) => [p.id, p])), [viveres]);

  function setFila(uid: string, patch: Partial<FilaUI>) { setFilas((fs) => fs.map((f) => (f.uid === uid ? { ...f, ...patch } : f))); }
  function addFila() { setFilas((fs) => [...fs, nuevaFila()]); }
  function removeFila(uid: string) { setFilas((fs) => (fs.length <= 1 ? fs : fs.filter((f) => f.uid !== uid))); }

  const lineas = filas.map((f) => {
    const p = prodMap.get(f.productoId) ?? null;
    const cant = Number(f.cantidad) || 0;
    const precio = Number(p?.precio) || 0;
    return { f, p, cant, precio, subtotal: cant * precio, excede: !!p && cant > Number(p.stock) };
  });
  const total = lineas.reduce((a, l) => a + l.subtotal, 0);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const items: CocinaItem[] = lineas.filter((l) => l.p && l.cant > 0).map((l) => ({
      producto_id: l.p!.id, sku: l.p!.sku, nombre: l.p!.nombre, cantidad: l.cant, precio: l.precio, almacen: l.p!.almacen ?? null,
    }));
    if (!items.length) { setError('Agregá al menos un víver con cantidad.'); return; }
    const exc = lineas.find((l) => l.excede);
    if (exc) { setError(`No hay stock suficiente de ${exc.p?.nombre} (disponible ${num(Number(exc.p?.stock))}).`); return; }
    const nPlatos = Number(platos) || 0;
    if (nPlatos <= 0) { setError('Indicá cuántos platos se realizaron.'); return; }
    setSaving(true);
    try {
      const r = await crearMovimientoCocina({ tipoComida: tipo, platos: nPlatos, items, nota: nota || null, actor, actorName });
      notify(`Movimiento de cocina ${r.codigo} · ${labelTipoComida(tipo)} · ${money(Number(r.valor_total))}`, 'success', { link: '#/app/cocina' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); setSaving(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="cocina-add" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : `Registrar · ${money(total)}`}</button>
    </>
  );

  return (
    <Modal title="Añadir movimiento de cocina" size="lg" onClose={() => !saving && onClose()} footer={footer}>
      <form id="cocina-add" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        {/* Tipo de comida (una sola) */}
        <div className="form-row">
          <label>Tipo de comida</label>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {TIPOS_COMIDA.map((t) => (
              <label key={t.value} className="card" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: 0, padding: '.5rem .8rem', cursor: 'pointer', borderColor: tipo === t.value ? 'var(--brand, #ff8a00)' : 'var(--border)' }}>
                <input type="radio" name="tipo-comida" checked={tipo === t.value} onChange={() => setTipo(t.value)} />
                <span>{t.icono} {t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>¿Cuántos platos se realizaron?</label>
            <input className="input mono" type="number" min={0} step="any" value={platos} onChange={(e) => setPlatos(e.target.value)} placeholder="Ej.: 24" required />
          </div>
          <div className="form-row">
            <label>Nota (opcional)</label>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Comentario del servicio…" />
          </div>
        </div>

        {/* Víveres consumidos (solo categoría Víveres del inventario) */}
        <div className="form-row">
          <label>Víveres consumidos <span className="muted">(solo productos de la categoría Víveres)</span></label>
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.84rem' }}>
              <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th><th></th></tr></thead>
              <tbody>
                {filas.map((f) => {
                  const l = lineas.find((x) => x.f.uid === f.uid)!;
                  return (
                    <tr key={f.uid}>
                      <td style={{ minWidth: 220 }}>
                        <SearchSelect value={f.productoId} onChange={(v) => setFila(f.uid, { productoId: v })}
                          placeholder={viveres.length ? '🔍 Buscar víver…' : '— sin víveres —'}
                          options={viveres.map((p) => ({ value: p.id, label: `${p.nombre} (${p.sku})` }))} />
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{l.p ? `${num(Number(l.p.stock))} ${l.p.unidad ?? ''}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input className="input mono" type="number" min={0} step="any" value={f.cantidad} onChange={(e) => setFila(f.uid, { cantidad: e.target.value })}
                          style={{ width: 90, textAlign: 'right', borderColor: l.excede ? 'var(--danger)' : undefined }} />
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{l.p ? money(l.precio) : '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(l.subtotal)}</td>
                      <td style={{ textAlign: 'right' }}>{filas.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeFila(f.uid)} title="Quitar">✕</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td><td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(total)}</td><td></td></tr></tfoot>
            </table>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.4rem' }} onClick={addFila} disabled={!viveres.length}>＋ Agregar víver</button>
          <small className="muted" style={{ display: 'block', marginTop: '.3rem' }}>Los precios salen del inventario (PMP). Al registrar, cada víver se <strong>descuenta del stock</strong>.</small>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── Consumo / Resumen con barras ───────────── */
type Rango = 'hoy' | 'semana' | 'mes' | 'rango';
function ResumenModal({ viveres, onClose }: { viveres: Producto[]; onClose: () => void }) {
  const [rango, setRango] = useState<Rango>('hoy');
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [movs, setMovs] = useState<CocinaMovimiento[]>([]);
  const [loading, setLoading] = useState(true);

  // Calcula el rango efectivo según el botón elegido.
  const { d, h } = useMemo(() => {
    const hoy = hoyISO();
    if (rango === 'hoy') return { d: hoy, h: hoy };
    if (rango === 'semana') return { d: inicioSemana(hoy), h: hoy };
    if (rango === 'mes') return { d: inicioMes(hoy), h: hoy };
    return { d: desde, h: hasta };
  }, [rango, desde, hasta]);

  useEffect(() => {
    setLoading(true);
    listMovimientosCocina({ desde: d, hasta: h }).then(setMovs).catch(() => setMovs([])).finally(() => setLoading(false));
  }, [d, h]);

  const resumen: ResumenCocina = useMemo(() => resumirCocina(movs), [movs]);
  const barrasTop: ChartPoint[] = resumen.topProductos.slice(0, 10).map((p) => ({ label: p.nombre, value: p.valor, tooltip: `${p.nombre}: ${money(p.valor)} · ${num(p.cantidad)} und` }));
  const barrasTipo: ChartPoint[] = (['desayuno', 'almuerzo', 'cena'] as const).map((t) => ({ label: labelTipoComida(t), value: resumen.porTipo[t].valor, tooltip: `${labelTipoComida(t)}: ${money(resumen.porTipo[t].valor)} · ${resumen.porTipo[t].platos} platos` }));
  const etiquetaRango = rango === 'hoy' ? `Día ${desdeLegible(d)}` : `${desdeLegible(d)} a ${desdeLegible(h)}`;

  return (
    <Modal title="📊 Consumo / Resumen" size="lg" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={() => descargarCocinaPdf({ titulo: `Consumo · ${etiquetaRango}`, resumen, movs }).catch(() => toast('No se pudo generar el PDF', 'error'))}>↓ Reporte PDF</button>
      </>
    }>
      {/* Selector de rango */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.75rem', alignItems: 'flex-end' }}>
        {([['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['rango', 'Rango…']] as const).map(([val, txt]) => (
          <button key={val} className={rango === val ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'} onClick={() => setRango(val)}>{txt}</button>
        ))}
        {rango === 'rango' && (
          <>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} />
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} />
          </>
        )}
      </div>

      {/* Resumen tipo "Día 23/06/2026: 24 platos, $300 total, prom $12,5/plato" */}
      <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
        <div style={{ fontSize: '.95rem' }}>
          <strong>{etiquetaRango}</strong> · <strong className="mono">{num(resumen.platos)}</strong> platos ·
          consumo total <strong className="mono">{money(resumen.valorTotal)}</strong> ·
          promedio por plato <strong className="mono">{money(resumen.promedioPorPlato)}</strong>
          <span className="muted"> · {resumen.movimientos} movimiento(s)</span>
        </div>
      </div>

      {loading ? <p className="muted">Cargando…</p> : (
        <>
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Víveres más consumidos ($)</div>
            <BarChart data={barrasTop} color="#10b981" yFormatter={(n) => money(n)} emptyMessage="Sin consumo en el rango." />
          </div>
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Consumo por tipo de comida ($)</div>
            <BarChart data={barrasTipo} color="#ff8a00" yFormatter={(n) => money(n)} emptyMessage="Sin consumo en el rango." />
          </div>

          {/* Stock disponible de víveres */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Stock disponible de víveres</div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.82rem' }}>
                <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>
                  {viveres.map((p) => (
                    <tr key={p.id} style={{ opacity: Number(p.stock) <= 0 ? 0.5 : 1 }}>
                      <td>{p.nombre} <span className="muted mono" style={{ fontSize: '.72rem' }}>{p.sku}</span></td>
                      <td className="mono" style={{ textAlign: 'right', color: Number(p.stock) <= 0 ? 'var(--danger)' : undefined }}>{num(Number(p.stock))} {p.unidad ?? ''}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(Number(p.precio))}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(Number(p.stock) * Number(p.precio))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function desdeLegible(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
