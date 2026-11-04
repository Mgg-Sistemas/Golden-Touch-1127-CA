/* ============================================================
   Golden Touch · Administración · pestaña «Configuración»
   Referencia y transparencia del módulo (no duplica catálogos de otros
   sitios): la tasa BCV del día que usan los equivalentes, la base legal de
   los parafiscales (FAOV) que calcula la calculadora, de dónde salen las
   categorías/proveedores (compartidos con Tesorería/Pedidos) y el acceso a
   la lista de empresas. Solo lectura, salvo el botón de empresas (full).
   ============================================================ */
import { useEffect, useState } from 'react';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';
import { FAOV_TIERS } from './administracionParafiscal';
import type { Empresa } from './admin.repository';

const num2 = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fFecha = (s: string | null) => (s ? new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${s}T00:00:00`)) : '—');

export function ConfiguracionTab({ empresas, puedeFull = true, onGestionarEmpresas }: {
  empresas: Empresa[];
  puedeFull?: boolean;
  onGestionarEmpresas?: () => void;
}) {
  const [tasa, setTasa] = useState<{ usd: number; eur: number; fecha: string | null } | null>(null);
  const [cargandoTasa, setCargandoTasa] = useState(true);

  useEffect(() => {
    let vivo = true;
    getTasaHoy()
      .then((t) => { if (vivo) setTasa({ usd: Number(t?.usd) || 0, eur: Number(t?.eur) || 0, fecha: t?.fecha ?? null }); })
      .catch(() => { if (vivo) setTasa(null); })
      .finally(() => { if (vivo) setCargandoTasa(false); });
    return () => { vivo = false; };
  }, []);

  const activas = empresas.filter((e) => e.activa).length;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Tasa BCV en uso */}
      <div className="card">
        <div className="card-title">💱 Tasa BCV del día</div>
        <p className="muted hint" style={{ marginTop: '.2rem' }}>
          Es la tasa que usan los equivalentes del tablero, el reporte y la calculadora de parafiscales. Sale de Tesorería (la misma de todo el sistema).
        </p>
        {cargandoTasa ? (
          <p className="muted" style={{ marginTop: '.4rem' }}>Leyendo la tasa…</p>
        ) : tasa && (tasa.usd > 0 || tasa.eur > 0) ? (
          <div className="adm-kpis" style={{ marginTop: '.6rem', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="adm-kpi oro"><span className="adm-kpi-lbl">USD</span><span className="adm-kpi-num">{num2(tasa.usd)}</span><span className="adm-kpi-sub">Bs por dólar</span></div>
            <div className="adm-kpi oro"><span className="adm-kpi-lbl">EUR</span><span className="adm-kpi-num">{num2(tasa.eur)}</span><span className="adm-kpi-sub">Bs por euro</span></div>
            <div className="adm-kpi"><span className="adm-kpi-lbl">Fecha</span><span className="adm-kpi-num" style={{ fontSize: '1.05rem' }}>{fFecha(tasa.fecha)}</span><span className="adm-kpi-sub">última publicada</span></div>
          </div>
        ) : (
          <div className="adm-aviso" style={{ marginTop: '.5rem' }}>No hay tasa cargada (inicia sesión o cárgala en Tesorería). Mientras tanto, los equivalentes usan 40 Bs/USD de respaldo.</div>
        )}
      </div>

      {/* Parafiscales (FAOV) */}
      <div className="card">
        <div className="card-title">⚖ Parafiscales · FAOV / BANAVIH</div>
        <p className="muted hint" style={{ marginTop: '.2rem' }}>
          Base de la calculadora (pestaña Movimientos → «Parafiscal»). Según Gaceta Extra 6.805, art. 98, la multa = <b>factor × la tasa BCV de mayor valor</b>, según el tamaño de la nómina. Los factores son fijos por ley.
        </p>
        <div className="adm-tabla" style={{ marginTop: '.6rem' }}>
          <table>
            <thead><tr><th>Tamaño de la nómina</th><th style={{ textAlign: 'right' }}>Factor</th></tr></thead>
            <tbody>
              {FAOV_TIERS.map((t) => (
                <tr key={t.nivel}><td>{t.label}</td><td className="mono" style={{ textAlign: 'right' }}><span className="adm-chip">{t.factor}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {tasa && (tasa.usd > 0 || tasa.eur > 0) && (
          <p className="muted hint" style={{ marginTop: '.5rem', fontSize: '.78rem' }}>
            Ejemplo hoy (≤50 trabajadores): 165 × {num2(Math.max(tasa.usd, tasa.eur))} = <b>Bs {num2(165 * Math.max(tasa.usd, tasa.eur))}</b>.
          </p>
        )}
      </div>

      {/* Catálogos compartidos */}
      <div className="card">
        <div className="card-title">🗂 Catálogos y empresas</div>
        <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem', display: 'grid', gap: '.4rem', lineHeight: 1.5 }}>
          <li><b>Categorías de gasto</b> y <b>proveedores</b>: se comparten con Tesorería y Pedidos. Se agregan y editan desde allá para que todo el sistema use los mismos.</li>
          <li><b>Empresas del módulo</b>: {empresas.length} registrada(s), {activas} activa(s). Es la lista propia de Administración (razón social, RIF, moneda, logo).</li>
        </ul>
        {puedeFull && onGestionarEmpresas && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '.4rem' }} onClick={onGestionarEmpresas}>⚙ Gestionar empresas</button>
        )}
      </div>
    </div>
  );
}
