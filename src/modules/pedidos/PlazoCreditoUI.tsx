import { useEffect, useMemo, useRef, useState } from 'react';
import type { Orden } from '@/shared/lib/types';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { guardarPlazoCreditoOrden } from './pedidos.repository';
import {
  diasEntreFechas,
  evaluarCreditoOrden,
  fmtFechaCredito,
  hoyCreditoVE,
  leerPlazoCreditoOrden,
  listarAlertasCreditosPorVencer,
  normalizarPlazoCredito,
  soloDiaIso,
  sumarDiasCredito,
  type ModoPlazoCredito,
  type PlazoCreditoConfig,
} from './creditoPlazo';

const DIAS_SUGERIDOS = [7, 15, 30, 45];

/**
 * Selector reutilizable para configurar las condiciones de una cuenta a crédito:
 * - Días en los que vence el crédito (y su fecha de vencimiento)
 * - O si la compra primero se recibe y luego se paga.
 */
export function PlazoCreditoFields({
  value,
  onChange,
  fechaBaseIso,
}: {
  value: PlazoCreditoConfig | null;
  onChange: (next: PlazoCreditoConfig | null) => void;
  fechaBaseIso?: string | null;
}) {
  const baseDia = soloDiaIso(fechaBaseIso) || hoyCreditoVE();
  const modo: ModoPlazoCredito = value?.modo ?? 'dias';
  const diasStr = value?.dias != null && value.dias > 0 ? String(value.dias) : '';
  const fechaVenc = value?.fecha_vencimiento ?? '';
  const primeroRecibe = modo === 'recibe_primero' ? true : Boolean(value?.primero_recibe);

  const actualizarModo = (nuevoModo: ModoPlazoCredito) => {
    if (nuevoModo === 'recibe_primero') {
      onChange({
        modo: 'recibe_primero',
        dias: value?.dias ?? null,
        fecha_vencimiento: value?.fecha_vencimiento ?? null,
        primero_recibe: true,
      });
    } else {
      const d = value?.dias && value.dias > 0 ? value.dias : 15;
      onChange({
        modo: 'dias',
        dias: d,
        fecha_vencimiento: value?.fecha_vencimiento || sumarDiasCredito(baseDia, d),
        primero_recibe: false,
      });
    }
  };

  const cambiarDias = (raw: string) => {
    const limpio = raw.replace(/\D/g, '');
    const n = limpio ? Math.max(1, parseInt(limpio, 10)) : null;
    const nuevaFecha = modo === 'dias' && n ? sumarDiasCredito(baseDia, n) : (n ? value?.fecha_vencimiento ?? null : null);
    onChange(
      normalizarPlazoCredito({
        modo,
        dias: n,
        fecha_vencimiento: nuevaFecha,
        primero_recibe: primeroRecibe,
      }),
    );
  };

  const cambiarFecha = (nuevaFecha: string) => {
    const f = soloDiaIso(nuevaFecha);
    const calcDias = f ? Math.max(0, diasEntreFechas(baseDia, f)) : (value?.dias ?? null);
    onChange(
      normalizarPlazoCredito({
        modo,
        dias: calcDias && calcDias > 0 ? calcDias : null,
        fecha_vencimiento: f,
        primero_recibe: primeroRecibe,
      }),
    );
  };

  return (
    <div
      className="card"
      style={{
        padding: '.7rem .85rem',
        marginTop: '.5rem',
        border: '1px solid rgba(245, 158, 11, 0.45)',
        background: 'rgba(245, 158, 11, 0.06)',
        display: 'grid',
        gap: '.55rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem' }}>
        <strong style={{ fontSize: '.83rem', color: 'var(--warning, #f59e0b)' }}>
          💳 Condición y vencimiento de la cuenta a crédito
        </strong>
        <span className="muted" style={{ fontSize: '.72rem' }}>
          Visible en Compras y Tesorería (alerta automática a 2 y 1 día de vencer)
        </span>
      </div>

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn btn-sm ${modo === 'dias' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => actualizarModo('dias')}
        >
          📅 Vence por días de crédito
        </button>
        <button
          type="button"
          className={`btn btn-sm ${modo === 'recibe_primero' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => actualizarModo('recibe_primero')}
        >
          📦 Primero se recibe y luego se paga
        </button>
      </div>

      {modo === 'dias' ? (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: '.2rem' }}>
              <label style={{ fontSize: '.75rem', margin: 0 }}>Días en que vence el crédito *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <input
                  className="input mono"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Ej: 15"
                  style={{ width: 95 }}
                  value={diasStr}
                  onChange={(e) => cambiarDias(e.target.value)}
                />
                <span className="muted" style={{ fontSize: '.78rem' }}>día(s)</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', paddingBottom: '.15rem' }}>
              {DIAS_SUGERIDOS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`btn btn-xs ${value?.dias === d ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => cambiarDias(String(d))}
                >
                  {d}d
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: '.2rem' }}>
              <label style={{ fontSize: '.75rem', margin: 0 }}>Fecha de vencimiento</label>
              <input
                className="input mono"
                type="date"
                value={fechaVenc}
                onChange={(e) => cambiarFecha(e.target.value)}
              />
            </div>
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={primeroRecibe}
              onChange={(e) =>
                onChange(
                  normalizarPlazoCredito({
                    modo: 'dias',
                    dias: value?.dias ?? null,
                    fecha_vencimiento: value?.fecha_vencimiento ?? null,
                    primero_recibe: e.target.checked,
                  }),
                )
              }
            />
            <span>📦 Además, la compra <strong>primero se recibe y luego se paga</strong></span>
          </label>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <div style={{ fontSize: '.8rem' }}>
            📦 Marcado como <strong>«Primero se recibe la compra/servicio y luego se paga»</strong>. Aparecerá indicado así en Compras y Tesorería.
          </div>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: '.2rem' }}>
              <label style={{ fontSize: '.75rem', margin: 0 }}>Días de crédito tras recibir <span className="muted">(opcional)</span></label>
              <input
                className="input mono"
                type="number"
                min={1}
                step={1}
                placeholder="Al recibir"
                style={{ width: 120 }}
                value={diasStr}
                onChange={(e) => cambiarDias(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gap: '.2rem' }}>
              <label style={{ fontSize: '.75rem', margin: 0 }}>Fecha límite de pago <span className="muted">(opcional)</span></label>
              <input
                className="input mono"
                type="date"
                value={fechaVenc}
                onChange={(e) => cambiarFecha(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {fechaVenc && (
        <small className="muted">
          🔔 Vence el <strong>{fmtFechaCredito(fechaVenc)}</strong> · El sistema emitirá alerta en Compras y Tesorería cuando falten <strong>2 días</strong> y <strong>1 día</strong> para vencer.
        </small>
      )}
    </div>
  );
}

