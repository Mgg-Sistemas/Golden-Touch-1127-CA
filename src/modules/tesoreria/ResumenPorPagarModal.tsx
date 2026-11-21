/* ============================================================
   Golden Touch · Tesorería · Resumen por WhatsApp de cuentas a crédito OC/OS
   (19-11-2026)

   Adaptación GT del `ResumenPorPagarModal` de MGG para el lote de cuentas a
   crédito de Compras: cada fila es una OC/OS con su SALDO pendiente, se eligen
   todas o una a una, se indica si se pagará y el mensaje separa OC de OS con
   sus subtotales. Nada se envía solo: se ve y se copia/comparte desde aquí.

   (GT usa `CompartirWhatsapp`, no el `MensajeWhatsappModal` de MGG.)
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { identidadEmpresa } from '@/shared/lib/empresa';
import type { OrdenPorPagar } from '@/modules/pedidos/pedidos.repository';
import { resolverInfoCredito } from '@/modules/pedidos/creditoVencimiento';
import { getTasaHoy, round2 } from './tasas.repository';
import { MOTIVOS_NO_PAGO, type MotivoLote } from './motivoPagoWhatsapp';
import {
  errorResumenPorPagar, textoResumenPorPagar, textoCreditosAlDia, textoTesoreriaAlDia,
  type ItemResumenPorPagar,
} from './resumenPorPagarWhatsapp';

interface Fila {
  id: string;
  codigo: string;
  proveedor: string;
  monto: number;
  moneda: string;
  esCredito?: boolean;
  tipoCredito?: 'OC' | 'OS';
  fechaVencimiento?: string | null;
}

const esBs = (m: string | null | undefined) => (m ?? '').toUpperCase() === 'BS';

function esOrdenServicio(r: OrdenPorPagar): boolean {
  const o = r.orden as OrdenPorPagar['orden'] & { clase?: string | null };
  if (o.clase === 'servicio' || o.tipo === 'servicio') return true;
  const cod = String(o.oc_codigo || o.codigo || '').trim().toUpperCase();
  return cod.startsWith('CS-') || cod.startsWith('OS-') || cod.startsWith('SV-') || cod.startsWith('SD-');
}

/** Motivos disponibles en el desplegable (GT los reutiliza del aviso individual). */
const OPCIONES_MOTIVO: MotivoLote[] = ['si', ...MOTIVOS_NO_PAGO];

