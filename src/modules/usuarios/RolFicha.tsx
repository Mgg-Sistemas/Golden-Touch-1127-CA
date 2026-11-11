/* ============================================================
   Golden Touch · Roles y permisos › Ficha de un rol
   Antes cada rol era una tarjeta con 26 filas × 3 casillas, y se
   pintaban todas a la vez: una pared. Aquí el rol se abre solo
   cuando se va a editar, y su contenido se parte en tres temas
   hermanos — Módulos · Teléfono · Depósitos — en vez de apilar
   teléfono y depósitos al fondo como apéndices.

   Dentro de «Módulos», los 26 permisos se agrupan por el proceso
   que atienden (ver gruposModulos.ts).

   Es presentación: cada casilla sigue llamando exactamente al
   mismo manejador de antes, con la misma clave de módulo.
   ============================================================ */
import { useState, type CSSProperties } from 'react';
import { VISTAS_TELEFONO } from '@/modules/auth/vistasTelefono';
import { iconoDeposito } from '@/modules/inventario/depositos';
import type { NivelEditor, PermisosAlmacenes } from '@/modules/auth/permisosAlmacen';
import type { Almacen } from '@/shared/lib/types';
import type { CustomRole } from './roles.repository';
import {
  MODULES,
  SIN_TELEFONO,
  emptyPermission as empty,
  type AccesoTelefonoRol,
  type ModuleKey,
  type ModulePermission,
  type RolePermisos,
} from './permisos.repository';
import { alcanceDeGrupo, gruposConTodos, INFO_MODULO } from './gruposModulos';

type Tema = 'modulos' | 'telefono' | 'depositos';

export type EstadoAutoguardado = 'idle' | 'guardando' | 'guardado' | 'error';

interface Props {
  rol: CustomRole;
  usuariosEnUso: number;
  permisos: RolePermisos | undefined;
  telefono: AccesoTelefonoRol | undefined;
  almacenes: PermisosAlmacenes | undefined;
  depositos: Almacen[];
  readOnly: boolean;
  /** El rol admin solo lo edita el admin (regla de siempre). */
  bloqueado: boolean;
  autoEstado: EstadoAutoguardado;
  onVolver: () => void;
  onToggle: (mod: ModuleKey, field: keyof ModulePermission) => void;
  onTelefono: (cambio: Partial<AccesoTelefonoRol>) => void;
  onDeposito: (almacen: string, nivel: NivelEditor) => void;
  onReset: () => void;
  onEliminar: (() => void) | null;
}

const TEXTO_AUTO: Record<EstadoAutoguardado, string> = {
  idle: '💾 Los cambios se guardan automáticamente',
  guardando: '⏳ Guardando…',
  guardado: '✓ Guardado automáticamente',
  error: '⚠ Error al guardar',
};

