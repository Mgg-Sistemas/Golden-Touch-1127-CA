/* ============================================================
   Golden Touch · Inventario · RESUMEN (modal con desglose)
   Cards clicables (valor por almacén, productos nuevos, entradas,
   salidas, traslados); al tocar un card se ve el DETALLE (qué
   productos). Exporta a PDF (vista previa) y por correo.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money, num, dateTime } from '@/shared/lib/format';
import {
  cargarResumenInventario,
  descargarResumenInventarioPdf,
  enviarResumenInventarioCorreo,
  rangoLabel,
  type ResumenInventario,
  type MovResumenRow,
  type NuevoProductoRow,
} from './resumenInventario';

type Bloque = 'nuevos' | 'entradas' | 'salidas' | 'traslados';

function hoyISO(): string { return new Date().toISOString().slice(0, 10); }
function isoMenosDias(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function primerDiaMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function ResumenInventarioModal({ defaultEmail, onClose }: { defaultEmail: string; onClose: () => void }) {
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [resumen, setResumen] = useState<ResumenInventario | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<Bloque | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emails, setEmails] = useState(defaultEmail);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    cargarResumenInventario(desde || null, hasta || null)
      .then((r) => { if (!cancel) setResumen(r); })
      .catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'No se pudo cargar el resumen', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  function rango(tipo: 'hoy' | 'semana' | 'mes' | 'todo') {
    if (tipo === 'hoy') { setDesde(hoyISO()); setHasta(hoyISO()); }
    else if (tipo === 'semana') { setDesde(isoMenosDias(6)); setHasta(hoyISO()); }
    else if (tipo === 'mes') { setDesde(primerDiaMes()); setHasta(hoyISO()); }
    else { setDesde(''); setHasta(''); }
  }

  async function exportarPdf() {
    if (!resumen) return;
    setBusy(true);
    try { await descargarResumenInventarioPdf(resumen); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
    finally { setBusy(false); }
  }
  async function enviar() {
    if (!resumen) return;
    setBusy(true);
    try {
      const { destinatarios } = await enviarResumenInventarioCorreo(emails.split(/[,\s;]+/), resumen);
      notify(`Resumen enviado a ${destinatarios.length} correo(s)`, 'success', { link: '#/app/inventario' });
      setEmailOpen(false);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error'); }
    finally { setBusy(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      <button className="btn btn-ghost" disabled={busy || !resumen} onClick={() => void exportarPdf()}>↓ PDF (vista previa)</button>
      <button className="btn btn-primary" disabled={busy || !resumen} onClick={() => setEmailOpen((v) => !v)}>✉ Enviar por correo</button>
    </>
  );

  return (
    <Modal title="📊 Resumen de inventario" size="xl" onClose={onClose} footer={footer}>
      {/* Rango de fechas */}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '.75rem' }}>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ fontSize: '.72rem' }}>Desde</label>
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ fontSize: '.72rem' }}>Hasta</label>
          <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => rango('hoy')}>Hoy</button>
          <button className="btn btn-sm btn-ghost" onClick={() => rango('semana')}>7 días</button>
          <button className="btn btn-sm btn-ghost" onClick={() => rango('mes')}>Mes</button>
          <button className="btn btn-sm btn-ghost" onClick={() => rango('todo')}>Todo</button>
        </div>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: '.78rem' }}>{rangoLabel({ desde: desde || null, hasta: hasta || null })}</span>
      </div>

      {emailOpen && (
        <div className="card" style={{ padding: '.6rem', marginBottom: '.6rem', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 1, minWidth: 220 }} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="correo1@…, correo2@…" />
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void enviar()}>{busy ? 'Enviando…' : 'Enviar'}</button>
        </div>
      )}

      {loading || !resumen ? (
        <div className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>Cargando resumen…</div>
      ) : (
        <>
          {/* KPI cards (clic en los desglosables = ver detalle) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '1rem' }}>
            <KpiCard titulo="Valor inventario" valor={money(resumen.valorTotal)} nota={`${num(resumen.stockTotal)} und en stock`} destacado />
            <KpiCard titulo="Productos nuevos" valor={num(resumen.nuevos.count)} nota={money(resumen.nuevos.valor)} activo={drill === 'nuevos'} onClick={() => setDrill((d) => d === 'nuevos' ? null : 'nuevos')} />
            <KpiCard titulo="Entradas" valor={num(resumen.entradas.count)} nota={money(resumen.entradas.valor)} activo={drill === 'entradas'} onClick={() => setDrill((d) => d === 'entradas' ? null : 'entradas')} />
            <KpiCard titulo="Salidas" valor={num(resumen.salidas.count)} nota={money(resumen.salidas.valor)} activo={drill === 'salidas'} onClick={() => setDrill((d) => d === 'salidas' ? null : 'salidas')} />
            <KpiCard titulo="Traslados" valor={num(resumen.traslados.count)} nota={money(resumen.traslados.valor)} activo={drill === 'traslados'} onClick={() => setDrill((d) => d === 'traslados' ? null : 'traslados')} />
          </div>

          {/* Detalle del bloque seleccionado */}
          {drill === 'nuevos' && <NuevosTabla filas={resumen.nuevos.filas} />}
          {drill === 'entradas' && <MovTabla titulo="Entradas" filas={resumen.entradas.filas} />}
          {drill === 'salidas' && <MovTabla titulo="Salidas" filas={resumen.salidas.filas} />}
          {drill === 'traslados' && <MovTabla titulo="Traslados" filas={resumen.traslados.filas} />}

          {/* Total por almacenes y sub-almacenes */}
          <div className="card" style={{ padding: '.6rem', marginTop: '.4rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Total por almacenes y sub-almacenes</span></div>
            <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: '.8rem' }}>
                <thead>
                  <tr><th>Sede</th><th>Almacén / sub-almacén</th><th style={{ textAlign: 'right' }}>Productos</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Valor</th></tr>
                </thead>
                <tbody>
                  {resumen.porAlmacen.map((a) => (
                    <tr key={a.almacen}>
                      <td className="muted">{a.sede}</td>
                      <td>{a.esSub ? <span style={{ paddingLeft: '1rem' }}>↳ {a.almacen}</span> : <strong>{a.almacen}</strong>}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{num(a.productos)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{num(a.stock)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(a.valor)}</td>
                    </tr>
                  ))}
                  {!resumen.porAlmacen.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin existencias.</td></tr>}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={3}>TOTAL</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(resumen.stockTotal)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(resumen.valorTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function KpiCard({ titulo, valor, nota, destacado, activo, onClick }: {
  titulo: string; valor: string; nota?: string; destacado?: boolean; activo?: boolean; onClick?: () => void;
}) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        padding: '.7rem .85rem',
        cursor: onClick ? 'pointer' : 'default',
        borderLeft: `3px solid ${destacado ? 'var(--brand, #ff8a00)' : activo ? 'var(--brand, #ff8a00)' : 'var(--border)'}`,
        background: activo ? 'rgba(255,138,0,.10)' : undefined,
      }}
      title={onClick ? 'Tocá para ver el detalle' : undefined}
    >
      <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{titulo}</div>
      <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{valor}</div>
      {nota && <div className="muted" style={{ fontSize: '.74rem' }}>{nota}{onClick ? ' · ver detalle' : ''}</div>}
    </div>
  );
}

