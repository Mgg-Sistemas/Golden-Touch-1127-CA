/* ============================================================
   Golden Touch · Solicitudes de Pedido · Vista de teléfono (29/10/2026)

   Para Almacén con el celular en la mano, al lado del estante: la lista de
   SP por revisar (número y cuántos renglones); al tocar una, cada renglón
   con su existencia y un «− / +» de lo que TIENE Almacén, los botones de
   lote, «Marcar como revisada» y el WhatsApp. Mismo flujo que la PC.
   ============================================================ */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { nombreYApellido } from '@/shared/lib/directorioUsuarios';
import { Quien } from '@/shared/ui/Quien';
import { DecimalInput } from '@/shared/ui/DecimalInput';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { dateTime, num, relTime } from '@/shared/lib/format';
import { ALMACENES_REVISION, faltante, porAlmacenDe, resumenRevision, stockDe, stockMinaDe, textoWhatsappSolicitud } from './revisionAlmacen';
import { useBorradores, useSolicitudesAlmacen } from './useSolicitudesAlmacen';
import { AvisoApagado, BadgeExistencia, BarraCobertura, useMarcarRevisada } from './SolicitudesComun';

export function SolicitudesAlmacenMovilView() {
  const { user } = useSession();
  const { isAdmin, can, role, appUser, soloTelefono, vistasTelefono } = usePermissions();
  // 30/10/2026 · Confirma el ALMACENISTA de Los Pinos (y el admin).
  const puedeRevisar = isAdmin || (role === 'almacenista' && can('inventario', 'escritura'));
  const quien = nombreYApellido(appUser?.nombre, appUser?.apellido) || user?.email || '';

  const datos = useSolicitudesAlmacen();
  const bor = useBorradores(datos.stock, datos.stockMina);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [verWsp, setVerWsp] = useState(false);
  const marcar = useMarcarRevisada(quien, (id) => { bor.olvidar(id); setAbiertaId(null); void datos.reload(); });

  // Si otra persona la revisó mientras estaba abierta, deja de estar en la lista.
  const s = datos.porRevisar.find((x) => x.orden.id === abiertaId) ?? null;

  return (
    <div className="surtidor">
      <header className="surt-head">
        <div>
          <h1>📋 Solicitudes de Pedido</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>{quien}</div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {!soloTelefono && <Link to="/app/pedidos?tab=almacen" className="btn btn-ghost">🖥 Módulo completo</Link>}
          {soloTelefono && vistasTelefono.length > 1 && <Link to="/app/telefono" className="btn btn-ghost">📱 Mis pantallas</Link>}
        </div>
      </header>

      {datos.loading && datos.activo === null && <p className="muted">Cargando…</p>}
      {!datos.loading && datos.activo === false && <AvisoApagado isAdmin={isAdmin} />}
      {datos.error && <div className="aviso danger sm" style={{ margin: '.5rem 0' }}><span className="aviso-icono">⚠</span><div>{datos.error}</div></div>}

      {datos.activo && !puedeRevisar && (
        <div className="aviso warning sm" style={{ margin: '.75rem 0' }}>
          <span className="aviso-icono">👁</span>
          <div>Tu rol solo puede ver. Las solicitudes las confirma el almacenista de Los Pinos (rol almacenista).</div>
        </div>
      )}

      {datos.activo && !s && (
        <section className="surt-lista">
          <h2>Por revisar ({datos.porRevisar.length})</h2>
          {!datos.loading && !datos.porRevisar.length && <p className="muted">No hay solicitudes esperando a Almacén. Las nuevas aparecen aquí solas.</p>}
          {datos.porRevisar.map((x) => (
            <button key={x.orden.id} type="button" className="surt-mov" onClick={() => { setAbiertaId(x.orden.id); setVerWsp(false); }}
              style={x.orden.urgente ? { borderColor: 'var(--danger)' } : undefined}>
              <span className="icono" aria-hidden>{x.orden.urgente ? '🚨' : '📝'}</span>
              <span style={{ minWidth: 0 }}>
                <div className="titulo mono" style={{ color: 'var(--primary-3)' }}>{x.orden.codigo}</div>
                <div className="sub">
                  {x.orden.solicitante?.trim() || <Quien correo={x.orden.solicitante_email} vacio="—" />}
                  {x.orden.unidad_solicitante ? ` · ${x.orden.unidad_solicitante}` : ''} · {relTime(x.orden.created_at)}
                </div>
              </span>
              <span style={{ textAlign: 'right', fontWeight: 800, fontSize: '1.1rem' }}>
                {x.orden.items.length} <small style={{ fontWeight: 600 }}>{x.orden.items.length === 1 ? 'renglón' : 'renglones'}</small>
              </span>
            </button>
          ))}
          {datos.revisadas.length > 0 && (
            <>
              <h2>Revisadas esta semana ({datos.revisadas.length})</h2>
              {datos.revisadas.slice(0, 10).map((x) => (
                <div key={x.orden.id} className="surt-mov" style={{ cursor: 'default' }}>
                  <span className="icono" aria-hidden>✅</span>
                  <span style={{ minWidth: 0 }}>
                    <div className="titulo mono">{x.orden.codigo}</div>
                    <div className="sub"><Quien nombre={x.revision?.revisada_por_nombre} correo={x.revision?.revisada_por} vacio="—" /> · {dateTime(x.revision?.revisada_en)}</div>
                  </span>
                  <span />
                </div>
              ))}
            </>
          )}
        </section>
      )}

      {datos.activo && s && (() => {
        const items = s.orden.items;
        const revision = bor.revisionDe(s);
        const porIdx = new Map(revision.map((r) => [r.idx, porAlmacenDe(r)]));
        const resumen = resumenRevision(items, revision);
        return (
          <div className="surt-form">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
              <div className="surt-form-titulo">
                <span className="icono" aria-hidden>{s.orden.urgente ? '🚨' : '📝'}</span>
                <strong className="mono" style={{ color: 'var(--primary-3)' }}>{s.orden.codigo}</strong>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setAbiertaId(null)}>← Lista</button>
            </div>
            <div className="surt-detalle">
              <div className="surt-fila"><span>Solicitante</span><span>{s.orden.solicitante?.trim() || <Quien correo={s.orden.solicitante_email} vacio="—" />}</span></div>
              {s.orden.unidad_solicitante && <div className="surt-fila"><span>Unidad</span><span>{s.orden.unidad_solicitante}</span></div>}
              <div className="surt-fila"><span>Fecha</span><span>{dateTime(s.orden.created_at)}</span></div>
              {s.orden.urgente && <div className="surt-fila"><span>Prioridad</span><span style={{ color: 'var(--danger)' }}>URGENTE</span></div>}
              {s.orden.motivo && <div className="surt-fila"><span>Motivo</span><span>{s.orden.motivo}</span></div>}
            </div>

            {puedeRevisar && (
              <div className="spa-lote-movil">
                <button type="button" className="btn btn-ghost" onClick={() => bor.lote(s, 'todo_disponible_segun_stock')}>✔ Según existencias</button>
                <button type="button" className="btn btn-ghost" onClick={() => bor.lote(s, 'todo_disponible')}>✔ Todo disponible</button>
                <button type="button" className="btn btn-ghost" onClick={() => bor.lote(s, 'todo_a_compras')}>🛒 Todo a Compras</button>
              </div>
            )}

            {items.map((it, idx) => {
              const sol = Number(it.cantidad) || 0;
              const pa = porIdx.get(idx) ?? { los_pinos: 0, mina: 0 };
              const tiene = pa.los_pinos + pa.mina;
              const falta = faltante(sol, tiene);
              const stMina = stockMinaDe(it, datos.stockMina);
              const sug = !it.productoId ? datos.sugerido(it.nombre) : null;
              const paso = sol >= 1 ? 1 : sol;
              return (
                <div key={idx} className="spa-renglon">
                  <div className="nombre">{it.nombre}</div>
                  <div className="sub">
                    <span>Piden <b className="mono" style={{ color: 'var(--text)' }}>{num(sol)} {it.unidad || 'und'}</b></span>
                  </div>
                  <div className="sub">
                    <span>📍 Los Pinos</span>
                    <BadgeExistencia solicitada={sol} stock={stockDe(it, datos.stock)} unidad={it.unidad} />
                    <span>· ⛏ Mina</span>
                    {stMina == null ? <span className="muted">no está</span> : <BadgeExistencia solicitada={sol} stock={stMina} unidad={it.unidad} />}
                  </div>
                  {sug && <div className="sub">Parecido: {sug.nombre} · hay {num(sug.stock)} {sug.unidad}</div>}
                  <BarraCobertura solicitada={sol} disponible={tiene} />
                  {ALMACENES_REVISION.filter((a) => a.key === 'los_pinos' || stMina != null).map((a) => {
                    const v = pa[a.key];
                    return (
                      <div key={a.key}>
                        <div className="sub" style={{ marginTop: '.3rem' }}>{a.icono} Sale de {a.label}</div>
                        <div className="spa-stepper">
                          <button type="button" className="btn btn-ghost" disabled={!puedeRevisar || v <= 0}
                            aria-label={`Menos de ${a.label}`} onClick={() => bor.fijar(s, idx, Math.max(0, v - paso), a.key)}>−</button>
                          <DecimalInput className="input" value={v} disabled={!puedeRevisar}
                            aria-label={`Sale de ${a.label}: ${it.nombre}`} onChange={(x) => bor.fijar(s, idx, x, a.key)} />
                          <button type="button" className="btn btn-ghost" disabled={!puedeRevisar || tiene >= sol}
                            aria-label={`Más de ${a.label}`} onClick={() => bor.fijar(s, idx, Math.min(sol, v + paso), a.key)}>＋</button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="compras">{falta > 0 ? <>🛒 A Compras: <b>{num(falta)} {it.unidad || 'und'}</b></> : <span className="muted">Almacén lo cubre completo</span>}</div>
                </div>
              );
            })}

            {puedeRevisar && (
              <>
                <div className="surt-campo">
                  <label htmlFor="spa-nota-movil">Nota</label>
                  <input id="spa-nota-movil" className="input surt-input" value={bor.nota(s.orden.id)}
                    onChange={(e) => bor.fijarNota(s.orden.id, e.target.value)} placeholder="Opcional" autoComplete="off" />
                </div>
                <div className="muted" style={{ textAlign: 'center' }}>
                  Almacén entrega {resumen.disponibles.length} · Compras cotiza {resumen.aCompras.length}
                </div>
                <button type="button" className="btn btn-success surt-guardar" disabled={marcar.guardando}
                  onClick={() => marcar.pedir(s, revision, bor.nota(s.orden.id))}>✓ Marcar como revisada</button>
              </>
            )}
            <button type="button" className="btn btn-ghost btn-grande" onClick={() => setVerWsp((v) => !v)}>
              📲 {verWsp ? 'Ocultar WhatsApp de la solicitud' : 'WhatsApp de la solicitud'}
            </button>
            {verWsp && <CompartirWhatsapp texto={textoWhatsappSolicitud(s.orden)} />}
          </div>
        );
      })()}

      {marcar.dialogos}
    </div>
  );
}
