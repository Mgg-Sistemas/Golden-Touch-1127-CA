import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './usuarios.css';
import { toast } from '@/shared/ui/Toast';
import { mensajeError } from '@/shared/lib/errores';
import { notify } from '@/shared/lib/notify';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { norm } from '@/shared/lib/texto';
import {
  loadPermisos,
  savePermisosRole,
  eliminarPermisosRol,
  normalizeRolePermisos,
  emptyPermission as empty,
  defaultsFor,
  loadTelefonoRoles,
  saveTelefonoRol,
  loadAlmacenesRoles,
  saveAlmacenesRol,
  SIN_TELEFONO,
  type AccesoTelefonoRol,
  type AllPermisos,
  type ModuleKey,
  type ModulePermission,
  type RoleKey,
  type RolePermisos,
} from './permisos.repository';
import {
  listRoles,
  eliminarRol,
  contarUsuariosPorRol,
  type CustomRole,
} from './roles.repository';
import { setRolesCache } from './usuarios.repository';
import { NuevoRolModal, GestionarRolesModal } from './RolesModales';
import { conNivelAlmacen, esAlmacenGeneral, type NivelEditor, type PermisosAlmacenes } from '@/modules/auth/permisosAlmacen';
import { listAlmacenes } from '@/modules/inventario/almacenes.repository';
import type { Almacen } from '@/shared/lib/types';
import { UsuariosAutorizadosPanel } from './UsuariosAutorizadosPanel';
import { RolFicha } from './RolFicha';
import { alcanceDeRol } from './gruposModulos';

// Un módulo que la fila guardada aún no trae (p. ej. «Solicitud de Pedido» / «Compras»,
// 31/10/2026) se muestra con el default del rol: es lo mismo que aplica la sesión
// (PermissionsContext → normalizeRolePermisos con rol), así la matriz no miente.
function normalize(stored: Partial<AllPermisos>, roles: CustomRole[]): AllPermisos {
  return roles.reduce<AllPermisos>((acc, r) => {
    const role = stored[r.key] as Partial<RolePermisos> | undefined;
    acc[r.key] = role ? normalizeRolePermisos(role, r.key) : defaultsFor(r.key);
    return acc;
  }, {} as AllPermisos);
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'crear' }
  | { kind: 'gestionar' }
  | { kind: 'eliminar'; role: CustomRole };

