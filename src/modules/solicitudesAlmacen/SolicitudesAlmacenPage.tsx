/* ============================================================
   Golden Touch · Solicitudes de Pedido (Almacén) · PC (29/10/2026)

   Las SP llegan primero a Almacén. Por cada renglón, Almacén dice cuánto
   TIENE (uno a uno o con los botones de lote) y la marca como revisada:
   lo que tiene se entrega del inventario y lo que falta pasa a Compras,
   que la acepta y la cotiza como siempre. Al marcarla sale el WhatsApp
   «ALMACÉN HA REVISADO LA ORDEN…».

   Con el interruptor `compras_revision_almacen` apagado, la pantalla solo
   muestra el aviso y Compras sigue igual que antes.
   ============================================================ */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { nombreYApellido } from '@/shared/lib/directorioUsuarios';
import { Quien } from '@/shared/ui/Quien';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { StatusBadge } from '@/shared/ui/StatusBadge';
import { DecimalInput } from '@/shared/ui/DecimalInput';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { dateTime, num } from '@/shared/lib/format';
import { mensajeError } from '@/shared/lib/errores';
import { devolverARevision, type SolicitudConRevision } from './solicitudesAlmacen.repository';
import {
  faltante, resumenRevision, revisionGuardada, stockDe, textoWhatsappRevision, textoWhatsappSolicitud,
  type RevisionRenglon,
} from './revisionAlmacen';
import { useBorradores, useSolicitudesAlmacen } from './useSolicitudesAlmacen';
import {
  AvisoApagado, BadgeExistencia, BarraCobertura, ModalWhatsapp, ResumenListas, renglonesDe, useMarcarRevisada,
} from './SolicitudesComun';

type Pestana = 'por_revisar' | 'revisadas';

/** Pestaña «Revisión de Almacén» de Pedidos / Compras (el encabezado lo pone PedidosPage). */
export function SolicitudesAlmacenPage() {
  const { user } = useSession();
  const { isAdmin, can, appUser, puedeVista } = usePermissions();
  const puedeRevisar = isAdmin || can('inventario', 'escritura');
  const quien = nombreYApellido(appUser?.nombre, appUser?.apellido) || user?.email || '';

  const datos = useSolicitudesAlmacen();
  const bor = useBorradores(datos.stock);
  const marcar = useMarcarRevisada(quien, (id) => { bor.olvidar(id); void datos.reload(); });
  const [pestana, setPestana] = useState<Pestana>('por_revisar');
  const [wsp, setWsp] = useState<{ titulo: string; texto: string } | null>(null);
  const [devolver, setDevolver] = useState<SolicitudConRevision | null>(null);

  async function confirmarDevolver() {
    if (!devolver) return;
    const s = devolver;
    setDevolver(null);
    try {
      await devolverARevision(s.orden.id);
      toast(`${s.orden.codigo} volvió a «Por revisar».`, 'success');
      void datos.reload();
    } catch (e) {
      toast(mensajeError(e, 'No se pudo devolver a revisión.'), 'error');
    }
  }

  return (
    <div>
      {datos.activo && puedeVista('solicitudes') && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.6rem' }}>
          <Link to="/app/solicitudes/telefono" className="btn btn-ghost">📱 Vista de teléfono</Link>
        </div>
      )}

      {datos.loading && datos.activo === null && <p className="muted">Cargando…</p>}
      {!datos.loading && datos.activo === false && <AvisoApagado isAdmin={isAdmin} />}
      {datos.error && <div className="aviso danger" style={{ marginBottom: '1rem' }}><span className="aviso-icono">⚠</span><div>{datos.error}</div></div>}

      {datos.activo && (
        <>
          {!puedeRevisar && (
            <div className="aviso warning sm" style={{ marginBottom: '.8rem' }}>
              <span className="aviso-icono">👁</span>
              <div>Tu rol solo puede ver. Para marcar solicitudes como revisadas hace falta escritura en Inventario.</div>
            </div>
          )}

          <div className="spa-tabs" role="tablist" aria-label="Solicitudes">
            <button type="button" role="tab" className="spa-tab" aria-selected={pestana === 'por_revisar'} onClick={() => setPestana('por_revisar')}>
              Por revisar ({datos.porRevisar.length})
            </button>
            <button type="button" role="tab" className="spa-tab" aria-selected={pestana === 'revisadas'} onClick={() => setPestana('revisadas')}>
              Revisadas (7 días)
            </button>
          </div>

          {pestana === 'por_revisar' && (
            datos.porRevisar.length
              ? datos.porRevisar.map((s) => (
                <TarjetaPorRevisar key={s.orden.id} s={s} puedeRevisar={puedeRevisar} guardando={marcar.guardando}
                  revision={bor.revisionDe(s)} stock={datos.stock} sugerido={datos.sugerido}
                  nota={bor.nota(s.orden.id)} onNota={(v) => bor.fijarNota(s.orden.id, v)}
                  onFijar={(idx, v) => bor.fijar(s, idx, v)} onLote={(m) => bor.lote(s, m)}
                  onWhatsapp={() => setWsp({ titulo: `📲 Solicitud ${s.orden.codigo}`, texto: textoWhatsappSolicitud(s.orden) })}
                  onRevisar={() => marcar.pedir(s, bor.revisionDe(s), bor.nota(s.orden.id))} />
              ))
              : !datos.loading && <EmptyState icon="✅" message="No hay solicitudes esperando a Almacén. Las nuevas aparecen aquí solas." />
          )}

          {pestana === 'revisadas' && (
            datos.revisadas.length
              ? datos.revisadas.map((s) => (
                <TarjetaRevisada key={s.orden.id} s={s} isAdmin={isAdmin} quienActual={quien}
                  onWhatsapp={(texto) => setWsp({ titulo: `📲 Revisión de ${s.orden.codigo}`, texto })}
                  onDevolver={() => setDevolver(s)} />
              ))
              : !datos.loading && <EmptyState icon="🗓" message="Ninguna solicitud revisada en los últimos 7 días." />
          )}
        </>
      )}

      {marcar.dialogos}
      {wsp && <ModalWhatsapp titulo={wsp.titulo} texto={wsp.texto} onClose={() => setWsp(null)} />}
      {devolver && (
        <ConfirmDialog title={`Devolver ${devolver.orden.codigo} a revisión`} danger confirmText="↩ Devolver a revisión"
          message="La solicitud vuelve a «Por revisar» para que Almacén la revise de nuevo."
          onConfirm={() => void confirmarDevolver()} onCancel={() => setDevolver(null)} />
      )}
    </div>
  );
}

