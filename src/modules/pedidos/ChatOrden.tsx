import { Quien } from '@/shared/ui/Quien';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/modules/auth/authStore';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import { toast } from '@/shared/ui/Toast';
import { listMensajes, enviarMensaje, marcarLeido, type MensajeOrden } from './ordenChat.repository';
import { ChatMensajeContenido } from './ChatFormato';
import { PERSONAS_CONOCIDAS_COMPRAS } from './personasCompras';
import { listUsuarios } from '@/modules/usuarios/usuarios.repository';
import type { Usuario } from '@/shared/lib/types';

export interface MiembroEquipo {
  nombre: string;
  email: string;
  departamento: string;
  cargo?: string;
}

/** Normaliza y categoriza un departamento para priorización y agrupación limpia */
export function normalizarDepartamento(deptoRaw?: string | null, email?: string): string {
  const d = (deptoRaw || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (d.includes('COMPRA')) return 'COMPRAS';
  if (d.includes('TESORER')) return 'TESORERIA';
  if (d.includes('ADMINISTRA')) return 'ADMINISTRACION';
  if (d.includes('ALMACEN')) return 'ALMACEN';
  if (d.includes('SISTEMA')) return 'SISTEMAS';
  if (d.includes('RRHH') || d.includes('HUMANO') || d.includes('PERSONAL')) return 'RRHH';
  if (d.includes('MAQUINA') || d.includes('TALLER') || d.includes('FLOTA')) return 'MAQUINARIA';
  if (d.includes('COMBUSTIBLE') || d.includes('SURTIDOR')) return 'COMBUSTIBLE';
  if (d.includes('COCINA') || d.includes('COMIDA')) return 'COCINA';
  if (d.includes('DIRECTIVA') || d.includes('GERENCIA') || d.includes('PRESIDENCIA')) return 'DIRECTIVA';
  if (d.includes('IMPUESTO') || d.includes('FISCAL') || d.includes('SENIAT')) return 'IMPUESTOS';
  if (d.includes('GEODESTA') || d.includes('MINA')) return 'OPERACIONES';

  const em = (email || '').toLowerCase().trim();
  if (em.includes('touchgolden')) return 'DIRECTIVA';
  if (em.includes('jhzgcontabilidad')) return 'TESORERIA';
  if (
    em.includes('analista1') ||
    em.includes('comprasanalista') ||
    em.includes('analistadecompras') ||
    em.includes('asistentecompras') ||
    em.includes('admingometales') ||
    em.includes('analista4')
  ) {
    return 'COMPRAS';
  }
  if (em.includes('analistaadministrativo') || em.includes('edinsontrabajo') || em.includes('mariana')) {
    return 'ADMINISTRACION';
  }
  if (em.includes('impuestosmgg')) return 'IMPUESTOS';
  if (em.includes('almacen')) return 'ALMACEN';
  if (em.includes('maquinaria')) return 'MAQUINARIA';
  if (em.includes('combustible')) return 'COMBUSTIBLE';
  if (em.includes('geodesta')) return 'OPERACIONES';
  if (em.includes('cocina')) return 'COCINA';
  if (em.includes('rrhh')) return 'RRHH';
  if (em.includes('sistema')) return 'SISTEMAS';

  return d || 'GENERAL';
}

/** Orden de prioridad departamental según el contexto de origen del chat */
export function ordenarDepartamentos(deptos: string[], contexto: 'compras' | 'tesoreria' | 'administracion'): string[] {
  let ordenPrioridad: string[] = [];
  if (contexto === 'compras') {
    // Compras referencia primero a Compras, luego a Tesorería, luego Administración...
    ordenPrioridad = ['COMPRAS', 'TESORERIA', 'ADMINISTRACION', 'ALMACEN', 'DIRECTIVA', 'OPERACIONES'];
  } else if (contexto === 'tesoreria') {
    // Tesorería referencia primero a Tesorería, luego a Compras, luego Administración (Gastos fijos)...
    ordenPrioridad = ['TESORERIA', 'COMPRAS', 'ADMINISTRACION', 'DIRECTIVA', 'ALMACEN', 'OPERACIONES'];
  } else if (contexto === 'administracion') {
    ordenPrioridad = ['ADMINISTRACION', 'TESORERIA', 'COMPRAS', 'DIRECTIVA', 'ALMACEN', 'OPERACIONES'];
  } else {
    ordenPrioridad = ['COMPRAS', 'TESORERIA', 'ADMINISTRACION'];
  }

  return [...deptos].sort((a, b) => {
    const idxA = ordenPrioridad.indexOf(a);
    const idxB = ordenPrioridad.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });
}

/** Etiqueta amigable de la fase actual de la orden o solicitud */
export function formatearFaseOrden(fase?: string | null): string {
  if (!fase) return '';
  const f = fase.toLowerCase().trim();
  switch (f) {
    case 'creada':
    case 'borrador':
      return 'Creada';
    case 'enviada_revision_almacen':
    case 'revision_almacen':
      return 'Revisión Almacén';
    case 'cotizacion':
    case 'en_cotizacion':
      return 'En Cotización';
    case 'pendiente_aprobacion':
    case 'revision':
      return 'Por Aprobar';
    case 'aprobada':
      return 'Aprobada';
    case 'emitida':
      return 'OC Emitida';
    case 'pendiente':
    case 'pendiente_pago':
    case 'por_pagar':
      return 'Por Pagar';
    case 'parcial':
    case 'abono':
      return 'Pago Parcial';
    case 'pagada':
      return 'Pagada';
    case 'recepcion':
    case 'recibida':
      return 'En Recepción';
    case 'cerrada':
      return 'Cerrada';
    default:
      return fase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/** Infiere el tipo de operación para exhibir contexto preciso */
export function inferirTipoOperacion(codigo: string, tipoDado?: string | null): string {
  if (tipoDado && tipoDado.trim()) return tipoDado.trim();
  const c = (codigo || '').toUpperCase().trim();
  if (c.startsWith('SP-')) return 'Solicitud de Pedido';
  if (c.startsWith('OC-')) return 'Orden de Compra';
  if (c.startsWith('CS-')) return 'Control de Servicio';
  if (c.startsWith('SS-')) return 'Solicitud de Servicio';
  if (c.startsWith('GF-')) return 'Gasto Fijo';
  return 'Orden';
}

/**
 * Chat interno de seguimiento por orden (OC / SP / CS / SS / GF).
 * Inteligente, contextual y clasificado por departamentos:
 * - Clasificación departamental con prioridad según módulo (Compras ↔ Tesorería ↔ Administración).
 * - Restricción estricta: Solo usuarios activos pueden ser mencionados.
 * - Despliegue de fase operativa e identidad del documento.
 * - Sin cortes visuales superiores en los menús desplegables.
 */
export function ChatOrden({
  ordenId,
  ordenLabel,
  autorNombre,
  contextoModulo,
  fase,
  tipoOperacion,
  referenciasSugeridas,
}: {
  ordenId: string;
  ordenLabel: string;
  autorNombre?: string | null;
  contextoModulo?: 'compras' | 'tesoreria' | 'administracion';
  fase?: string | null;
  tipoOperacion?: string | null;
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

  // Detección automática del módulo de contexto si no se pasa explícito
  const ctxModulo: 'compras' | 'tesoreria' | 'administracion' = useMemo(() => {
    if (contextoModulo) return contextoModulo;
    if (typeof window !== 'undefined') {
      if (window.location.hash.includes('tesoreria')) return 'tesoreria';
      if (window.location.hash.includes('administracion')) return 'administracion';
    }
    return 'compras';
  }, [contextoModulo]);

  // Autocomplete de menciones (@) y referencias (#)
  const [miembros, setMiembros] = useState<MiembroEquipo[]>([]);
  const [menuTipo, setMenuTipo] = useState<'mencion' | 'referencia' | null>(null);
  const [menuQuery, setMenuQuery] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);

  // Cargar lista de miembros activos clasificados por departamento
  useEffect(() => {
    let cancel = false;
    async function cargarMiembros() {
      const mapa = new Map<string, { nombre: string; depto: string }>();
      const inactivosSet = new Set<string>();

      try {
        const dbUsers: Usuario[] = await listUsuarios();
        for (const u of dbUsers) {
          const emailNorm = (u.email ?? '').toLowerCase().trim();
          // Cuarto requisito: EXCLUIR usuarios inactivos, bloqueados o archivados
          const esInactivo = (u.estado && u.estado.toLowerCase() !== 'activo') || !!u.archivado_en || !!u.bloqueado;
          if (esInactivo) {
            if (emailNorm) inactivosSet.add(emailNorm);
            continue;
          }

          const nom = `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim();
          if (emailNorm && nom) {
            const depto = normalizarDepartamento(u.departamento, emailNorm);
            mapa.set(emailNorm, { nombre: nom.toUpperCase(), depto });
          }
        }
      } catch {
        // Fallback a personas conocidas si la RPC de usuarios no está disponible
      }

      // Incorporar personas conocidas de compras que no estén marcadas como inactivas
      for (const [correo, nom] of Object.entries(PERSONAS_CONOCIDAS_COMPRAS)) {
        const emailNorm = correo.toLowerCase().trim();
        if (inactivosSet.has(emailNorm)) continue;
        if (!mapa.has(emailNorm)) {
          const depto = normalizarDepartamento(null, emailNorm);
          mapa.set(emailNorm, { nombre: nom.toUpperCase(), depto });
        }
      }

      if (!cancel) {
        const lista: MiembroEquipo[] = [];
        const nombresVistos = new Set<string>();
        for (const [email, { nombre, depto }] of mapa.entries()) {
          const upper = nombre.toUpperCase();
          if (!nombresVistos.has(upper)) {
            lista.push({ email, nombre: upper, departamento: depto });
            nombresVistos.add(upper);
          }
        }
        setMiembros(lista);
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

  // Filtrado y clasificación departamental para el menú de mención
  // Tercer requisito: Orden prioritario según contexto (Compras ➔ Tesorería o Tesorería ➔ Compras ➔ Administración)
  const { miembrosAgrupados, miembrosPlana } = useMemo(() => {
    if (menuTipo !== 'mencion') return { miembrosAgrupados: [] as Array<[string, MiembroEquipo[]]>, miembrosPlana: [] as MiembroEquipo[] };

    const filtrados = miembros.filter((m) =>
      m.nombre.toLowerCase().includes(menuQuery) ||
      m.email.toLowerCase().includes(menuQuery) ||
      m.departamento.toLowerCase().includes(menuQuery)
    );

    const gruposMap = new Map<string, MiembroEquipo[]>();
    for (const m of filtrados) {
      const dep = m.departamento;
      if (!gruposMap.has(dep)) gruposMap.set(dep, []);
      gruposMap.get(dep)!.push(m);
    }

    // Ordenar cada grupo alfabéticamente
    for (const lista of gruposMap.values()) {
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }

    // Ordenar los departamentos según la prioridad del módulo
    const deptosOrdenados = ordenarDepartamentos(Array.from(gruposMap.keys()), ctxModulo);
    const grupos: Array<[string, MiembroEquipo[]]> = deptosOrdenados.map((d) => [d, gruposMap.get(d)!]);

    // Aplanar para facilitar la navegación con teclas ↑ / ↓
    const plana: MiembroEquipo[] = [];
    for (const [, items] of grupos) {
      plana.push(...items);
    }

    return { miembrosAgrupados: grupos, miembrosPlana: plana.slice(0, 10) };
  }, [menuTipo, miembros, menuQuery, ctxModulo]);

  // Sugerencias de referencias (#)
  // Quinto requisito: Para Tesorería se incluye Gastos Fijos (#GF-) junto con #OC-, #SP-, #CS-, #SS-
  // Excluye explícitamente CD- (Compra directa) y SD- (Servicio directo)
  const referenciasFiltradas = useMemo(() => {
    if (menuTipo !== 'referencia') return [];
    const baseReferencias = [
      ...(ordenLabel && !ordenLabel.startsWith('CD-') && !ordenLabel.startsWith('SD-') ? [ordenLabel] : []),
      ...(referenciasSugeridas ?? []).filter((r) => !r.toUpperCase().startsWith('CD-') && !r.toUpperCase().startsWith('SD-')),
      'OC-',
      'SP-',
      'CS-',
      'SS-',
      ...(ctxModulo === 'tesoreria' || ctxModulo === 'administracion' ? ['GF-'] : []),
    ];
    const unicas = Array.from(new Set(baseReferencias));
    return unicas.filter((r) => r.toLowerCase().includes(menuQuery)).slice(0, 6);
  }, [menuTipo, ordenLabel, referenciasSugeridas, ctxModulo, menuQuery]);

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
    if (menuTipo === 'mencion' && miembrosPlana.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenuIndex((prev) => (prev + 1) % miembrosPlana.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenuIndex((prev) => (prev - 1 + miembrosPlana.length) % miembrosPlana.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const elegido = miembrosPlana[menuIndex];
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

  const tipoLegible = inferirTipoOperacion(ordenLabel, tipoOperacion);
  const faseLegible = formatearFaseOrden(fase);

  return (
    <div
      style={{
        background: 'var(--surface, #23272e)',
        border: '1px solid var(--border, #333944)',
        borderRadius: 'var(--r-md, 10px)',
        // Primer requisito: overflow visible para evitar cortes superiores del menú de mención
        overflow: 'visible',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Encabezado contextual con tipo de operación y fase */}
      <div
        style={{
          padding: '0.65rem 0.9rem',
          background: 'var(--bg-1, #20242a)',
          borderBottom: '1px solid var(--border, #333944)',
          borderTopLeftRadius: 'var(--r-md, 10px)',
          borderTopRightRadius: 'var(--r-md, 10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '.4rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
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
          <span
            style={{
              fontSize: '0.72rem',
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-muted, #9aa6b5)',
              padding: '1px 6px',
              borderRadius: '4px',
              fontWeight: 500,
            }}
          >
            {tipoLegible} {faseLegible ? `· ${faseLegible}` : ''}
          </span>
        </div>
        <span className="muted" style={{ fontSize: '0.74rem' }}>
          {ctxModulo === 'tesoreria' ? 'Tesorería ↔ Compras / Administración' : 'Compras ↔ Tesorería'}
        </span>
      </div>

      {/* Lista de mensajes (mínimo 140px de headroom para que el popover respire) */}
      <div
        style={{
          minHeight: msgs.length ? 150 : 130,
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
              padding: '1.5rem 0',
              color: 'var(--text-dim, #6a7585)',
              gap: '0.2rem',
            }}
          >
            <span style={{ fontSize: '1.2rem', opacity: 0.65 }}>💬</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin mensajes en esta orden</span>
            <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>Escribe abajo para coordinar con el equipo</span>
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

      {/* Compositor de mensaje unificado */}
      <div
        style={{
          padding: '0.6rem 0.85rem',
          background: 'var(--bg-1, #20242a)',
          borderTop: '1px solid var(--border, #333944)',
          borderBottomLeftRadius: 'var(--r-md, 10px)',
          borderBottomRightRadius: 'var(--r-md, 10px)',
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
          {/* Menú emergente de mención (@) agrupado por departamento */}
          {menuTipo === 'mencion' && miembrosPlana.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: 'var(--surface-2, #2b3038)',
                border: '1px solid var(--border-strong, #434a56)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-lg, 0 12px 28px rgba(0,0,0,0.5))',
                maxHeight: 230,
                overflowY: 'auto',
                zIndex: 100,
                padding: '4px',
              }}
            >
              <div
                style={{
                  fontSize: '.68rem',
                  padding: '4px 8px 3px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Mencionar a (prioridad {ctxModulo}):</span>
                <span style={{ fontSize: '.64rem', color: 'var(--primary, #ff8a00)' }}>Solo activos</span>
              </div>

              {miembrosAgrupados.map(([depto, usuarios]) => (
                <div key={depto} style={{ marginTop: '4px' }}>
                  <div
                    style={{
                      fontSize: '.64rem',
                      fontWeight: 800,
                      color: depto === 'COMPRAS' || depto === 'TESORERIA' ? 'var(--primary-2, #ffa733)' : 'var(--text-dim, #6a7585)',
                      padding: '3px 8px 1px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{depto}</span>
                    <span style={{ opacity: 0.7 }}>{usuarios.length}</span>
                  </div>

                  {usuarios.map((m) => {
                    const itemIdx = miembrosPlana.indexOf(m);
                    const seleccionado = itemIdx === menuIndex;
                    return (
                      <div
                        key={m.email}
                        onClick={() => insertarSugerencia(m.nombre, true)}
                        onMouseEnter={() => itemIdx !== -1 && setMenuIndex(itemIdx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '5px 8px',
                          borderRadius: 5,
                          cursor: 'pointer',
                          background: seleccionado ? 'rgba(255,138,0,.15)' : 'transparent',
                          color: seleccionado ? 'var(--primary, #ff8a00)' : 'inherit',
                          fontSize: '.8rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              background: seleccionado ? 'var(--primary, #ff8a00)' : 'rgba(255,138,0,.2)',
                              color: seleccionado ? '#1c1f24' : 'var(--primary, #ff8a00)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '.66rem',
                              fontWeight: 800,
                            }}
                          >
                            @
                          </span>
                          <span style={{ fontWeight: 600 }}>{m.nombre}</span>
                        </div>
                        <span className="muted" style={{ fontSize: '.7rem' }}>{m.email}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Menú emergente de referencia (#) */}
          {menuTipo === 'referencia' && referenciasFiltradas.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: 'var(--surface-2, #2b3038)',
                border: '1px solid var(--border-strong, #434a56)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-lg, 0 12px 28px rgba(0,0,0,0.5))',
                maxHeight: 200,
                overflowY: 'auto',
                zIndex: 100,
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
                     r.startsWith('SS-') ? 'Solicitud de Servicio' :
                     r.startsWith('GF-') ? 'Gasto Fijo (Administración)' : 'Referencia'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Área de texto integrada */}
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
            placeholder="Escribe un mensaje… (@ para mencionar por departamento, # para referenciar)"
            value={texto}
            onChange={handleTextoChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => setInputFocused(false), 200)}
            disabled={enviando}
          />

          {/* Barra inferior integrada */}
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
                title="Referenciar orden (#OC, #SP, #CS, #SS, #GF)"
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

            {/* Botón Enviar */}
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
