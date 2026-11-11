import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/shared/lib/supabase';
import { signOut, useSession } from '@/modules/auth/authStore';
import { toast } from '@/shared/ui/Toast';
import { dateTime } from '@/shared/lib/format';
import type { Usuario } from '@/shared/lib/types';
import { colorRol, labelRol, loadRolesAndCache } from '@/modules/usuarios/usuarios.repository';
import { Iniciales } from '@/shared/ui/Iniciales';
import { HuellaModal } from '@/modules/auth/HuellaModal';
import { isWebAuthnSupported } from '@/modules/auth/webauthn.repository';
import {
  getNotifPrefs,
  playNotificationPattern,
  setNotifPrefs,
  stopNotificationPattern,
} from '@/shared/lib/sound';
import { activarNotificaciones, soportaPush } from '@/shared/lib/webpush';
import './ajustes.css';

const VIEW_KEY = 'mgg.view.pedidos';
const SCOPE_KEY = 'mgg.scope.pedidos';

export function AjustesPage() {
  const { user, session } = useSession();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [huellaOpen, setHuellaOpen] = useState(false);
  /* El caché de roles solo trae de entrada los 3 del sistema y únicamente el
     módulo Usuarios lo refresca: sin esto, quien tiene un rol personalizado
     veía aquí la clave cruda («supervisor_patio») en vez de su nombre. Y de
     paso da el color del rol para las iniciales. */
  const [rolesListos, setRolesListos] = useState(false);
  useEffect(() => {
    let vivo = true;
    loadRolesAndCache()
      .then(() => { if (vivo) setRolesListos(true); })
      .catch(() => { if (vivo) setRolesListos(true); }); // sin roles se usa lo que haya
    return () => { vivo = false; };
  }, []);

  // Perfil editable
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  // Motivo del cambio de nombre: obligatorio si cambia (queda en el historial de nombres).
  const [motivoNombre, setMotivoNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Preferencias locales (localStorage)
  const [viewPref, setViewPref] = useState<'kanban' | 'lista'>(() =>
    (typeof window !== 'undefined' && localStorage.getItem(VIEW_KEY) === 'lista') ? 'lista' : 'kanban',
  );
  const [scopePref, setScopePref] = useState<'pedidos' | 'oc'>(() =>
    (typeof window !== 'undefined' && localStorage.getItem(SCOPE_KEY) === 'oc') ? 'oc' : 'pedidos',
  );

  // Preferencias de notificaciones
  const [notifEnabled, setNotifEnabled] = useState(() => getNotifPrefs().enabled);
  const [notifSound, setNotifSound] = useState(() => getNotifPrefs().sound);
  const [notifDuration, setNotifDuration] = useState(() => getNotifPrefs().duration);

  // Notificaciones push de este dispositivo (Web Push · BORRADOR: el envío real lo hará un
  // Edge Function todavía inexistente — ver shared/lib/webpush.ts).
  const pushSoportado = soportaPush();
  const [pushMsg, setPushMsg] = useState('');
  const [pushActivando, setPushActivando] = useState(false);
  async function activarPush() {
    setPushActivando(true);
    try {
      const r = await activarNotificaciones();
      setPushMsg(r.ok ? 'Activadas en este dispositivo.' : (r.motivo ?? 'No se pudo activar.'));
      toast(r.ok ? 'Notificaciones activadas en este dispositivo.' : (r.motivo ?? 'No se pudo activar.'), r.ok ? 'success' : 'warning');
    } finally {
      setPushActivando(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!user) { setLoading(false); return; }
    supabase
      .from('usuarios')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const u = (data ?? null) as Usuario | null;
        setUsuario(u);
        setNombre(u?.nombre ?? '');
        setApellido(u?.apellido ?? '');
        setTelefono(u?.telefono ?? '');
        setDepartamento(u?.departamento ?? '');
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const cambiaNombre = !!usuario && (nombre.trim() !== (usuario.nombre ?? '').trim() || apellido.trim() !== (usuario.apellido ?? '').trim());
  // `rolesListos` entra en el cálculo para repintar cuando llega el caché.
  const rolColor = rolesListos ? colorRol(usuario?.role) : undefined;

  async function handleGuardarPerfil() {
    if (!user) return;
    if (cambiaNombre && !motivoNombre.trim()) { toast('Escribe el motivo del cambio de nombre: queda en tu historial.', 'error'); return; }
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({
          nombre: nombre.trim(),
          apellido: apellido.trim() || null,
          telefono: telefono.trim() || null,
          departamento: departamento.trim() || null,
          ...(cambiaNombre ? { nombre_cambio_motivo: motivoNombre.trim() } : {}),
        })
        .eq('id', user.id);
      if (error) throw new Error(error.message || 'No se pudo guardar el perfil');
      toast('Perfil actualizado', 'success');
      setUsuario((u) => u ? { ...u, nombre: nombre.trim(), apellido: apellido.trim() || null, telefono: telefono.trim() || null, departamento: departamento.trim() || null } : u);
      setMotivoNombre('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al guardar', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  function setView(v: 'kanban' | 'lista') {
    setViewPref(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* localStorage no disponible */ }
    toast(`Vista preferida: ${v === 'kanban' ? 'Kanban' : 'Lista'}`, 'info');
  }

  function setScope(s: 'pedidos' | 'oc') {
    setScopePref(s);
    try { localStorage.setItem(SCOPE_KEY, s); } catch { /* localStorage no disponible */ }
    toast(`Vista preferida: ${s === 'oc' ? 'Órdenes de Compra' : 'Solicitud de Pedido'}`, 'info');
  }

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  function handleCambiarClave() {
    // Pasamos `from` para que la pantalla de cambio sepa volver aquí
    // en lugar de cerrar sesión y mandar al landing.
    navigate('/cambiar-clave', { state: { from: '/app/ajustes' } });
  }

  // `.p-8` no existe en el CSS del proyecto: salía sin estilo, pegado al borde.
  if (loading) return <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="muted hint">Configura tu perfil y preferencias del sistema.</p>
        </div>
      </div>

      {/* El carnet: quién eres, una sola vez. Correo, rol y estado salían
          repetidos en Perfil y en Sesión. */}
      <div className="aju-carnet" style={{ '--rol-color': rolColor } as CSSProperties}>
        <Iniciales
          nombre={nombre} apellido={apellido} respaldo={user?.email}
          color={rolColor} tamano="lg"
        />
        <div className="aju-carnet-datos">
          <div className="aju-carnet-nombre">{[nombre, apellido].filter(Boolean).join(' ') || '—'}</div>
          <span className="aju-carnet-correo">{user?.email}</span>
          <div className="aju-carnet-marcas">
            <span className="badge primary">{labelRol(usuario?.role)}</span>
            {usuario?.estado === 'activo'
              ? <span className="badge success">Activo</span>
              : <span className="badge danger">Inactivo</span>}
            {usuario?.departamento && <span className="badge">{usuario.departamento}</span>}
          </div>
        </div>
        {session?.user?.last_sign_in_at && (
          <div className="aju-carnet-ingreso">
            <strong>Último ingreso</strong>
            {dateTime(session.user.last_sign_in_at)}
          </div>
        )}
      </div>

      {/* Perfil manda y ocupa la columna ancha: quien entra se ve primero a sí
          mismo. Antes el orden lo decidía el ancho de la pantalla. */}
      <div className="aju-grid">

        {/* Perfil */}
        <div className="card aju-card">
          <div className="card-title" style={{ marginBottom: '1rem' }}>
            <span>Perfil</span>
          </div>
          {/* Quién eres ya lo dice el carnet de arriba: aquí solo se edita. */}
          <p className="muted" style={{ marginTop: 0, fontSize: '.84rem' }}>
            Tus datos personales. El correo de acceso lo cambia un administrador.
          </p>

          <div className="form-grid">
            <div className="form-row">
              <label>Nombre</label>
              <input
                className="input"
                value={nombre}
                onChange={(e) => setNombre(e.target.value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, '').toUpperCase())}
                placeholder="Solo letras"
              />
            </div>
            <div className="form-row">
              <label>Apellido</label>
              <input
                className="input"
                value={apellido}
                onChange={(e) => setApellido(e.target.value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, '').toUpperCase())}
                placeholder="Solo letras"
              />
            </div>
          </div>
          {cambiaNombre && (
            <div className="form-row">
              <label htmlFor="perfil-motivo-nombre">Motivo del cambio de nombre *</label>
              <textarea id="perfil-motivo-nombre" className="input" rows={2} value={motivoNombre} onChange={(e) => setMotivoNombre(e.target.value)}
                placeholder="Ej.: corrección, cambio de apellido…" />
              <small className="muted">Lo que hiciste con tu nombre anterior sigue mostrando ese nombre; el cambio queda en tu historial de nombres.</small>
            </div>
          )}
          <div className="form-grid">
            <div className="form-row">
              <label>Teléfono</label>
              <input
                className="input"
                inputMode="numeric"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 15))}
                placeholder="Solo dígitos"
                maxLength={15}
              />
            </div>
            <div className="form-row">
              <label>Departamento</label>
              <input
                className="input"
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value.toUpperCase())}
                placeholder="Opcional"
              />
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleGuardarPerfil} disabled={savingProfile}>
            {savingProfile ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </div>

        {/* Notificaciones */}
        <div className="card aju-card">
          <div className="card-title" style={{ marginBottom: '1rem' }}>
            <span>Notificaciones</span>
          </div>

          <div className="setting-row">
            <div>
              <strong>Recibir notificaciones</strong>
              <div className="muted" style={{ fontSize: '.82rem' }}>
                Mostrar alertas in-app (campana del topbar) y toasts.
              </div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={notifEnabled}
                onChange={(e) => {
                  setNotifEnabled(e.target.checked);
                  setNotifPrefs({ enabled: e.target.checked });
                }}
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          <div className="setting-row">
            <div>
              <strong>Sonido al recibir</strong>
              <div className="muted" style={{ fontSize: '.82rem' }}>
                Reproduce un patrón sonoro intermedio (doble-beep).
              </div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={notifSound}
                disabled={!notifEnabled}
                onChange={(e) => {
                  setNotifSound(e.target.checked);
                  setNotifPrefs({ sound: e.target.checked });
                }}
              />
              <span className="slider-toggle"></span>
            </label>
          </div>

          <div className="setting-row">
            <div style={{ flex: 1 }}>
              <strong>Duración del sonido</strong>
              <div className="muted" style={{ fontSize: '.82rem' }}>
                <span className="mono">{notifDuration} s</span> de repetición al sonar el patrón.
              </div>
              <input
                type="range"
                min={3}
                max={30}
                step={1}
                value={notifDuration}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setNotifDuration(v);
                  setNotifPrefs({ duration: v });
                }}
                disabled={!notifEnabled || !notifSound}
                style={{ width: '100%', marginTop: '.5rem', accentColor: 'var(--primary)' }}
              />
            </div>
          </div>

          <div className="setting-row">
            <div style={{ flex: 1 }}>
              <strong>
                Notificaciones en este dispositivo{' '}
                <span className="badge warning" style={{ fontSize: '.65rem' }}>En preparación</span>
              </strong>
              <div className="muted" style={{ fontSize: '.82rem' }}>
                {/* La pantalla deja de prometer de más: el cliente de Web Push
                    está listo, pero el envío (Edge Function) todavía no existe,
                    así que con la app cerrada aún no llega nada. */}
                Registra este dispositivo para recibir avisos con la app cerrada. El envío
                todavía no está montado, así que por ahora los avisos solo llegan con el
                sistema abierto.
                {!pushSoportado && ' Este navegador no lo soporta.'}
                {pushMsg && <><br />{pushMsg}</>}
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-primary" disabled={!pushSoportado || pushActivando} onClick={() => void activarPush()}>
              {pushActivando ? 'Activando…' : 'Activar'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
            <button
              className="btn btn-ghost"
              onClick={() => playNotificationPattern(notifDuration)}
              disabled={!notifEnabled || !notifSound}
            >
              🔊 Probar sonido
            </button>
            <button className="btn btn-ghost" onClick={stopNotificationPattern}>
              ■ Detener
            </button>
          </div>
        </div>

        {/* Seguridad */}
        <div className="card aju-card">
          <div className="card-title" style={{ marginBottom: '1rem' }}>
            <span>Seguridad</span>
          </div>
          <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
            Cambia tu clave de acceso al sistema. Vas a ser redirigido al login después de actualizarla.
          </p>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={handleCambiarClave}>
              🔑 Cambiar mi clave
            </button>
            {isWebAuthnSupported() && (
              <button
                className="btn btn-ghost"
                onClick={() => setHuellaOpen(true)}
                title="Activar el ingreso con huella/biometría en este equipo"
              >
                🔒 Entrar con huella (este equipo)
              </button>
            )}
          </div>
          {isWebAuthnSupported() && (
            <p className="muted" style={{ fontSize: '.78rem', marginTop: '.6rem' }}>
              La huella se activa por equipo: registra la biometría de este dispositivo para entrar más rápido.
            </p>
          )}
        </div>

        {/* Preferencias de vista */}
        <div className="card aju-card">
          <div className="card-title" style={{ marginBottom: '1rem' }}>
            <span>Vista preferida (Pedidos)</span>
          </div>
          <p className="muted" style={{ fontSize: '.85rem', marginBottom: '.75rem' }}>
            Modo por defecto del módulo Pedidos/Compras. Igualmente puedes alternar dentro del módulo.
          </p>

          {/* Son dos preguntas distintas y antes iban sin etiqueta, una debajo
              de la otra: nada decía cuál era cuál. */}
          <div className="aju-preferencia">
            <span className="aju-preferencia-label" id="aju-como">Cómo se ve</span>
            <div className="view-toggle" role="tablist" aria-labelledby="aju-como">
              <button type="button" role="tab" aria-selected={viewPref === 'kanban'}
                className={viewPref === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>▦ Kanban</button>
              <button type="button" role="tab" aria-selected={viewPref === 'lista'}
                className={viewPref === 'lista' ? 'active' : ''} onClick={() => setView('lista')}>☰ Lista</button>
            </div>
          </div>
          <div className="aju-preferencia">
            <span className="aju-preferencia-label" id="aju-que">Qué abre</span>
            <div className="view-toggle" role="tablist" aria-labelledby="aju-que">
              <button type="button" role="tab" aria-selected={scopePref === 'pedidos'}
                className={scopePref === 'pedidos' ? 'active' : ''} onClick={() => setScope('pedidos')}>✉ Solicitud de Pedido</button>
              <button type="button" role="tab" aria-selected={scopePref === 'oc'}
                className={scopePref === 'oc' ? 'active' : ''} onClick={() => setScope('oc')}>🧾 Órdenes de Compra</button>
            </div>
          </div>
        </div>

        {/* Sesión */}
        <div className="card aju-card">
          <div className="card-title" style={{ marginBottom: '1rem' }}>
            <span>Sesión</span>
          </div>
          {/* Correo, rol, estado y último ingreso los dice el carnet de
              arriba: repetirlos aquí era decir dos veces lo mismo. */}
          <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
            Al cerrar sesión vuelves a la pantalla de ingreso. Tus datos y preferencias
            quedan guardados.
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
            <button className="btn btn-danger" onClick={handleLogout}>
              ⎋ Cerrar sesión
            </button>
          </div>
        </div>

      </div>

      {huellaOpen && <HuellaModal onClose={() => setHuellaOpen(false)} />}
    </div>
  );
}
