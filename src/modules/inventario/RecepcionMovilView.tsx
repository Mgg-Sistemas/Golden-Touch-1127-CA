/* ============================================================
   Golden Touch · Inventario (teléfono) · «📥 Recepción» e «Histórico de recepciones» (04/11/2026)

   · RecepcionDeliveryMovil: lo que el delivery entregó en almacén y falta recepcionar.
     Al tocar una OC: SP/OC, proveedor, solicitante, analista, el delivery encargado y
     sus fotos, y cada renglón con lo pedido y cuánto llegó (como la recepción de la PC).
     «✅ Recepcionar» suma al inventario, deja la OC recibida en Compras y abre el
     WhatsApp (con las fotos) y el PDF.
   · HistoricoRecepcionesMovil: las recepciones de ese almacén, con su PDF y su WhatsApp.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from '@/shared/ui/Toast';
import { previewGaleria } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { num } from '@/shared/lib/format';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { quienSync } from '@/shared/lib/directorioUsuarios';
import { hoyVenezuela } from '@/shared/lib/rangosFecha';
import { fechaHoraVE } from './salidasMina';
import { Listo } from './SalidaMinaMovil';
import { verDocMovilPdf } from './inventarioMovilPdf';
import {
  cantidadesRecibidas, docRecepcion, docRecepcionHistorica, errorRecepcion, esParcial, mensajeRecepcion, mensajeRecepcionHistorica,
  type CantidadesRecepcion, type FotoRecepcion, type PorRecepcionar, type RecepcionDetallada,
} from './recepcionMovil';
import { descargarFotosRecepcion, detallarRecepcion, listPorRecepcionar, recepcionarPedido, subirFacturasAlmacen, urlFotoRecepcion } from './recepcionMovil.repository';
import { listMovimientosRecepcion } from './movimientos.repository';
import { recepcionesDesdeMovimientos, type Recepcion } from './recepcionesHistorico';
import { errorRangoHistorico, rangoHistoricoPorDefecto } from './historicoMovil';

const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

/** Cuántas OC faltan por recepcionar (para el botón del inicio). */
export function usePorRecepcionar(activo: boolean) {
  const [lista, setLista] = useState<PorRecepcionar[]>([]);
  const cargar = useCallback(async () => {
    if (!activo) { setLista([]); return; }
    setLista(await listPorRecepcionar().catch(() => []));
  }, [activo]);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['delivery_pedidos', 'ordenes'], () => { void cargar(); });
  return { lista, recargar: cargar };
}

function Fotos({ fotos }: { fotos: FotoRecepcion[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    void Promise.all(fotos.map(async (f) => [f.path, await urlFotoRecepcion(f.path).catch(() => '')] as const))
      .then((xs) => { if (vivo) setUrls(Object.fromEntries(xs)); });
    return () => { vivo = false; };
  }, [fotos]);
  if (!fotos.length) return null;
  const galeria = fotos.filter((f) => !!urls[f.path]).map((f) => ({ path: f.path, url: urls[f.path], filename: f.filename }));
  return (
    <div className="rep-fotos">
      {fotos.map((f) => (
        <button key={f.path} type="button" className="rep-foto" disabled={!urls[f.path]}
          onClick={() => previewGaleria(galeria, Math.max(0, galeria.findIndex((x) => x.path === f.path)))}
          aria-label={`Ver ${f.filename}`}>
          {urls[f.path] ? <img src={urls[f.path]} alt={f.filename} /> : <span className="rep-foto-doc">📷</span>}
        </button>
      ))}
    </div>
  );
}

