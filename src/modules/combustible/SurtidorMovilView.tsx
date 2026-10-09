/* ============================================================
   Golden Touch · Combustible · Surtidor (vista de teléfono)

   La pantalla del que está al lado del tanque con el celular: elige el
   tanque, toca «Surtir a un equipo», «Pasar a otro tanque» o «Entrada»,
   pone los litros, a qué equipo/camión va, quién autorizó, le saca fotos
   y guarda. La merma no se carga desde aquí (02/10/2026): es de la PC. Abajo ve los últimos movimientos del tanque y
   puede abrir cada uno para ver o agregar fotos, o borrarlo (con
   confirmación). El 📊 Reporte muestra un rango de fechas por tipo, con
   las fotos de cada movimiento.

   Escribe en las MISMAS tablas que el módulo de PC (registrarUso /
   registrarTraslado / registrarEntrada / eliminarMovimientoTanque, con
   PMP y contadores encadenados), así que
   lo que se hace aquí aparece al instante en la PC y viceversa (realtime).
   Corregir litros, equipo u hora es tarea de la PC.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { toast } from '@/shared/ui/Toast';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { num, date, dateTime, money } from '@/shared/lib/format';
import type { CatalogoCombustible, MovimientoTanque, TanqueCombustible, TipoCatalogoCombustible, TipoMovTanque } from '@/shared/lib/types';
import {
  listTanques, listCatalogos, listMovimientosTanque, registrarUso, registrarTraslado, registrarEntrada,
  eliminarMovimientoTanque, ultimoHorometroEquipo, ultimoContadorTanque, ultimoKilometrajeEquipo,
} from './tanques.repository';
import { AdjuntosSalida, SelectorAdjuntos } from '@/modules/salidas/AdjuntosSalida';
import { adjuntosCombustible, MODULO_ADJUNTO_TANQUE } from './adjuntosCombustible.repository';
import { SurtidorReporteMovil } from './SurtidorReporteMovil';
import { mensajeMovimiento } from './mensajeMovimiento';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { horaAInput, horaDesdeInput } from './horaMovimiento';
import { contadorFinalPropuesto } from './contadorSurtidor';
import { errorHorometro, faltaHorometroFinal, horasTrabajadas } from './horometroEquipo';
import { errorSaldoInsuficiente, etiquetaTanque, tanqueSinLitros } from './saldoSuficiente';

/** Cuántos movimientos se ven en el teléfono. El libro completo está en la PC. */
export const ULTIMOS_EN_TELEFONO = 10;

const ICONO: Record<TipoMovTanque, string> = { entrada: '⬇', uso: '⛽', traslado: '🔁', retorno: '↩', merma: '🔻' };
const NOMBRE_TIPO: Record<TipoMovTanque, string> = { entrada: 'Entrada', uso: 'Surtido', traslado: 'Traslado', retorno: 'Retorno', merma: 'Merma' };

const hoyVE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const horaVE = () => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date());

/** Lo que se puede registrar desde el teléfono (el retorno y la merma quedan para la PC). */
type TipoSurtidor = 'uso' | 'traslado' | 'entrada';

const TITULO: Record<TipoSurtidor, string> = {
  uso: 'Surtir a un equipo', traslado: 'Pasar a otro tanque', entrada: 'Entrada de combustible',
};

