/* ============================================================
   Golden Touch · Combustible · Reporte del surtidor (teléfono)

   Qué pasó en un rango de fechas, agrupado por TIPO de movimiento
   (surtidos, traslados, entradas, mermas, retornos), con los litros de
   cada grupo y las FOTOS de cada movimiento como miniaturas. Se mira en
   el teléfono, tocando una foto se abre grande.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { num, date } from '@/shared/lib/format';
import type { MovimientoTanque, TanqueCombustible, TipoMovTanque } from '@/shared/lib/types';
import { listMovimientosTanque } from './tanques.repository';
import { esImagenAdjunto } from '@/modules/salidas/adjuntosSalidaReglas';
import type { AdjuntoSalida } from '@/modules/salidas/adjuntosSalida.repository';
import { adjuntosCombustible, MODULO_ADJUNTO_TANQUE } from './adjuntosCombustible.repository';

const ORDEN_TIPOS: TipoMovTanque[] = ['uso', 'traslado', 'entrada', 'merma', 'retorno'];
const ICONO: Record<TipoMovTanque, string> = { entrada: '⬇', uso: '⛽', traslado: '🔁', retorno: '↩', merma: '🔻' };
const TITULO: Record<TipoMovTanque, string> = { uso: 'Surtidos (consumo de equipos)', traslado: 'Traslados', entrada: 'Entradas (ingresos)', merma: 'Mermas', retorno: 'Retornos' };

const primerDiaMes = () => {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return `${d.slice(0, 7)}-01`;
};
const hoyVE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function SurtidorReporteMovil({ tanques, tanqueInicial, onClose }: {
  tanques: TanqueCombustible[]; tanqueInicial: string; onClose: () => void;
}) {
  const [tanqueId, setTanqueId] = useState<string>(tanqueInicial);
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoyVE());
  const [movs, setMovs] = useState<MovimientoTanque[]>([]);
  const [fotos, setFotos] = useState<AdjuntoSalida[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const ids = tanqueId ? [tanqueId] : tanques.map((t) => t.id);
      const listas = await Promise.all(ids.map((id) => listMovimientosTanque(id)));
      const todos = listas.flat().filter((m) => m.fecha >= desde && m.fecha <= hasta)
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      setMovs(todos);
      const adj = await adjuntosCombustible.listarDe(MODULO_ADJUNTO_TANQUE, todos.map((m) => m.id));
      setFotos(adj);
      setUrls(await adjuntosCombustible.urls(adj.map((a) => a.path)));
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo armar el reporte', 'error'); }
    finally { setCargando(false); }
  }, [tanqueId, tanques, desde, hasta]);
  useEffect(() => { void cargar(); }, [cargar]);

  const grupos = useMemo(() => ORDEN_TIPOS
    .map((tipo) => {
      const lista = movs.filter((m) => m.tipo === tipo);
      return { tipo, lista, litros: lista.reduce((s, m) => s + (Number(m.litros) || 0), 0) };
    })
    .filter((g) => g.lista.length), [movs]);

  const fotosDe = (id: string) => fotos.filter((f) => f.ref_id === id);
  const nombreTanque = (id: string) => tanques.find((t) => t.id === id)?.nombre ?? '—';

  async function abrir(a: AdjuntoSalida) {
    try { previewArchivo(urls.get(a.path) ?? await adjuntosCombustible.url(a.path), a.nombre); }
    catch { toast('No se pudo abrir la foto', 'error'); }
  }

  return (
    <Modal title="📊 Reporte con fotos" size="lg" onClose={onClose}
      footer={<button className="btn btn-primary btn-grande" onClick={onClose}>Cerrar</button>}>
      <div className="surt-grid2" style={{ marginBottom: '.6rem' }}>
        <div className="surt-campo">
          <label htmlFor="rep-desde">Desde</label>
          <input id="rep-desde" className="input surt-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="surt-campo">
          <label htmlFor="rep-hasta">Hasta</label>
          <input id="rep-hasta" className="input surt-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>
      <div className="surt-campo" style={{ marginBottom: '.8rem' }}>
        <label htmlFor="rep-tanque">Tanque</label>
        <select id="rep-tanque" className="select surt-input" value={tanqueId} onChange={(e) => setTanqueId(e.target.value)}>
          <option value="">Todos los tanques</option>
          {tanques.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      {cargando && <p className="muted">Armando el reporte…</p>}
      {!cargando && !grupos.length && <EmptyState icon="📊" message="Sin movimientos en ese rango." />}

      {!cargando && grupos.map((g) => (
        <section key={g.tipo} className="rep-grupo">
          <h3 className="rep-grupo-titulo">
            <span>{ICONO[g.tipo]} {TITULO[g.tipo]}</span>
            <span className="mono">{g.lista.length} · {num(g.litros)} L</span>
          </h3>
          {g.lista.map((m) => {
            const fs = fotosDe(m.id);
            return (
              <div key={m.id} className="rep-mov">
                <div className="rep-mov-cab">
                  <div style={{ minWidth: 0 }}>
                    <div className="titulo">{m.equipo || m.observacion || TITULO[g.tipo]}</div>
                    <div className="sub">
                      {date(m.fecha)}{m.hora ? ` ${m.hora}` : ''}{!tanqueId ? ` · ${nombreTanque(m.tanque_id)}` : ''}
                      {m.autorizado_por ? ` · Aut.: ${m.autorizado_por}` : ''}
                      {m.equipo && m.observacion ? ` · ${m.observacion}` : ''}
                    </div>
                  </div>
                  <span className="mono litros">{num(m.litros)} L</span>
                </div>
                {fs.length ? (
                  <div className="rep-fotos">
                    {fs.map((a) => (
                      <button key={a.id} type="button" className="rep-foto" onClick={() => void abrir(a)} title={a.nombre}>
                        {esImagenAdjunto(a.content_type, a.nombre) && urls.get(a.path)
                          ? <img src={urls.get(a.path)} alt={a.nombre} loading="lazy" />
                          : <span className="rep-foto-doc">📄<small>{a.nombre}</small></span>}
                      </button>
                    ))}
                  </div>
                ) : <div className="muted" style={{ fontSize: '.78rem' }}>Sin fotos</div>}
              </div>
            );
          })}
        </section>
      ))}
    </Modal>
  );
}
