import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { date, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import { listContratos } from './contratos.repository';
import { pct } from './ContratosModal';
import { descargarTenorPdf, descargarTenorExcel, enviarTenorPorCorreo, type TenorRow } from './tenorReportes';

/**
 * Tenor Promedio Diarios: historial por contrato.
 * Muestra Ton procesadas y Kg Casiterita y aplica:
 *   Ton × 1000  ·  Tenor % = Kg Casiterita ÷ (Ton × 1000)
 */
export function TenorModal({ defaultEmail, onClose }: { defaultEmail: string; onClose: () => void }) {
  const [rows, setRows] = useState<TenorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [correoOpen, setCorreoOpen] = useState(false);
  const [fTexto, setFTexto] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');

  const recargar = useCallback(async () => {
    const cs = await listContratos();
    setRows(cs.map((c) => {
      const ton = Number(c.ton_procesadas) || 0;
      const kg = Number(c.kg_seco_limpio) || 0;
      const tonMil = ton * 1000;
      return { numero: c.numero, fecha: c.fecha, ton, kg, tonMil, tenor: tonMil > 0 ? kg / tonMil : null };
    }));
  }, []);
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    recargar().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [recargar]);
  useRealtime(['acopio_contratos'], () => { void recargar(); });

  const filtrados = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    return rows.filter((r) => {
      if (fDesde && r.fecha < fDesde) return false;
      if (fHasta && r.fecha > fHasta) return false;
      if (q && !`${r.numero} ${r.fecha}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, fTexto, fDesde, fHasta]);

  const tot = useMemo(() => {
    const ton = filtrados.reduce((a, r) => a + r.ton, 0);
    const kg = filtrados.reduce((a, r) => a + r.kg, 0);
    const tonMil = filtrados.reduce((a, r) => a + r.tonMil, 0);
    return { ton, kg, tonMil, tenor: tonMil > 0 ? kg / tonMil : null };
  }, [filtrados]);

  const hayFiltro = !!(fTexto || fDesde || fHasta);
  function limpiar() { setFTexto(''); setFDesde(''); setFHasta(''); }

  return (
    <Modal title="Tenor Promedio Diarios" size="xl" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
        Historial por contrato. <strong>Ton × 1000</strong> y <strong>Tenor %</strong> = Kg Casiterita ÷ (Ton procesadas × 1000).
      </p>

      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
        <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-ghost" disabled={!filtrados.length} title="Descargar PDF"
            onClick={() => void descargarTenorPdf(filtrados, { filtro: hayFiltro ? 'filtrado' : undefined }).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'))}>↓ PDF</button>
          <button className="btn btn-sm btn-ghost" disabled={!filtrados.length} title="Descargar Excel"
            onClick={() => void descargarTenorExcel(filtrados).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el Excel', 'error'))}>📊 Excel</button>
          <button className="btn btn-sm btn-ghost" disabled={!filtrados.length} title="Enviar por correo"
            onClick={() => setCorreoOpen(true)}>✉ Correo</button>
        </span>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input className="input" type="search" value={fTexto} onChange={(e) => setFTexto(e.target.value)}
              placeholder="🔍 Buscar (n°, fecha)…" style={{ width: 200, paddingRight: fTexto ? '1.6rem' : undefined }} />
            {fTexto && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFTexto('')}
              style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>}
          </div>
          <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
            Desde <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ width: 'auto' }} />
          </label>
          <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
            Hasta <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ width: 'auto' }} />
          </label>
          {hayFiltro && <button className="btn btn-sm btn-ghost" onClick={limpiar}>✕ Limpiar</button>}
          <span className="muted" style={{ fontSize: '.8rem' }}>{filtrados.length}/{rows.length}</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr>
            <th>N° Contrato</th><th>Fecha</th>
            <th style={{ textAlign: 'right' }}>Ton procesadas</th>
            <th style={{ textAlign: 'right' }}>Kg Casiterita</th>
            <th style={{ textAlign: 'right' }}>Ton × 1000</th>
            <th style={{ textAlign: 'right' }}>Tenor %</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !filtrados.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Sin registros.</td></tr>}
            {!loading && filtrados.map((r) => (
              <tr key={r.numero}>
                <td className="mono"><strong>{r.numero}</strong></td>
                <td>{date(r.fecha)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(r.ton)}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--primary-3)', fontWeight: 700 }}>{num(r.kg)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(r.tonMil)}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{pct(r.tenor)}</td>
              </tr>
            ))}
          </tbody>
          {!loading && filtrados.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td colSpan={2}>TOTALES</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(tot.ton)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(tot.kg)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(tot.tonMil)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{pct(tot.tenor)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {correoOpen && (
        <CorreoReporteModal
          titulo="Enviar Tenor Promedio Diarios"
          descripcion={`Se enviará el PDF del tenor (${filtrados.length} registro(s)${hayFiltro ? ', con el filtro aplicado' : ''}).`}
          defaultEmail={defaultEmail}
          onEnviar={async (emails) => {
            const { destinatarios } = await enviarTenorPorCorreo(filtrados, emails, { filtro: hayFiltro ? 'filtrado' : undefined });
            return destinatarios;
          }}
          onClose={() => setCorreoOpen(false)}
        />
      )}
    </Modal>
  );
}