function Cabecera({ s, extra }: { s: SolicitudConRevision; extra?: ReactNode }) {
  const o = s.orden;
  return (
    <div className="spa-sp-cab">
      <div>
        <h2 className="spa-codigo">{o.codigo}</h2>
        <div className="spa-datos">
          <span>{dateTime(o.created_at)}</span>
          <span>Solicita: <strong>{o.solicitante?.trim() || <Quien correo={o.solicitante_email} vacio="—" />}</strong></span>
          {o.unidad_solicitante && <span>Unidad: <strong>{o.unidad_solicitante}</strong></span>}
          {o.urgente && <span className="badge danger">🚨 Urgente</span>}
        </div>
        {(o.motivo || o.finalidad) && (
          <div className="spa-datos" style={{ marginTop: '.2rem' }}>
            {o.motivo && <span>Motivo: <strong>{o.motivo}</strong></span>}
            {o.finalidad && <span>Finalidad: <strong>{o.finalidad}</strong></span>}
          </div>
        )}
      </div>
      <div className="spa-cab-acciones">{extra}</div>
    </div>
  );
}

function TarjetaPorRevisar({ s, revision, stock, sugerido, nota, onNota, onFijar, onLote, onWhatsapp, onRevisar, puedeRevisar, guardando }: {
  s: SolicitudConRevision;
  revision: RevisionRenglon[];
  stock: Record<string, number>;
  sugerido: (nombre: string) => { nombre: string; stock: number; unidad: string } | null;
  nota: string;
  onNota: (v: string) => void;
  onFijar: (idx: number, v: number | null) => void;
  onLote: (m: 'todo_disponible_segun_stock' | 'todo_a_compras' | 'todo_disponible') => void;
  onWhatsapp: () => void;
  onRevisar: () => void;
  puedeRevisar: boolean;
  guardando: boolean;
}) {
  const items = s.orden.items;
  const porIdx = new Map(revision.map((r) => [r.idx, r.cantidad_disponible]));
  const resumen = resumenRevision(items, revision);
  return (
    <section className={`card spa-sp${s.orden.urgente ? ' urgente' : ''}`} aria-label={`Solicitud ${s.orden.codigo}`}>
      <Cabecera s={s} extra={<button type="button" className="btn btn-ghost btn-sm" onClick={onWhatsapp}>📲 WhatsApp de la solicitud</button>} />

      {puedeRevisar && (
        <div className="spa-lote">
          <span>Por lote:</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onLote('todo_disponible_segun_stock')}>✔ Todo según existencias</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onLote('todo_disponible')}>✔ Todo disponible</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onLote('todo_a_compras')}>🛒 Todo a Compras</button>
        </div>
      )}

      <div className="table-wrap" style={{ borderRadius: 0, border: 0, borderTop: '1px solid var(--border)' }}>
        <table className="table spa-tabla">
          <thead>
            <tr>
              <th>Producto</th><th>Unidad</th><th className="num">Solicitado</th><th>Existencia actual</th>
              <th className="num">Lo tiene Almacén</th><th className="num">A Compras</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const sol = Number(it.cantidad) || 0;
              const tiene = porIdx.get(idx) ?? 0;
              const falta = faltante(sol, tiene);
              const st = stockDe(it, stock);
              const sug = !it.productoId ? sugerido(it.nombre) : null;
              return (
                <tr key={idx}>
                  <td data-col="Producto">
                    <strong>{it.nombre}</strong>
                    {it.sku && <span className="muted mono" style={{ fontSize: '.75rem', marginLeft: '.4rem' }}>{it.sku}</span>}
                    {sug && <span className="spa-sugerido">Parecido en inventario: {sug.nombre} · hay {num(sug.stock)} {sug.unidad}</span>}
                    <BarraCobertura solicitada={sol} disponible={tiene} />
                  </td>
                  <td data-col="Unidad">{it.unidad || 'und'}</td>
                  <td data-col="Solicitado" className="num mono">{num(sol)}</td>
                  <td data-col="Existencia actual"><BadgeExistencia solicitada={sol} stock={st} unidad={it.unidad} /></td>
                  <td data-col="Lo tiene Almacén" className="num">
                    <DecimalInput className="input spa-input" value={tiene} disabled={!puedeRevisar}
                      aria-label={`Lo tiene Almacén de ${it.nombre}`} title={`Entre 0 y ${num(sol)}`}
                      onChange={(v) => onFijar(idx, v)} />
                  </td>
                  <td data-col="A Compras" className="num">
                    <span className={`spa-compras${falta ? '' : ' cero'}`}>{num(falta)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {puedeRevisar && (
        <div className="spa-pie">
          <div className="spa-nota">
            <label htmlFor={`nota-${s.orden.id}`}>Nota para Compras y el solicitante (opcional)</label>
            <input id={`nota-${s.orden.id}`} className="input" value={nota} onChange={(e) => onNota(e.target.value)}
              placeholder="Ej.: lo disponible se retira en el galpón 2" autoComplete="off" />
          </div>
          <div className="spa-cuenta">
            Almacén entrega <b>{resumen.disponibles.length}</b> · Compras cotiza <b>{resumen.aCompras.length}</b>
          </div>
          <button type="button" className="btn btn-success" disabled={guardando} onClick={onRevisar}>✓ Marcar como revisada</button>
        </div>
      )}
    </section>
  );
}

