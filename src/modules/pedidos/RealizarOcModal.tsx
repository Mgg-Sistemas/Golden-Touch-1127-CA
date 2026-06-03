import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { dateTime, money } from '@/shared/lib/format';
import type { Orden, Proveedor } from '@/shared/lib/types';
import { emitirOrdenCompraGrupo, listAprobadasDeProveedor } from './pedidos.repository';
import { descargarOrdenCompraPdf } from './ordenCompraPdf';
import { notify } from '@/shared/lib/notify';

interface Props {
  orden: Orden;
  proveedor: Proveedor | null;
  actorEmail: string;
  onClose: () => void;
  onEmitted: () => void;
}

const DOCUMENTOS_OC = ['Nota de entrega', 'Nota de despacho'] as const;

export function RealizarOcModal({ orden, proveedor, actorEmail, onClose, onEmitted }: Props) {
  const [hermanas, setHermanas] = useState<Orden[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [documentos, setDocumentos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  function toggleDoc(doc: string) {
    setDocumentos((prev) => {
      const next = new Set(prev);
      if (next.has(doc)) next.delete(doc); else next.add(doc);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    if (!orden.proveedor_id) { setLoading(false); return; }
    listAprobadasDeProveedor(orden.proveedor_id, orden.id)
      .then((rows) => { if (!cancelled) setHermanas(rows); })
      .catch(() => { if (!cancelled) setHermanas([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orden.id, orden.proveedor_id]);

  function toggle(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodas() {
    if (seleccionadas.size === hermanas.length) {
      setSeleccionadas(new Set());
    } else {
      setSeleccionadas(new Set(hermanas.map((o) => o.id)));
    }
  }

  const extras = hermanas.filter((o) => seleccionadas.has(o.id));
  const total = useMemo(
    () => [orden, ...extras].reduce((a, o) => a + Number(o.total ?? 0), 0),
    [orden, extras],
  );

  async function handleEmitir() {
    setSubmitting(true);
    try {
      const all: Orden[] = [orden, ...extras];
      const docs = DOCUMENTOS_OC.filter((d) => documentos.has(d));
      const { ocCodigo, cantidad } = await emitirOrdenCompraGrupo(all, actorEmail, docs);
      // Generar PDF (siempre uno solo, con todas las OPs consolidadas si las hay)
      await descargarOrdenCompraPdf(orden.id);
      notify(
        cantidad > 1
          ? `${ocCodigo} emitida · consolidó ${cantidad} órdenes de pedido`
          : `${ocCodigo} emitida para ${orden.codigo}`,
        'success',
        { link: '#/app/pedidos' },
      );
      onEmitted();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Error al emitir OC', 'error', { persist: false });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Realizar Orden de Compra"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleEmitir} disabled={submitting}>
            {submitting
              ? 'Emitiendo…'
              : `🧾 Emitir OC para ${1 + extras.length} orden${extras.length > 0 ? 'es' : ''}`}
          </button>
        </>
      }
    >
      <div className="card" style={{ background: 'var(--bg-2)', padding: '1rem', marginBottom: '1rem' }}>
        <div className="card-title" style={{ marginBottom: '.5rem' }}>
          <span>Proveedor adjudicado</span>
        </div>
        <div className="detail-row">
          <div className="k">Razón social</div>
          <div className="v"><strong>{proveedor?.razon_social ?? '—'}</strong></div>
        </div>
        <div className="detail-row">
          <div className="k">RIF</div>
          <div className="v mono">{proveedor?.rif ?? '—'}</div>
        </div>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem', borderColor: 'var(--primary)' }}>
        <div className="card-title">
          <span>OP que iniciás esta OC</span>
          <span className="badge primary">obligatoria</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.5rem' }}>
          <div>
            <div className="mono"><strong>{orden.codigo}</strong></div>
            <div className="muted" style={{ fontSize: '.78rem' }}>{orden.solicitante ?? orden.solicitante_email}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono">{money(orden.total)}</div>
            <div className="muted" style={{ fontSize: '.72rem' }}>{orden.items.length} ítem(s)</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '1rem' }}>
        <div className="card-title" style={{ marginBottom: '.5rem' }}>
          <span>Consolidar con otras OPs aprobadas del mismo proveedor</span>
          {hermanas.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={toggleTodas}>
              {seleccionadas.size === hermanas.length ? 'Desmarcar todas' : 'Marcar todas'}
            </button>
          )}
        </div>
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 0, marginBottom: '.75rem' }}>
          Opcional. Si no marcás ninguna, se emite la OC solo para <span className="mono">{orden.codigo}</span>.
        </p>

        {loading ? (
          <EmptyState message="Buscando otras OPs aprobadas…" icon="◔" />
        ) : !hermanas.length ? (
          <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
            No hay otras órdenes de pedido aprobadas pendientes de este proveedor.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            {hermanas.map((o) => {
              const checked = seleccionadas.has(o.id);
              return (
                <label
                  key={o.id}
                  className="row-selectable"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: '.75rem',
                    alignItems: 'center',
                    padding: '.55rem .75rem',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    background: checked ? 'rgba(255,138,0,0.06)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(o.id)} />
                  <div>
                    <div className="mono"><strong>{o.codigo}</strong></div>
                    <div className="muted" style={{ fontSize: '.72rem' }}>
                      {o.solicitante ?? o.solicitante_email} · {dateTime(o.created_at)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono">{money(o.total)}</div>
                    <div className="muted" style={{ fontSize: '.7rem' }}>{o.items.length} ítem(s)</div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Documentos a adjuntar a la OC */}
      <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
        <div className="card-title" style={{ marginBottom: '.5rem' }}>
          <span>Documentos de la orden de compra</span>
        </div>
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 0, marginBottom: '.75rem' }}>
          Marcá los documentos que acompañan esta OC. Quedan registrados en la trazabilidad de la orden.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {DOCUMENTOS_OC.map((doc) => {
            const checked = documentos.has(doc);
            return (
              <label
                key={doc}
                style={{
                  display: 'flex', alignItems: 'center', gap: '.6rem',
                  padding: '.55rem .75rem', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  background: checked ? 'rgba(255,138,0,0.06)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleDoc(doc)} />
                <span style={{ fontWeight: 600 }}>📄 {doc}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1rem',
          padding: '.75rem 1rem',
          borderTop: '1px solid var(--border)',
        }}
      >
        <span className="muted">Total consolidado de la OC</span>
        <strong className="mono" style={{ fontSize: '1.1rem' }}>{money(total)}</strong>
      </div>
    </Modal>
  );
}