export function SurtidorMovilView() {
  const { user } = useSession();
  const { can, appUser, soloTelefono, vistasTelefono } = usePermissions();
  const canWrite = can('combustible', 'escritura');
  // Rol solo teléfono: no tiene módulo de PC al que ir.
  const esSurtidor = soloTelefono;
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  const [tanques, setTanques] = useState<TanqueCombustible[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoCombustible[]>([]);
  const [selId, setSelId] = useState('');
  const [movs, setMovs] = useState<MovimientoTanque[]>([]);
  const [conteo, setConteo] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [paso, setPaso] = useState<'inicio' | 'form'>('inicio');
  const [tipo, setTipo] = useState<TipoSurtidor>('uso');
  const [detalle, setDetalle] = useState<MovimientoTanque | null>(null);
  const [reporte, setReporte] = useState(false);

  const reloadBase = useCallback(async () => {
    const [ts, cat] = await Promise.all([listTanques(), listCatalogos()]);
    const activos = ts.filter((t) => (t as { estado?: string }).estado !== 'inactivo');
    setTanques(activos);
    setCatalogos(cat);
    setSelId((prev) => (prev && activos.some((t) => t.id === prev) ? prev : activos[0]?.id ?? ''));
  }, []);

  // Solo los últimos 10 del tanque, del más nuevo al más viejo: en el teléfono no se
  // lee un libro mayor, se mira lo que acaba de pasar.
  const reloadMovs = useCallback(async (id: string): Promise<MovimientoTanque[]> => {
    if (!id) { setMovs([]); setConteo(new Map()); return []; }
    const todos = await listMovimientosTanque(id);
    const ultimos = todos.slice(-ULTIMOS_EN_TELEFONO).reverse();
    setMovs(ultimos);
    try { setConteo(await adjuntosCombustible.contar(MODULO_ADJUNTO_TANQUE, ultimos.map((m) => m.id))); }
    catch { /* el contador de fotos es adorno: sin él la lista se muestra igual */ }
    return ultimos;
  }, []);

  useEffect(() => {
    let cancel = false;
    reloadBase().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'No se pudo cargar', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reloadBase]);
  useEffect(() => { void reloadMovs(selId).catch(() => {}); }, [selId, reloadMovs]);
  useRealtime(['combustible_tanques', 'combustible_tanque_movimientos', 'combustible_catalogos', 'combustible_adjuntos'], () => {
    void reloadBase().catch(() => {});
    void reloadMovs(selId).catch(() => {});
  });

  const sel = useMemo(() => tanques.find((t) => t.id === selId) ?? null, [tanques, selId]);
  // Si el movimiento abierto lo borró otro (o se borró aquí), el detalle se cierra solo.
  const detalleVivo = detalle ? movs.find((m) => m.id === detalle.id) ?? null : null;
  useEffect(() => { if (detalle && !loading && movs.length && !movs.some((m) => m.id === detalle.id)) setDetalle(null); }, [detalle, movs, loading]);

  function abrirForm(t: TipoSurtidor) { setTipo(t); setPaso('form'); }

  return (
    <div className="surtidor">
      <header className="surt-head">
        <div>
          <h1>⛽ Surtidor</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>{actorName ?? actor}</div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setReporte(true)} disabled={!tanques.length}
            title="Movimientos por rango de fechas, agrupados por tipo, con sus fotos">📊 Reporte</button>
          {!esSurtidor && <Link to="/app/combustible" className="btn btn-ghost">🖥 Módulo completo</Link>}
          {esSurtidor && vistasTelefono.length > 1 && <Link to="/app/telefono" className="btn btn-ghost">📱 Mis pantallas</Link>}
        </div>
      </header>

      {loading && <p className="muted">Cargando…</p>}
      {!loading && !tanques.length && <EmptyState icon="⛽" message="No hay tanques activos. Se crean desde el módulo en la PC." />}

      {!!tanques.length && (
        <>
          <div className="surt-rotulo">Tanque</div>
          <div className="surt-tanques" role="tablist" aria-label="Tanque">
            {tanques.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={t.id === selId}
                className={`surt-tanque${t.id === selId ? ' sel' : ''}`}
                onClick={() => { setSelId(t.id); setPaso('inicio'); }}>
                <div className="nombre">{t.nombre}</div>
                <div className="saldo">{num(t.saldo_litros)} <small>L</small></div>
                {tanqueSinLitros(t.saldo_litros) && <div className="muted" style={{ fontSize: '.75rem', color: 'var(--danger)' }}>Sin litros</div>}
              </button>
            ))}
          </div>
        </>
      )}

      {sel && paso === 'inicio' && canWrite && tanqueSinLitros(sel.saldo_litros) && (
        <div className="aviso warning sm" style={{ margin: '.75rem 0' }}>
          <span className="aviso-icono">⛔</span>
          <div><strong>{sel.nombre} está sin litros.</strong> No se puede surtir ni pasar a otro tanque hasta que entre combustible.</div>
        </div>
      )}
      {sel && paso === 'inicio' && canWrite && (
        <div className="surt-acciones">
          <button type="button" className="surt-btn primario" onClick={() => abrirForm('uso')} disabled={tanqueSinLitros(sel.saldo_litros)}>
            <span className="icono" aria-hidden>⛽</span>
            <span>Surtir a un equipo</span>
            <small>Sale combustible de {sel.nombre} a un equipo o camión</small>
          </button>
          <button type="button" className="surt-btn" onClick={() => abrirForm('traslado')} disabled={tanqueSinLitros(sel.saldo_litros)}>
            <span className="icono" aria-hidden>🔁</span>
            <span>Pasar a otro tanque</span>
            <small>Traslado a otro tanque</small>
          </button>
          <button type="button" className="surt-btn entrada" onClick={() => abrirForm('entrada')}>
            <span className="icono" aria-hidden>⬇</span>
            <span>Entrada</span>
            <small>Llega combustible al tanque</small>
          </button>
        </div>
      )}
      {sel && !canWrite && <div className="aviso warning sm" style={{ margin: '.75rem 0' }}><span className="aviso-icono">👁</span><div>Tu rol solo puede ver. Para registrar surtidos hace falta escritura en Combustible.</div></div>}

      {sel && paso === 'form' && (
        <FormularioSurtido key={`${sel.id}-${tipo}`} tipo={tipo} tanque={sel} tanques={tanques} catalogos={catalogos}
          actor={actor} actorName={actorName}
          onCancel={() => setPaso('inicio')}
          onSaved={async (movId) => {
            setPaso('inicio');
            await reloadBase().catch(() => {});
            const lista = await reloadMovs(sel.id).catch(() => [] as MovimientoTanque[]);
            // Se abre el detalle de lo recién cargado: es donde está el botón para pasarlo por WhatsApp.
            const nuevo = movId ? (lista ?? []).find((m) => m.id === movId) : null;
            if (nuevo) setDetalle(nuevo);
          }} />
      )}

      {sel && (
        <section className="surt-lista">
          <h2>Últimos {ULTIMOS_EN_TELEFONO} movimientos · {sel.nombre}</h2>
          {!movs.length && <p className="muted">Este tanque no tiene movimientos todavía.</p>}
          {movs.map((m) => {
            const entra = m.tipo === 'entrada' || m.tipo === 'retorno';
            const n = conteo.get(m.id) ?? 0;
            return (
              <button key={m.id} type="button" className="surt-mov" onClick={() => setDetalle(m)}>
                <span className="icono" aria-hidden>{ICONO[m.tipo]}</span>
                <span style={{ minWidth: 0 }}>
                  <div className="titulo">{m.equipo || m.observacion || NOMBRE_TIPO[m.tipo]}</div>
                  <div className="sub">
                    {NOMBRE_TIPO[m.tipo]} · {date(m.fecha)}{m.hora ? ` ${m.hora}` : ''}
                    {m.autorizado_por ? ` · Aut.: ${m.autorizado_por}` : ''}
                    {n > 0 ? ` · 📎 ${n}` : ''}
                  </div>
                </span>
                <span className={`litros${entra ? ' entra' : ''}`}>{entra ? '+' : '−'}{num(m.litros)} L</span>
              </button>
            );
          })}
          {movs.length >= ULTIMOS_EN_TELEFONO && (
            <p className="muted" style={{ fontSize: '.85rem' }}>Aquí se ven los últimos {ULTIMOS_EN_TELEFONO}. El libro completo está en el módulo de Combustible en la PC.</p>
          )}
        </section>
      )}

      {detalleVivo && (
        <DetalleMovil mov={detalleVivo} tanque={tanques.find((t) => t.id === detalleVivo.tanque_id) ?? null} tanques={tanques}
          canWrite={canWrite} esSurtidor={esSurtidor} actor={actor} onClose={() => setDetalle(null)}
          onBorrado={async () => { setDetalle(null); await reloadBase().catch(() => {}); await reloadMovs(selId).catch(() => {}); }} />
      )}

      {reporte && <SurtidorReporteMovil tanques={tanques} tanqueInicial={selId} onClose={() => setReporte(false)} />}
    </div>
  );
}

