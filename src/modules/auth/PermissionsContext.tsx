import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getAppUser, signOut, useSession, type AppUser } from './authStore';
import { useRealtime } from '@/shared/lib/useRealtime';
import {
  loadAccesoRol,
  SIN_TELEFONO,
  defaultsFor,
  normalizeRolePermisos,
  MODULES,
  type ModuleKey,
  type ModulePermission,
  type RolePermisos,
  type AccesoTelefonoRol,
} from '@/modules/usuarios/permisos.repository';
import { VISTAS_TELEFONO, inicioTelefono, vistasPermitidas, type VistaTelefono, type VistaTelefonoKey } from './vistasTelefono';
import {
  puedeVerAlmacen as verAlmacen,
  puedeEscribirAlmacen as escribirAlmacen,
  type PermisosAlmacenes,
} from './permisosAlmacen';
import { resolverDeposito } from '@/modules/inventario/depositos';

export type PermLevel = keyof ModulePermission; // 'lectura' | 'escritura' | 'full'

interface PermissionsValue {
  loading: boolean;
  role: string | null;
  /** Usuario actual (de la tabla `usuarios`). Compartido para evitar re-consultarlo por página. */
  appUser: AppUser | null;
  permisos: RolePermisos | null;
  isAdmin: boolean;
  /** ¿El rol actual tiene `level` (por defecto lectura) sobre `module`? */
  can: (module: ModuleKey, level?: PermLevel) => boolean;
  /** Módulos con al menos lectura, en el orden canónico de MODULES. */
  allowedModules: ModuleKey[];
  /** Pantallas de teléfono que puede abrir: las de su rol con lectura en su módulo. */
  vistasTelefono: VistaTelefono[];
  /** ¿Puede abrir esta pantalla de teléfono? */
  puedeVista: (vista: VistaTelefonoKey) => boolean;
  /** Su rol trabaja solo desde el teléfono: no ve las pantallas de PC, salvo Ajustes. */
  soloTelefono: boolean;
  /** Claves de pantallas de teléfono dadas al rol (sin filtrar por permisos). */
  vistasDelRol: readonly string[];
  /** Depósitos del rol (roles_permisos.almacenes). El General no va aquí: es el módulo Inventario. */
  almacenes: PermisosAlmacenes;
  /** ¿Puede ver ese depósito (por nombre de almacén)? 'General' = lectura en Inventario. */
  puedeVerAlmacen: (almacen: string | null | undefined) => boolean;
  /** ¿Puede cargar en ese depósito? 'General' = escritura en Inventario. */
  puedeEscribirAlmacen: (almacen: string | null | undefined) => boolean;
}

