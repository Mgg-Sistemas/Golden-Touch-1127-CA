/* ============================================================
   Golden Touch · Libro fiscal · OC con factura

   La lista de OC a las que se les puede practicar una retención, con lo que
   ya tienen en el libro. El 🧾 abre el registro con los datos de la OC:
   proveedor, moneda, total, IVA y base (total sin IVA ni IGTF).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { norm } from '@/shared/lib/texto';
import { listOcConFactura, type OcConFactura } from './bandeja.repository';
import { urlComprobante } from './retencionesFiscal.repository';
import { RegistrarRetencionModal, type SemillaRetencion } from './LibroFiscal';
import { semillaDeOc } from './semillaRetencion';

function monto(n: number, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'Bs' ? `Bs ${v}` : `$ ${v}`;
}

export function BandejaOc({ canWrite, actor, actorName, onCantidad }: {
  canWrite: boolean; actor: string; actorName: string | null; onCantidad?: (n: number) => void;
}) {
  const [filas, setFilas] = useState<OcConFactura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [soloSinRetencion, setSoloSinRetencion] = useState(true);
  const [registrar, setRegistrar] = useState<SemillaRetencion | null>(null);

  const reload = useCallback(async () => {
    const rs = await listOcConFactura();
    setFilas(rs); setError(null);
    onCantidad?.(rs.filter((o) => !o.enLibro).length);
  }, [onCantidad]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reload()
      .catch((e) => { if (!cancel) setError(e instanceof Error ? e.message : 'No se pudieron leer las OC.'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);

  useRealtime(['ordenes', 'retenciones'], () => { void reload().catch(() => { /* se reintenta en el próximo cambio */ }); });

  const visibles = useMemo(() => {
    const q = norm(texto);
    return filas.filter((o) => {
      if (soloSinRetencion && o.enLibro > 0) return false;
      return !q || norm(`${o.ocCodigo ?? ''} ${o.opCodigo ?? ''} ${o.proveedorNombre} ${o.proveedorRif ?? ''}`).includes(q);
    });
  }, [filas, texto, soloSinRetencion]);

  async function verFactura(o: OcConFactura) {
    if (!o.facturaPath) return;
    try { previewArchivo(await urlComprobante(o.facturaPath), o.facturaNombre ?? 'factura'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo abrir la factura', 'error'); }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ margin: 0, flex: '1 1 240px' }}>
            <label>Buscar</label>
            <input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="OC, proveedor o RIF…" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.86rem' }}>
            <input type="checkbox" checked={soloSinRetencion} onChange={(e) => setSoloSinRetencion(e.target.checked)} />
            Solo las que aún no tienen retención en el libro
          </label>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.86rem' }}>
            <thead>
              <tr>
                <th>OC</th><th>Proveedor</th><th>Condición</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>IVA</th>
                <th>En el libro</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7}><EmptyState icon="◔" message="Cargando las OC…" /></td></tr>}
              {!loading && error && <tr><td colSpan={7}><EmptyState icon="⚠" message={`No se pudieron leer las OC: ${error}`} /></td></tr>}
              {!loading && !error && !visibles.length && (
                <tr><td colSpan={7}><EmptyState icon="🧾" message="No hay OC con factura pendientes de retención" /></td></tr>
              )}
              {!loading && !error && visibles.map((o) => (
                <tr key={o.id}>
                  <td className="mono">
                    {o.ocCodigo ?? '—'}
                    <div className="muted" style={{ fontSize: '.7rem' }}>{o.opCodigo ?? ''}</div>
                  </td>
                  <td>
                    <div>{o.proveedorNombre}</div>
                    <div className="muted mono" style={{ fontSize: '.72rem' }}>{o.proveedorRif ?? ''}</div>
                  </td>
                  <td className="muted" style={{ fontSize: '.8rem' }}>{o.condicionLabel}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{monto(o.total, o.moneda)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{o.iva ? monto(o.iva, o.moneda) : '—'}</td>
                  <td>
                    {o.enLibro
                      ? <span className="badge" style={{ color: 'var(--success)' }}>{o.enLibro} registrada{o.enLibro === 1 ? '' : 's'}</span>
                      : <span className="badge" style={{ color: 'var(--warning)' }}>Sin retención</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {o.facturaPath && (
                      <button className="btn btn-sm btn-ghost" onClick={() => void verFactura(o)} title={o.facturaNombre ?? 'Factura'}>📎</button>
                    )}
                    {canWrite && (
                      <button className="btn btn-sm btn-ghost" onClick={() => setRegistrar(semillaDeOc(o))} title="Registrar la retención de esta OC">🧾</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hint muted" style={{ fontSize: '.74rem', marginTop: '.4rem' }}>
          Entran las OC con soporte «factura» y las que tienen la factura del proveedor adjunta al recibir.
        </div>
      </div>

      {registrar && (
        <RegistrarRetencionModal semilla={registrar} actor={actor} actorName={actorName}
          onClose={() => setRegistrar(null)}
          onHecho={async () => { setRegistrar(null); await reload().catch(() => { /* idem */ }); }} />
      )}
    </div>
  );
}
