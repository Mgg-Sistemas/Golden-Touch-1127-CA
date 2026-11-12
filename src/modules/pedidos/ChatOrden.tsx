import { Quien } from '@/shared/ui/Quien';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/modules/auth/authStore';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import { toast } from '@/shared/ui/Toast';
import { listMensajes, enviarMensaje, marcarLeido, type MensajeOrden } from './ordenChat.repository';
import { ChatMensajeContenido } from './ChatFormato';
import { PERSONAS_CONOCIDAS_COMPRAS } from './personasCompras';
import { listUsuarios } from '@/modules/usuarios/usuarios.repository';
import type { Usuario } from '@/shared/lib/types';

interface MiembroEquipo {
  nombre: string;
  email: string;
}

/**
 * Chat interno de seguimiento por orden (OC). Hilo único por orden para que el
 * Gerente General y el analista de compras conversen al revisar/aprobar.
 * En tiempo real; con formato enriquecido (Telegram / WhatsApp / Slack),
 * menciones (@) con alertas personalizadas y referencias (#).
 */
export function ChatOrden({
  ordenId,
  ordenLabel,
  autorNombre,
  referenciasSugeridas,
}: {
  ordenId: string;
  ordenLabel: string;
  autorNombre?: string | null;
  referenciasSugeridas?: string[];
}) {
  const { user } = useSession();
  const [msgs, setMsgs] = useState<MensajeOrden[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cargaError, setCargaError] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autocomplete de menciones (@) y referencias (#)
  const [miembros, setMiembros] = useState<MiembroEquipo[]>([]);
  const [menuTipo, setMenuTipo] = useState<'mencion' | 'referencia' | null>(null);
  const [menuQuery, setMenuQuery] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);

  // Cargar lista de miembros para menciones (@)
  useEffect(() => {
    let cancel = false;
    async function cargarMiembros() {
      const mapa = new Map<string, string>();
      for (const [correo, nom] of Object.entries(PERSONAS_CONOCIDAS_COMPRAS)) {
        mapa.set(correo.toLowerCase(), nom);
      }
      try {
        const dbUsers: Usuario[] = await listUsuarios();
        for (const u of dbUsers) {
          const nom = `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim();
          if (u.email && nom) {
            mapa.set(u.email.toLowerCase(), nom);
          }
        }
      } catch {
        // Fallback a PERSONAS_CONOCIDAS_COMPRAS si no hay acceso directo a usuarios
      }
      if (!cancel) {
        const lista: MiembroEquipo[] = [];
        const nombresVistos = new Set<string>();
        for (const [email, nombre] of mapa.entries()) {
          const upper = nombre.toUpperCase();
          if (!nombresVistos.has(upper)) {
            lista.push({ email, nombre: upper });
            nombresVistos.add(upper);
          }
        }
        setMiembros(lista.sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }
    }
    void cargarMiembros();
    return () => { cancel = true; };
  }, []);

  const marcar = useCallback(() => {
    if (user?.id) void marcarLeido(ordenId, user.id).catch(() => { /* best-effort */ });
  }, [ordenId, user?.id]);

  const cargar = useCallback(async () => {
    if (!ordenId) { setLoading(false); return; }
    try {
      const rows = await listMensajes(ordenId);
      setMsgs(rows);
      setCargaError(false);
      marcar();
    } catch {
      setCargaError(true);
    } finally {
      setLoading(false);
    }
  }, [ordenId, marcar]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['orden_mensajes'], () => { void cargar(); });

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  // Manejo de autocompletado en el textarea
  const actualizarSugerencias = (nuevoTexto: string, pos: number) => {
    const textoAntes = nuevoTexto.slice(0, pos);

    // Buscar si el cursor está inmediatamente después de un @...
    const matchMencion = textoAntes.match(/(?:^|\s)@([a-zA-ZÁÉÍÓÚáéíóúñÑ0-9_.]*)$/);
    if (matchMencion) {
      setMenuTipo('mencion');
      setMenuQuery(matchMencion[1].toLowerCase());
      setMenuIndex(0);
      return;
    }

    // Buscar si el cursor está inmediatamente después de un #...
    const matchRef = textoAntes.match(/(?:^|\s)#([a-zA-Z0-9-]*)$/);
    if (matchRef) {
      setMenuTipo('referencia');
      setMenuQuery(matchRef[1].toLowerCase());
      setMenuIndex(0);
      return;
    }

    setMenuTipo(null);
  };

  const handleTextoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setTexto(val);
    actualizarSugerencias(val, e.target.selectionStart ?? val.length);
  };

  // Filtrado de miembros para el menú de mención
  const miembrosFiltrados = menuTipo === 'mencion'
    ? miembros.filter((m) =>
        m.nombre.toLowerCase().includes(menuQuery) || m.email.toLowerCase().includes(menuQuery)
      ).slice(0, 6)
    : [];

  // Sugerencias de referencias (#)
  // IMPORTANTE: Excluye explícitamente CD- (Compra directa) y SD- (Servicio directo)
  const baseReferencias = [
    ...(ordenLabel && !ordenLabel.startsWith('CD-') && !ordenLabel.startsWith('SD-') ? [ordenLabel] : []),
    ...(referenciasSugeridas ?? []).filter((r) => !r.toUpperCase().startsWith('CD-') && !r.toUpperCase().startsWith('SD-')),
    'OC-',
    'SP-',
    'CS-',
    'SS-',
  ];
  const referenciasUnicas = Array.from(new Set(baseReferencias));
  const referenciasFiltradas = menuTipo === 'referencia'
    ? referenciasUnicas.filter((r) => r.toLowerCase().includes(menuQuery)).slice(0, 6)
    : [];

  // Insertar sugerencia elegida
  const insertarSugerencia = (valor: string, esMencion: boolean) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? texto.length;
    const textoAntes = texto.slice(0, pos);
    const textoDespues = texto.slice(pos);

    let prefijo = '';
    if (esMencion) {
      prefijo = textoAntes.replace(/(?:^|\s)@([a-zA-ZÁÉÍÓÚáéíóúñÑ0-9_.]*)$/, (match) => {
        return match.startsWith(' ') ? ` @${valor} ` : `@${valor} `;
      });
    } else {
      const limpio = valor.replace(/^#/, '');
      prefijo = textoAntes.replace(/(?:^|\s)#([a-zA-Z0-9-]*)$/, (match) => {
        return match.startsWith(' ') ? ` #${limpio} ` : `#${limpio} `;
      });
    }

    const resultado = prefijo + textoDespues;
    setTexto(resultado);
    setMenuTipo(null);

    // Reposicionar cursor
    setTimeout(() => {
      ta.focus();
      const nuevaPos = prefijo.length;
      ta.setSelectionRange(nuevaPos, nuevaPos);
    }, 0);
  };

  // Botones de formato rápido (Negrita, Cursiva, etc.)
  const aplicarFormato = (inicio: string, fin: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const seleccionado = texto.slice(start, end);

    if (seleccionado) {
      const nuevoTexto = texto.slice(0, start) + inicio + seleccionado + fin + texto.slice(end);
      setTexto(nuevoTexto);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + inicio.length, end + inicio.length);
      }, 0);
    } else {
      const placeholder = 'texto';
      const nuevoTexto = texto.slice(0, start) + inicio + placeholder + fin + texto.slice(end);
      setTexto(nuevoTexto);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + inicio.length, start + inicio.length + placeholder.length);
      }, 0);
    }
  };

  const insertarPrefijoLinea = (prefijo: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const antes = texto.slice(0, start);
    const despues = texto.slice(start);
    const necesitaSalto = antes.length > 0 && !antes.endsWith('\n');
    const insercion = (necesitaSalto ? '\n' : '') + prefijo;
    setTexto(antes + insercion + despues);
    setTimeout(() => {
      ta.focus();
      const pos = (antes + insercion).length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  const dispararMencion = () => {
    insertarPrefijoLinea('@');
    setMenuTipo('mencion');
    setMenuQuery('');
    setMenuIndex(0);
  };

  const dispararReferencia = () => {
    insertarPrefijoLinea('#');
    setMenuTipo('referencia');
    setMenuQuery('');
    setMenuIndex(0);
  };

  async function enviar() {
    const t = texto.trim();
    if (!t || !user?.email) return;
    setEnviando(true);
    try {
      await enviarMensaje({ ordenId, ordenLabel, mensaje: t, autorEmail: user.email, autorNombre: autorNombre ?? null });
      setTexto('');
      setMenuTipo(null);
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error');
    } finally {
      setEnviando(false);
    }
  }

  // Teclado en textarea: soporte de flechas para dropdown y Enter para enviar
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Si el menú de sugerencias está abierto
    if (menuTipo === 'mencion' && miembrosFiltrados.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenuIndex((prev) => (prev + 1) % miembrosFiltrados.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenuIndex((prev) => (prev - 1 + miembrosFiltrados.length) % miembrosFiltrados.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const elegido = miembrosFiltrados[menuIndex];
        if (elegido) insertarSugerencia(elegido.nombre, true);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuTipo(null);
        return;
      }
    }

    if (menuTipo === 'referencia' && referenciasFiltradas.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenuIndex((prev) => (prev + 1) % referenciasFiltradas.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenuIndex((prev) => (prev - 1 + referenciasFiltradas.length) % referenciasFiltradas.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const elegido = referenciasFiltradas[menuIndex];
        if (elegido) insertarSugerencia(elegido, false);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuTipo(null);
        return;
      }
    }

    // Atajos de formato con Ctrl / Cmd
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      aplicarFormato('*', '*');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      aplicarFormato('_', '_');
      return;
    }

    // Enter sin Shift: Enviar
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  };

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
      {/* Encabezado */}
      <div style={{ marginBottom: '.5rem' }}>
        <div style={{ fontWeight: 700, fontSize: '.95rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <span style={{ color: '#ff8a00' }}>💬</span> Chat interno · {ordenLabel}
        </div>
        <div className="muted" style={{ fontSize: '.78rem', marginTop: '.15rem' }}>
          Seguimiento interno con formato enriquecido (*negrita*, _cursiva_, viñetas, @menciones y #referencias).
        </div>
      </div>

      {/* Lista de mensajes */}
      <div
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '.5rem',
          padding: '.2rem .1rem .4rem',
        }}
      >
        {loading && <div className="muted" style={{ fontSize: '.84rem', textAlign: 'center' }}>Cargando…</div>}
        {!loading && cargaError && (
          <div className="muted" style={{ fontSize: '.82rem', textAlign: 'center', padding: '.6rem 0' }}>
            No se pudo cargar el chat.{' '}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => { setLoading(true); void cargar(); }}
            >
              ↻ Reintentar
            </button>
          </div>
        )}
        {!loading && !cargaError && !msgs.length && (
          <div className="muted" style={{ fontSize: '.84rem', textAlign: 'center', padding: '.6rem 0' }}>
            Sin mensajes. Inicia la conversación de seguimiento de esta orden.
          </div>
        )}
        {msgs.map((m) => {
          const propio = m.autor_email === user?.email;
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: propio ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '82%',
                  padding: '.45rem .75rem',
                  borderRadius: 10,
                  fontSize: '.85rem',
                  background: propio ? 'rgba(255,138,0,.16)' : 'var(--bg-1)',
                  border: `1px solid ${propio ? 'rgba(255,138,0,.35)' : 'var(--border)'}`,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '.72rem', marginBottom: '.2rem' }}>
                  <Quien nombre={m.autor_nombre} correo={m.autor_email} />
                </div>
                <ChatMensajeContenido mensaje={m.mensaje} />
                <div className="muted" style={{ fontSize: '.66rem', marginTop: '.25rem', textAlign: 'right' }}>
                  {dateTime(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {/* Barra de formato rápido (estilo Slack/WhatsApp/Telegram) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginTop: '.5rem',
          padding: '2px 4px',
          borderTop: '1px solid rgba(255,138,0,.15)',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          title="Negrita (*texto* o Ctrl+B)"
          onClick={() => aplicarFormato('*', '*')}
          style={{ fontWeight: 800, minWidth: 26, height: 24, padding: '0 4px' }}
        >
          B
        </button>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          title="Cursiva (_texto_ o Ctrl+I)"
          onClick={() => aplicarFormato('_', '_')}
          style={{ fontStyle: 'italic', fontWeight: 600, minWidth: 26, height: 24, padding: '0 4px' }}
        >
          I
        </button>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          title="Tachado (~texto~)"
          onClick={() => aplicarFormato('~', '~')}
          style={{ textDecoration: 'line-through', minWidth: 26, height: 24, padding: '0 4px' }}
        >
          S
        </button>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          title="Código inline (`código`)"
          onClick={() => aplicarFormato('`', '`')}
          style={{ fontFamily: 'monospace', minWidth: 26, height: 24, padding: '0 4px' }}
        >
          &lt;/&gt;
        </button>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          title="Cita (> texto)"
          onClick={() => insertarPrefijoLinea('> ')}
          style={{ fontWeight: 800, minWidth: 26, height: 24, padding: '0 4px' }}
        >
          ”
        </button>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          title="Viñeta (• elemento)"
          onClick={() => insertarPrefijoLinea('• ')}
          style={{ color: '#ff8a00', fontWeight: 800, minWidth: 26, height: 24, padding: '0 4px' }}
        >
          •
        </button>

        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', margin: '0 3px' }} />

        <button
          type="button"
          className="btn btn-xs btn-ghost"
          title="Mencionar a un miembro del equipo (@)"
          onClick={dispararMencion}
          style={{ height: 24, padding: '0 6px', fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <span style={{ color: '#ff8a00', fontWeight: 800 }}>@</span> Mencionar
        </button>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          title="Referenciar orden (#OC, #SP, #CS, #SS)"
          onClick={dispararReferencia}
          style={{ height: 24, padding: '0 6px', fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <span style={{ color: '#60a5fa', fontWeight: 800 }}>#</span> Referencia
        </button>
      </div>

      {/* Entrada de mensaje con soporte para sugerencias emergentes */}
      <div style={{ position: 'relative', display: 'flex', gap: '.4rem', marginTop: '.3rem' }}>
        {/* Menú emergente de mención (@) */}
        {menuTipo === 'mencion' && miembrosFiltrados.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              marginBottom: 4,
              background: 'var(--surface-2, #1e293b)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
              maxHeight: 180,
              overflowY: 'auto',
              zIndex: 50,
              padding: '4px',
            }}
          >
            <div className="muted" style={{ fontSize: '.7rem', padding: '3px 8px', fontWeight: 700 }}>
              Mencionar persona (@):
            </div>
            {miembrosFiltrados.map((m, idx) => (
              <div
                key={m.email}
                onClick={() => insertarSugerencia(m.nombre, true)}
                onMouseEnter={() => setMenuIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: idx === menuIndex ? 'rgba(255,138,0,.15)' : 'transparent',
                  color: idx === menuIndex ? '#ff9800' : 'inherit',
                  fontSize: '.82rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: 'rgba(255,138,0,.25)',
                      color: '#ff8a00',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '.7rem',
                      fontWeight: 800,
                    }}
                  >
                    @
                  </span>
                  <span style={{ fontWeight: 600 }}>{m.nombre}</span>
                </div>
                <span className="muted" style={{ fontSize: '.72rem' }}>{m.email}</span>
              </div>
            ))}
          </div>
        )}

        {/* Menú emergente de referencia (#) */}
        {menuTipo === 'referencia' && referenciasFiltradas.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              marginBottom: 4,
              background: 'var(--surface-2, #1e293b)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
              maxHeight: 180,
              overflowY: 'auto',
              zIndex: 50,
              padding: '4px',
            }}
          >
            <div className="muted" style={{ fontSize: '.7rem', padding: '3px 8px', fontWeight: 700 }}>
              Referenciar orden (#):
            </div>
            {referenciasFiltradas.map((r, idx) => (
              <div
                key={r}
                onClick={() => insertarSugerencia(r, false)}
                onMouseEnter={() => setMenuIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: idx === menuIndex ? 'rgba(59,130,246,.15)' : 'transparent',
                  color: idx === menuIndex ? '#60a5fa' : 'inherit',
                  fontSize: '.82rem',
                }}
              >
                <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#60a5fa' }}>#{r}</span>
                <span className="muted" style={{ fontSize: '.74rem' }}>
                  {r.startsWith('OC-') ? 'Orden de Compra' :
                   r.startsWith('SP-') ? 'Solicitud de Pedido' :
                   r.startsWith('CS-') ? 'Control de Servicio' :
                   r.startsWith('SS-') ? 'Solicitud de Servicio' : 'Referencia'}
                </span>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="input"
          rows={2}
          style={{ flex: 1, resize: 'vertical', minHeight: '38px', maxHeight: '120px', fontSize: '.85rem' }}
          placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para salto de línea)"
          value={texto}
          onChange={handleTextoChange}
          onKeyDown={handleKeyDown}
          disabled={enviando}
        />
        <button
          className="btn btn-primary"
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          style={{ alignSelf: 'flex-end', height: '38px' }}
        >
          {enviando ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