const PermissionsContext = createContext<PermissionsValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [permisos, setPermisos] = useState<RolePermisos | null>(null);
  const [telefono, setTelefono] = useState<AccesoTelefonoRol>(SIN_TELEFONO);
  const [almacenes, setAlmacenes] = useState<PermisosAlmacenes>({});

  // Carga el rol del usuario y su matriz de permisos. Reutilizable: se llama al
  // iniciar sesión y cada vez que cambian roles/permisos/usuarios (realtime), para
  // que un cambio de un admin se refleje en la sesión activa SIN recargar.
  const cargar = useCallback(async (mostrarCargando: boolean) => {
    if (!user) return;
    if (mostrarCargando) setLoading(true);
    const u = await getAppUser(user);
    // Cuenta deshabilitada (el admin la desactivó, quizá con la sesión abierta):
    // el servidor ya bloquea toda escritura vía is_operativo(); aquí además la
    // sacamos al login con un motivo claro. Cubre tanto el arranque como el
    // refresco por realtime de `usuarios`.
    if (u && u.estado && u.estado !== 'activo') {
      try { localStorage.setItem('cuenta_deshabilitada', '1'); } catch { /* ignore */ }
      await signOut();
      setAppUser(null);
      setRole(null);
      setPermisos(null);
      setTelefono(SIN_TELEFONO);
      setAlmacenes({});
      setLoading(false);
      return;
    }
    setAppUser(u);
    const r = u?.role ?? null;
    setRole(r);
    if (!r) {
      setPermisos(null);
      setTelefono(SIN_TELEFONO);
      setAlmacenes({});
      setLoading(false);
      return;
    }
    let stored: RolePermisos | null = null;
    let tel: AccesoTelefonoRol = SIN_TELEFONO;
    let alms: PermisosAlmacenes = {};
    try {
      const acceso = await loadAccesoRol(r);
      stored = acceso?.permisos ?? null;
      tel = acceso?.telefono ?? SIN_TELEFONO;
      alms = acceso?.almacenes ?? {};
    } catch {
      stored = null; // RLS/offline: caemos a los defaults del rol (sin depósitos)
    }
    setTelefono(tel);
    setAlmacenes(alms);
    // Si la matriz aún no tiene fila para el rol, usamos los defaults (mismos que el panel).
    setPermisos(stored ? normalizeRolePermisos(stored, r) : defaultsFor(r));
    setLoading(false);
    // Dependemos del ID del usuario, NO del objeto `user`: al cambiar de pestaña y
    // volver, Supabase refresca el token y emite onAuthStateChange con un objeto
    // `user` NUEVO (mismo id). Si dependiéramos del objeto, `cargar` se recrearía,
    // el efecto se re-ejecutaría con setLoading(true) y se desmontaría la página
    // (cerrando cualquier modal abierto). Con el id estable, eso no ocurre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setRole(null);
      setAppUser(null);
      setPermisos(null);
      setTelefono(SIN_TELEFONO);
      setAlmacenes({});
      setLoading(false);
      return;
    }
    void cargar(true);
  }, [user?.id, sessionLoading, cargar]);

  // Sincronización en vivo: si el admin cambia los permisos de un rol o reasigna el
  // rol del usuario, su sesión re-aplica los permisos al instante (sin recargar).
  useRealtime(
    ['roles_permisos', 'custom_roles', 'usuarios'],
    () => { void cargar(false); },
    { enabled: !!user },
  );

  const value = useMemo<PermissionsValue>(() => {
    const isAdmin = role === 'admin';
    const can = (module: ModuleKey, level: PermLevel = 'lectura') => {
      // El admin es superusuario: nunca queda bloqueado de su propio panel de permisos.
      if (isAdmin) return true;
      const p = permisos?.[module];
      if (!p) return false;
      return p.full || p[level];
    };
    const allowedModules = MODULES.map((m) => m.key).filter((k) => can(k, 'lectura'));
    // Cada depósito se da por rol (30/10/2026); el General sigue siendo el módulo Inventario.
    const ctxAlmacen = {
      isAdmin, almacenes,
      inventario: { lectura: can('inventario', 'lectura'), escritura: can('inventario', 'escritura') },
    };
    const puedeVerAlmacen = (a: string | null | undefined) => verAlmacen(a, ctxAlmacen);
    const puedeEscribirAlmacen = (a: string | null | undefined) => escribirAlmacen(a, ctxAlmacen);
    const vistasTelefono = vistasPermitidas(telefono.vistas, (m) => can(m, 'lectura'), isAdmin, puedeVerAlmacen);
    const puedeVista = (vista: VistaTelefonoKey) => vistasTelefono.some((v) => v.key === vista);
    // El administrador nunca queda encerrado en el teléfono.
    const soloTelefono = !isAdmin && telefono.soloTelefono;
    return {
      loading, role, appUser, permisos, isAdmin, can, allowedModules, vistasTelefono, puedeVista, soloTelefono,
      vistasDelRol: telefono.vistas, almacenes, puedeVerAlmacen, puedeEscribirAlmacen,
    };
  }, [loading, role, appUser, permisos, telefono, almacenes]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions debe usarse dentro de <PermissionsProvider>');
  return ctx;
}

/** Adónde va el usuario cuando entra o cuando cae en algo que no puede ver. */
function destinoInicial(p: Pick<PermissionsValue, 'allowedModules' | 'soloTelefono' | 'vistasTelefono' | 'almacenes'>): string {
  if (p.soloTelefono) return inicioTelefono(p.vistasTelefono);
  const first = p.allowedModules[0];
  if (first) return `/app/${first}`;
  // Sin módulos pero con algún depósito: entra a su depósito.
  const deposito = Object.keys(p.almacenes)[0];
  return deposito ? resolverDeposito(deposito).ruta : '/app/sin-acceso';
}

