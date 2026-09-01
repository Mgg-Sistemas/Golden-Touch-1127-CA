import { useCallback, useEffect, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { money, num, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import {
  listMercadosCerrados, actualizarMercadoHistorico, eliminarMercado,
  type Mercado, type ResumenViver,
} from './cocinaMercado.repository';
import { descargarCocinaCierrePdf } from './cocinaCierrePdf';
import { enviarCierreCocinaPorCorreo } from './enviarCierreCocina';

const dmy = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * Histórico de mercados CERRADOS (como «Recepciones cerradas»): lista → detalle. En el
 * detalle se puede VISUALIZAR (tarjetas), EDITAR (cantidades + nota), sacar el REPORTE
 * (PDF/correo) y ELIMINAR.
 */
export function MercadosHistoricoModal({ canWrite, onClose }: { canWrite: boolean; onClose: () => void }) {
  const [lista, setLista] = useState<Mercado[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'list' | 'detalle'>('list');
  const [ver, setVer] = useState<Mercado | null>(null);
  const [editando, setEditando] = useState(false);
  const [editItems, setEditItems] = useState<ResumenViver[]>([]);
  const [editNota, setEditNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [aBorrar, setABorrar] = useState<Mercado | null>(null);

  const cargar = useCallback(async () => {
    try { setLista(await listMercadosCerrados()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar el histórico', 'error'); }
  }, []);
  useEffect(() => { setLoading(true); cargar().finally(() => setLoading(false)); }, [cargar]);
  useRealtime(['cocina_mercados'], () => { void cargar(); });

  function abrirDetalle(m: Mercado) { setVer(m); setEditando(false); setEditNota(m.nota ?? ''); setMode('detalle'); }
  function volver() { setVer(null); setEditando(false); setMode('list'); }

  function empezarEdicion() {
    if (!ver) return;
    setEditItems((ver.resumen ?? []).map((r) => ({ ...r })));
    setEditNota(ver.nota ?? '');
    setEditando(true);
  }
  function setItem(i: number, patch: Partial<ResumenViver>) {
    setEditItems((arr) => arr.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  }
  async function guardar() {
    if (!ver) return;
    setGuardando(true);
    try {
      const upd = await actualizarMercadoHistorico(ver.id, { resumen: editItems, nota: editNota });
      setVer(upd); setEditando(false);
      await cargar();
      toast(`Mercado ${upd.numero ?? ''} actualizado`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setGuardando(false); }
  }
  async function enviarCorreo() {
    if (!ver) return;
    setEnviando(true);
    try {
      const destinos = emailTo.trim() ? emailTo.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : undefined;
      const { destinatarios } = await enviarCierreCocinaPorCorreo(ver, destinos);
      toast(`Reporte enviado a ${destinatarios.join(', ') || 'los destinatarios'}`, 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo enviar el correo', 'error'); }
    finally { setEnviando(false); }
  }
  async function borrar(m: Mercado) {
    try { await eliminarMercado(m.id); await cargar(); if (ver?.id === m.id) volver(); toast(`Mercado ${m.numero ?? ''} eliminado del histórico`, 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setABorrar(null); }
  }

  const resumen = ver?.resumen ?? [];
  const consumoValor = ver?.totales?.consumo_valor ?? 0;

  const footer = mode === 'detalle' && ver ? (
    <>
      <button className="btn btn-ghost" onClick={volver}>← Volver</button>
      <button className="btn btn-ghost" onClick={() => void descargarCocinaCierrePdf(ver)}>↓ PDF</button>
      {canWrite && !editando && <button className="btn btn-ghost" onClick={empezarEdicion}>✏️ Editar</button>}
      {canWrite && editando && <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : '💾 Guardar'}</button>}
    </>
  ) : (
    <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
  );

  return (
    <Modal
      title={mode === 'detalle' && ver ? `🗂 Mercado ${ver.numero ?? ''} (cerrado)` : '🗂 Mercados cerrados (histórico)'}
      size="xl" onClose={onClose} footer={footer}>
      {mode === 'list' && (
        loading ? <p className="muted">Cargando…</p> : !lista.length ? (
          <EmptyState message="Todavía no hay mercados cerrados. Cerrá un ciclo desde «🧾 Cerrar mercado»." icon="🗂" />
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr>
                <th>N° Mercado</th><th>Ciclo</th><th style={{ textAlign: 'right' }}>Víveres</th>
                <th style={{ textAlign: 'right' }}>Consumo</th><th style={{ textAlign: 'right' }}>Pasaron</th>{canWrite && <th></th>}
              </tr></thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(m)} title="Ver detalle">
                    <td className="mono" style={{ fontWeight: 700 }}>{m.numero ?? '—'}</td>
                    <td>{dmy(m.inicio_at)} → {dmy(m.cierre_at)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(m.totales?.viveres ?? (m.resumen?.length ?? 0))}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(m.totales?.consumo_valor ?? 0)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(m.totales?.queda_viveres ?? 0)}</td>
                    {canWrite && <td><button className="btn btn-sm btn-ghost" title="Eliminar del histórico" onClick={(e) => { e.stopPropagation(); setABorrar(m); }}>🗑</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {mode === 'detalle' && ver && (
        <div style={{ display: 'grid', gap: '.6rem' }}>
          <div className="muted" style={{ fontSize: '.82rem' }}>
            Ciclo <strong>{dmy(ver.inicio_at)} → {dmy(ver.cierre_at)}</strong> · cerrado {dateTime(ver.cierre_at ?? ver.created_at)}
            {ver.cerrado_por ? ` · por ${ver.cerrado_por}` : ''} · consumo total <strong className="mono">{money(consumoValor)}</strong>
          </div>

          {/* Enviar el reporte por correo */}
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" style={{ maxWidth: 260 }} value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
              placeholder="correo@empresa.com (opcional)" />
            <button className="btn btn-ghost btn-sm" onClick={() => void enviarCorreo()} disabled={enviando}>{enviando ? 'Enviando…' : '✉ Enviar reporte'}</button>
          </div>

          {!editando ? (
            // VISUALIZAR: tabla (saldo + entrada = disponible, consumo, queda).
            resumen.length === 0 ? <p className="muted">Este ciclo no tiene resumen guardado.</p> : (
              <div className="table-wrap" style={{ maxHeight: '52vh', overflow: 'auto' }}>
                <table className="table" style={{ fontSize: '.83rem' }}>
                  <thead><tr>
                    <th>Víver</th><th style={{ textAlign: 'right' }}>Saldo</th><th style={{ textAlign: 'right' }}>＋ Entrada</th>
                    <th style={{ textAlign: 'right' }}>＝ Disponible</th><th style={{ textAlign: 'right' }}>Consumo</th><th style={{ textAlign: 'right' }}>Quedó</th>
                  </tr></thead>
                  <tbody>
                    {resumen.map((r) => (
                      <tr key={r.producto_id}>
                        <td>{r.nombre} {r.unidad && <span className="muted">· {r.unidad}</span>}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{num(r.saldo_inicial)}</td>
                        <td className="mono" style={{ textAlign: 'right', color: r.entradas > 0 ? 'var(--brand, #ff8a00)' : undefined }}>{r.entradas > 0 ? `+${num(r.entradas)}` : '—'}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(r.disponible)}</td>
                        <td className="mono" style={{ textAlign: 'right', color: r.consumo > 0 ? 'var(--danger)' : undefined }}>{r.consumo > 0 ? `−${num(r.consumo)}` : '—'}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: r.queda > 0 ? 'var(--success, #16a34a)' : 'var(--muted)' }}>{num(r.queda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            // EDITAR: tabla editable de cantidades por víver + nota.
            <>
              <div className="muted" style={{ fontSize: '.76rem' }}>Corregí las cantidades de ESTE ciclo (no reescribe el ciclo siguiente). «Disponible» = saldo + entrada.</div>
              <div className="table-wrap" style={{ maxHeight: '48vh', overflow: 'auto' }}>
                <table className="table" style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Víver</th><th style={{ textAlign: 'right' }}>Saldo</th><th style={{ textAlign: 'right' }}>Entrada</th><th style={{ textAlign: 'right' }}>Consumo</th><th style={{ textAlign: 'right' }}>Queda</th></tr></thead>
                  <tbody>
                    {editItems.map((r, i) => (
                      <tr key={r.producto_id}>
                        <td>{r.nombre} {r.unidad && <span className="muted">· {r.unidad}</span>}</td>
                        {(['saldo_inicial', 'entradas', 'consumo', 'queda'] as const).map((campo) => (
                          <td key={campo} style={{ textAlign: 'right' }}>
                            <input className="input mono" type="number" step="any" style={{ width: 84, textAlign: 'right' }}
                              value={String(r[campo] ?? 0)} onChange={(e) => setItem(i, { [campo]: Number(e.target.value) || 0 })} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-row">
                <label>Nota del ciclo <span className="muted">(opcional)</span></label>
                <textarea className="input" rows={2} value={editNota} onChange={(e) => setEditNota(e.target.value)} placeholder="Observaciones del mercado…" />
              </div>
            </>
          )}
          {!editando && ver.nota && <div className="card" style={{ padding: '.5rem .7rem' }}><span className="muted">📝 </span>{ver.nota}</div>}
        </div>
      )}

      {aBorrar && (
        <ConfirmDialog title="Eliminar mercado del histórico"
          message={`¿Eliminar el mercado ${aBorrar.numero ?? ''} del histórico? No repone stock ni afecta el ciclo abierto; solo borra este registro histórico.`}
          confirmText="Eliminar" onCancel={() => setABorrar(null)} onConfirm={() => borrar(aBorrar)} />
      )}
    </Modal>
  );
}
