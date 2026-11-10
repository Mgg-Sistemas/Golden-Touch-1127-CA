/* ============================================================
   Golden Touch · Inventario · «🌐 Enviar a MGG Los Pinos» (10/11/2026)
   Arriba se arma el envío (productos de Los Pinos con su cantidad);
   abajo, los envíos hechos y cómo van: por confirmar en MGG, recibidos,
   rechazados (se devuelven a Los Pinos) o en error (reintentar).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { toast } from '@/shared/ui/Toast';
import { dateTime, money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { TransferenciaMaterialInter } from '@/shared/lib/types';
import {
  devolverMaterial, enviarMaterialAMgg, errorRenglonesMaterial, listProductosParaMgg, listTransferenciasMaterial,
  mensajeEnvioMaterial, reintentarMaterial, type ProductoParaMgg,
} from './materialInter.repository';

const ESTADO: Record<TransferenciaMaterialInter['estado'], { txt: string; badge: string }> = {
  enviada: { txt: '⏳ Por confirmar en MGG', badge: 'warning' },
  por_confirmar: { txt: '⏳ Por confirmar', badge: 'warning' },
  recibida: { txt: '✅ Recibida en MGG', badge: 'success' },
  rechazada: { txt: '⛔ Rechazada por MGG', badge: 'danger' },
  error: { txt: '⚠ No llegó a MGG', badge: 'danger' },
  devuelta: { txt: '↩ Devuelta a Los Pinos', badge: 'muted' },
};

const leer = (s: string) => Number(String(s).replace(',', '.')) || 0;

export function EnviarMaterialMggModal({ actor, actorName, puedeOperar, onClose, onCambio }: {
  actor: string; actorName: string | null; puedeOperar: boolean; onClose: () => void; onCambio: () => void;
}) {
  const [productos, setProductos] = useState<ProductoParaMgg[]>([]);
  const [envios, setEnvios] = useState<TransferenciaMaterialInter[]>([]);
  const [cargando, setCargando] = useState(true);
  const [renglones, setRenglones] = useState<Array<{ id: string; cantidad: string }>>([]);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [listo, setListo] = useState<{ texto: string; ok: boolean; error: string | null } | null>(null);

  const cargar = useCallback(async () => {
    const [p, e] = await Promise.all([listProductosParaMgg(), listTransferenciasMaterial()]);
    setProductos(p);
    setEnvios(e.filter((t) => t.direccion === 'saliente'));
  }, []);
  useEffect(() => {
    cargar().catch((e) => toast(e instanceof Error ? e.message : 'No se pudo cargar', 'error')).finally(() => setCargando(false));
  }, [cargar]);
  useRealtime(['transferencias_material_inter'], () => { void cargar().catch(() => {}); });

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const elegidos = renglones
    .map((r) => ({ producto: porId.get(r.id), cantidad: leer(r.cantidad) }))
    .filter((r): r is { producto: ProductoParaMgg; cantidad: number } => !!r.producto);
  const error = renglones.length ? errorRenglonesMaterial(elegidos) : null;
  const valor = elegidos.reduce((a, r) => a + r.cantidad * r.producto.costo, 0);
  const opciones = useMemo(() => productos
    .filter((p) => !renglones.some((r) => r.id === p.id))
    .map((p) => ({ value: p.id, label: p.nombre, hint: `${p.sku} · hay ${num(p.stock)} ${p.unidad}`, keywords: [p.sku, p.categoria ?? ''] })),
  [productos, renglones]);

  async function enviar() {
    const mal = errorRenglonesMaterial(elegidos);
    if (mal) { toast(mal, 'error'); return; }
    setEnviando(true);
    try {
      const r = await enviarMaterialAMgg({ renglones: elegidos, nota, actor, actorName });
      setListo({ texto: mensajeEnvioMaterial(r.transferencia, actorName ?? actor), ok: r.entregada, error: r.error });
      toast(r.entregada ? 'Enviado: queda por confirmar en MGG Los Pinos.' : 'Salió de Los Pinos pero no llegó a MGG: reintenta abajo.', r.entregada ? 'success' : 'warning');
      setRenglones([]); setNota('');
      onCambio();
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error');
    } finally { setEnviando(false); }
  }

  async function accion(id: string, fn: () => Promise<void>, ok: string) {
    setOcupado(id);
    try { await fn(); toast(ok, 'success'); onCambio(); await cargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo', 'error'); }
    finally { setOcupado(null); }
  }

  return (
    <Modal title="🌐 Enviar a MGG · Almacén Los Pinos" size="lg" onClose={onClose}>
      <div className="aviso info sm" style={{ marginBottom: '.75rem' }}>
        <span className="aviso-icono">🔗</span>
        <div>
          Sale del <strong>Almacén Los Pinos de GT</strong> y llega al <strong>Almacén Los Pinos de MGG</strong>, donde el almacenista lo
          confirma (empareja cada producto con el suyo) y entra con el <strong>costo de GT</strong> (se promedia). Si MGG lo rechaza, aquí se devuelve a Los Pinos.
        </div>
      </div>

      {listo && (
        <div className="card" style={{ marginBottom: '.75rem', borderColor: listo.ok ? 'var(--success)' : 'var(--danger)' }}>
          <strong>{listo.ok ? '✅ Enviado a MGG (por confirmar allá)' : `⚠ No llegó a MGG: ${listo.error ?? ''}`}</strong>
          <CompartirWhatsapp texto={listo.texto} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setListo(null)}>Cerrar aviso</button>
        </div>
      )}

      {puedeOperar && (
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title"><span>📦 Nuevo envío</span></div>
          <SearchSelect value="" options={opciones} placeholder={cargando ? 'Cargando Los Pinos…' : '+ Agregar producto de Los Pinos…'}
            emptyText="No hay más productos con existencia en Los Pinos"
            onChange={(id) => { if (id) setRenglones((rs) => (rs.some((r) => r.id === id) ? rs : [...rs, { id, cantidad: '' }])); }} />
          {renglones.length > 0 && (
            <table className="table" style={{ marginTop: '.6rem' }}>
              <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Hay</th><th style={{ width: 130 }}>Enviar</th><th style={{ textAlign: 'right' }}>Costo c/u</th><th /></tr></thead>
              <tbody>
                {renglones.map((r) => {
                  const p = porId.get(r.id);
                  if (!p) return null;
                  return (
                    <tr key={r.id}>
                      <td><strong>{p.nombre}</strong><div className="muted" style={{ fontSize: '.78rem' }}>{p.sku}</div></td>
                      <td style={{ textAlign: 'right' }} className="mono">{num(p.stock)} {p.unidad}</td>
                      <td>
                        <input className="input" inputMode="decimal" value={r.cantidad} placeholder="0" aria-label={`Cantidad de ${p.nombre}`}
                          onChange={(e) => setRenglones((rs) => rs.map((x) => (x.id === r.id ? { ...x, cantidad: e.target.value } : x)))} />
                      </td>
                      <td style={{ textAlign: 'right' }} className="mono">{money(p.costo, 'USD')}</td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" aria-label={`Quitar ${p.nombre}`}
                          onClick={() => setRenglones((rs) => rs.filter((x) => x.id !== r.id))}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="field" style={{ marginTop: '.6rem' }}>
            <label htmlFor="mat-mgg-nota">Nota (opcional)</label>
            <input id="mat-mgg-nota" className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Para qué es, quién lo lleva…" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginTop: '.6rem', flexWrap: 'wrap' }}>
            {renglones.length > 0 && <span className="muted">Valor: <strong>{money(valor, 'USD')}</strong></span>}
            {error && <span style={{ color: 'var(--danger)', fontSize: '.85rem' }}>{error}</span>}
            <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }}
              disabled={enviando || !renglones.length || !!error} onClick={() => void enviar()}>
              {enviando ? 'Enviando…' : `🌐 Enviar ${renglones.length || ''} producto(s) a MGG`}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title"><span>🧾 Envíos a MGG</span></div>
        {cargando ? <p className="muted">Cargando…</p> : !envios.length ? <p className="muted">Todavía no hay envíos.</p> : (
          <div style={{ display: 'grid', gap: '.5rem' }}>
            {envios.map((t) => {
              const e = ESTADO[t.estado];
              return (
                <div key={t.id} className="card" style={{ margin: 0, padding: '.55rem .7rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{t.resumen}</strong>
                      <div className="muted" style={{ fontSize: '.78rem' }}>
                        {dateTime(t.created_at)} · {t.actor_name ?? t.actor}{t.total_usd != null ? ` · ${money(t.total_usd, 'USD')}` : ''}
                        {t.confirmada_por ? ` · ${t.estado === 'rechazada' ? 'rechazó' : 'recibió'} ${t.confirmada_por}` : ''}
                      </div>
                    </div>
                    <span className={`badge ${e.badge}`}>{e.txt}</span>
                  </div>
                  <ul style={{ margin: '.35rem 0 0', paddingLeft: '1.1rem', fontSize: '.85rem' }}>
                    {(t.items ?? []).map((i, k) => (
                      <li key={`${t.id}-${k}`}>
                        {num(i.cantidad)} {i.unidad} · {i.nombre}
                        {i.destino_nombre ? <span className="muted"> → en MGG: {i.destino_nombre}{i.destino_sku ? ` (${i.destino_sku})` : ''}</span> : null}
                      </li>
                    ))}
                  </ul>
                  {t.estado === 'rechazada' && t.rechazo_motivo && <div style={{ color: 'var(--danger)', fontSize: '.85rem' }}>Motivo: {t.rechazo_motivo}</div>}
                  {t.estado === 'error' && t.mensaje_error && <div style={{ color: 'var(--danger)', fontSize: '.85rem' }}>{t.mensaje_error}</div>}
                  {puedeOperar && (t.estado === 'error' || t.estado === 'rechazada') && (
                    <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem', flexWrap: 'wrap' }}>
                      {t.estado === 'error' && (
                        <button type="button" className="btn btn-primary btn-sm" disabled={ocupado === t.id}
                          onClick={() => void accion(t.id, () => reintentarMaterial(t.id), 'Reenviado: queda por confirmar en MGG.')}>↻ Reintentar</button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado === t.id}
                        title={t.estado === 'error' ? 'Solo si confirmaste con MGG que no le llegó: si le llegó, se duplicaría.' : undefined}
                        onClick={() => {
                          if (t.estado === 'error' && !window.confirm('¿Seguro que a MGG no le llegó? Si le llegó, devolverlo duplica la mercancía. Primero prueba «Reintentar».')) return;
                          void accion(t.id, () => devolverMaterial({ id: t.id, actor, actorName }), 'Devuelto a Los Pinos.');
                        }}>↩ Devolver a Los Pinos</button>
                    </div>
                  )}
                  <div style={{ marginTop: '.3rem' }}>
                    <details><summary className="muted" style={{ fontSize: '.8rem', cursor: 'pointer' }}>💬 WhatsApp del envío</summary>
                      <CompartirWhatsapp texto={mensajeEnvioMaterial(t, t.actor_name ?? t.actor ?? '')} />
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
