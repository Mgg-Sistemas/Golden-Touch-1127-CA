import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/modules/auth/authStore';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import { toast } from '@/shared/ui/Toast';
import { listMensajes, enviarMensaje, marcarLeido, type MensajeOrden } from './ordenChat.repository';

/**
 * Chat interno de seguimiento por orden (OC). Hilo único por orden para que el
 * Gerente General y el analista de compras conversen al revisar/aprobar.
 * En tiempo real; marca el hilo como leído al abrirlo y al llegar mensajes.
 */
export function ChatOrden({ ordenId, ordenLabel, autorNombre }: {
  ordenId: string;
  ordenLabel: string;
  autorNombre?: string | null;
}) {
  const { user } = useSession();
  const [msgs, setMsgs] = useState<MensajeOrden[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [loading, setLoading] = useState(true);
  const finRef = useRef<HTMLDivElement>(null);

  const marcar = useCallback(() => {
    if (user?.id) void marcarLeido(ordenId, user.id).catch(() => { /* best-effort */ });
  }, [ordenId, user?.id]);

  const cargar = useCallback(async () => {
    try {
      const rows = await listMensajes(ordenId);
      setMsgs(rows);
      marcar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar la conversación', 'error');
    } finally {
      setLoading(false);
    }
  }, [ordenId, marcar]);

  useEffect(() => { void cargar(); }, [cargar]);
  // En vivo: cualquier mensaje nuevo de esta orden refresca el hilo.
  useRealtime(['orden_mensajes'], () => { void cargar(); });

  // Auto-scroll al último mensaje cuando cambia la lista.
  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  async function enviar() {
    const t = texto.trim();
    if (!t || !user?.email) return;
    setEnviando(true);
    try {
      await enviarMensaje({ ordenId, ordenLabel, mensaje: t, autorEmail: user.email, autorNombre: autorNombre ?? null });
      setTexto('');
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        marginTop: '.6rem',
        border: '1.5px solid rgba(255,138,0,.55)',
        borderRadius: 12,
        background: 'rgba(255,138,0,.04)',
        boxShadow: '0 0 0 3px rgba(255,138,0,.06)',
      }}
    >
      <div style={{ marginBottom: '.5rem' }}>
        <div style={{ fontWeight: 700, fontSize: '.95rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <span style={{ color: '#ff8a00' }}>💬</span> Chat interno · {ordenLabel}
        </div>
        <div className="muted" style={{ fontSize: '.78rem', marginTop: '.15rem' }}>
          Hilo de seguimiento interno de esta orden (no se envía al proveedor).
        </div>
      </div>
      <div
        style={{
          maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          gap: '.5rem', padding: '.2rem .1rem .4rem',
        }}
      >
        {loading && <div className="muted" style={{ fontSize: '.84rem', textAlign: 'center' }}>Cargando…</div>}
        {!loading && !msgs.length && (
          <div className="muted" style={{ fontSize: '.84rem', textAlign: 'center', padding: '.6rem 0' }}>
            Sin mensajes. Iniciá la conversación de seguimiento de esta orden.
          </div>
        )}
        {msgs.map((m) => {
          const propio = m.autor_email === user?.email;
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: propio ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '78%', padding: '.45rem .7rem', borderRadius: 10, fontSize: '.85rem',
                  background: propio ? 'rgba(255,138,0,.16)' : 'var(--bg-1)',
                  border: `1px solid ${propio ? 'rgba(255,138,0,.35)' : 'var(--border)'}`,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '.72rem', marginBottom: '.15rem' }}>
                  {m.autor_nombre || m.autor_email}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.mensaje}</div>
                <div className="muted" style={{ fontSize: '.66rem', marginTop: '.2rem', textAlign: 'right' }}>{dateTime(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>
      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
        <textarea
          className="input"
          rows={1}
          style={{ flex: 1, resize: 'none' }}
          placeholder="Escribí un mensaje… (Enter para enviar)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
          disabled={enviando}
        />
        <button className="btn btn-primary" onClick={() => void enviar()} disabled={enviando || !texto.trim()}>
          {enviando ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
