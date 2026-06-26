/* ============================================================
   Golden Touch · Facturas de Compra/Servicio Directo (varias)
   Lista, sube (PDF/imagen), borra y previsualiza las facturas de
   una compra o servicio directo. Reutilizable en ambos módulos.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import {
  listAdjuntosDirectos, agregarAdjuntoDirecto, eliminarAdjuntoDirecto, urlAdjuntoDirecto,
  type AdjuntoDirecto, type ModuloDirecto,
} from './adjuntosDirectos.repository';

export function FacturasDirectas({ modulo, refId, actor, soloLectura = false }: {
  modulo: ModuloDirecto; refId: string; actor: string; soloLectura?: boolean;
}) {
  const [lista, setLista] = useState<AdjuntoDirecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [borrar, setBorrar] = useState<AdjuntoDirecto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try { setLista(await listAdjuntosDirectos(modulo, refId)); }
    catch { /* RLS/red */ }
    finally { setCargando(false); }
  }, [modulo, refId]);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime(['adjuntos_directos'], () => { void reload(); });

  async function abrir(a: AdjuntoDirecto) {
    try { previewArchivo(await urlAdjuntoDirecto(modulo, a.path), a.nombre || (a.path.split('/').pop() ?? 'factura')); }
    catch { toast('No se pudo abrir la factura', 'error'); }
  }

  async function onPick(file: File | null) {
    if (!file) return;
    setSubiendo(true);
    try {
      await agregarAdjuntoDirecto(modulo, refId, file, actor);
      toast('Factura cargada', 'success');
      if (inputRef.current) inputRef.current.value = '';
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar la factura', 'error'); }
    finally { setSubiendo(false); }
  }

  async function confirmarBorrar() {
    const a = borrar; if (!a) return;
    try { await eliminarAdjuntoDirecto(a); toast('Factura eliminada', 'success'); setBorrar(null); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  const esImg = (a: AdjuntoDirecto) => (a.content_type ?? '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.path);

  return (
    <div className="card" style={{ marginTop: '.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '.9rem' }}>🧾 Facturas / comprobantes {lista.length ? <span className="badge">{lista.length}</span> : null}</strong>
        {!soloLectura && (
          <>
            <input ref={inputRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
              onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
            <button type="button" className="btn btn-sm btn-primary" disabled={subiendo} onClick={() => inputRef.current?.click()}>
              {subiendo ? 'Subiendo…' : '＋ Agregar factura (PDF/imagen)'}
            </button>
          </>
        )}
      </div>

      {cargando ? (
        <div className="muted" style={{ fontSize: '.8rem' }}>Cargando…</div>
      ) : !lista.length ? (
        <div className="muted" style={{ fontSize: '.8rem' }}>Sin facturas cargadas.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
          {lista.map((a) => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', minWidth: 0 }}>
                <span>{esImg(a) ? '🖼' : '📄'}</span>
                <button type="button" className="btn btn-sm btn-ghost" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => abrir(a)} title={a.nombre ?? 'Ver factura'}>{a.nombre || 'factura'}</button>
                <small className="muted">{dateTime(a.created_at)}</small>
              </span>
              {!soloLectura && (
                <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setBorrar(a)} title="Eliminar factura">🗑</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {borrar && (
        <ConfirmDialog title="Eliminar factura" message={`¿Eliminar "${borrar.nombre || 'la factura'}"? No se puede deshacer.`}
          confirmText="Eliminar" danger onConfirm={confirmarBorrar} onCancel={() => setBorrar(null)} />
      )}
    </div>
  );
}
