/* ============================================================
   Golden Touch · Tesorería · Cierre de mes (UI)
   Vista previa del reporte del período, cierre (archiva los
   movimientos del mes, reversible) y lista de cierres con su
   reporte descargable (PDF/Excel). No borra nada ni toca saldos.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import {
  computeReporteCierre, listCierres, crearCierre, reabrirCierre, periodoActual,
  type ReporteCierre, type Cierre,
} from './cierres.repository';
import { descargarCierrePdf, descargarCierreExcel, periodoLargo } from './cierreReporte';

function montoStr(n: number | null | undefined, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$ ${v}` : `${moneda} ${v}`;
}

function BloqueMoneda({ titulo, rec }: { titulo: string; rec: Record<string, number> }) {
  const ent = Object.entries(rec).filter(([, v]) => Math.abs(Number(v) || 0) > 0.0001);
  return (
    <div className="card" style={{ margin: 0, padding: '.55rem .75rem' }}>
      <div className="muted" style={{ fontSize: '.68rem', textTransform: 'uppercase' }}>{titulo}</div>
      {ent.length ? ent.map(([mon, v]) => (
        <div key={mon} className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
          <span className="muted">{mon}</span><strong>{montoStr(v, mon)}</strong>
        </div>
      )) : <div className="muted mono" style={{ fontSize: '.85rem' }}>—</div>}
    </div>
  );
}

export function CierreMesModal({ canWrite, actor, actorName, onClose }: {
  canWrite: boolean; actor: string; actorName: string | null; onClose: () => void;
}) {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [rep, setRep] = useState<ReporteCierre | null>(null);
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [loading, setLoading] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [confirmCerrar, setConfirmCerrar] = useState(false);
  const [reabrir, setReabrir] = useState<Cierre | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, cs] = await Promise.all([
        computeReporteCierre(periodo).catch(() => null),
        listCierres().catch(() => [] as Cierre[]),
      ]);
      setRep(r); setCierres(cs);
    } finally { setLoading(false); }
  }, [periodo]);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['cierres_caja', 'movimientos_caja'], () => { void cargar(); });

  const cerradoVigente = useMemo(
    () => cierres.find((c) => c.periodo === periodo && c.estado === 'cerrado') ?? null,
    [cierres, periodo],
  );

  async function doCerrar() {
    if (!rep) return;
    setCerrando(true);
    try {
      await crearCierre({ periodo, snapshot: rep, actor, actorName });
      toast(`Mes ${periodo} cerrado. Los movimientos quedaron archivados.`, 'success');
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cerrar', 'error'); }
    finally { setCerrando(false); }
  }
  async function doReabrir(c: Cierre) {
    try { await reabrirCierre(c.id, actor); toast(`Mes ${c.periodo} reabierto.`, 'success'); await cargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo reabrir', 'error'); }
  }

  const footer = <button className="btn btn-primary" onClick={onClose}>Cerrar</button>;

  return (
    <Modal title="🗓️ Cierre de mes" size="xl" onClose={onClose} footer={footer}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.7rem' }}>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }}>
          Período <input className="input" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ width: 'auto' }} />
        </label>
        <span style={{ fontWeight: 600 }}>{periodoLargo(periodo)}</span>
        {cerradoVigente
          ? <span className="badge" style={{ color: 'var(--success)' }}>✓ Cerrado</span>
          : <span className="badge" style={{ color: 'var(--warning)' }}>Abierto</span>}
        <span className="muted" style={{ fontSize: '.78rem', marginLeft: 'auto' }}>{loading ? 'cargando…' : `${rep?.movimientos ?? 0} movimiento(s) del período`}</span>
      </div>

      {rep && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.5rem', marginBottom: '.6rem' }}>
            <BloqueMoneda titulo="Ingresos" rec={rep.ingresos} />
            <BloqueMoneda titulo="Gastos" rec={rep.gastos} />
            <BloqueMoneda titulo="Resultado" rec={rep.resultado} />
            <BloqueMoneda titulo="Por cobrar" rec={rep.cxc} />
            <BloqueMoneda titulo="Por pagar" rec={rep.cxp} />
          </div>

          <div className="card" style={{ margin: '0 0 .7rem', padding: '.55rem .75rem' }}>
            <div className="muted" style={{ fontSize: '.68rem', textTransform: 'uppercase', marginBottom: '.3rem' }}>Saldos disponibles</div>
            {rep.saldos.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.2rem .8rem' }}>
                {rep.saldos.map((s, i) => (
                  <div key={i} className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem' }}>
                    <span className="muted">{s.caja}{s.cuenta && s.cuenta !== 'general' ? ` · ${s.cuenta}` : ''}</span>
                    <strong style={{ color: s.saldo < 0 ? 'var(--danger)' : undefined }}>{montoStr(s.saldo, s.moneda)}</strong>
                  </div>
                ))}
              </div>
            ) : <div className="muted mono" style={{ fontSize: '.85rem' }}>—</div>}
          </div>

          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {canWrite && !cerradoVigente && (
              <button className="btn btn-primary" disabled={cerrando} onClick={() => setConfirmCerrar(true)}>
                {cerrando ? 'Cerrando…' : '🔒 Cerrar mes'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => void descargarCierrePdf(rep)}>↓ PDF</button>
            <button className="btn btn-ghost" onClick={() => void descargarCierreExcel(rep)}>↓ Excel</button>
          </div>
        </>
      )}

      <div className="card-title" style={{ margin: '0 0 .4rem' }}><span>Cierres registrados</span></div>
      {!cierres.length ? (
        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Aún no hay cierres.</p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Período</th><th>Estado</th><th style={{ textAlign: 'right' }}>Movs.</th><th>Cerró</th><th></th></tr></thead>
            <tbody>
              {cierres.map((c) => (
                <tr key={c.id}>
                  <td><strong>{periodoLargo(c.periodo)}</strong></td>
                  <td><span className="badge" style={{ color: c.estado === 'cerrado' ? 'var(--success)' : 'var(--muted)' }}>{c.estado === 'cerrado' ? 'Cerrado' : 'Reabierto'}</span></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{c.movimientos}</td>
                  <td className="muted" style={{ fontSize: '.78rem' }}>{c.actor_name || c.actor || '—'}<div>{dateTime(c.created_at)}</div></td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost" title="PDF" onClick={() => void descargarCierrePdf(c.snapshot)}>↓ PDF</button>
                    <button className="btn btn-sm btn-ghost" title="Excel" onClick={() => void descargarCierreExcel(c.snapshot)}>↓ Excel</button>
                    {canWrite && c.estado === 'cerrado' && <button className="btn btn-sm btn-ghost" title="Reabrir" onClick={() => setReabrir(c)}>↺ Reabrir</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmCerrar && (
        <ConfirmDialog
          title="Cerrar mes"
          message={`Se archivarán los ${rep?.movimientos ?? 0} movimiento(s) de ${periodoLargo(periodo)} y desaparecerán de la vista actual (es reversible). Se guarda el reporte. ¿Continuar?`}
          confirmText="Cerrar mes"
          onCancel={() => setConfirmCerrar(false)}
          onConfirm={() => { setConfirmCerrar(false); void doCerrar(); }}
        />
      )}
      {reabrir && (
        <ConfirmDialog
          title="Reabrir cierre"
          message={`Los movimientos de ${periodoLargo(reabrir.periodo)} vuelven a la vista actual. ¿Continuar?`}
          confirmText="Reabrir"
          onCancel={() => setReabrir(null)}
          onConfirm={() => { const c = reabrir; setReabrir(null); void doReabrir(c); }}
        />
      )}
    </Modal>
  );
}