/** Envuelve una página: si el rol no tiene lectura sobre `module`, redirige al primer módulo permitido. */
export function RequireModule({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const p = usePermissions();
  if (p.loading) return <div className="p-8 muted">Cargando…</div>;
  // Solo teléfono: de las pantallas de PC solo queda Ajustes (para cambiar la clave).
  if (p.soloTelefono && module !== 'ajustes') return <Navigate to={inicioTelefono(p.vistasTelefono)} replace />;
  if (p.can(module, 'lectura')) return <>{children}</>;
  return <Navigate to={destinoInicial(p)} replace />;
}

/**
 * Envuelve una pantalla de teléfono: hace falta la pantalla en el rol y lectura en su módulo.
 * Quien tiene el módulo pero no la pantalla va a la versión de PC del módulo.
 */
export function RequireVistaTelefono({ vista, children }: { vista: VistaTelefonoKey; children: ReactNode }) {
  const p = usePermissions();
  if (p.loading) return <div className="p-8 muted">Cargando…</div>;
  if (p.puedeVista(vista)) return <>{children}</>;
  const v = VISTAS_TELEFONO.find((x) => x.key === vista);
  // Pantalla de un depósito: sin permiso en ese depósito, aviso; con permiso pero sin la pantalla, a su PC.
  if (v?.almacen) {
    if (!p.puedeVerAlmacen(v.almacen)) return <SinAccesoDeposito nombre={resolverDeposito(v.almacen).nombre} volver={destinoInicial(p)} />;
    if (!p.soloTelefono && v.rutaPc) return <Navigate to={v.rutaPc} replace />;
    return <Navigate to={destinoInicial(p)} replace />;
  }
  if (!p.soloTelefono && v && p.can(v.modulo, 'lectura')) return <Navigate to={`/app/${v.modulo}`} replace />;
  return <Navigate to={destinoInicial(p)} replace />;
}

/** Pantallas de teléfono que abren los depósitos (sus chips llevan de uno a otro). */
const VISTAS_DE_DEPOSITO: readonly string[] = ['deposito_mina', 'inventario'];

/** Aviso amable cuando se entra por URL a un depósito que el rol no tiene. */
function SinAccesoDeposito({ nombre, volver }: { nombre: string; volver: string }) {
  return (
    <div className="card" style={{ padding: '2rem', maxWidth: 520, margin: '2rem auto', textAlign: 'center' }}>
      <h2 style={{ marginTop: 0 }}>⛔ No tienes acceso a este depósito</h2>
      <p className="muted">
        Tu rol no tiene permiso sobre <strong>{nombre}</strong>. Pídele a un administrador que te lo
        asigne en <strong>Usuarios → Roles y Permisos → Depósitos</strong>.
      </p>
      <Link to={volver} className="btn btn-ghost">← Volver</Link>
    </div>
  );
}

/**
 * Envuelve un depósito (30/10/2026): cada uno se da por rol (roles_permisos.almacenes);
 * el General sigue siendo el módulo Inventario. Sin permiso → aviso «No tienes acceso».
 * `deposito` = clave/slug/nombre; si falta, sale del `:slug` de la ruta.
 * `telefono`: además hace falta una pantalla de teléfono de depósitos en el rol.
 */
export function RequireDeposito({ deposito, telefono = false, children }: { deposito?: string; telefono?: boolean; children: ReactNode }) {
  const p = usePermissions();
  const params = useParams<{ slug?: string }>();
  if (p.loading) return <div className="p-8 muted">Cargando…</div>;
  const dep = resolverDeposito(deposito ?? params.slug ?? 'general');
  if (!telefono && p.soloTelefono) return <Navigate to={inicioTelefono(p.vistasTelefono)} replace />;
  if (!p.puedeVerAlmacen(dep.almacen)) return <SinAccesoDeposito nombre={dep.nombre} volver={destinoInicial(p)} />;
  if (telefono && !p.isAdmin && !p.vistasDelRol.some((k) => VISTAS_DE_DEPOSITO.includes(k))) {
    return <Navigate to={p.soloTelefono ? destinoInicial(p) : dep.ruta} replace />;
  }
  return <>{children}</>;
}

/** Envuelve una página SOLO para administradores; a los demás los redirige a su primer módulo. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const p = usePermissions();
  if (p.loading) return <div className="p-8 muted">Cargando…</div>;
  if (p.isAdmin) return <>{children}</>;
  return <Navigate to={destinoInicial(p)} replace />;
}

/** Redirige al primer módulo al que el usuario tiene acceso (usado como índice de /app).
 *  Un rol solo teléfono va a su pantalla, o a «Mis pantallas» si tiene varias. */
export function HomeRedirect() {
  const p = usePermissions();
  if (p.loading) return <div className="p-8 muted">Cargando…</div>;
  return <Navigate to={destinoInicial(p)} replace />;
}