export function RolesPermisosPanel({ readOnly = false, onRolesChanged }: { readOnly?: boolean; onRolesChanged?: () => void } = {}) {
  const { user } = useSession();
  const { isAdmin } = usePermissions(); // el rol admin solo lo edita el admin
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [permisos, setPermisos] = useState<AllPermisos>({} as AllPermisos);
  const [telefono, setTelefono] = useState<Record<RoleKey, AccesoTelefonoRol>>({});
  // Depósitos por rol (30/10/2026): cada uno sin acceso / lectura / escritura. El General es el módulo Inventario.
  const [almacenesRol, setAlmacenesRol] = useState<Record<RoleKey, PermisosAlmacenes>>({});
  const [depositos, setDepositos] = useState<Almacen[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoEstado, setAutoEstado] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle');
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [buscarRol, setBuscarRol] = useState('');
  /* Galería → ficha. Se abre en la galería (capa de descubrimiento) y
     la matriz solo se monta para el rol que se va a editar. */
  const [rolAbierto, setRolAbierto] = useState<RoleKey | null>(null);
  // Guardados en curso. Mientras haya alguno, el eco de tiempo real de NUESTRO
  // propio guardado no se aplica (pisaría un clic hecho un instante después);
  // se refresca una sola vez al terminar el último.
  const guardandoRef = useRef(0);
  const refrescarAlTerminar = useRef(false);

  // `silencioso`: actualiza los datos sin mostrar «Cargando…». Antes cada cambio
  // de permiso volvía por tiempo real, la matriz entera se desmontaba y se
  // volvía a pintar (parecía que la página se refrescaba y el scroll saltaba).
  async function refresh(silencioso = false) {
    if (!silencioso) setLoading(true);
    try {
      const [rolesList, remote, c, tel, alms, deps] = await Promise.all([
        listRoles(),
        loadPermisos(),
        contarUsuariosPorRol(),
        loadTelefonoRoles().catch(() => ({} as Record<RoleKey, AccesoTelefonoRol>)),
        loadAlmacenesRoles().catch(() => ({} as Record<RoleKey, PermisosAlmacenes>)),
        listAlmacenes().catch(() => [] as Almacen[]),
      ]);
      setRolesCache(rolesList);
      setRoles(rolesList);
      setCounts(c);
      setTelefono(tel);
      setAlmacenesRol(alms);
      setDepositos(deps.filter((a) => !esAlmacenGeneral(a.nombre) && a.estado !== 'inactivo'));
      if (remote) {
        setPermisos(normalize(remote, rolesList));
      } else {
        const defaults = rolesList.reduce<AllPermisos>((acc, r) => {
          acc[r.key] = defaultsFor(r.key);
          return acc;
        }, {} as AllPermisos);
        setPermisos(defaults);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar la matriz', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void refresh().finally(() => { if (cancelled) void 0; });
    return () => { cancelled = true; };
  }, []);
  // En vivo (multiusuario): cambios de roles o de la matriz de permisos se reflejan solos.
  useRealtime(['custom_roles', 'roles_permisos', 'taxonomias', 'almacenes'], () => {
    if (guardandoRef.current > 0) { refrescarAlTerminar.current = true; return; }
    void refresh(true);
  });

  function terminarGuardado() {
    guardandoRef.current -= 1;
    if (guardandoRef.current === 0 && refrescarAlTerminar.current) {
      refrescarAlTerminar.current = false;
      void refresh(true);
    }
  }

  // Recarga la matriz y avisa al padre (para que el dropdown de "crear usuario"
  // y otros listados de roles se actualicen automáticamente tras un cambio).
  async function reload() {
    await refresh(true);
    onRolesChanged?.();
  }

  function togglePerm(role: RoleKey, mod: ModuleKey, field: keyof ModulePermission) {
    setPermisos((prev) => {
      const current = prev[role]?.[mod] ?? { ...empty };
      const next: ModulePermission = { ...current, [field]: !current[field] };
      if (field === 'full' && next.full) {
        next.lectura = true;
        next.escritura = true;
      }
      if ((field === 'lectura' || field === 'escritura') && !next[field]) {
        next.full = false;
      }
      const nextRole = normalizeRolePermisos({ ...prev[role], [mod]: next });
      // Autoguardado: persiste de inmediato los permisos de ESE rol (no depende
      // del botón "Guardar", para que no se pierdan al cambiar de vista).
      void persistirRol(role, nextRole);
      return { ...prev, [role]: nextRole };
    });
  }

  async function persistirRol(role: RoleKey, rolePermisos: RolePermisos) {
    setAutoEstado('guardando');
    guardandoRef.current += 1;
    try {
      await savePermisosRole(role, rolePermisos, user?.email ?? 'sistema');
      setAutoEstado('guardado');
    } catch (e) {
      setAutoEstado('error');
      // Los errores de Supabase son objetos planos (no `Error`): antes se tapaba la causa real
      // con el texto genérico (01/11/2026, «No se pudo guardar el permiso» sin más).
      toast(mensajeError(e, 'No se pudo guardar el permiso'), 'error');
      refrescarAlTerminar.current = true; // vuelve a lo que de verdad quedó guardado
    } finally {
      terminarGuardado();
    }
  }

  // Pantallas de teléfono del rol: también se guardan solas, sin tocar la matriz de módulos.
  function cambiarTelefono(role: RoleKey, cambio: Partial<AccesoTelefonoRol>) {
    const next = { ...(telefono[role] ?? SIN_TELEFONO), ...cambio };
    setTelefono((prev) => ({ ...prev, [role]: next }));
    void persistirTelefono(role, next);
  }

  async function persistirTelefono(role: RoleKey, acceso: AccesoTelefonoRol) {
    setAutoEstado('guardando');
    guardandoRef.current += 1;
    try {
      await saveTelefonoRol(role, acceso, user?.email ?? 'sistema', permisos[role] ?? defaultsFor(role));
      setAutoEstado('guardado');
    } catch (e) {
      setAutoEstado('error');
      toast(mensajeError(e, 'No se pudo guardar la pantalla de teléfono'), 'error');
      refrescarAlTerminar.current = true;
    } finally {
      terminarGuardado();
    }
  }

  // Depósitos del rol: autoguardado, solo toca roles_permisos.almacenes.
  function cambiarDeposito(role: RoleKey, almacen: string, nivel: NivelEditor) {
    const next = conNivelAlmacen(almacenesRol[role] ?? {}, almacen, nivel);
    setAlmacenesRol((prev) => ({ ...prev, [role]: next }));
    void persistirDepositos(role, next);
  }

  async function persistirDepositos(role: RoleKey, almacenes: PermisosAlmacenes) {
    setAutoEstado('guardando');
    guardandoRef.current += 1;
    try {
      await saveAlmacenesRol(role, almacenes, user?.email ?? 'sistema', permisos[role] ?? defaultsFor(role));
      setAutoEstado('guardado');
    } catch (e) {
      setAutoEstado('error');
      toast(mensajeError(e, 'No se pudo guardar el permiso del depósito'), 'error');
      refrescarAlTerminar.current = true;
    } finally {
      terminarGuardado();
    }
  }

  function resetRol(role: RoleKey) {
    const def = defaultsFor(role);
    setPermisos((prev) => ({ ...prev, [role]: def }));
    void persistirRol(role, def); // autoguardado
    toast(`Permisos del rol "${role}" reseteados al valor por defecto`, 'info');
  }

  async function handleEliminarRol(role: CustomRole) {
    try {
      await eliminarRol(role.key);
      try { await eliminarPermisosRol(role.key); } catch { /* opcional */ }
      notify(`Rol eliminado: ${role.label}`, 'success', { link: '#/app/usuarios' });
      setModal({ kind: 'none' });
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error');
    }
  }

  const rolesVisibles = (() => {
    const t = norm(buscarRol);
    if (!t) return roles;
    return roles.filter((r) => t.split(/\s+/).every((p) => norm(`${r.label} ${r.key} ${r.descripcion ?? ''}`).includes(p)));
  })();

  const rolSel = rolAbierto ? roles.find((r) => r.key === rolAbierto) ?? null : null;

  /* La ficha del rol reemplaza la galería: la matriz se monta solo para
     el rol que se está editando, no para los seis a la vez. */
  if (rolSel) {
    const enUso = counts[rolSel.key] ?? 0;
    return (
      <div>
        <RolFicha
          rol={rolSel}
          usuariosEnUso={enUso}
          permisos={permisos[rolSel.key]}
          telefono={telefono[rolSel.key]}
          almacenes={almacenesRol[rolSel.key]}
          depositos={depositos}
          readOnly={readOnly}
          bloqueado={rolSel.key === 'admin' && !isAdmin}
          autoEstado={autoEstado}
          onVolver={() => setRolAbierto(null)}
          onToggle={(mod, field) => togglePerm(rolSel.key, mod, field)}
          onTelefono={(cambio) => cambiarTelefono(rolSel.key, cambio)}
          onDeposito={(almacen, nivel) => cambiarDeposito(rolSel.key, almacen, nivel)}
          onReset={() => resetRol(rolSel.key)}
          onEliminar={!readOnly && !rolSel.sistema && enUso === 0 ? () => setModal({ kind: 'eliminar', role: rolSel }) : null}
        />

        {modal.kind === 'eliminar' && (
          <ConfirmDialog
            title="Eliminar rol"
            message={`Se eliminará el rol "${modal.role.label}". Esto borra también su matriz de permisos. ¿Continuar?`}
            confirmText="Eliminar"
            danger
            onCancel={() => setModal({ kind: 'none' })}
            onConfirm={async () => {
              await handleEliminarRol(modal.role);
              setRolAbierto(null); // el rol ya no existe: volver a la galería
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Quién FIRMA no es lo mismo que qué puede ver cada rol: va antes
          y con encabezado propio, en vez de empotrado entre los roles. */}
      <div className="rol-seccion-aparte">
        <UsuariosAutorizadosPanel readOnly={readOnly} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <p className="muted" style={{ margin: 0, fontSize: '.88rem', maxWidth: '58ch' }}>
          Elige un rol para ver y ajustar qué puede hacer. Puedes crear roles nuevos y
          eliminar los que no tengan usuarios asignados.
        </p>
        {!readOnly && (
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={() => setModal({ kind: 'gestionar' })} title="Editar nombre, descripción o color de roles">
              ⚙ Gestionar
            </button>
            <button className="btn btn-ghost" onClick={() => setModal({ kind: 'crear' })}>+ Nuevo rol</button>
          </div>
        )}
      </div>

      {!loading && (
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.9rem' }}>
          <input
            id="roles-buscar" className="input" style={{ maxWidth: 360 }}
            value={buscarRol} onChange={(e) => setBuscarRol(e.target.value)}
            placeholder="🔍 Buscar rol por nombre o descripción…" aria-label="Buscar rol"
          />
          {buscarRol && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setBuscarRol('')}>✕ Limpiar</button>}
          <span className="muted" style={{ fontSize: '.8rem' }}>{rolesVisibles.length} de {roles.length} roles</span>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: '1.25rem' }}>
          <p className="muted" style={{ margin: 0 }}>Cargando roles…</p>
        </div>
      ) : !rolesVisibles.length ? (
        <div className="card muted" style={{ padding: '1.25rem' }}>Ningún rol coincide con «{buscarRol}».</div>
      ) : (
        /* Galería: cada rol resumido en una barra de alcance. Antes había
           que recorrer seis tablas enteras para compararlos. */
        <div className="rol-galeria">
          {rolesVisibles.map((rc) => {
            const enUso = counts[rc.key] ?? 0;
            const alcance = alcanceDeRol(permisos[rc.key]);
            const pct = Math.round((alcance.conAcceso / alcance.total) * 100);
            const vistasTel = telefono[rc.key]?.vistas.length ?? 0;
            const deps = Object.keys(almacenesRol[rc.key] ?? {}).length;
            return (
              <button
                key={rc.key}
                type="button"
                className="rol-card"
                style={{ '--rol-color': rc.color } as CSSProperties}
                onClick={() => setRolAbierto(rc.key)}
                title={`Ver y ajustar los permisos de ${rc.label}`}
              >
                <span className="rol-card-nombre">
                  {rc.label}
                  {rc.sistema && <span className="badge" style={{ fontSize: '.65rem' }}>SISTEMA</span>}
                </span>
                <span className="rol-card-usuarios">
                  {enUso === 0 ? 'Sin usuarios asignados' : `${enUso} usuario(s) asignado(s)`}
                </span>
                {rc.descripcion && <p className="rol-card-desc">{rc.descripcion}</p>}

                <span className="rol-alcance-fila">
                  <span
                    className="rol-alcance"
                    role="img"
                    aria-label={`Ve ${alcance.conAcceso} de ${alcance.total} módulos`}
                  >
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <span className="rol-alcance-cifra">{alcance.conAcceso}/{alcance.total}</span>
                </span>

                <span className="rol-card-extras">
                  <span>✎ {alcance.escritura} con escritura</span>
                  {alcance.full > 0 && <span>★ {alcance.full} full</span>}
                  {rc.key === 'admin'
                    ? <span>📱 todas · ⛏ todos</span>
                    : <>
                        <span>📱 {vistasTel === 0 ? 'sin pantallas' : `${vistasTel} pantalla(s)`}</span>
                        <span>⛏ {deps === 0 ? 'sin depósitos' : `${deps} depósito(s)`}</span>
                      </>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {modal.kind === 'crear' && (
        <NuevoRolModal
          actorEmail={user?.email ?? undefined}
          onClose={() => setModal({ kind: 'none' })}
          onCreated={async (creado) => {
            const def = defaultsFor(creado.key);
            setPermisos((prev) => ({ ...prev, [creado.key]: def }));
            // Persiste la fila del nuevo rol de inmediato (autoguardado) para que
            // no se pierda al refrescar la matriz.
            await persistirRol(creado.key, def);
            setModal({ kind: 'none' });
            await reload();
            // Un rol recién creado no tiene nada configurado: se abre su ficha
            // para seguir sin buscarlo en la galería.
            setRolAbierto(creado.key);
          }}
        />
      )}

      {modal.kind === 'gestionar' && (
        <GestionarRolesModal
          roles={roles}
          conteoUso={counts}
          actorEmail={user?.email ?? undefined}
          onClose={() => setModal({ kind: 'none' })}
          onCambioAplicado={reload}
        />
      )}

      {modal.kind === 'eliminar' && (
        <ConfirmDialog
          title="Eliminar rol"
          message={`Se eliminará el rol "${modal.role.label}". Esto borra también su matriz de permisos. ¿Continuar?`}
          confirmText="Eliminar"
          danger
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={() => handleEliminarRol(modal.role)}
        />
      )}
    </div>
  );
}
