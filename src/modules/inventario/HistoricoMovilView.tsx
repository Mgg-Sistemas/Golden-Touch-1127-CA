/* ============================================================
   Golden Touch · Inventario · Histórico de salidas y de traslados en el teléfono (03/11/2026)

   · HistoricoSalidasMovil: las salidas del teléfono de ese depósito y, además, las
     salidas EJECUTADAS del módulo Salidas (PC) que registró el usuario que entró.
   · HistoricoTrasladosMovil: los traslados TRA-#### que salieron o entraron a ese depósito.
   Buscador, fechas (por defecto los últimos 30 días, hasta 200 filas) y, al tocar una
   fila, «📄 Ver PDF» (el mismo formato de siempre) y «💬 WhatsApp» (el mismo aviso).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { hoyVenezuela } from '@/shared/lib/rangosFecha';
import { quienSync } from '@/shared/lib/directorioUsuarios';
import { fechaHoraVE, mensajeSalidasMina, num, rangoCodigos, type FotoSalidaMina, type SalidaMina } from './salidasMina';
import { costosDeProductos, descargarFotosSalidaMina, listMisSalidasPcEjecutadas, listSalidasMinaHistorico, urlFotoSalidaMina } from './salidasMina.repository';
import { listTrasladosMovil } from './trasladoAlmacen.repository';
import { mensajeTraslados, nombreDepositoChat } from './inventarioMovil';
import { costoProducto, docSalidaPc, docSalidasMovil, docTrasladosMovil, verDocMovilPdf, type DocMovilPdf } from './inventarioMovilPdf';
import {
  LIMITE_HISTORICO, agruparLotesTraslado, errorRangoHistorico, filtrarHistoricoSalidas, filtrarLotesTraslado, limitesIsoRango, mensajeSalidaPc,
  rangoHistoricoPorDefecto, resumenItemsSalidaPc, unirHistoricoSalidas, type FilaHistoricoSalida, type TrasladoHistorico,
} from './historicoMovil';

type Costos = Awaited<ReturnType<typeof costosDeProductos>>;

/** Costos de los productos que aparecen en el histórico (04/11/2026: el PDF salía en $0,00). */
function useCostos(ids: string[]): Costos {
  const [costos, setCostos] = useState<Costos>(new Map());
  const clave = Array.from(new Set(ids)).sort().join(',');
  useEffect(() => {
    let vivo = true;
    if (!clave) { setCostos(new Map()); return; }
    void costosDeProductos(clave.split(',')).then((m) => { if (vivo) setCostos(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [clave]);
  return costos;
}

const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

/** Fechas + buscador comunes a los dos históricos. */
function useFiltros() {
  const hoy = hoyVenezuela();
  const def = rangoHistoricoPorDefecto(hoy);
  const [desde, setDesde] = useState(def.desde);
  const [hasta, setHasta] = useState(def.hasta);
  const [busca, setBusca] = useState('');
  const problema = errorRangoHistorico(desde, hasta, hoy);
  return { hoy, desde, setDesde, hasta, setHasta, busca, setBusca, problema };
}

function Filtros({ f, id }: { f: ReturnType<typeof useFiltros>; id: string }) {
  return (
    <>
      <div className="surt-grid2">
        <div className="surt-campo">
          <label htmlFor={`${id}-desde`}>Desde</label>
          <input id={`${id}-desde`} type="date" className="input surt-input" value={f.desde} max={f.hoy} onChange={(e) => f.setDesde(e.target.value)} />
        </div>
        <div className="surt-campo">
          <label htmlFor={`${id}-hasta`}>Hasta</label>
          <input id={`${id}-hasta`} type="date" className="input surt-input" value={f.hasta} max={f.hoy} onChange={(e) => f.setHasta(e.target.value)} />
        </div>
      </div>
      <input className="input surt-input" type="search" name={`${id}-buscar`} placeholder="🔍 Código, material, motivo, autorizado, quién…"
        value={f.busca} onChange={(e) => f.setBusca(e.target.value)} autoComplete="off" aria-label="Buscar en el histórico" />
      {f.problema && <div className="aviso warning sm"><span className="aviso-icono">⚠</span><div>{f.problema}</div></div>}
    </>
  );
}

/** «📄 Ver PDF» + «💬 WhatsApp» de la fila elegida. */
function Acciones({ pdf, texto, fotos }: { pdf: DocMovilPdf; texto: string; fotos?: File[] }) {
  const [abriendo, setAbriendo] = useState(false);
  const [wsp, setWsp] = useState(false);
  async function verPdf() {
    setAbriendo(true);
    try { await verDocMovilPdf(pdf); } catch (e) { toast(errMsg(e, 'No se pudo generar el PDF'), 'error'); } finally { setAbriendo(false); }
  }
  return (
    <div style={{ display: 'grid', gap: '.5rem', marginTop: '.5rem' }}>
      <div className="surt-grid2">
        <button type="button" className="btn btn-primary btn-grande" onClick={() => void verPdf()} disabled={abriendo}>
          {abriendo ? 'Armando el PDF…' : '📄 Ver PDF'}
        </button>
        <button type="button" className="btn btn-wsp btn-grande" onClick={() => setWsp((x) => !x)}>💬 WhatsApp</button>
      </div>
      {wsp && <CompartirWhatsapp texto={texto} fotos={fotos} />}
    </div>
  );
}

/** Miniaturas de las fotos guardadas de una salida. */
function Miniaturas({ fotos }: { fotos: FotoSalidaMina[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    void Promise.all(fotos.map(async (f) => [f.path, await urlFotoSalidaMina(f.path).catch(() => '')] as const))
      .then((xs) => { if (vivo) setUrls(Object.fromEntries(xs)); });
    return () => { vivo = false; };
  }, [fotos]);
  if (!fotos.length) return null;
  return (
    <div className="rep-fotos">
      {fotos.map((f) => (
        <a key={f.path} className="rep-foto" href={urls[f.path] || undefined} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${f.filename}`}>
          {urls[f.path] ? <img src={urls[f.path]} alt={f.filename} /> : <span className="rep-foto-doc">📷</span>}
        </a>
      ))}
    </div>
  );
}

/** Detalle de una salida del teléfono: baja sus fotos para mandarlas por WhatsApp. */
function DetalleSalidaTelefono({ salidas, almacen, costos }: { salidas: SalidaMina[]; almacen: string; costos: Costos }) {
  const s = salidas[0];
  const [fotos, setFotos] = useState<File[]>([]);
  useEffect(() => {
    let vivo = true;
    if (s.fotos.length) void descargarFotosSalidaMina(s).then((xs) => { if (vivo) setFotos(xs); });
    return () => { vivo = false; };
  }, [s]);
  return (
    <>
      <Miniaturas fotos={s.fotos} />
      <Acciones pdf={docSalidasMovil(salidas, (id) => costos.get(id), almacen, { actor: s.actor, nombre: s.actor_name })}
        texto={mensajeSalidasMina(salidas, quienSync(s.actor_name, s.actor))} fotos={fotos} />
    </>
  );
}

export function HistoricoSalidasMovil({ almacen, nombre, actor, onVolver }: { almacen: string; nombre: string; actor: string; onVolver: () => void }) {
  const f = useFiltros();
  const [filas, setFilas] = useState<FilaHistoricoSalida[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (f.problema) return;
    setFilas(null);
    const { desdeIso, hastaIso } = limitesIsoRango(f.desde, f.hasta);
    try {
      const [tel, pc] = await Promise.all([
        listSalidasMinaHistorico({ almacen, desdeIso, hastaIso, limite: LIMITE_HISTORICO }),
        actor && actor !== 'sistema'
          ? listMisSalidasPcEjecutadas({ almacen, actor, desdeIso, hastaIso, limite: LIMITE_HISTORICO }).catch(() => [])
          : Promise.resolve([]),
      ]);
      setFilas(unirHistoricoSalidas(tel, pc));
    } catch (e) { setFilas([]); toast(errMsg(e, 'No se pudieron leer las salidas'), 'error'); }
  }, [almacen, actor, f.desde, f.hasta, f.problema]);
  useEffect(() => { void cargar(); }, [cargar]);

  const lista = useMemo(() => filtrarHistoricoSalidas(filas ?? [], f.busca).slice(0, LIMITE_HISTORICO), [filas, f.busca]);
  const llenas = (filas ?? []).reduce((n, x) => n + (x.tipo === 'telefono' ? x.salidas.length : 1), 0) >= LIMITE_HISTORICO;
  const costos = useCostos((filas ?? []).flatMap((x) => (x.tipo === 'telefono' ? x.salidas.map((y) => y.producto_id) : [])));

  return (
    <section className="surt-lista">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0' }}>
        <strong style={{ fontSize: '1.1rem' }}>🧾 Histórico de salidas · {nombre}</strong>
        <button type="button" className="btn btn-ghost" onClick={onVolver}>← Volver</button>
      </div>
      <Filtros f={f} id="hist-sal" />
      {filas === null && !f.problema && <p className="muted">Cargando…</p>}
      {filas && <h2>{lista.length ? `${lista.length} salida(s)` : 'No hay salidas en esas fechas'}</h2>}
      {llenas && <small className="muted">Se muestran las {LIMITE_HISTORICO} más recientes: acorta las fechas para ver las demás.</small>}
      {lista.map((fila) => {
        const id = fila.tipo === 'telefono' ? fila.salidas[0].id : fila.sol.id;
        const abiertaEsta = abierta === id;
        if (fila.tipo === 'telefono') {
          const ss = fila.salidas;
          const s = ss[0];
          const varios = ss.length > 1;
          return (
            <div key={id}>
              <button type="button" className="surt-mov" onClick={() => setAbierta(abiertaEsta ? null : id)} aria-expanded={abiertaEsta}>
                <span className="icono" aria-hidden>{s.fotos.length ? '📷' : '📤'}</span>
                <span style={{ minWidth: 0 }}>
                  <div className="titulo">{varios ? `${ss.length} productos · ${s.producto_nombre} y más` : s.producto_nombre}</div>
                  <div className="sub">{rangoCodigos(ss.map((x) => x.codigo))} · {fechaHoraVE(s.created_at)}</div>
                  <div className="sub">{s.motivo} · Retorna: {s.retorna ? 'SÍ' : 'NO'}{s.fotos.length ? ` · ${s.fotos.length} foto(s)` : ''}</div>
                  {s.autorizado_por && <div className="sub">Autorizó: {s.autorizado_por}</div>}
                </span>
                <span className="litros">{varios ? <>{ss.length} <small>prod.</small></> : <>{num(s.cantidad)} <small>{s.unidad}</small></>}</span>
              </button>
              {abiertaEsta && <DetalleSalidaTelefono salidas={ss} almacen={almacen} costos={costos} />}
            </div>
          );
        }
        const sol = fila.sol;
        const r = resumenItemsSalidaPc(sol);
        return (
          <div key={id}>
            <button type="button" className="surt-mov" onClick={() => setAbierta(abiertaEsta ? null : id)} aria-expanded={abiertaEsta}>
              <span className="icono" aria-hidden>🖥</span>
              <span style={{ minWidth: 0 }}>
                <div className="titulo">{r.material}</div>
                <div className="sub">{sol.codigo} · {fechaHoraVE(sol.created_at)} · Módulo Salidas</div>
                {sol.motivo && <div className="sub">{sol.motivo}</div>}
              </span>
              <span className="litros">{r.cantidad}</span>
            </button>
            {abiertaEsta && <Acciones pdf={docSalidaPc(sol)} texto={mensajeSalidaPc(sol)} />}
          </div>
        );
      })}
    </section>
  );
}

export function HistoricoTrasladosMovil({ almacen, nombre, onVolver }: { almacen: string; nombre: string; onVolver: () => void }) {
  const f = useFiltros();
  const [ts, setTs] = useState<TrasladoHistorico[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (f.problema) return;
    setTs(null);
    const { desdeIso, hastaIso } = limitesIsoRango(f.desde, f.hasta);
    try { setTs(await listTrasladosMovil({ almacen, desdeIso, hastaIso, limite: LIMITE_HISTORICO })); }
    catch (e) { setTs([]); toast(errMsg(e, 'No se pudieron leer los traslados'), 'error'); }
  }, [almacen, f.desde, f.hasta, f.problema]);
  useEffect(() => { void cargar(); }, [cargar]);

  const lotes = useMemo(() => agruparLotesTraslado(ts ?? []), [ts]);
  const lista = useMemo(() => filtrarLotesTraslado(lotes, f.busca), [lotes, f.busca]);
  const costos = useCostos((ts ?? []).map((t) => t.producto_origen_id));

  return (
    <section className="surt-lista">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0' }}>
        <strong style={{ fontSize: '1.1rem' }}>🔁 Histórico de traslados · {nombre}</strong>
        <button type="button" className="btn btn-ghost" onClick={onVolver}>← Volver</button>
      </div>
      <Filtros f={f} id="hist-tra" />
      {ts === null && !f.problema && <p className="muted">Cargando…</p>}
      {ts && <h2>{lista.length ? `${lista.length} traslado(s)` : 'No hay traslados en esas fechas'}</h2>}
      {(ts?.length ?? 0) >= LIMITE_HISTORICO && <small className="muted">Se muestran los {LIMITE_HISTORICO} más recientes: acorta las fechas para ver los demás.</small>}
      {lista.map((g) => {
        const t = g[0];
        const varios = g.length > 1;
        const abiertaEsta = abierta === t.codigo;
        const quien = quienSync(t.actor_name, t.actor);
        return (
          <div key={t.codigo}>
            <button type="button" className="surt-mov" onClick={() => setAbierta(abiertaEsta ? null : t.codigo)} aria-expanded={abiertaEsta}>
              <span className="icono" aria-hidden>🔁</span>
              <span style={{ minWidth: 0 }}>
                <div className="titulo">{varios ? `${g.length} productos · ${t.nombre} y más` : t.nombre}</div>
                <div className="sub">{rangoCodigos(g.map((x) => x.codigo))} · {fechaHoraVE(t.at)}</div>
                <div className="sub">{nombreDepositoChat(t.origen)} → {nombreDepositoChat(t.destino)}{t.nota ? ` · ${t.nota}` : ''}</div>
              </span>
              <span className="litros">{varios ? <>{g.length} <small>prod.</small></> : <>{num(t.cantidad)} <small>{t.unidad}</small></>}</span>
            </button>
            {abiertaEsta && <>
              <Acciones pdf={docTrasladosMovil(g, (id) => costoProducto(costos.get(id)), { actor: t.actor, nombre: t.actor_name })} texto={mensajeTraslados(g, quien)} />
            </>}
          </div>
        );
      })}
    </section>
  );
}