function TarjetaRevisada({ s, isAdmin, quienActual, onWhatsapp, onDevolver }: {
  s: SolicitudConRevision; isAdmin: boolean; quienActual: string;
  onWhatsapp: (texto: string) => void; onDevolver: () => void;
}) {
  const r = s.revision;
  const items = renglonesDe(s);
  const resumen = resumenRevision(items, revisionGuardada(r?.items_revision));
  const texto = r?.texto_whatsapp?.trim()
    || textoWhatsappRevision(s.orden, resumen, r?.revisada_por_nombre || quienActual, r?.nota);
  return (
    <section className="card spa-sp revisada" aria-label={`Solicitud ${s.orden.codigo} revisada`}>
      <Cabecera s={s} extra={(
        <>
          <StatusBadge estado={s.orden.estado} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onWhatsapp(texto)}>📲 Reenviar WhatsApp</button>
          {isAdmin && <button type="button" className="btn btn-danger btn-sm" onClick={onDevolver}>↩ Devolver a revisión</button>}
        </>
      )} />
      <div className="spa-datos" style={{ padding: '0 1.1rem .4rem' }}>
        <span>Revisada por <strong><Quien nombre={r?.revisada_por_nombre} correo={r?.revisada_por} vacio="—" /></strong></span>
        <span>{dateTime(r?.revisada_en)}</span>
        {r?.nota && <span>Nota: <strong>{r.nota}</strong></span>}
      </div>
      <div style={{ padding: '0 1.1rem .9rem' }}><ResumenListas resumen={resumen} /></div>
    </section>
  );
}