function MovTabla({ titulo, filas }: { titulo: string; filas: MovResumenRow[] }) {
  const total = filas.reduce((a, f) => a + f.valor, 0);
  return (
    <div className="card" style={{ padding: '.6rem', marginBottom: '.6rem', borderColor: 'var(--brand, #ff8a00)' }}>
      <div className="card-title" style={{ marginBottom: '.4rem' }}><span>{titulo} · {filas.length} · {money(total)}</span></div>
      <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.78rem' }}>
          <thead>
            <tr><th>Fecha</th><th>SKU</th><th>Producto</th><th>Almacén</th><th>Destino / detalle</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Valor</th></tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="muted">{dateTime(f.at)}</td>
                <td className="mono">{f.sku}</td>
                <td>{f.nombre}</td>
                <td>{f.almacen}</td>
                <td className="muted">{f.destino || f.detalle || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(f.cantidad)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(f.valor)}</td>
              </tr>
            ))}
            {!filas.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin movimientos en el período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NuevosTabla({ filas }: { filas: NuevoProductoRow[] }) {
  return (
    <div className="card" style={{ padding: '.6rem', marginBottom: '.6rem', borderColor: 'var(--brand, #ff8a00)' }}>
      <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Productos nuevos · {filas.length}</span></div>
      <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.78rem' }}>
          <thead>
            <tr><th>Fecha</th><th>SKU</th><th>Producto</th><th>Categoría</th><th>Almacén</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Valor</th></tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.sku}>
                <td className="muted">{dateTime(f.at)}</td>
                <td className="mono">{f.sku}</td>
                <td>{f.nombre}</td>
                <td className="muted">{f.categoria}</td>
                <td>{f.almacen}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(f.stock)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(f.valor)}</td>
              </tr>
            ))}
            {!filas.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>No entraron productos nuevos en el período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
