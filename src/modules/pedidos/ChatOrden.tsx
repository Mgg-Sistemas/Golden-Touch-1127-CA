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
 * Chat interno de seguimiento por orden (OC / SP / CS / SS).
 * Diseño integrado y cohesivo con la estética oscura de Golden Touch:
 * - Contenedor unificado estilo Slack / Linear.
 * - Formato enriquecido (*negrita*, _cursiva_, viñetas, citas, código).
 * - Autocompletado inteligente para @menciones y #referencias.
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
  const [inputFocused, setInputFocused] = useState(false);
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
        // Fallback a PERSONAS_CONOCIDAS_COMPRAS
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

    const matchMencion = textoAntes.match(/(?:^|\s)@([a-zA-ZÁÉÍÓÚáéíóúñÑ0-9_.]*)$/);
    if (matchMencion) {
      setMenuTipo('mencion');
      setMenuQuery(matchMencion[1].toLowerCase());
      setMenuIndex(0);
      return;
    }

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

  const miembrosFiltrados = menuTipo === 'mencion'
    ? miembros.filter((m) =>
        m.nombre.toLowerCase().includes(menuQuery) || m.email.toLowerCase().includes(menuQuery)
      ).slice(0, 6)
    : [];

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

    setTimeout(() => {
      ta.focus();
      const nuevaPos = prefijo.length;
      ta.setSelectionRange(nuevaPos, nuevaPos);
    }, 0);
  };

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  };

  const actionBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted, #9aa6b5)',
    cursor: 'pointer',
    padding: '0 5px',
    minWidth: '22px',
    height: '24px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    fontSize: '0.8rem',
    lineHeight: 1,
  };

  return (
    <div
      style={{
        background: 'var(--surface, #23272e)',
        border: '1px solid var(--border, #333944)',
        borderRadius: 'var(--r-md, 10px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Encabezado limpio y sobrio */}
      <div
        style={{
          padding: '0.6rem 0.85rem',
          background: 'var(--bg-1, #20242a)',
          borderBottom: '1px solid var(--border, #333944)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.95rem' }}>💬</span>
          <span style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text)' }}>
            Chat interno
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
              background: 'rgba(255, 138, 0, 0.12)',
              color: 'var(--primary, #ff8a00)',
              padding: '1px 6px',
              borderRadius: '4px',
              fontWeight: 600,
              border: '1px solid rgba(255, 138, 0, 0.22)',
            }}
          >
            {ordenLabel}
          </span>
        </div>
        <span className="muted" style={{ fontSize: '0.74rem' }}>
          Seguimiento interno de la orden
        </span>
      </div>

      {/* Lista de mensajes */}
      <div
        style={{
          minHeight: msgs.length ? 140 : 85,
          maxHeight: 250,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          padding: '0.75rem 0.9rem',
          background: 'var(--bg-0, #1c1f24)',
        }}
      >
        {loading && <div className="muted" style={{ fontSize: '.82rem', textAlign: 'center', padding: '1rem 0' }}>Cargando conversación…</div>}
        {!loading && cargaError && (
          <div className="muted" style={{ fontSize: '.82rem', textAlign: 'center', padding: '1rem 0' }}>
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.25rem 0',
              color: 'var(--text-dim, #6a7585)',
              gap: '0.2rem',
            }}
          >
            <span style={{ fontSize: '1.15rem', opacity: 0.65 }}>💬</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin mensajes en esta orden</span>
            <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>Escribe abajo para coordinar o dejar notas con el equipo</span>
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
                  borderRadius: 8,
                  fontSize: '.84rem',
                  background: propio ? 'rgba(255,138,0,.12)' : 'var(--surface-2, #2b3038)',
                  border: `1px solid ${propio ? 'rgba(255,138,0,.25)' : 'var(--border, #333944)'}`,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '.72rem', marginBottom: '.2rem', color: propio ? 'var(--primary-2, #ffa733)' : 'var(--text-muted)' }}>
                  <Quien nombre={m.autor_nombre} correo={m.autor_email} />
                </div>
                <ChatMensajeContenido mensaje={m.mensaje} />
                <div className="muted" style={{ fontSize: '.65rem', marginTop: '.2rem', textAlign: 'right' }}>
                  {dateTime(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {/* Compositor de mensaje unificado (Estilo Slack / Linear / WhatsApp Web) */}
      <div
        style={{
          padding: '0.6rem 0.85rem',
          background: 'var(--bg-1, #20242a)',
          borderTop: '1px solid var(--border, #333944)',
        }}
      >
        <div
          style={{
            position: 'relative',
            background: 'var(--bg-2, #262a31)',
            border: inputFocused ? '1px solid var(--primary, #ff8a00)' : '1px solid var(--border, #333944)',
            boxShadow: inputFocused ? '0 0 0 2px rgba(255, 138, 0, 0.16)' : 'none',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          {/* Menú emergente de mención (@) */}
          {menuTipo === 'mencion' && miembrosFiltrados.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: 'var(--surface-2, #2b3038)',
                border: '1px solid var(--border-strong, #434a56)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,0.45))',
                maxHeight: 180,
                overflowY: 'auto',
                zIndex: 60,
                padding: '4px',
              }}
            >
              <div className="muted" style={{ fontSize: '.68rem', padding: '3px 8px', fontWeight: 600 }}>
                Mencionar a:
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
                    padding: '5px 8px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    background: idx === menuIndex ? 'rgba(255,138,0,.15)' : 'transparent',
                    color: idx === menuIndex ? 'var(--primary, #ff8a00)' : 'inherit',
                    fontSize: '.8rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'rgba(255,138,0,.2)',
                        color: 'var(--primary, #ff8a00)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '.66rem',
                        fontWeight: 700,
                      }}
                    >
                      @
                    </span>
                    <span style={{ fontWeight: 600 }}>{m.nombre}</span>
                  </div>
                  <span className="muted" style={{ fontSize: '.7rem' }}>{m.email}</span>
                </div>
              ))}
            </div>
          )}

          {/* Menú emergente de referencia (#) */}
          {menuTipo === 'referencia' && referenciasFiltradas.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: 'var(--surface-2, #2b3038)',
                border: '1px solid var(--border-strong, #434a56)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,0.45))',
                maxHeight: 180,
                overflowY: 'auto',
                zIndex: 60,
                padding: '4px',
              }}
            >
              <div className="muted" style={{ fontSize: '.68rem', padding: '3px 8px', fontWeight: 600 }}>
                Referenciar operación (#):
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
                    padding: '5px 8px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    background: idx === menuIndex ? 'rgba(74,168,255,.15)' : 'transparent',
                    color: idx === menuIndex ? 'var(--info, #4aa8ff)' : 'inherit',
                    fontSize: '.8rem',
                  }}
                >
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: 'var(--info, #4aa8ff)' }}>#{r}</span>
                  <span className="muted" style={{ fontSize: '.72rem' }}>
                    {r.startsWith('OC-') ? 'Orden de Compra' :
                     r.startsWith('SP-') ? 'Solicitud de Pedido' :
                     r.startsWith('CS-') ? 'Control de Servicio' :
                     r.startsWith('SS-') ? 'Solicitud de Servicio' : 'Referencia'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Área de texto sin borde integrado */}
          <textarea
            ref={textareaRef}
            rows={2}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: '0.55rem 0.75rem',
              fontSize: '0.84rem',
              color: 'var(--text)',
              fontFamily: 'inherit',
              lineHeight: '1.4',
              minHeight: '42px',
              maxHeight: '120px',
            }}
            placeholder="Escribe un mensaje… (@ para mencionar, # para referenciar)"
            value={texto}
            onChange={handleTextoChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => setInputFocused(false), 200)}
            disabled={enviando}
          />

          {/* Barra inferior integrada con herramientas y botón Enviar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.25rem 0.5rem 0.35rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              background: 'rgba(0, 0, 0, 0.1)',
              borderBottomLeftRadius: '7px',
              borderBottomRightRadius: '7px',
            }}
          >
            {/* Formato rápido */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap' }}>
              <button
                type="button"
                title="Negrita (*texto* o Ctrl+B)"
                onClick={() => aplicarFormato('*', '*')}
                style={actionBtnStyle}
              >
                <strong style={{ fontWeight: 800 }}>B</strong>
              </button>
              <button
                type="button"
                title="Cursiva (_texto_ o Ctrl+I)"
                onClick={() => aplicarFormato('_', '_')}
                style={{ ...actionBtnStyle, fontStyle: 'italic', fontWeight: 600 }}
              >
                I
              </button>
              <button
                type="button"
                title="Tachado (~texto~)"
                onClick={() => aplicarFormato('~', '~')}
                style={{ ...actionBtnStyle, textDecoration: 'line-through' }}
              >
                S
              </button>
              <button
                type="button"
                title="Código inline (`código`)"
                onClick={() => aplicarFormato('`', '`')}
                style={{ ...actionBtnStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: '.76rem' }}
              >
                &lt;/&gt;
              </button>
              <button
                type="button"
                title="Cita (> texto)"
                onClick={() => insertarPrefijoLinea('> ')}
                style={{ ...actionBtnStyle, fontWeight: 700 }}
              >
                ”
              </button>
              <button
                type="button"
                title="Viñeta (• elemento)"
                onClick={() => insertarPrefijoLinea('• ')}
                style={{ ...actionBtnStyle, color: 'var(--primary, #ff8a00)', fontSize: '.9rem' }}
              >
                •
              </button>

              <div style={{ width: 1, height: 14, background: 'var(--border, #333944)', margin: '0 4px' }} />

              <button
                type="button"
                title="Mencionar persona (@)"
                onClick={dispararMencion}
                style={{
                  ...actionBtnStyle,
                  gap: '3px',
                  padding: '0 6px',
                  fontSize: '.74rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                }}
              >
                <span style={{ color: 'var(--primary, #ff8a00)', fontWeight: 800 }}>@</span>
                <span>Mencionar</span>
              </button>
              <button
                type="button"
                title="Referenciar orden (#OC, #SP, #CS, #SS)"
                onClick={dispararReferencia}
                style={{
                  ...actionBtnStyle,
                  gap: '3px',
                  padding: '0 6px',
                  fontSize: '.74rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                }}
              >
                <span style={{ color: 'var(--info, #4aa8ff)', fontWeight: 800 }}>#</span>
                <span>Referencia</span>
              </button>
            </div>

            {/* Botón Enviar integrado */}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void enviar()}
              disabled={enviando || !texto.trim()}
              style={{
                height: '28px',
                padding: '0 0.8rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                borderRadius: '5px',
              }}
            >
              <span>{enviando ? '…' : 'Enviar'}</span>
              <span style={{ fontSize: '0.72rem' }}>➤</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
