import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { date, dosDecimales } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import type { ContratoAcopio } from '@/shared/lib/types';
import { listContratos, setMesaContrato } from './contratos.repository';

/**
 * KG MESAS · merma por humedad por contrato (réplica de la hoja de mesas).
 * Cada contrato lleva dos pesos manuales (Mojado / Seco) y el sistema calcula:
 *   Merma en Kg = Pesos Seco − Pesos Mojado          (admite negativos)
 *   % Merma     = Merma en Kg / Pesos Mojado × 100
 * Arriba, tarjetas con los totales de cada columna. Realtime.
 */

const fmt2 = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—'
    : Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—'
    : `${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const parse = (s: string) => { const n = Number(s); return s.trim() === '' || !Number.isFinite(n) ? null : n; };

export function KgMesasModal({ onClose }: { onClose: () => void }) {
  const { can } = usePermissions();
  const canWrite = can('produccion', 'escritura');

  const [contratos, setContratos] = useState<ContratoAcopio[]>([]);
  const [loading, setLoading] = useState(true);
  const [fTexto, setFTexto] = useState('');
  // Borradores de edición por contrato (lo que se está tecleando).
  const [draft, setDraft] = useState<Record<string, { mojado: string; seco: string }>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => { setContratos(await listContratos()); }, []);
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    cargar().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [cargar]);
  useRealtime(['acopio_contratos'], () => { void cargar(); });

  // Valor mostrado en cada celda: el borrador si se está editando, si no el guardado.
  const valorMojado = (c: ContratoAcopio) => draft[c.id]?.mojado ?? (c.mesa_peso_mojado == null ? '' : String(c.mesa_peso_mojado));
  const valorSeco = (c: ContratoAcopio) => draft[c.id]?.seco ?? (c.mesa_peso_seco == null ? '' : String(c.mesa_peso_seco));

  function setCampo(c: ContratoAcopio, campo: 'mojado' | 'seco', valor: string) {
    const v = dosDecimales(valor);
    setDraft((d) => ({ ...d, [c.id]: { mojado: valorMojado(c), seco: valorSeco(c), [campo]: v } }));
  }

  async function guardar(c: ContratoAcopio) {
    const d = draft[c.id];
    if (!d) return;
    const mojado = parse(d.mojado), seco = parse(d.seco);
    // Sin cambios respecto a lo guardado → no llamar a la BD.
    if (mojado === (c.mesa_peso_mojado ?? null) && seco === (c.mesa_peso_seco ?? null)) {
      setDraft((p) => { const { [c.id]: _omit, ...rest } = p; return rest; });
      return;
    }
    setGuardando(c.id);
    try {
      await setMesaContrato(c.id, mojado, seco);
      setDraft((p) => { const { [c.id]: _omit, ...rest } = p; return rest; });
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setGuardando(null); }
  }

  // Orden cronológico (más viejo → nuevo) y filtro por número/fecha.
  const filas = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    return contratos
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .filter((c) => !q || `${c.numero} ${c.fecha} ${date(c.created_at)}`.toLowerCase().includes(q))
      .map((c) => {
        const mojado = parse(valorMojado(c));
        const seco = parse(valorSeco(c));
        const merma = mojado != null && seco != null ? seco - mojado : null;
        const pct = merma != null && mojado ? (merma / mojado) * 100 : null;
        return { c, mojado, seco, merma, pct };
      });
  }, [contratos, fTexto, draft]);

  // Totales (tarjetas): sumatorias de cada columna sobre todas las filas mostradas.
  const tot = useMemo(() => {
    let mojado = 0, seco = 0, merma = 0;
    for (const f of filas) {
      if (f.mojado != null) mojado += f.mojado;
      if (f.seco != null) seco += f.seco;
      if (f.merma != null) merma += f.merma;
    }
    const pct = mojado ? (merma / mojado) * 100 : null;
    return { mojado, seco, merma, pct };
  }, [filas]);

  const Kpi = ({ titulo, valor, color, destacar }: { titulo: string; valor: string; color?: string; destacar?: boolean }) => (
    <div className="card" style={destacar ? { borderColor: 'var(--primary)', borderWidth: 2, background: 'linear-gradient(135deg, var(--surface-2), var(--surface))' } : undefined}>
      <div className="card-title"><span>{titulo}</span></div>
      <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{valor}</div>
    </div>
  );

  const footer = <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>;

  return (
    <Modal title="⚖ KG MESAS · Merma por humedad" size="xl" onClose={onClose} footer={footer}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <Kpi titulo="Total Pesos Mojados (Kg)" valor={fmt2(tot.mojado)} color="var(--primary-3)" destacar />
        <Kpi titulo="Total Pesos Seco (Kg)" valor={fmt2(tot.seco)} color="var(--primary-3)" />
        <Kpi titulo="Merma en Kg" valor={fmt2(tot.merma)} color={tot.merma < 0 ? 'var(--danger)' : 'var(--success, #45c08a)'} />
        <Kpi titulo="% de Merma" valor={fmtPct(tot.pct)} color={(tot.pct ?? 0) < 0 ? 'var(--danger)' : 'var(--success, #45c08a)'} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.6rem' }}>
        <div style={{ position: 'relative' }}>
          <input className="input" type="search" value={fTexto} onChange={(e) => setFTexto(e.target.value)}
            placeholder="🔍 Buscar (contrato, fecha…)" style={{ width: 240, paddingRight: fTexto ? '1.6rem' : undefined }} />
          {fTexto && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFTexto('')} title="Limpiar"
            style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>}
        </div>
      </div>

      {loading ? <EmptyState message="Cargando…" icon="◔" /> : !filas.length ? (
        <EmptyState message="Sin contratos. Al crear un contrato aparecerá aquí para cargar sus pesos de mesa." icon="⚖" />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Fecha de creación</th>
                <th style={{ textAlign: 'right' }}>Pesos Mojado (Kg)</th>
                <th style={{ textAlign: 'right' }}>Pesos Seco (Kg)</th>
                <th title="Pesos Seco − Pesos Mojado (admite negativo)" style={{ textAlign: 'right' }}>Merma en Kg ⓘ</th>
                <th title="Merma en Kg ÷ Pesos Mojado × 100" style={{ textAlign: 'right' }}>% Merma Humedad ⓘ</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ c, merma, pct }) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700 }} className="mono">{c.numero}</td>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{date(c.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input className="input mono" inputMode="decimal" disabled={!canWrite || guardando === c.id}
                      value={valorMojado(c)} placeholder="0.00" style={{ width: 110, textAlign: 'right' }}
                      onChange={(e) => setCampo(c, 'mojado', e.target.value)} onBlur={() => void guardar(c)} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input className="input mono" inputMode="decimal" disabled={!canWrite || guardando === c.id}
                      value={valorSeco(c)} placeholder="0.00" style={{ width: 110, textAlign: 'right' }}
                      onChange={(e) => setCampo(c, 'seco', e.target.value)} onBlur={() => void guardar(c)} />
                  </td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 800, color: merma == null ? undefined : merma < 0 ? 'var(--danger)' : 'var(--success, #45c08a)' }}>{fmt2(merma)}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: pct == null ? undefined : pct < 0 ? 'var(--danger)' : 'var(--success, #45c08a)' }}>{fmtPct(pct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border, rgba(255,255,255,.15))' }}>
                <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>Totales</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary-3)' }}>{fmt2(tot.mojado)}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary-3)' }}>{fmt2(tot.seco)}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 800, color: tot.merma < 0 ? 'var(--danger)' : 'var(--success, #45c08a)' }}>{fmt2(tot.merma)}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 800, color: (tot.pct ?? 0) < 0 ? 'var(--danger)' : 'var(--success, #45c08a)' }}>{fmtPct(tot.pct)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="muted" style={{ fontSize: '.74rem', marginTop: '.5rem' }}>
            <strong>Merma en Kg</strong> = Pesos Seco − Pesos Mojado (admite negativo) · <strong>% Merma</strong> = Merma ÷ Pesos Mojado × 100.
            Los pesos se guardan solos al salir del campo. El <strong>Pesos Mojado</strong> se refleja en la observación del contrato como «Material de Mesa: …».
          </p>
        </div>
      )}
    </Modal>
  );
}