/** Badge compacto de plazo/vencimiento para tarjetas y tablas de Compras y Tesorería. */
export function BadgePlazoCredito({ orden }: { orden: Orden }) {
  const ev = evaluarCreditoOrden(orden);
  if (!ev.esCredito) return null;
  if (!ev.plazo) {
    return (
      <span className="badge" style={{ fontSize: '.72rem', background: 'rgba(148,163,184,0.16)', color: '#cbd5e1' }}>
        💳 Crédito (sin plazo definido)
      </span>
    );
  }
  const bg =
    ev.nivel === 'vencido' || ev.nivel === 'hoy'
      ? 'rgba(239, 68, 68, 0.2)'
      : ev.nivel === 'por_vencer'
        ? 'rgba(245, 158, 11, 0.22)'
        : 'rgba(56, 189, 248, 0.16)';
  const fg =
    ev.nivel === 'vencido' || ev.nivel === 'hoy'
      ? '#fca5a5'
      : ev.nivel === 'por_vencer'
        ? '#fcd34d'
        : '#7dd3fc';
  const icono =
    ev.nivel === 'vencido'
      ? '⛔'
      : ev.nivel === 'hoy' || ev.nivel === 'por_vencer'
        ? '🚨'
        : ev.primeroRecibe
          ? '📦'
          : '📅';

  return (
    <span
      className="badge"
      style={{
        fontSize: '.73rem',
        background: bg,
        color: fg,
        border: `1px solid ${fg}44`,
        fontWeight: ev.disparaAlerta ? 700 : 500,
      }}
    >
      {icono} {ev.etiquetaCorta}
    </span>
  );
}

/** Modal rápido para definir o editar el vencimiento / modalidad de crédito en una orden existente. */
export function EditarPlazoCreditoModal({
  orden,
  actorEmail,
  onClose,
  onSaved,
}: {
  orden: Orden;
  actorEmail: string;
  onClose: () => void;
  onSaved: (updated: Orden) => void | Promise<void>;
}) {
  const inicial = useMemo(() => {
    const prev = leerPlazoCreditoOrden(orden);
    if (prev) return prev;
    const base = soloDiaIso(orden.oc_aprobada_en || orden.oc_creada_en || orden.created_at) || hoyCreditoVE();
    return { modo: 'dias' as const, dias: 15, fecha_vencimiento: sumarDiasCredito(base, 15), primero_recibe: false };
  }, [orden]);

  const [plazo, setPlazo] = useState<PlazoCreditoConfig | null>(inicial);
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!plazo) {
      toast('Indica los días de vencimiento o marca que primero se recibe y luego se paga.', 'warning');
      return;
    }
    if (plazo.modo === 'dias' && !(plazo.dias && plazo.dias > 0) && !plazo.fecha_vencimiento) {
      toast('Indica en cuántos días vence el crédito.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const actualizada = await guardarPlazoCreditoOrden(orden, plazo, actorEmail || 'sistema');
      toast('Condición de crédito actualizada en Compras y Tesorería.', 'success');
      await onSaved(actualizada);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar el plazo de crédito', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`💳 Plazo de crédito · ${orden.oc_codigo ?? orden.codigo}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar plazo de crédito'}
          </button>
        </>
      }
    >
      <PlazoCreditoFields
        value={plazo}
        onChange={setPlazo}
        fechaBaseIso={orden.oc_aprobada_en || orden.oc_creada_en || orden.created_at}
      />
    </Modal>
  );
}

