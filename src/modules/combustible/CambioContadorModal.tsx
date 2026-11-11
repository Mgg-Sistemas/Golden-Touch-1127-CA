/* ============================================================
   Golden Touch · Combustible · «Se cambió el contador del tanque»
   (10/11/2026)

   Cuando a un tanque se le daña el contador y se pone uno nuevo, el aparato
   arranca en cero. Aquí se deja asentado con cuánto quedó el viejo, para que
   el sistema siga sumando desde ahí y no se pierda lo ya surtido.

   NO toca ni un solo movimiento ya guardado: solo cambia cómo se interpretan
   las lecturas DE AHÍ EN ADELANTE.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import {
  listCambiosContador, registrarCambioContador, acumuladoActualTanque,
  ultimaFechaMovimientoTanque, type CambioContadorTanque,
} from './tanques.repository';
import { aAcumulado, motivoNoRegistrable } from './arrastreContador';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const nLitros = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
const fFecha = (s: string) =>
  new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${s}T00:00:00`));

export function CambioContadorModal({ tanque, actor, onClose, onGuardado }: {
  tanque: { id: string; nombre: string };
  actor?: string | null;
  onClose: () => void;
  onGuardado?: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState<CambioContadorTanque[]>([]);
  const [ultimaFecha, setUltimaFecha] = useState<string | null>(null);

  const [fecha, setFecha] = useState(hoyISO());
  const [cierre, setCierre] = useState('');
  const [arranque, setArranque] = useState('0');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    Promise.all([
      acumuladoActualTanque(tanque.id),
      ultimaFechaMovimientoTanque(tanque.id),
      listCambiosContador(tanque.id),
    ])
      .then(([acum, ult, hist]) => {
        if (!vivo) return;
        // El cierre se propone solo: es lo que el tanque trae acumulado hoy.
        if (acum != null) setCierre(String(acum));
        setUltimaFecha(ult);
        setHistorial(hist);
      })
      .catch(() => { if (vivo) { setHistorial([]); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [tanque.id]);

  const cierreNum = cierre.trim() === '' ? null : Number(cierre.replace(',', '.'));
  const arranqueNum = arranque.trim() === '' ? null : Number(arranque.replace(',', '.'));

  const impedimento = useMemo(
    () => motivoNoRegistrable({
      fecha,
      ultimaFechaMovimiento: ultimaFecha,
      acumuladoCierre: Number.isFinite(cierreNum as number) ? cierreNum : null,
      lecturaNueva: Number.isFinite(arranqueNum as number) ? arranqueNum : null,
    }),
    [fecha, ultimaFecha, cierreNum, arranqueNum],
  );

  // La frase que hace entender todo: qué va a pasar a partir de mañana.
  const ejemplo = useMemo(() => {
    if (impedimento || cierreNum == null || arranqueNum == null) return null;
    const marca = arranqueNum + 30;
    const verá = aAcumulado(marca, { fecha, acumuladoCierre: cierreNum, lecturaNueva: arranqueNum });
    return { marca, verá };
  }, [impedimento, cierreNum, arranqueNum, fecha]);

  async function guardar() {
    if (impedimento) { toast(impedimento, 'warning', { silent: true }); return; }
    setGuardando(true);
    try {
      await registrarCambioContador({
        tanqueId: tanque.id,
        fecha,
        acumuladoCierre: cierreNum as number,
        lecturaNueva: arranqueNum as number,
        motivo,
        actor,
      });
      toast('Listo: el contador nuevo queda enlazado con lo que ya se había surtido.', 'success');
      onGuardado?.();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo registrar el cambio.', 'error');
    } finally { setGuardando(false); }
  }

  return (
    <Modal
      title={`🔧 Se cambió el contador · ${tanque.nombre}`}
      onClose={onClose}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', width: '100%' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void guardar()}
            disabled={guardando || cargando || !!impedimento}
            style={{ background: '#ff8a00', color: '#000', fontWeight: 700 }}
          >
            {guardando ? 'Guardando…' : 'Registrar el cambio'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
        <p className="muted hint" style={{ margin: 0, fontSize: '.82rem', lineHeight: 1.5 }}>
          Cuando se daña el contador y se pone uno nuevo, el aparato arranca otra vez desde cero.
          Aquí se deja asentado <strong>con cuánto quedó el viejo</strong>, para que el sistema siga
          sumando desde ahí. Quien surta sigue escribiendo lo que marca el aparato, como siempre.
          <br />
          <strong>Nada de lo ya cargado se modifica.</strong>
        </p>

        {cargando ? (
          <p className="muted">Leyendo el tanque…</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', flex: '1 1 150px' }}>
                <span className="muted hint" style={{ fontSize: '.72rem' }}>¿Qué día se cambió?</span>
                <input type="date" className="input input-sm" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={guardando} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', flex: '1 1 170px' }}>
                <span className="muted hint" style={{ fontSize: '.72rem' }}>¿Con cuánto quedó el contador viejo?</span>
                <input
                  type="number" className="input input-sm" value={cierre} min="0" step="0.01"
                  onChange={(e) => setCierre(e.target.value)} disabled={guardando}
                />
                <span className="muted hint" style={{ fontSize: '.68rem' }}>Se propone lo que el tanque trae acumulado. Cámbielo si la última lectura real fue otra.</span>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', flex: '1 1 150px' }}>
                <span className="muted hint" style={{ fontSize: '.72rem' }}>¿En cuánto arranca el nuevo?</span>
                <input
                  type="number" className="input input-sm" value={arranque} min="0" step="0.01"
                  onChange={(e) => setArranque(e.target.value)} disabled={guardando}
                />
                <span className="muted hint" style={{ fontSize: '.68rem' }}>Casi siempre en cero.</span>
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
              <span className="muted hint" style={{ fontSize: '.72rem' }}>¿Por qué se cambió? (opcional)</span>
              <input
                className="input input-sm" value={motivo} maxLength={200}
                onChange={(e) => setMotivo(e.target.value)} disabled={guardando}
                placeholder="Ej: se dañó el contador y se instaló uno nuevo"
              />
            </label>

            {impedimento ? (
              <div style={{ padding: '.6rem .75rem', borderRadius: 6, border: '1px solid #ef4444', background: 'rgba(239,68,68,.12)', color: '#fca5a5', fontSize: '.82rem' }}>
                ⚠ {impedimento}
              </div>
            ) : ejemplo ? (
              <div style={{ padding: '.6rem .75rem', borderRadius: 6, border: '1px solid #10b981', background: 'rgba(16,185,129,.1)', fontSize: '.84rem', lineHeight: 1.5 }}>
                A partir del <strong>{fFecha(fecha)}</strong>: si el contador marca{' '}
                <strong>{nLitros(ejemplo.marca)} L</strong>, el sistema mostrará{' '}
                <strong>{ejemplo.verá == null ? '—' : `${nLitros(ejemplo.verá)} L`}</strong>.
              </div>
            ) : null}

            <div>
              <strong style={{ fontSize: '.82rem' }}>Cambios ya registrados en este tanque</strong>
              {historial.length === 0 ? (
                <EmptyState icon="🔧" message="Es el primer cambio de contador de este tanque." />
              ) : (
                <div className="adm-tabla" style={{ marginTop: '.35rem', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 180, overflowY: 'auto' }}>
                  <table>
                    <thead><tr><th>Fecha</th><th>Cerró en</th><th>Arrancó en</th><th>Motivo</th></tr></thead>
                    <tbody>
                      {historial.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontSize: '.8rem' }}>{fFecha(c.fecha)}</td>
                          <td style={{ fontSize: '.8rem' }}>{nLitros(c.acumuladoCierre)} L</td>
                          <td style={{ fontSize: '.8rem' }}>{nLitros(c.lecturaNueva)} L</td>
                          <td style={{ fontSize: '.78rem' }}>{c.motivo || <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