/* ───────────── Formulario: surtido, traslado o entrada ───────────── */
function FormularioSurtido({ tipo, tanque, tanques, catalogos, actor, actorName, onCancel, onSaved }: {
  tipo: TipoSurtidor; tanque: TanqueCombustible; tanques: TanqueCombustible[]; catalogos: CatalogoCombustible[];
  actor: string; actorName: string | null; onCancel: () => void; onSaved: (movId?: string) => Promise<void>;
}) {
  const opts = (t: TipoCatalogoCombustible) => catalogos.filter((c) => c.tipo === t && c.activo);
  const sale = tipo !== 'entrada';
  const [litros, setLitros] = useState('');
  const [costo, setCosto] = useState(tanque.tasa_usd_litro ? String(tanque.tasa_usd_litro) : '');
  const [equipo, setEquipo] = useState('');
  const [autorizado, setAutorizado] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [observacion, setObservacion] = useState('');
  const [fecha, setFecha] = useState(hoyVE());
  const [hora, setHora] = useState(horaVE());
  const [hi, setHi] = useState(''); const [hiAuto, setHiAuto] = useState(false);
  const [hf, setHf] = useState('');
  const [km, setKm] = useState('');
  const [ci, setCi] = useState(''); const [ciAuto, setCiAuto] = useState(false);
  const [cf, setCf] = useState('');
  const [masDatos, setMasDatos] = useState(false);
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [etapa, setEtapa] = useState<'movimiento' | 'fotos'>('movimiento');
  // Con mala señal, subir fotos puede tardar: pasados unos segundos se avisa que el
  // movimiento ya está guardado, para que nadie lo vuelva a cargar.
  const [demorado, setDemorado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!guardando) { setDemorado(false); return; }
    const t = setTimeout(() => setDemorado(true), 12_000);
    return () => clearTimeout(t);
  }, [guardando]);

  // Igual que en la PC: el horómetro inicial es del equipo y el contador inicial es del
  // tanque; se traen del último final para que la cadena no se corte.
  useEffect(() => {
    if (!equipo) { setHi(''); setHiAuto(false); return; }
    // Si el equipo nuevo no trae horómetro, no se queda el inicial del equipo anterior.
    ultimoHorometroEquipo(equipo).then((u) => { if (u != null) { setHi(String(u)); setHiAuto(true); } else { setHi(''); setHiAuto(false); } }).catch(() => {});
    ultimoKilometrajeEquipo(equipo).then((u) => { if (u != null) setKm(String(u)); }).catch(() => {});
  }, [equipo]);
  useEffect(() => {
    ultimoContadorTanque(tanque.id).then((u) => { if (u != null) { setCi(String(u)); setCiAuto(true); } else { setCi(''); setCiAuto(false); } }).catch(() => {});
  }, [tanque.id]);

  const litrosNum = Number(String(litros).replace(',', '.')) || 0;
  const costoNum = Number(String(costo).replace(',', '.')) || 0;
  const litrosContador = ci !== '' && cf !== '' ? Number(cf) - Number(ci) : null;
  // HRS = HF − HI, igual que en la PC: se calcula solo y se muestra al que surte.
  const hrs = horasTrabajadas(hi === '' ? null : Number(hi), hf === '' ? null : Number(hf));
  // El contador al terminar es donde arranca el siguiente surtido: si se deja vacío, se
  // guarda inicial + litros (lo completa el repositorio; aquí solo se muestra).
  const cfPropuesto = contadorFinalPropuesto(ci === '' ? null : Number(ci), litrosNum);
  // No se surte más de lo que hay (09/10/2026): se avisa mientras se escribe y no deja guardar.
  const errSaldo = sale ? errorSaldoInsuficiente({ nombre: tanque.nombre, saldo: tanque.saldo_litros, litros: litrosNum }) : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!(litrosNum > 0)) { setError(tipo === 'entrada' ? 'Indica los litros que entraron.' : 'Indica los litros surtidos.'); return; }
    if (tipo === 'uso' && !equipo) { setError('Indica a qué equipo o camión va el combustible.'); return; }
    if (tipo === 'traslado' && !destinoId) { setError('Indica a qué tanque pasa el combustible.'); return; }
    if (tipo === 'entrada' && !(costoNum >= 0)) { setError('Indica el costo por litro.'); return; }
    if (errSaldo) { setError(errSaldo); return; }
    // HF < HI dejaría horas negativas y el próximo surtido del equipo arrancaría mal.
    let hiNum = hi === '' ? null : Number(hi); const hfNum = hf === '' ? null : Number(hf);
    // Con mala señal el inicial puede no haber llegado todavía: se pide ahora, antes de guardar,
    // para que el surtido no quede sin HI ni horas trabajadas.
    if (tipo === 'uso' && equipo && hiNum == null) {
      const u = await ultimoHorometroEquipo(equipo).catch(() => null);
      if (u != null) { hiNum = u; setHi(String(u)); setHiAuto(true); }
    }
    // El final que retrocede sí se frena; que FALTE no (03/10/2026, decisión del dueño):
    // hay vehículos que llevan kilometraje y no horómetro, y exigir el final los trababa.
    // El recordatorio de cargarlo se muestra en el campo, sin bloquear el guardado.
    const errHor = errorHorometro(hiNum, hfNum);
    if (errHor) { setError(errHor); return; }
    setGuardando(true); setEtapa('movimiento');
    try {
      const campos = {
        fecha, hora, equipo, autorizado_por: autorizado, ubicacion, observacion,
        horometroIni: hiNum, horometroFin: hfNum,
        kilometraje: km === '' ? null : Number(km),
        contadorGlobalIni: ci === '' ? null : Number(ci), contadorGlobalFin: cf === '' ? null : Number(cf),
      };
      let movId: string;
      if (tipo === 'uso') movId = (await registrarUso({ tanqueId: tanque.id, litros: litrosNum, campos, actor, actorName })).id;
      else if (tipo === 'traslado') movId = (await registrarTraslado({ tanqueId: tanque.id, litros: litrosNum, tanqueDestinoId: destinoId, campos, actor, actorName })).id;
      else movId = (await registrarEntrada({ tanqueId: tanque.id, litros: litrosNum, costoLitro: costoNum, campos, actor, actorName })).id;
      // Las fotos se suben recién ahora: la carpeta lleva el id del movimiento.
      if (adjuntos.length) {
        setEtapa('fotos');
        const r = await adjuntosCombustible.subir(MODULO_ADJUNTO_TANQUE, movId, adjuntos, actor);
        for (const f of r.fallos) toast(`Movimiento guardado, pero una foto no se pudo subir: ${f}`, 'error');
      }
      toast(`${TITULO[tipo]}: registrado`, 'success');
      await onSaved(movId);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar.'); }
    finally { setGuardando(false); }
  }

  const destinos = tanques.filter((t) => t.id !== tanque.id);
  const subtitulo = tipo === 'entrada'
    ? `Entra a ${tanque.nombre} · hoy tiene ${num(tanque.saldo_litros)} L a ${money(tanque.tasa_usd_litro)}/L`
    : `Desde ${tanque.nombre} · ${num(tanque.saldo_litros)} L disponibles`;

  return (
    <form className="surt-form card" onSubmit={guardar}>
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>{ICONO[tipo]}</span>
        <div>
          <strong>{TITULO[tipo]}</strong>
          <div className="muted" style={{ fontSize: '.85rem' }}>{subtitulo}</div>
        </div>
      </div>

      {error && <div className="aviso danger"><span className="aviso-icono">⛔</span><div>{error}</div></div>}

      <div className="surt-campo">
        <label htmlFor="surt-litros">Litros</label>
        <input id="surt-litros" className="input surt-input surt-litros" type="number" inputMode="decimal" step="any" min={0}
          value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="0" autoFocus required />
        {errSaldo && <small style={{ color: 'var(--danger)', fontWeight: 700 }}>{errSaldo}</small>}
      </div>

      {tipo === 'entrada' && (
        <div className="surt-campo">
          <label htmlFor="surt-costo">Costo por litro (USD)</label>
          <input id="surt-costo" className="input surt-input" type="number" inputMode="decimal" step="0.0001" min={0}
            value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0,00" />
          <small className="muted">Recalcula la tasa promedio del tanque. Viene precargado con la tasa de hoy.</small>
        </div>
      )}

      {tipo === 'traslado' && (
        <div className="surt-campo">
          <label htmlFor="surt-destino">¿A qué tanque pasa?</label>
          <div className="surt-buscable">
            <SearchSelect id="surt-destino" value={destinoId} onChange={setDestinoId} placeholder="🔍 Busca el tanque…"
              options={destinos.map((t) => ({ value: t.id, label: etiquetaTanque(t.nombre, t.saldo_litros) }))} />
          </div>
        </div>
      )}

      <div className="surt-campo">
        <label htmlFor="surt-equipo">
          {tipo === 'uso' ? '¿A qué equipo o camión va?' : tipo === 'entrada' ? 'Camión o cisterna que lo trajo (opcional)' : 'Equipo / camión que lo lleva (opcional)'}
        </label>
        <div className="surt-buscable">
          <SearchSelect id="surt-equipo" value={equipo} onChange={setEquipo} placeholder="🔍 Escribe parte del nombre o la placa…"
            options={opts('equipo').map((c) => ({ value: c.valor, label: c.valor }))} />
        </div>
      </div>

      {tipo === 'uso' && equipo && (
        <>
          {/* HF − HI = horas trabajadas para el mantenimiento, y el HF es el HI del próximo
              surtido del equipo. Antes estaba escondido en «Más datos» y casi nunca se cargaba. */}
          <div className="surt-grid2">
            <div className="surt-campo">
              <label htmlFor="surt-hi">Horómetro inicial</label>
              <input id="surt-hi" className="input surt-input" type="number" inputMode="decimal" step="any" value={hi} readOnly={hiAuto}
                onChange={(e) => setHi(e.target.value)} placeholder="primera lectura" title={hiAuto ? 'Es el último horómetro final de este equipo: no se cambia aquí' : undefined} />
              {hiAuto && <small className="muted">🔒 Último final del equipo</small>}
            </div>
            <div className="surt-campo">
              <label htmlFor="surt-hf">Horómetro final</label>
              <input id="surt-hf" className="input surt-input" type="number" inputMode="decimal" step="any" value={hf} onChange={(e) => setHf(e.target.value)}
                placeholder="lo que marca hoy" />
              {/* Recordatorio, no bloqueo: un camión lleva kilometraje y puede no tener final de horómetro. */}
              {tipo === 'uso' && faltaHorometroFinal(hi === '' ? null : Number(hi), hf === '' ? null : Number(hf)) && (
                <small className="muted">⏱ Si este equipo lleva horómetro, carga el final: de ahí salen las horas del mantenimiento. Si es un vehículo, con el kilometraje basta.</small>
              )}
            </div>
          </div>
          <div className="surt-campo">
            <label htmlFor="surt-hrs">Horas trabajadas (HF − HI)</label>
            <input id="surt-hrs" className="input surt-input" value={hrs == null ? '' : num(hrs)} readOnly placeholder="se calcula sola"
              style={{ background: 'rgba(255,165,0,.12)', borderColor: 'var(--warning)', fontWeight: 700 }} />
            <small className="muted">
              {hiAuto ? 'El inicial es el último final de este equipo. ' : 'Este equipo no tiene horómetro cargado: si lo tiene, escribe las dos lecturas. '}
              En vehículos va el kilometraje del tablero. Las horas van al mantenimiento y el final es donde arranca el próximo surtido.
            </small>
          </div>
        </>
      )}

      <div className="surt-campo">
        <label htmlFor="surt-autorizado">Autorizado por</label>
        <div className="surt-buscable">
          <SearchSelect id="surt-autorizado" value={autorizado} onChange={setAutorizado} placeholder="🔍 Busca quién autorizó…"
            options={opts('autorizado').map((c) => ({ value: c.valor, label: c.valor }))} />
        </div>
      </div>

      {(tipo === 'uso' || tipo === 'traslado') && (
        <div className="surt-campo">
          <label htmlFor="surt-cf">Contador del surtidor al terminar</label>
          <input id="surt-cf" className="input surt-input" type="number" inputMode="decimal" step="any" value={cf} onChange={(e) => setCf(e.target.value)}
            placeholder={cfPropuesto != null ? `${cfPropuesto} (se pone solo)` : ciAuto ? `arrancó en ${ci}` : 'lectura final del contador'} />
          {cf === '' && ci !== '' && (
            <small className="muted">
              Arrancó en {num(Number(ci))}.{' '}
              {cfPropuesto != null
                ? <>Si lo dejas vacío se guarda <strong>{num(cfPropuesto)}</strong> (el arranque más los {num(litrosNum)} L). Si el contador marca otra cosa, escríbelo.</>
                : 'Lo que marque al terminar es donde arranca el próximo surtido.'}
            </small>
          )}
          {litrosContador != null && (
            <small className={Math.abs(litrosContador - litrosNum) > 1 ? 'surt-alerta' : 'muted'}>
              Según el contador salieron {num(litrosContador)} L{Math.abs(litrosContador - litrosNum) > 1 && litrosNum > 0 ? ' · no coincide con los litros' : ''}
            </small>
          )}
        </div>
      )}

      <SelectorAdjuntos archivos={adjuntos} onChange={setAdjuntos}
        titulo={tipo === 'entrada' ? '📷 Fotos (guía, cisterna, medida)' : '📷 Fotos (contador, equipo, vale)'} grande />

      <button type="button" className="surt-mas" onClick={() => setMasDatos((v) => !v)}>
        {masDatos ? '▾ Menos datos' : `▸ Más datos (${tipo === 'uso' ? 'kilometraje, ' : tipo === 'traslado' ? 'horómetro, kilometraje, ' : ''}destino, hora, observación)`}
      </button>
      {masDatos && (
        <>
          {(tipo === 'uso' || tipo === 'traslado') && (
            <>
              {tipo === 'traslado' && <div className="surt-grid2">
                <div className="surt-campo">
                  <label htmlFor="surt-hi">Horómetro inicial</label>
                  <input id="surt-hi" className="input surt-input" type="number" inputMode="decimal" step="any" value={hi} readOnly={hiAuto}
                    onChange={(e) => setHi(e.target.value)} placeholder="último del equipo" />
                </div>
                <div className="surt-campo">
                  <label htmlFor="surt-hf">Horómetro final</label>
                  <input id="surt-hf" className="input surt-input" type="number" inputMode="decimal" step="any" value={hf} onChange={(e) => setHf(e.target.value)} />
                </div>
              </div>}
              <div className="surt-grid2">
                <div className="surt-campo">
                  <label htmlFor="surt-km">Kilometraje</label>
                  <input id="surt-km" className="input surt-input" type="number" inputMode="decimal" step="any" value={km} onChange={(e) => setKm(e.target.value)} placeholder="odómetro" />
                </div>
                <div className="surt-campo">
                  <label htmlFor="surt-ci">Contador inicial</label>
                  <input id="surt-ci" className="input surt-input" type="number" inputMode="decimal" step="any" value={ci} readOnly={ciAuto} onChange={(e) => setCi(e.target.value)} />
                </div>
              </div>
            </>
          )}
          <div className="surt-campo">
            <label htmlFor="surt-ubic">Destino / mina</label>
            <div className="surt-buscable">
              <SearchSelect id="surt-ubic" value={ubicacion} onChange={setUbicacion} placeholder="🔍 Busca el destino…"
                options={[{ value: '', label: '— sin destino —' }, ...opts('ubicacion').map((c) => ({ value: c.valor, label: c.valor }))]} />
            </div>
          </div>
          <div className="surt-grid2">
            <div className="surt-campo">
              <label htmlFor="surt-fecha">Fecha</label>
              <input id="surt-fecha" className="input surt-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="surt-campo">
              <label htmlFor="surt-hora">Hora</label>
              {/* Selector de hora: en el teléfono abre el reloj del sistema. Escrita a
                  mano entraban horas sin la A ni la P del AM/PM, que desordenaban el libro. */}
              <input id="surt-hora" className="input surt-input" type="time" step={1}
                value={horaAInput(hora)} onChange={(e) => setHora(horaDesdeInput(e.target.value))} />
            </div>
          </div>
          <div className="surt-campo">
            <label htmlFor="surt-obs">Observación</label>
            <input id="surt-obs" className="input surt-input" value={observacion} onChange={(e) => setObservacion(e.target.value)}
              placeholder={tipo === 'entrada' ? 'Compra PDVSA, guía N°…' : 'SUMINISTRO COMBUSTIBLE…'} />
          </div>
        </>
      )}

      {guardando && demorado && (
        <div className="aviso warning">
          <span className="aviso-icono">⏳</span>
          <div>
            {etapa === 'fotos'
              ? <><strong>El movimiento ya quedó guardado</strong>; se están subiendo las fotos con poca señal. No lo vuelvas a cargar. Puedes esperar o volver a la lista: las fotos siguen subiendo solas.</>
              : <>Está tardando más de lo normal por la señal. No lo vuelvas a cargar hasta revisar la lista.</>}
            <div style={{ marginTop: '.5rem' }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>Ver la lista</button>
            </div>
          </div>
        </div>
      )}
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando || !!errSaldo}>
        {guardando
          ? (etapa === 'fotos' ? `Subiendo ${adjuntos.length === 1 ? 'la foto' : `${adjuntos.length} fotos`}…` : 'Guardando…')
          : `✔ Registrar ${tipo === 'uso' ? 'surtido' : tipo === 'traslado' ? 'traslado' : 'entrada'}`}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>Cancelar</button>
    </form>
  );
}