export function ResumenPorPagarModal({ rows, onClose, creditos = false }: {
  /** OC/OS a crédito con saldo pendiente (o las OC por pagar si `creditos` es false). */
  rows: OrdenPorPagar[];
  onClose: () => void;
  /** El monto de cada fila es el SALDO (créditos de Compras). */
  creditos?: boolean;
}) {
  const filas = useMemo<Fila[]>(() => rows.map((r) => {
    const infoCr = resolverInfoCredito(r.orden);
    return {
      id: r.orden.id,
      codigo: r.orden.oc_codigo ?? r.orden.codigo ?? '—',
      proveedor: r.proveedorNombre || '—',
      monto: creditos
        ? Math.max(0, round2((Number(r.orden.total) || 0) - (Number(r.orden.abonado_total) || 0)))
        : Number(r.montoAPagar) || 0,
      moneda: r.orden.total_moneda ?? (r.orden as OrdenPorPagar['orden'] & { moneda?: string | null }).moneda ?? 'USD',
      esCredito: creditos,
      tipoCredito: esOrdenServicio(r) ? 'OS' as const : 'OC' as const,
      fechaVencimiento: infoCr.fechaVencimientoFmt,
    };
  }), [rows, creditos]);

  const [tasa, setTasa] = useState(0);
  useEffect(() => { getTasaHoy().then((t) => setTasa(Number(t.usd) || 0)).catch(() => setTasa(0)); }, []);
  const enUsd = (f: Fila) => (esBs(f.moneda) ? (tasa > 0 ? round2(f.monto / tasa) : 0) : round2(f.monto));

  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(filas.map((f) => f.id)));
  const [motivos, setMotivos] = useState<Record<string, MotivoLote>>({});
  const [detalles, setDetalles] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState<string | null>(null);

  const todas = filas.length > 0 && filas.every((f) => marcadas.has(f.id));
  const seleccionadas = filas.filter((f) => marcadas.has(f.id));
  const hayBsSinTasa = tasa <= 0 && seleccionadas.some((f) => esBs(f.moneda));
  const totalSel = round2(seleccionadas.reduce((a, f) => a + enUsd(f), 0));

  function toggle(id: string) {
    setMarcadas((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function aplicarATodas(m: MotivoLote) {
    setMotivos(Object.fromEntries(seleccionadas.map((f) => [f.id, m])));
  }
  function generar() {
    if (!filas.length) { setTexto(creditos ? textoCreditosAlDia(new Date()) : textoTesoreriaAlDia(new Date())); return; }
    if (hayBsSinTasa) { toast('No hay tasa BCV del día: no se pueden pasar a $ las cuentas en Bs.', 'error'); return; }
    const items: ItemResumenPorPagar[] = seleccionadas.map((f) => ({
      codigo: f.codigo, proveedor: f.proveedor, montoUsd: enUsd(f),
      motivo: motivos[f.id] ?? 'si', motivoDetalle: detalles[f.id] ?? null,
      esCredito: f.esCredito, tipoCredito: f.tipoCredito,
      fechaVencimiento: f.fechaVencimiento,
    }));
    const err = errorResumenPorPagar(items);
    if (err) { toast(err, 'error'); return; }
    setTexto(textoResumenPorPagar(items, new Date(), { creditos }));
  }

  return (
    <Modal
      title={creditos ? '💬 Resumen por WhatsApp · Cuentas a crédito (OC / OS)' : '💬 Resumen por WhatsApp · Órdenes por pagar'}
      size="lg"
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" disabled={filas.length > 0 && !seleccionadas.length} onClick={generar}>
          {filas.length ? `💬 Generar resumen (${seleccionadas.length})` : '💬 Generar «Sin créditos pendientes»'}
        </button>
      </>}
    >
      <p className="hint muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Marca todas o una a una e indica el <strong>motivo de pago</strong> de cada una. El mensaje lleva el código, el proveedor,
        el <strong>saldo</strong> en $ de cada crédito, los subtotales OC/OS, el total, la fecha en que se genera
        y la <strong>identidad de {identidadEmpresa('GT').nombre}</strong>.
      </p>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.6rem' }}>
        <label style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}>
          <input type="checkbox" checked={todas} onChange={() => setMarcadas(todas ? new Set() : new Set(filas.map((f) => f.id)))} />
          Seleccionar todas
        </label>
        <span className="muted" style={{ fontSize: '.8rem', marginLeft: 'auto' }}>Motivo para las marcadas:</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => aplicarATodas('si')}>✓ Todas se pagan</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => aplicarATodas('No procede esta compra')}>✕ No procede</button>
      </div>
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr>
            <th style={{ width: 28 }}></th><th>Código</th><th>Proveedor</th>
            <th style={{ textAlign: 'right' }}>Saldo $</th><th>Motivo de pago</th>
          </tr></thead>
          <tbody>
            {!filas.length && <tr><td colSpan={5} style={{ textAlign: 'center', fontWeight: 700 }}>
              CUENTAS A CRÉDITO (OC Y OS) PENDIENTES: 0 · <span style={{ color: 'var(--success)' }}>✅ TESORERÍA AL DÍA EN CUENTAS A CRÉDITO</span>
            </td></tr>}
            {filas.map((f) => {
              const m = motivos[f.id] ?? 'si';
              const marcada = marcadas.has(f.id);
              return (
                <tr key={f.id} style={{ opacity: marcada ? 1 : 0.5 }}>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={marcada} onChange={() => toggle(f.id)} /></td>
                  <td className="mono">
                    {f.codigo}
                    {!creditos && f.esCredito && (
                      <span className="badge" style={{ marginLeft: '.35rem', background: '#dc2626', color: '#fff', fontSize: '.64rem', fontWeight: 700 }}>
                        💳 CRÉDITO {f.tipoCredito ?? 'OC'}
                      </span>
                    )}
                  </td>
                  <td>{f.proveedor}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {esBs(f.moneda) && tasa <= 0 ? '—' : `$${enUsd(f).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                  <td>
                    <select className="input" style={{ minWidth: 200 }} value={m} disabled={!marcada}
                      onChange={(e) => setMotivos((p) => ({ ...p, [f.id]: e.target.value as MotivoLote }))}>
                      {OPCIONES_MOTIVO.map((k) => (
                        <option key={k} value={k}>{k === 'si' ? '✓ ' : '✕ '}{k}</option>
                      ))}
                    </select>
                    {(m === 'Otro' || m === 'No procede esta compra') && marcada && (
                      <input className="input" style={{ marginTop: '.3rem' }} placeholder="Escribe el motivo"
                        value={detalles[f.id] ?? ''} onChange={(e) => setDetalles((p) => ({ ...p, [f.id]: e.target.value }))} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {seleccionadas.length > 0 && (
            <tfoot><tr>
              <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Total ({seleccionadas.length})</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>${totalSel.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td></td>
            </tr></tfoot>
          )}
        </table>
      </div>
      {hayBsSinTasa && <p className="hint" style={{ color: 'var(--danger)' }}>Falta la tasa BCV del día para pasar a $ las cuentas en Bs.</p>}
      {texto && (
        <div style={{ ...{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: 8, padding: '.75rem', marginTop: '.75rem' } }}>
          <div style={{ fontWeight: 800, marginBottom: '.5rem' }}>📋 Resumen · Cuentas a crédito</div>
          <CompartirWhatsapp texto={texto} />
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '.5rem' }} onClick={() => setTexto(null)}>← Volver a la selección</button>
        </div>
      )}
    </Modal>
  );
}