export function RolFicha({
  rol, usuariosEnUso, permisos, telefono, almacenes, depositos,
  readOnly, bloqueado, autoEstado,
  onVolver, onToggle, onTelefono, onDeposito, onReset, onEliminar,
}: Props) {
  const [tema, setTema] = useState<Tema>('modulos');
  /* La ayuda de cada módulo duplicaba el alto de la tabla. Se repliega,
     y quien la necesita la abre para todo el rol de una vez. */
  const [verAyuda, setVerAyuda] = useState(false);
  /* Arranca con el primer grupo abierto: ni la pared de antes ni una
     pantalla de títulos sin contenido. */
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(['mineral']));
  const grupos = gruposConTodos();
  const t = telefono ?? SIN_TELEFONO;
  const noEditable = readOnly || bloqueado;

  const alternarGrupo = (key: string) => {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="rol-ficha">
      <div className="rol-ficha-head">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onVolver}>← Roles</button>
        <h2 className="rol-ficha-titulo" style={{ '--rol-color': rol.color } as CSSProperties}>
          <span className="rol-ficha-color" aria-hidden="true" />
          {rol.label}
          {rol.sistema && <span className="badge" style={{ fontSize: '.65rem' }}>SISTEMA</span>}
        </h2>
        <span className="rol-card-usuarios">
          {usuariosEnUso === 0 ? 'Sin usuarios asignados' : `${usuariosEnUso} usuario(s)`}
        </span>
        {!readOnly && (
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <span className={`rol-autoguardado ${autoEstado}`} aria-live="polite">{TEXTO_AUTO[autoEstado]}</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onReset} title="Resetear este rol a los valores por defecto">
              ↺ Default
            </button>
            {onEliminar && (
              <button type="button" className="btn btn-sm btn-danger" onClick={onEliminar} title="Eliminar este rol">
                🗑 Eliminar
              </button>
            )}
          </div>
        )}
      </div>

      {rol.descripcion && <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>{rol.descripcion}</p>}

      {/* Los tres temas del rol, al mismo nivel. El administrador ve todas
          las pantallas y todos los depósitos: ahí no hay nada que elegir. */}
      <div className="view-toggle" style={{ marginLeft: 0, marginBottom: '1rem' }} role="tablist" aria-label="Qué configurar del rol">
        <button type="button" role="tab" aria-selected={tema === 'modulos'} className={tema === 'modulos' ? 'active' : ''} onClick={() => setTema('modulos')}>
          Módulos
        </button>
        {rol.key !== 'admin' && (
          <>
            <button type="button" role="tab" aria-selected={tema === 'telefono'} className={tema === 'telefono' ? 'active' : ''} onClick={() => setTema('telefono')}>
              📱 Teléfono
            </button>
            <button type="button" role="tab" aria-selected={tema === 'depositos'} className={tema === 'depositos' ? 'active' : ''} onClick={() => setTema('depositos')}>
              ⛏ Depósitos
            </button>
          </>
        )}
      </div>

      {tema === 'modulos' && (
        <div>
          <div className="perm-barra">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVerAyuda((v) => !v)} aria-expanded={verAyuda}>
              {verAyuda ? 'Ocultar la ayuda de cada módulo' : 'Mostrar la ayuda de cada módulo'}
            </button>
            <span className="muted" style={{ fontSize: '.75rem' }}>{MODULES.length} módulos en {grupos.length} grupos</span>
          </div>
          {/* Explica la columna: va antes de la matriz, no después. */}
          <p className="perm-nota" style={{ margin: '0 0 .75rem' }}>
            Full control incluye lectura y escritura: al marcarlo se marcan las dos.
          </p>

          {grupos.map((g) => {
            const abierto = abiertos.has(g.key);
            const conAcceso = alcanceDeGrupo(permisos, g.modulos);
            return (
              <div className="perm-grupo" key={g.key}>
                <button
                  type="button"
                  className="perm-grupo-head"
                  aria-expanded={abierto}
                  onClick={() => alternarGrupo(g.key)}
                >
                  <span className="perm-grupo-flecha" aria-hidden="true">▸</span>
                  <span>
                    {g.label}
                    <small className="muted" style={{ display: 'block', fontWeight: 500, fontSize: '.74rem' }}>{g.resumen}</small>
                  </span>
                  <span className="perm-grupo-resumen">{conAcceso} de {g.modulos.length}</span>
                </button>

                {abierto && (
                  <div className="perm-grupo-cuerpo">
                    <div className="table-wrap">
                      <table className="perm-tabla">
                        <thead>
                          <tr>
                            <th>Módulo</th>
                            <th>Lectura</th>
                            <th>Escritura</th>
                            <th>Full control</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.modulos.map((k) => {
                            const info = INFO_MODULO.get(k);
                            const p = permisos?.[k] ?? { ...empty };
                            const campos: { campo: keyof ModulePermission; label: string }[] = [
                              { campo: 'lectura', label: 'Lectura' },
                              { campo: 'escritura', label: 'Escritura' },
                              { campo: 'full', label: 'Full control' },
                            ];
                            return (
                              <tr key={k}>
                                <td className="perm-modulo">
                                  <div className="perm-modulo-nombre">{info?.label ?? k}</div>
                                  {verAyuda && info?.ayuda && <p className="perm-modulo-ayuda">{info.ayuda}</p>}
                                </td>
                                {campos.map(({ campo, label }) => (
                                  <td className="perm-celda" key={campo}>
                                    <label>
                                      <input
                                        type="checkbox"
                                        disabled={noEditable}
                                        checked={!!p[campo]}
                                        onChange={() => onToggle(k, campo)}
                                        aria-label={`${label} ${info?.label ?? k} para ${rol.label}`}
                                      />
                                    </label>
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tema === 'telefono' && rol.key !== 'admin' && (
        <div>
          <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
            Qué pantallas ve este rol cuando entra desde un teléfono.
          </p>
          <div className="rol-lista-opciones">
            {VISTAS_TELEFONO.map((v) => {
              const marcada = t.vistas.includes(v.key);
              const mod = permisos?.[v.modulo];
              // La pantalla de un depósito pide ese depósito, no el módulo.
              const sinModulo = v.almacen ? !almacenes?.[v.almacen] : !(mod?.lectura || mod?.full);
              const modLabel = v.almacen ?? INFO_MODULO.get(v.modulo)?.label ?? v.modulo;
              return (
                <label key={v.key} htmlFor={`tel-${rol.key}-${v.key}`} className="rol-opcion" style={{ cursor: readOnly ? 'default' : 'pointer' }}>
                  <input
                    id={`tel-${rol.key}-${v.key}`} type="checkbox" disabled={readOnly} checked={marcada}
                    onChange={() => onTelefono({ vistas: marcada ? t.vistas.filter((x) => x !== v.key) : [...t.vistas, v.key] })}
                  />
                  <span>
                    {v.icono} {v.label}
                    {marcada && sinModulo && (
                      <small style={{ color: 'var(--warning)' }}>
                        No se abre: falta {v.almacen ? 'permiso en' : 'lectura en'} {modLabel}.
                      </small>
                    )}
                  </span>
                </label>
              );
            })}
            <label htmlFor={`tel-${rol.key}-solo`} className="rol-opcion" style={{ cursor: readOnly ? 'default' : 'pointer' }}>
              <input
                id={`tel-${rol.key}-solo`} type="checkbox" disabled={readOnly} checked={t.soloTelefono}
                onChange={() => onTelefono({ soloTelefono: !t.soloTelefono })}
              />
              <span>
                <strong>Solo teléfono</strong>
                <small className="muted">Entra directo a sus pantallas de teléfono y no ve las de PC, salvo Ajustes.</small>
                {t.soloTelefono && !t.vistas.length && (
                  <small style={{ color: 'var(--danger)' }}>Sin pantallas marcadas, este rol no tiene nada que abrir.</small>
                )}
              </span>
            </label>
          </div>
        </div>
      )}

      {tema === 'depositos' && rol.key !== 'admin' && (
        <div>
          <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
            Cada depósito es independiente. Sin acceso no aparece, y la base tampoco lo deja leer.
            El General es el módulo «Inventario».
          </p>
          {!depositos.length ? (
            <p className="muted" style={{ fontSize: '.82rem' }}>No hay depósitos creados además del Inventario Los Pinos.</p>
          ) : (
            <>
              <div className="rol-lista-opciones">
                {depositos.map((d) => {
                  const nivel: NivelEditor = almacenes?.[d.nombre] ?? 'sin';
                  const id = `dep-${rol.key}-${d.id}`;
                  return (
                    <div key={d.id} className="rol-deposito">
                      <label htmlFor={id}>{iconoDeposito(d.nombre)} {d.nombre}</label>
                      <select
                        id={id} className="input" style={{ padding: '.3rem .5rem', fontSize: '.82rem' }}
                        disabled={readOnly} value={nivel}
                        onChange={(e) => onDeposito(d.nombre, e.target.value as NivelEditor)}
                      >
                        <option value="sin">Sin acceso</option>
                        <option value="lectura">Lectura</option>
                        <option value="escritura">Escritura</option>
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="perm-nota">
                Lectura: ve el depósito y su reporte. Escritura: además carga productos, entradas, salidas y traslados.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