/* ───────────── Detalle de un movimiento (fotos y borrado) ───────────── */
function DetalleMovil({ mov, tanque, tanques, canWrite, esSurtidor, actor, onClose, onBorrado }: {
  mov: MovimientoTanque; tanque: TanqueCombustible | null; tanques: TanqueCombustible[];
  canWrite: boolean; esSurtidor: boolean; actor: string; onClose: () => void; onBorrado: () => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const destino = mov.tanque_destino_id ? tanques.find((t) => t.id === mov.tanque_destino_id)?.nombre : null;
  const Fila = ({ k, v }: { k: string; v: string | null | undefined }) => v ? (
    <div className="surt-fila"><span className="muted">{k}</span><span>{v}</span></div>
  ) : null;

  async function borrar() {
    setBorrando(true);
    try {
      await eliminarMovimientoTanque(mov);
      toast('Movimiento borrado', 'success');
      await onBorrado();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo borrar', 'error');
      setBorrando(false);
    }
  }

  return (
    <Modal title={`${ICONO[mov.tipo]} ${NOMBRE_TIPO[mov.tipo]} · ${num(mov.litros)} L`} size="md" onClose={() => { if (!borrando) onClose(); }}
      footer={<>
        {canWrite && !confirmando && <button className="btn btn-danger btn-grande" onClick={() => setConfirmando(true)} disabled={borrando}>🗑 Eliminar</button>}
        {!esSurtidor && <Link to="/app/combustible" className="btn btn-ghost btn-grande" onClick={onClose}>🖥 Corregir en la PC</Link>}
        <button className="btn btn-primary btn-grande" onClick={onClose} disabled={borrando}>Cerrar</button>
      </>}>
      {/* El que surte manda el aviso al grupo apenas carga el surtido. */}
      <CompartirWhatsapp texto={mensajeMovimiento({ mov, tanque: tanque?.nombre, tanqueDestino: destino, registradoPor: mov.actor_name || mov.created_by })} />

      <div className="surt-detalle">
        <Fila k="Tanque" v={tanque?.nombre} />
        <Fila k="Fecha" v={`${date(mov.fecha)}${mov.hora ? ` · ${mov.hora}` : ''}`} />
        <Fila k="Equipo" v={mov.equipo} />
        <Fila k="A qué tanque" v={destino} />
        <Fila k="Autorizado por" v={mov.autorizado_por} />
        <Fila k="Destino / mina" v={mov.ubicacion} />
        <Fila k="Observación" v={mov.observacion} />
        {mov.tipo === 'entrada' && <Fila k="Costo por litro" v={money(mov.tasa_usd_litro)} />}
        <Fila k="Contador" v={mov.contador_global_ini != null || mov.contador_global_fin != null ? `${mov.contador_global_ini ?? '—'} → ${mov.contador_global_fin ?? '—'}` : null} />
        <Fila k="Horómetro" v={mov.horometro_ini != null || mov.horometro_fin != null ? `${mov.horometro_ini ?? '—'} → ${mov.horometro_fin ?? '—'}` : null} />
        <Fila k="Horas trabajadas" v={(() => { const h = mov.horas_utilizadas ?? horasTrabajadas(mov.horometro_ini, mov.horometro_fin); return h != null ? `${num(h)} h` : null; })()} />
        <Fila k="Kilometraje" v={mov.kilometraje != null ? num(mov.kilometraje) : null} />
        <Fila k="Registrado" v={`${dateTime(mov.created_at)}${mov.actor_name || mov.created_by ? ` · ${mov.actor_name || mov.created_by}` : ''}`} />
      </div>

      {confirmando && (
        <div className="surt-confirmar" role="alertdialog" aria-label="Confirmar borrado">
          <div style={{ fontSize: '1.05rem' }}>
            <strong>¿Borrar este {NOMBRE_TIPO[mov.tipo].toLowerCase()} de {num(mov.litros)} L?</strong>
            <div className="muted" style={{ marginTop: '.3rem', fontSize: '.9rem' }}>
              Se borran también sus fotos{mov.mov_vinculado_id ? ' y el movimiento vinculado del otro tanque' : ''}, y el saldo del tanque se recalcula. No se puede deshacer. Se refleja al instante en la PC.
            </div>
          </div>
          <div className="botones">
            <button type="button" className="btn btn-peligro" onClick={() => void borrar()} disabled={borrando}>{borrando ? 'Borrando…' : '🗑 SÍ, BORRAR'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmando(false)} disabled={borrando}>↩ VOLVER</button>
          </div>
        </div>
      )}

      <AdjuntosSalida repo={adjuntosCombustible} modulo={MODULO_ADJUNTO_TANQUE} refId={mov.id} actor={actor} soloLectura={!canWrite} grande
        titulo="📷 Fotos y documentos" />
      <small className="muted" style={{ display: 'block', marginTop: '.6rem' }}>
        Aquí se agregan o quitan fotos, o se borra el movimiento completo. Los litros, el equipo, la hora y los medidores se corrigen desde el módulo de Combustible en la PC; el cambio se ve aquí al instante.
      </small>
    </Modal>
  );
}