function DetalleRecepcion({ p, actor, actorName, onVolver, onHecha }: {
  p: PorRecepcionar; actor: string; actorName: string | null; onVolver: () => void; onHecha: () => void;
}) {
  const [cants, setCants] = useState<CantidadesRecepcion>(() => p.items.map(() => ''));
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [hecha, setHecha] = useState<{ at: string; quien: string | null } | null>(null);
  const [fotosArchivos, setFotosArchivos] = useState<File[]>([]);
  // 11/11/2026: la factura del proveedor es obligatoria al recepcionar (foto o PDF).
  const [facturas, setFacturas] = useState<File[]>([]);
  const problema = errorRecepcion(p, cants);
  const parcial = esParcial(p, cants);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (problema) return toast(problema, 'error');
    if (!facturas.length) return toast('Carga la factura del proveedor (foto o PDF) antes de recepcionar.', 'error');
    setGuardando(true);
    try {
      const r = await recepcionarPedido(p.pedido_id, cantidadesRecibidas(p, cants), nota);
      try { await subirFacturasAlmacen(p.orden_id, facturas, actor); }
      catch (e2) { toast(`Recepcionada, pero la factura no se pudo subir: ${errMsg(e2, 'error')}. Pide a Compras que la cargue en «🧾 Factura».`, 'warning'); }
      toast(r.resultado === 'ya_recibida' ? 'La OC ya estaba recibida en Compras.' : `OC ${p.oc ?? p.sp} recepcionada: ya está en el inventario.`, 'success');
      setHecha({ at: r.at || new Date().toISOString(), quien: r.recepcionado_nombre || actorName });
      void descargarFotosRecepcion([...p.fotos_entrega, ...p.fotos_recibo]).then(setFotosArchivos);
    } catch (err) {
      toast(errMsg(err, 'No se pudo recepcionar'), 'error');
    } finally { setGuardando(false); }
  }

  if (hecha) {
    return <Listo titulo={`OC ${p.oc ?? p.sp} recepcionada`} fotos={fotosArchivos}
      texto={mensajeRecepcion(p, cants, hecha.quien ?? actor, hecha.at, nota)}
      pdf={docRecepcion(p, cants, { actor, nombre: actorName }, hecha.at, nota)} onListo={onHecha} />;
  }

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>📥</span><strong>Recepción · {p.oc ?? p.sp}</strong></div>
      <div className="surt-detalle">
        <div className="surt-fila"><span>Pedido</span><span className="mono">{p.sp}{p.oc ? ` · ${p.oc}` : ''}</span></div>
        {p.proveedor && <div className="surt-fila"><span>Proveedor</span><span>{p.proveedor}</span></div>}
        {p.solicitante && <div className="surt-fila"><span>Solicita</span><span>{p.solicitante}{p.unidad_solicitante ? ` · ${p.unidad_solicitante}` : ''}</span></div>}
        {p.analista && <div className="surt-fila"><span>Analista</span><span>{p.analista}</span></div>}
        <div className="surt-fila"><span>Delivery</span><span>🛵 {p.delivery ?? '—'}</span></div>
        {p.entregado_en && <div className="surt-fila"><span>Entregó</span><span>{fechaHoraVE(p.entregado_en)}</span></div>}
        {p.nota_entrega && <div className="surt-fila"><span>Nota del delivery</span><span>{p.nota_entrega}</span></div>}
      </div>
      <Fotos fotos={[...p.fotos_entrega, ...p.fotos_recibo]} />
      {p.fotos_factura.length > 0 && (<>
        <span className="surt-rotulo">🧾 Factura que fotografió el delivery</span>
        <Fotos fotos={p.fotos_factura} />
      </>)}

      <span className="surt-rotulo">¿Cuánto llegó? ({p.items.length} renglón{p.items.length === 1 ? '' : 'es'})</span>
      {p.items.map((it, i) => {
        const pedida = Number(it.cantidad) || 0;
        const llego = cantidadesRecibidas(p, cants)[i];
        return (
          <div key={`${it.sku}-${i}`} className="surt-lote-item">
            <div className="surt-lote-cab"><strong>{it.nombre}</strong><span className="muted mono" style={{ fontSize: '.8rem' }}>{it.sku}</span></div>
            <div className="muted" style={{ fontSize: '.8rem' }}>Pedido: {num(pedida)} {it.unidad ?? ''}{!it.productoId ? ' · sin ficha en inventario (no suma stock)' : ''}</div>
            <input className="input surt-litros" inputMode="decimal" value={cants[i]} placeholder={num(pedida)} disabled={guardando}
              aria-label={`Cuánto llegó de ${it.nombre}`}
              onChange={(e) => setCants((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
            {llego < pedida && <small className="surt-alerta">Llegan {num(llego)} de {num(pedida)}.</small>}
          </div>
        );
      })}
      <small className="muted">Vacío = llegó todo lo pedido. Si llegó menos, escribe lo que llegó.</small>
      <div className="surt-campo">
        <label htmlFor="rec-nota">Nota</label>
        <input id="rec-nota" className="input surt-input" value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Opcional: estado en que llegó, faltantes…" autoComplete="off" />
      </div>
      <div className="surt-campo">
        <label htmlFor="rec-factura">🧾 Factura del proveedor <span style={{ color: 'var(--danger)' }}>*</span></label>
        <div style={{ position: 'relative', display: 'flex' }}>
          <span className="btn btn-primary" style={{ width: '100%', minHeight: 56, fontWeight: 700, justifyContent: 'center' }} aria-hidden>{facturas.length ? `🧾 ${facturas.length} archivo(s) · cambiar` : '🧾 CARGAR FACTURA'}</span>
          <input id="rec-factura" type="file" accept="image/*,application/pdf" multiple disabled={guardando}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
            aria-label="Cargar la factura del proveedor"
            onChange={(e) => { setFacturas(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </div>
        {facturas.length > 0 && <small className="muted">📎 {facturas.map((f) => f.name).join(', ')}</small>}
        <small className="muted">Foto o PDF de la factura. Compras la ve en «🧾 Factura» (Facturas almacén).</small>
      </div>
      {problema && <div className="aviso warning sm"><span className="aviso-icono">⚠</span><div>{problema}</div></div>}
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando || !!problema || !facturas.length}>
        {guardando ? 'Recepcionando…' : parcial ? '✅ Recepcionar (incompleta)' : '✅ Recepcionar'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onVolver} disabled={guardando}>← Volver</button>
    </form>
  );
}

export function RecepcionDeliveryMovil({ pendientes, actor, actorName, canWrite, onVolver, onCambio }: {
  pendientes: PorRecepcionar[]; actor: string; actorName: string | null; canWrite: boolean;
  onVolver: () => void; onCambio: () => void;
}) {
  const [elegida, setElegida] = useState<PorRecepcionar | null>(null);
  if (elegida) {
    return <DetalleRecepcion p={elegida} actor={actor} actorName={actorName}
      onVolver={() => setElegida(null)} onHecha={() => { setElegida(null); onCambio(); }} />;
  }
  return (
    <section className="surt-lista">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0' }}>
        <strong style={{ fontSize: '1.1rem' }}>📥 Por recepcionar ({pendientes.length})</strong>
        <button type="button" className="btn btn-ghost" onClick={onVolver}>← Volver</button>
      </div>
      {!pendientes.length && <p className="muted">No hay nada que el delivery haya entregado sin recepcionar.</p>}
      {pendientes.map((p) => (
        <button key={p.pedido_id} type="button" className="surt-mov" disabled={!canWrite} onClick={() => setElegida(p)}>
          <span className="icono" aria-hidden>{p.urgente ? '🚨' : '📦'}</span>
          <span style={{ minWidth: 0 }}>
            <div className="titulo">{p.proveedor ?? 'Proveedor'} · {p.oc ?? p.sp}</div>
            <div className="sub">{p.sp} · {p.items.length} producto(s){p.solicitante ? ` · ${p.solicitante}` : ''}</div>
            <div className="sub">🛵 {p.delivery ?? '—'}{p.entregado_en ? ` · ${fechaHoraVE(p.entregado_en)}` : ''}</div>
          </span>
          <span className="litros">›</span>
        </button>
      ))}
    </section>
  );
}

/** Almacén de una recepción del histórico: los nombres viejos (Los Pinos, Producción…) son el General. */
const esDelAlmacen = (r: Recepcion, almacen: string) =>
  almacen === 'General' ? !r.almacen || !['Depósito Mina', 'Reutilizables', 'Items Dañados'].includes(r.almacen) : r.almacen === almacen;

function AccionesRecepcion({ r }: { r: Recepcion }) {
  const [d, setD] = useState<RecepcionDetallada | null>(null);
  const [wsp, setWsp] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  useEffect(() => { let vivo = true; void detallarRecepcion(r).then((x) => { if (vivo) setD(x); }).catch(() => {}); return () => { vivo = false; }; }, [r]);
  async function verPdf() {
    if (!d) return;
    setAbriendo(true);
    try { await verDocMovilPdf(docRecepcionHistorica(d)); } catch (e) { toast(errMsg(e, 'No se pudo generar el PDF'), 'error'); } finally { setAbriendo(false); }
  }
  if (!d) return <p className="muted">Cargando…</p>;
  return (
    <div style={{ display: 'grid', gap: '.5rem', marginTop: '.5rem' }}>
      <div className="surt-grid2">
        <button type="button" className="btn btn-primary btn-grande" onClick={() => void verPdf()} disabled={abriendo}>{abriendo ? 'Armando el PDF…' : '📄 Ver PDF'}</button>
        <button type="button" className="btn btn-wsp btn-grande" onClick={() => setWsp((x) => !x)}>💬 WhatsApp</button>
      </div>
      {wsp && <CompartirWhatsapp texto={mensajeRecepcionHistorica(d, quienSync(r.actor_name, r.actor))} />}
    </div>
  );
}

export function HistoricoRecepcionesMovil({ almacen, nombre, onVolver }: { almacen: string; nombre: string; onVolver: () => void }) {
  const hoy = hoyVenezuela();
  const def = rangoHistoricoPorDefecto(hoy);
  const [desde, setDesde] = useState(def.desde);
  const [hasta, setHasta] = useState(def.hasta);
  const [recs, setRecs] = useState<Recepcion[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const problema = errorRangoHistorico(desde, hasta, hoy);

  const cargar = useCallback(async () => {
    if (problema) return;
    setRecs(null);
    try {
      const movs = await listMovimientosRecepcion(desde, hasta);
      setRecs(recepcionesDesdeMovimientos(movs as never).filter((r) => esDelAlmacen(r, almacen)));
    } catch (e) { setRecs([]); toast(errMsg(e, 'No se pudieron leer las recepciones'), 'error'); }
  }, [desde, hasta, problema, almacen]);
  useEffect(() => { void cargar(); }, [cargar]);

  const lista = useMemo(() => recs ?? [], [recs]);
  return (
    <section className="surt-lista">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0' }}>
        <strong style={{ fontSize: '1.1rem' }}>📥 Histórico de recepciones · {nombre}</strong>
        <button type="button" className="btn btn-ghost" onClick={onVolver}>← Volver</button>
      </div>
      <div className="surt-grid2">
        <div className="surt-campo"><label htmlFor="hr-desde">Desde</label>
          <input id="hr-desde" type="date" className="input surt-input" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} /></div>
        <div className="surt-campo"><label htmlFor="hr-hasta">Hasta</label>
          <input id="hr-hasta" type="date" className="input surt-input" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} /></div>
      </div>
      {problema && <div className="aviso warning sm"><span className="aviso-icono">⚠</span><div>{problema}</div></div>}
      {recs === null && !problema && <p className="muted">Cargando…</p>}
      {recs && <h2>{lista.length ? `${lista.length} recepción(es)` : 'No hay recepciones en esas fechas'}</h2>}
      {lista.map((r) => {
        const clave = `${r.ref_id}-${r.at}`;
        const abiertaEsta = abierta === clave;
        return (
          <div key={clave}>
            <button type="button" className="surt-mov" onClick={() => setAbierta(abiertaEsta ? null : clave)} aria-expanded={abiertaEsta}>
              <span className="icono" aria-hidden>📥</span>
              <span style={{ minWidth: 0 }}>
                <div className="titulo">{r.codigo}</div>
                <div className="sub">{fechaHoraVE(r.at)} · {quienSync(r.actor_name, r.actor) || '—'}</div>
              </span>
              <span className="litros">{r.items.length} <small>prod.</small></span>
            </button>
            {abiertaEsta && <AccionesRecepcion r={r} />}
          </div>
        );
      })}
    </section>
  );
}