/**
 * Banner de alerta prominente + notificación en campana cuando una cuenta a crédito (OC u OS)
 * está a 2 días o 1 día de su fecha de vencimiento (o vence hoy / está vencida).
 * Se muestra tanto en Compras como en Tesorería.
 */
export function AlertaCreditosPorVencerBanner({
  ordenes,
  proveedoresMap,
  modulo,
  onSelectOrden,
}: {
  ordenes: Orden[];
  proveedoresMap?: Map<string, string>;
  modulo: 'compras' | 'tesoreria';
  onSelectOrden?: (orden: Orden) => void;
}) {
  const hoy = hoyCreditoVE();
  const alertas = useMemo(() => listarAlertasCreditosPorVencer(ordenes, hoy), [ordenes, hoy]);
  const notificadosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const { orden, evalCredito } of alertas) {
      const cod = orden.oc_codigo ?? orden.codigo;
      const key = `credito-vence-${modulo}-${orden.id}-${hoy}-${evalCredito.diasRestantes}`;
      if (notificadosRef.current.has(key)) continue;
      notificadosRef.current.add(key);
      try {
        const seen = sessionStorage.getItem(key);
        if (seen) continue;
        sessionStorage.setItem(key, '1');
      } catch { /* ignore */ }
      const sigla = orden.tipo === 'servicio' ? 'OS' : 'OC';
      const saldoFmt = `$ ${evalCredito.saldoPendiente.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      notify(
        `🚨 Crédito por pagar [${sigla}] ${cod}: ${evalCredito.mensajeAlerta} · Saldo ${saldoFmt}`,
        evalCredito.diasRestantes !== null && evalCredito.diasRestantes <= 0 ? 'error' : 'warning',
        {
          dedup_key: `credito-vence-${orden.id}-${hoy}-${evalCredito.diasRestantes}`,
          link: modulo === 'tesoreria' ? '#/app/tesoreria' : '#/app/pedidos',
        },
      );
    }
  }, [alertas, hoy, modulo]);

  if (alertas.length === 0) return null;

  return (
    <div
      className="card"
      style={{
        padding: '.8rem 1rem',
        marginBottom: '1rem',
        borderLeft: '4px solid var(--danger, #ef4444)',
        border: '1px solid rgba(239, 68, 68, 0.45)',
        background: 'rgba(239, 68, 68, 0.08)',
        display: 'grid',
        gap: '.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem' }}>
        <div style={{ fontWeight: 800, color: '#fca5a5', fontSize: '.92rem' }}>
          🚨 Alerta de Cuentas a Crédito por Pagar ({alertas.length} próxima(s) a vencer o vencida(s))
        </div>
        <span className="muted" style={{ fontSize: '.76rem' }}>
          Aviso automático a 2 días y 1 día de la fecha de vencimiento
        </span>
      </div>

      <div style={{ display: 'grid', gap: '.4rem' }}>
        {alertas.map(({ orden, evalCredito }) => {
          const sigla = orden.tipo === 'servicio' ? 'OS' : 'OC';
          const cod = orden.oc_codigo ? `${orden.oc_codigo} (${orden.codigo})` : orden.codigo;
          const prov = (orden.proveedor_id && proveedoresMap?.get(orden.proveedor_id)) || '';
          const saldoFmt = `$ ${evalCredito.saldoPendiente.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return (
            <div
              key={orden.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '.6rem',
                flexWrap: 'wrap',
                padding: '.45rem .65rem',
                borderRadius: 6,
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', fontSize: '.83rem' }}>
                <span className="badge" style={{ background: sigla === 'OS' ? 'rgba(56,189,248,0.2)' : 'rgba(249,115,22,0.2)', color: sigla === 'OS' ? '#38bdf8' : '#fb923c', fontWeight: 700 }}>
                  {sigla}
                </span>
                <strong className="mono">{cod}</strong>
                {prov && <span>· {prov}</span>}
                <span style={{ color: '#fcd34d', fontWeight: 700 }}>· {evalCredito.mensajeAlerta}</span>
                {evalCredito.primeroRecibe && (
                  <span className="muted" style={{ fontSize: '.76rem' }}>
                    · 📦 {evalCredito.yaRecibida ? 'Ya recibida' : 'Pendiente por recibir'}
                  </span>
                )}
                <span>
                  · Saldo pendiente: <strong className="mono" style={{ color: '#fca5a5' }}>{saldoFmt}</strong>
                </span>
              </div>
              {onSelectOrden && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => onSelectOrden(orden)}
                >
                  {modulo === 'tesoreria' ? '💳 Pagar / Abonar crédito' : '👁 Ver cuenta a crédito'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
