import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money, num, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { BarChart, type ChartPoint } from '@/shared/ui/Chart';
import type { Producto } from '@/shared/lib/types';
import {
  listViveres, listMovimientosCocina, crearMovimientoCocina, actualizarMovimientoCocina, eliminarMovimientoCocina,
  resumirCocina, TIPOS_COMIDA, labelTipoComida, viveresBajos, alertarViveresBajosACompras,
  type CocinaMovimiento, type CocinaItem, type TipoComida, type ResumenCocina,
} from './cocina.repository';
import { descargarCocinaPdf } from './cocinaPdf';
import { crearAlertaMercado } from './alertasMercado.repository';
import {
  getMercadoActivo, iniciarMercado, descartarMercado, computeResumen, cerrarMercado, diasDelCiclo, detalleViverCiclo,
  CICLO_DIAS, type Mercado, type ResumenViver, type TotalesMercado, type DetalleViverCiclo,
} from './cocinaMercado.repository';
import { claveDescarte, confirmacionValida, motivoValido, MOTIVO_DESCARTE_MIN } from './mercadoDescarte';
import { LeyendaCocina } from './LeyendaCocina';
import { EcuacionMercado, SelectorVista, TablaDisponible } from './PanelMercado';
import { diferenciasPorViver, explicarDiferencia, guardarVista, vistaGuardada, type VistaMercado } from './mercadoPanel';
import { descargarCocinaCierrePdf } from './cocinaCierrePdf';
import { enviarCierreCocinaPorCorreo } from './enviarCierreCocina';
import { MercadosHistoricoModal } from './MercadosHistoricoModal';
import { ControlDistribucionModal } from './ControlDistribucionModal';

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/**
 * «Hoy» en la zona de la empresa (America/Caracas, UTC−4).
 *
 * GT-INT-07 · Antes era `toISOString()`, que da el día en UTC, mientras el
 * formulario etiquetaba con la fecha local. Resultado: toda comida servida
 * después de las 20:00 se corría un día. La cena del 2 a las 21:00 se guardaba
 * como día 2 (bien) pero el botón «Hoy» del resumen ya pedía el 3, así que no
 * aparecía en el total de su propio día. Mismo criterio que `hoyVE()` en
 * acopio/caja.repository.ts.
 */
function hoyISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
/** YYYY-MM-DD → DD/MM/YYYY (para etiquetas legibles). */
function dmy(iso: string): string { const p = iso.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }
function inicioSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00`); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString().slice(0, 10);
}
function inicioMes(iso: string): string { return `${iso.slice(0, 7)}-01`; }

export function CocinaPage() {
  const { appUser, can, isAdmin } = usePermissions();
  const actor = appUser?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;
  const canWrite = isAdmin || can('cocina', 'escritura');

  const [movs, setMovs] = useState<CocinaMovimiento[]>([]);
  const [viveres, setViveres] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'none' | 'add' | 'resumen' | 'alerta' | 'historico' | 'control'>('none');
  const [editando, setEditando] = useState<CocinaMovimiento | null>(null);
  const [aEliminar, setAEliminar] = useState<CocinaMovimiento | null>(null);
  const [notaAlerta, setNotaAlerta] = useState('');
  const [enviandoAlerta, setEnviandoAlerta] = useState(false);
  // Ciclo de mercado (21 días): mercado abierto + su resumen (disponible/consumo/queda).
  const [mercado, setMercado] = useState<Mercado | null>(null);
  const [resMercado, setResMercado] = useState<ResumenViver[]>([]);
  const [totMercado, setTotMercado] = useState<TotalesMercado | null>(null);
  const [detalleViver, setDetalleViver] = useState<{ item: ResumenViver; det: DetalleViverCiclo } | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  // El diálogo de cierre se ata al mercado para el que se abrió, como el de descarte: si otra
  // persona lo cierra o descarta mientras tanto, no reaparece para el mercado siguiente.
  const [cerrandoId, setCerrandoId] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [emailCierre, setEmailCierre] = useState('');
  // El modal se ata al mercado que se estaba descartando, no a un booleano: si otra
  // persona lo descarta primero y después se inicia uno nuevo, el modal no reaparece
  // solo para el mercado nuevo.
  const [descartandoId, setDescartandoId] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [errorMercado, setErrorMercado] = useState<string | null>(null);
  // Error de la carga general (comidas y víveres). Sin esto, si fallaba la primera carga, con
  // la vista «Disponible» la pantalla quedaba en «Cargando…» para siempre.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // true recién cuando la lectura del mercado salió bien. Sin esto, si fallaba otra
  // lectura previa (las comidas), la pantalla decía «No hay un mercado abierto» sin
  // haberlo consultado.
  const [mercadoLeido, setMercadoLeido] = useState(false);
  // Panel por capas, como MGG: qué se mira (se recuerda en el navegador), el filtro de
  // víveres que no cuadran y el aviso de víveres bajos plegado a una línea.
  const [vista, setVista] = useState<VistaMercado>(() => vistaGuardada());
  const [soloDif, setSoloDif] = useState(false);
  const [verBajos, setVerBajos] = useState(false);
  function elegirVista(v: VistaMercado) { setVista(v); guardarVista(v); }

  async function enviarAlertaMercado() {
    setEnviandoAlerta(true);
    try {
      await crearAlertaMercado({ nota: notaAlerta || null, actor, actorName });
      notify('Alerta enviada a Compras: hay que restablecer el mercado', 'success', { link: '#/app/pedidos' });
      setNotaAlerta('');
      setModal('none');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo enviar la alerta', 'error');
    } finally {
      setEnviandoAlerta(false);
    }
  }

  // Filtros de la tabla.
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fTipo, setFTipo] = useState<TipoComida | ''>('');
  const [fBuscar, setFBuscar] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, v] = await Promise.all([
        listMovimientosCocina({ desde: fDesde || undefined, hasta: fHasta || undefined, tipo: fTipo || undefined }),
        listViveres().catch(() => [] as Producto[]),
      ]);
      setMovs(m); setViveres(v); setErrorCarga(null);
      // Ciclo de mercado: lee el mercado abierto y calcula su resumen (saldo inicial +
      // entradas = disponible; consumo; lo que queda).
      //
      // La pantalla ya NO crea el mercado sola. Antes, en cada carga con permiso de
      // escritura, si no encontraba uno abierto lo insertaba: un mercado descartado
      // reaparecía abierto en la carga siguiente sin que nadie lo decidiera. Ahora, sin
      // mercado abierto, se ofrece «Iniciar mercado» y lo abre una persona.
      try {
        const mk = await getMercadoActivo();
        // El resumen se calcula ANTES de mostrar el mercado: si no, el panel pintaba ceros y
        // «Sin víveres» mientras tanto.
        const res = mk ? await computeResumen(mk, v) : null;
        setMercado(mk);
        setResMercado(res?.items ?? []); setTotMercado(res?.totales ?? null);
        setMercadoLeido(true);
        setErrorMercado(null);
      } catch (e) {
        // No bloquea la vista de cocina, pero tampoco se calla: un error de lectura no
        // puede verse igual que «no hay mercado» y ofrecer iniciar uno encima.
        setErrorMercado(e instanceof Error ? e.message : 'No se pudo leer el mercado');
      }
      // Aviso automático a los Analistas de Compras si hay víveres al 20% o menos de su
      // mínimo (best-effort, con dedup para no repetir). Se evalúa en cada carga/refresh,
      // incluido después de registrar una comida (que baja el stock).
      void alertarViveresBajosACompras(v);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo cargar Cocina';
      setErrorCarga(msg);
      toast(msg, 'error');
    } finally { setLoading(false); }
  }, [fDesde, fHasta, fTipo]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['cocina_movimientos', 'movimientos', 'existencias', 'cocina_mercados'], () => { void cargar(); });

  // Búsqueda general (cliente): código, tipo, nota, fecha/hora, productos.
  const movsFiltrados = useMemo(() => {
    const q = norm(fBuscar.trim());
    if (!q) return movs;
    return movs.filter((m) => {
      const campos = [m.codigo ?? '', labelTipoComida(m.tipo_comida), m.nota ?? '', dateTime(m.at),
        ...(m.items ?? []).flatMap((i) => [i.nombre, i.sku])];
      return campos.some((c) => norm(String(c)).includes(q));
    });
  }, [movs, fBuscar]);

  // KPIs sincronizados con lo que muestra la tabla (mismos filtros: fecha, tipo y búsqueda).
  // Antes eran «de hoy» y no reflejaban un movimiento cargado con fecha de servicio desfasada.
  const resFiltrado = useMemo(() => resumirCocina(movsFiltrados), [movsFiltrados]);
  // Etiqueta del período que resumen las tarjetas (según los filtros de fecha).
  const notaPeriodo = fDesde && fHasta
    ? (fDesde === fHasta ? (fDesde === hoyISO() ? 'hoy' : dmy(fDesde)) : `${dmy(fDesde)} – ${dmy(fHasta)}`)
    : fDesde ? `desde ${dmy(fDesde)}` : fHasta ? `hasta ${dmy(fHasta)}` : 'todo el registro';
  // Víveres al 20% o menos de su mínimo (se avisa a Compras y se muestra acá).
  const bajos = useMemo(() => viveresBajos(viveres), [viveres]);

  async function confirmarEliminar(m: CocinaMovimiento) {
    try {
      await eliminarMovimientoCocina(m.id, actor, null);
      toast('Movimiento eliminado · los víveres se devolvieron al inventario', 'success');
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setAEliminar(null); }
  }


  // Contador del ciclo (día X de 21, cuántos faltan, si ya venció).
  const ciclo = useMemo(() => (mercado ? diasDelCiclo(mercado) : null), [mercado]);

  // Víveres cuya cuenta del ciclo no da lo que hay en el inventario (para el detalle).
  const difPorProducto = useMemo(
    () => new Map(diferenciasPorViver(resMercado).map((d) => [d.producto_id, d] as const)),
    [resMercado],
  );
  // Del aviso a los víveres concretos: enciende el filtro y, si hacía falta, cambia a la
  // vista que tiene la tabla. Solo cambiar de vista dejaba buscándolos a ojo.
  function alternarSoloDif(activar: boolean) {
    setSoloDif(activar);
    if (activar && vista === 'movimientos') elegirVista('disponible');
  }
  const verDisponible = !!mercado && vista !== 'movimientos';
  // Sin mercado no hay tabla de víveres ni selector: las comidas quedan siempre a la vista.
  const verMovimientos = vista !== 'disponible' || (!mercado && (mercadoLeido || !!errorMercado));

  // Detalle de un víver del ciclo (lo que quedó + la nueva entrada + los consumos).
  async function abrirDetalleViver(item: ResumenViver) {
    if (!mercado) return;
    setCargandoDetalle(true);
    setDetalleViver({ item, det: { entradas: [], consumos: [], mermas: [] } });
    try {
      const det = await detalleViverCiclo(mercado, item.producto_id);
      setDetalleViver({ item, det });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar el detalle', 'error');
      setDetalleViver(null);
    } finally { setCargandoDetalle(false); }
  }

  // Cierre del mercado: cierra el ciclo, genera el PDF (siempre) y abre el siguiente con el
  // saldo. El correo es OPCIONAL: solo se envía si se cargó al menos un destinatario.
  async function ejecutarCierre() {
    if (!mercado) return;
    setCerrando(true);
    try {
      const cerrado = await cerrarMercado(mercado, actor);
      await descargarCocinaCierrePdf(cerrado);
      const destinos = emailCierre.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      if (destinos.length) {
        const { destinatarios } = await enviarCierreCocinaPorCorreo(cerrado, destinos);
        toast(`Mercado ${cerrado.numero ?? ''} cerrado · PDF generado y enviado a ${destinatarios.join(', ') || 'los destinatarios'}`, 'success');
      } else {
        toast(`Mercado ${cerrado.numero ?? ''} cerrado · reporte PDF generado`, 'success');
      }
      notify(`Cierre de mercado ${cerrado.numero ?? ''} · el nuevo ciclo arranca con lo que quedó`, 'success', { link: '#/app/cocina' });
      setCerrandoId(null); setEmailCierre('');
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cerrar el mercado', 'error'); }
    finally { setCerrando(false); }
  }

  // Inicio del mercado: lo decide una persona. La foto del stock se toma en este instante.
  async function iniciar() {
    setIniciando(true);
    try {
      const nuevo = await iniciarMercado();
      setSoloDif(false);
      notify(`Mercado ${nuevo.numero ?? ''} iniciado · empieza ${dateTime(nuevo.inicio_at)}`, 'success', { link: '#/app/cocina' });
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo iniciar el mercado', 'error'); }
    finally { setIniciando(false); }
  }

  async function alDescartar(m: Mercado) {
    setDescartandoId(null);
    // El descartado deja de mostrarse ya: mientras recarga no se ofrece cerrarlo ni se ve su
    // panel, y el filtro de descuadrados no pasa al mercado siguiente.
    setMercado(null); setResMercado([]); setTotMercado(null);
    setMercadoLeido(false); setSoloDif(false);
    notify(`Mercado ${m.numero ?? ''} descartado · no cuenta y no pasa saldo. El próximo se inicia con «Iniciar mercado».`, 'warning', { link: '#/app/cocina' });
    await cargar();
  }

  return (
    <div className="page">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>🍽 Control de Alimentación (Cocina)</h1>
          <p className="muted hint" style={{ margin: '.25rem 0 0' }}>Consumo de víveres por comida (desayuno, almuerzo, cena), con platos y costo del inventario.</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* El contador del ciclo, «Cerrar» y «Descartar» van en el panel del mercado, como
              en MGG: la cabecera queda para lo que se hace todos los días. */}
          <button className="btn btn-ghost" onClick={() => setModal('resumen')}>📊 Consumo / Resumen</button>
          <button className="btn btn-ghost" onClick={() => setModal('control')} title="Control diario por producto con lote óptimo de compra (EOQ) y punto de reorden">📋 Control de distribución</button>
          <button className="btn btn-ghost" onClick={() => setModal('historico')} title="Ver los mercados ya cerrados: visualizar, editar y sacar reportes">🗂 Mercados cerrados</button>
          {canWrite && <button className="btn btn-warning" onClick={() => setModal('alerta')} title="Avisar a Compras que hay que montar el mercado">🔔 Alerta a Restablecer</button>}
          {canWrite && <button className="btn btn-primary" onClick={() => setModal('add')}>➕ Añadir Movimiento</button>}
        </div>
      </div>

      {/* Sin mercado abierto: lo inicia una persona. La pantalla ya no lo crea sola
          (ver iniciarMercado), así que este es el único camino para abrir uno. */}
      {/* No depende de `loading`: cada evento de tiempo real recarga, y la tarjeta se
          desmontaba y plegaba la leyenda. */}
      {mercadoLeido && !mercado && !errorMercado && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--brand, #ff8a00)' }}>
          <div className="card-title"><span>🛒 Iniciar mercado (ciclo de {CICLO_DIAS} días)</span></div>
          <p className="hint muted" style={{ marginTop: 0 }}>
            Todavía no hay un mercado activo. El mercado empieza en el <strong>instante exacto en que presiones «Iniciar mercado ahora»</strong>:
            el <strong>stock de víveres de ese momento</strong> es el saldo inicial, y solo cuentan las entradas y comidas registradas desde ahí. Ahí arranca el conteo de {CICLO_DIAS} días.
            Desde el día {CICLO_DIAS + 1} toca <strong>cerrarlo</strong> (se puede cerrar antes si hace falta), con PDF y el stock de ese momento como saldo del siguiente.
          </p>
          {/* Sin fecha para elegir (decisión del usuario, 14/09/2026 16:54): el inicio es el
              instante del clic, y lo movido antes queda dentro del saldo inicial. */}
          {canWrite ? (
            <button className="btn btn-primary" onClick={() => void iniciar()} disabled={iniciando}>
              {iniciando ? 'Iniciando…' : '🛒 Iniciar mercado ahora'}
            </button>
          ) : <p className="muted" style={{ margin: 0 }}>No tenés permiso para iniciar el mercado.</p>}
          <p className="muted" style={{ fontSize: '.8rem', margin: '.5rem 0 0' }}>
            Mientras no haya mercado, las comidas se registran y descuentan stock igual, pero no entran en ningún ciclo. Cargá las comidas atrasadas antes de iniciarlo: lo registrado antes del clic queda dentro del saldo inicial.
          </p>
          <LeyendaCocina />
        </div>
      )}
      {errorMercado && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--danger)' }}>
          <strong>No se pudo leer el mercado de cocina.</strong> <span className="muted">{errorMercado}</span>
          <div style={{ marginTop: '.5rem' }}><button className="btn btn-sm btn-ghost" onClick={() => void cargar()}>↻ Reintentar</button></div>
        </div>
      )}

      {/* ── CAPA 1 · La ecuación del ciclo (portado de MGG) ───────────────────
          Los cinco números del ciclo, lo que costó el plato y, solo si no cuadra, el
          contraste con el inventario. Reemplaza al contador de la cabecera. */}
      {mercado && (
        <EcuacionMercado mercado={mercado} items={resMercado} platos={totMercado?.platos ?? null}
          consumoValor={totMercado?.consumo_valor ?? 0} ciclo={ciclo} soloDif={soloDif} onSoloDif={alternarSoloDif} />
      )}

      {/* Aviso de víveres bajos (20% o menos del mínimo): también se notifica a Compras.
          Plegado a una línea: el aviso y la cuenta quedan a la vista; la lista, a un clic. */}
      {bajos.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: '.7rem', padding: '.55rem .8rem', fontSize: '.83rem' }}>
          🥫 <strong className="mono">{num(bajos.length)}</strong> {bajos.length === 1 ? 'víver' : 'víveres'} para reponer
          <span className="muted"> · 20% o menos del mínimo · avisado a Compras</span>
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: '.4rem' }} aria-expanded={verBajos} onClick={() => setVerBajos((v) => !v)}>
            {verBajos ? 'ocultar' : 'ver cuáles'}
          </button>
          {verBajos && (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
              {bajos.map((p) => (
                <span key={p.id} className="btn btn-sm btn-ghost" style={{ cursor: 'default' }}
                  title={`Stock ${num(Number(p.stock))} · mínimo ${num(Number(p.stock_min))} · umbral 20% = ${num(Number(p.stock_min) * 0.2)}`}>
                  {p.nombre} · {num(Number(p.stock))} {p.unidad ?? ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CAPA 2 · Qué se quiere mirar ── */}
      {mercado && <SelectorVista vista={vista} onElegir={elegirVista} />}

      {/* Cerrar y descartar, al lado del panel como en MGG. Cerrar se resalta pasado el día
          21; antes queda punteado. DESCARTAR es lo contrario de cerrar: no abre el siguiente
          ni le pasa saldo. Va en tono discreto: es la salida de excepción, no la habitual. */}
      {canWrite && mercado && (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.8rem' }}>
          <button className={`btn ${ciclo?.vencido ? 'btn-primary' : 'btn-ghost'}`} style={ciclo?.vencido ? undefined : { borderStyle: 'dashed' }}
            onClick={() => setCerrandoId(mercado.id)}
            title={ciclo?.vencido
              ? 'Cerrar el ciclo: genera el reporte (PDF/correo) y arranca el siguiente con lo que quedó'
              : `Todavía no llega el día ${CICLO_DIAS + 1}; se puede cerrar igual si hace falta`}>
            {ciclo?.vencido ? `🧾 Cerrar mercado (día ${ciclo.dia}) — genera PDF y arranca el siguiente` : '🧾 Cerrar mercado anticipadamente'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setDescartandoId(mercado.id)}
            title="El mercado no cuenta y no le pasa saldo al siguiente. No se borra nada. El próximo se inicia con «Iniciar mercado».">
            ⊘ Descartar mercado
          </button>
        </div>
      )}

      {!mercadoLeido && !errorMercado && errorCarga && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--danger)' }}>
          <strong>No se pudo cargar Cocina.</strong> <span className="muted">{errorCarga}</span>
          <div style={{ marginTop: '.5rem' }}><button className="btn btn-sm btn-ghost" onClick={() => void cargar()}>↻ Reintentar</button></div>
        </div>
      )}
      {!mercadoLeido && !errorMercado && !errorCarga && !verMovimientos && (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div>
      )}

      {/* ── CAPA 3a · Disponible a consumir ── */}
      {verDisponible && (
        <TablaDisponible items={resMercado} soloDif={soloDif} onSoloDif={setSoloDif} onElegir={(r) => void abrirDetalleViver(r)} />
      )}

      {/* ── CAPA 3b · Movimientos: las comidas registradas, con sus tarjetas y filtros ──
          Las tarjetas resumen lo mismo que muestra la tabla, así que van con ella. */}
      {verMovimientos && (<>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', margin: '0 0 1rem' }}>
        <KpiCard titulo="Platos" valor={num(resFiltrado.platos)} nota={`${resFiltrado.movimientos} movimiento(s) · ${notaPeriodo}`} />
        <KpiCard titulo="Consumo" valor={money(resFiltrado.valorTotal)} nota={`costo de víveres · ${notaPeriodo}`} destacado />
        <KpiCard titulo="Promedio por plato" valor={money(resFiltrado.promedioPorPlato)} nota={notaPeriodo} />
        <KpiCard titulo="Víveres en catálogo" valor={num(viveres.length)} nota="productos disponibles" />
      </div>

      {/* Filtros de la tabla */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ margin: 0 }}>
            <label style={{ fontSize: '.72rem' }}>Desde</label>
            <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label style={{ fontSize: '.72rem' }}>Hasta</label>
            <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label style={{ fontSize: '.72rem' }}>Tipo de comida</label>
            <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value as TipoComida | '')}>
              <option value="">Todas</option>
              {TIPOS_COMIDA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ margin: 0, flex: '1 1 220px' }}>
            <label style={{ fontSize: '.72rem' }}>Búsqueda general</label>
            <input className="input" value={fBuscar} onChange={(e) => setFBuscar(e.target.value)} placeholder="🔍 código, producto, nota, fecha/hora…" />
          </div>
          {(fDesde || fHasta || fTipo || fBuscar) && (
            <button className="btn btn-ghost" onClick={() => { setFDesde(''); setFHasta(''); setFTipo(''); setFBuscar(''); }}>✕ Limpiar</button>
          )}
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }}
            onClick={() => descargarCocinaPdf({ titulo: tituloRango(fDesde, fHasta), resumen: resumirCocina(movsFiltrados), movs: movsFiltrados }).catch(() => toast('No se pudo generar el PDF', 'error'))}>
            ↓ Reporte PDF
          </button>
        </div>
      </div>

      {/* Tabla de movimientos por tipo de comida */}
      {loading ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div>
      ) : movsFiltrados.length === 0 ? (
        <div className="card"><EmptyState message="No hay movimientos de cocina con esos filtros." icon="🍽" /></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.86rem' }}>
              <thead><tr>
                <th>Código</th><th>Tipo de comida</th><th>Fecha / Hora</th>
                <th style={{ textAlign: 'right' }}>Platos</th><th style={{ textAlign: 'right' }}>Valor</th>
                <th style={{ textAlign: 'right' }}>Prom./plato</th>
                <th>Víveres</th>{canWrite && <th></th>}
              </tr></thead>
              <tbody>
                {movsFiltrados.map((m) => {
                  const tc = TIPOS_COMIDA.find((t) => t.value === m.tipo_comida);
                  return (
                    <tr key={m.id}>
                      <td className="mono">{m.codigo ?? '—'}</td>
                      <td><span className="badge">{tc?.icono} {labelTipoComida(m.tipo_comida)}</span></td>
                      <td>{dateTime(m.at)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{num(m.platos)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(Number(m.valor_total))}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{Number(m.platos) > 0 ? money(Number(m.valor_total) / Number(m.platos)) : '—'}</td>
                      <td className="muted" style={{ fontSize: '.78rem' }}>
                        {(m.items ?? []).map((i) => `${num(i.cantidad)} ${i.nombre}`).join(' · ')}
                        {m.nota ? <div>📝 {m.nota}</div> : null}
                      </td>
                      {canWrite && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" title="Editar movimiento (tipo, platos, víveres, cantidades, nota y fecha)" onClick={() => setEditando(m)}>✏</button>
                          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Eliminar" onClick={() => setAEliminar(m)}>🗑</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Total ({movsFiltrados.length})</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(movsFiltrados.reduce((a, m) => a + (Number(m.platos) || 0), 0))}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(movsFiltrados.reduce((a, m) => a + (Number(m.valor_total) || 0), 0))}</td>
                {(() => {
                  const tp = movsFiltrados.reduce((a, m) => a + (Number(m.platos) || 0), 0);
                  const tv = movsFiltrados.reduce((a, m) => a + (Number(m.valor_total) || 0), 0);
                  return <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{tp > 0 ? money(tv / tp) : '—'}</td>;
                })()}
                <td colSpan={canWrite ? 2 : 1}></td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}
      </>)}

      {/* Va al pie y cerrada: las mismas preguntas vuelven cada ciclo (portado de MGG). */}
      {mercado && <LeyendaCocina />}

      {modal === 'add' && (
        <AddMovimientoModal viveres={viveres} actor={actor} actorName={actorName}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await cargar(); }} />
      )}
      {editando && (
        <AddMovimientoModal viveres={viveres} actor={actor} actorName={actorName} editar={editando}
          onClose={() => setEditando(null)} onSaved={async () => { setEditando(null); await cargar(); }} />
      )}
      {modal === 'resumen' && (
        <ResumenModal viveres={viveres} onClose={() => setModal('none')} />
      )}
      {modal === 'control' && <ControlDistribucionModal onClose={() => setModal('none')} />}
      {modal === 'historico' && (
        <MercadosHistoricoModal canWrite={canWrite} onClose={() => setModal('none')} />
      )}
      {modal === 'alerta' && (
        <Modal title="🔔 Alerta a Restablecer el mercado" size="md" onClose={() => !enviandoAlerta && setModal('none')} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal('none')} disabled={enviandoAlerta}>Cancelar</button>
            <button className="btn btn-warning" onClick={() => void enviarAlertaMercado()} disabled={enviandoAlerta}>{enviandoAlerta ? 'Enviando…' : '🔔 Enviar alerta a Compras'}</button>
          </>
        }>
          <p style={{ marginTop: 0 }}>
            Esto le avisa a <strong>Compras</strong> que hay que <strong>montar el mercado</strong>. Aparece como una <strong>tarjeta en Pedidos</strong> para que el analista cree la Solicitud de Pedido de <strong>MERCADO</strong>.
          </p>
          <div className="form-row">
            <label>Nota para Compras <span className="muted">(opcional)</span></label>
            <textarea className="textarea" value={notaAlerta} onChange={(e) => setNotaAlerta(e.target.value)} placeholder="Ej.: falta arroz, pollo y aceite; urge para mañana…" rows={3} />
          </div>
        </Modal>
      )}
      {aEliminar && (
        <ConfirmDialog title="Eliminar movimiento de cocina"
          message={`¿Eliminar ${aEliminar.codigo ?? 'el movimiento'} (${labelTipoComida(aEliminar.tipo_comida)})? El stock ya descontado NO se repone automáticamente.`}
          confirmText="Eliminar" onCancel={() => setAEliminar(null)} onConfirm={() => confirmarEliminar(aEliminar)} />
      )}

      {/* Detalle de un víver del ciclo: lo que quedó + la nueva entrada + los consumos. */}
      {detalleViver && (
        <Modal title={`Víver · ${detalleViver.item.nombre}`} size="lg" onClose={() => setDetalleViver(null)}
          footer={<button className="btn btn-primary" onClick={() => setDetalleViver(null)}>Cerrar</button>}>
          {/* La cuenta del víver en el orden en que se lee, como el detalle de MGG. */}
          {(() => {
            const it = detalleViver.item;
            const u = it.unidad ?? '';
            const dif = difPorProducto.get(it.producto_id);
            return (
              <div className="card" style={{ margin: '0 0 .8rem', background: 'var(--bg-2)', fontSize: '.9rem' }}>
                <div>Al iniciar el ciclo{mercado ? <> (<strong>{dateTime(mercado.inicio_at)}</strong>)</> : null} había <strong className="mono">{num(it.saldo_inicial)} {u}</strong></div>
                <div>+ entradas desde entonces: <strong className="mono" style={{ color: 'var(--primary-3, #2ecc71)' }}>{num(it.entradas)} {u}</strong></div>
                <div style={{ marginTop: '.2rem' }}>= <strong>TOTAL DISPONIBLE A CONSUMIR</strong>: <strong className="mono" style={{ fontSize: '1.05rem' }}>{num(it.disponible)} {u}</strong></div>
                <div className="muted">
                  − consumido: <strong className="mono" style={{ color: 'var(--danger)' }}>{num(it.consumo)} {u}</strong>
                  {' · − mermas / salidas: '}<strong className="mono" style={{ color: 'var(--warning)' }}>{num(it.mermas ?? 0)} {u}</strong>
                  {' · en inventario hay: '}<strong className="mono" style={{ color: it.queda <= 0 ? 'var(--danger)' : 'var(--primary-3, #2ecc71)' }}>{num(it.queda)} {u}</strong>
                </div>
                {dif && (
                  <div style={{ marginTop: '.45rem', paddingTop: '.4rem', borderTop: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--warning)' }}>
                      ⚠ la cuenta del ciclo da <strong className="mono">{num(dif.cuenta)} {u}</strong>
                      {' · '}{dif.diferencia < 0 ? 'faltan' : 'sobran'} <strong className="mono">{num(Math.abs(dif.diferencia))} {u}</strong>
                    </span>
                    <div className="dim" style={{ fontSize: '.8rem', marginTop: '.15rem' }}>↳ {explicarDiferencia(dif.diferencia)}</div>
                  </div>
                )}
              </div>
            );
          })()}
          {cargandoDetalle ? (
            <p className="muted">Cargando detalle…</p>
          ) : (
            <>
              <h4 style={{ margin: '.6rem 0 .35rem', color: 'var(--primary-3, #2ecc71)' }}>Entradas ({detalleViver.det.entradas.length})</h4>
              {!detalleViver.det.entradas.length ? (
                <p className="muted" style={{ margin: 0 }}>Sin entradas en este ciclo.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                  {detalleViver.det.entradas.map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '.25rem', fontSize: '.83rem' }}>
                      <span className="muted">{dateTime(e.fecha)}{e.ref ? <> · <span className="mono">{e.ref}</span></> : null}</span>
                      <span className="mono" style={{ color: 'var(--primary-3, #2ecc71)', whiteSpace: 'nowrap' }}>+{num(e.cantidad)} {detalleViver.item.unidad ?? ''}</span>
                    </div>
                  ))}
                </div>
              )}
              <h4 style={{ margin: '.8rem 0 .35rem', color: 'var(--danger)' }}>Consumos ({detalleViver.det.consumos.length})</h4>
              {!detalleViver.det.consumos.length ? (
                <p className="muted" style={{ margin: 0 }}>Sin consumos de este víver en el ciclo.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                  {detalleViver.det.consumos.map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '.25rem', fontSize: '.83rem' }}>
                      <span><span className="mono">{c.codigo ?? '—'}</span> · {labelTipoComida(c.tipo_comida ?? '')} · <span className="muted">{dateTime(c.fecha)}</span></span>
                      <span className="mono" style={{ color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                        −{num(c.cantidad)} {detalleViver.item.unidad ?? ''} <span className="muted">· {money(c.valor)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <h4 style={{ margin: '.8rem 0 .35rem', color: 'var(--warning)' }}>Mermas / salidas ({detalleViver.det.mermas.length})</h4>
              {!detalleViver.det.mermas.length ? (
                <p className="muted" style={{ margin: 0 }}>Sin mermas ni salidas de este víver en el ciclo.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                  {detalleViver.det.mermas.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '.25rem', fontSize: '.83rem' }}>
                      {/* El motivo tal como se escribió: es lo que explica la pérdida. */}
                      <span>
                        <span className="badge" style={{ fontSize: '.66rem' }}>{s.tipo}</span>{' '}
                        {s.detalle ?? <span className="muted">sin motivo escrito</span>}
                        <span className="muted"> · {dateTime(s.fecha)}{s.actor ? ` · ${s.actor}` : ''}</span>
                      </span>
                      <span className="mono" style={{ color: 'var(--warning)', whiteSpace: 'nowrap' }}>−{num(s.cantidad)} {detalleViver.item.unidad ?? ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Cierre del mercado: reporte PDF (descargable / por correo) + arranca el próximo ciclo. */}
      {cerrandoId && mercado && mercado.id === cerrandoId && (
        <Modal title="🧾 Cerrar mercado" size="md" onClose={() => !cerrando && setCerrandoId(null)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCerrandoId(null)} disabled={cerrando}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => void ejecutarCierre()} disabled={cerrando}>{cerrando ? 'Cerrando…' : '🧾 Cerrar mercado'}</button>
          </>
        }>
          <p style={{ marginTop: 0 }}>
            Se cierra el mercado <strong>{mercado.numero ?? ''}</strong> ({ciclo ? `día ${ciclo.dia} de ${CICLO_DIAS}` : ''}) y se genera el <strong>reporte del ciclo en PDF</strong> (consumo por víver y lo que queda). El <strong>siguiente mercado arranca con el saldo</strong> de lo que quedó. Queda en el <strong>histórico</strong> de mercados cerrados.
          </p>
          <div className="card" style={{ padding: '.6rem', marginBottom: '.7rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-around', textAlign: 'center' }}>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Víveres</div><div className="mono" style={{ fontWeight: 700 }}>{num(totMercado?.viveres ?? resMercado.length)}</div></div>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Consumo total</div><div className="mono" style={{ fontWeight: 700 }}>{money(totMercado?.consumo_valor ?? 0)}</div></div>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Pasan al próximo</div><div className="mono" style={{ fontWeight: 700 }}>{num(totMercado?.queda_viveres ?? 0)} víveres</div></div>
          </div>
          <div className="form-row">
            <label>Correo(s) para el reporte <span className="muted">(opcional · separá con coma)</span></label>
            <input className="input" value={emailCierre} onChange={(e) => setEmailCierre(e.target.value)} placeholder="correo@empresa.com, otro@empresa.com" />
            <small className="muted">Opcional: si cargás uno o más correos, además de descargar el PDF <strong>se envía por correo</strong>. Si lo dejás vacío, solo se genera el PDF.</small>
          </div>
        </Modal>
      )}

      {descartandoId && mercado && mercado.id === descartandoId && (
        <DescartarMercadoModal mercado={mercado} dia={ciclo?.dia ?? null} totales={totMercado}
          actor={actor} actorName={actorName}
          onClose={() => setDescartandoId(null)} onDone={alDescartar} />
      )}
    </div>
  );
}

/* ───────────── Descartar el mercado abierto ─────────────
   Portado de MGG. Descartar no es cerrar: el ciclo queda guardado y marcado, no
   cuenta y no le pasa saldo al siguiente. Tampoco abre uno nuevo: lo inicia una
   persona cuando el inventario está como debe. Doble llave, como lo destructivo del
   resto del sistema: un motivo que explique y el número del mercado escrito a mano. */
function DescartarMercadoModal({ mercado, dia, totales, actor, actorName, onClose, onDone }: {
  mercado: Mercado; dia: number | null; totales: TotalesMercado | null;
  actor: string; actorName: string | null;
  onClose: () => void; onDone: (m: Mercado) => void | Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [escrito, setEscrito] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = claveDescarte(mercado.numero);
  const motivoOk = motivoValido(motivo);
  const confirmado = confirmacionValida(escrito, clave);
  const listo = motivoOk && confirmado && !guardando;

  async function confirmar() {
    if (!listo) return;
    setGuardando(true); setError(null);
    try {
      const descartado = await descartarMercado(mercado, { actor, actorName, motivo });
      await onDone(descartado);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descartar el mercado');
      setGuardando(false);
    }
  }

  return (
    <Modal title={`⊘ Descartar mercado ${mercado.numero ?? ''}`} size="md" onClose={() => { if (!guardando) onClose(); }} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
        <button className="btn btn-danger" onClick={() => void confirmar()} disabled={!listo}>
          {guardando ? 'Descartando…' : '⊘ Descartar'}
        </button>
      </>
    }>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
      <div className="card" style={{ borderColor: 'var(--danger)', marginTop: 0, marginBottom: '.75rem' }}>
        <strong>Esto no se deshace.</strong> El ciclo <strong>deja de contar</strong>: no le pasa saldo al siguiente y sus cifras salen de la cadena.
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        No se borra nada — las comidas, los movimientos y el resumen quedan donde están, y el ciclo se sigue
        consultando en «Mercados cerrados» con todas sus cifras. No se abre otro mercado: cuando alguien lo inicie,
        el <strong>saldo inicial será el stock del instante</strong> en que alguien presione «Iniciar mercado ahora», y
        solo cuenta lo que pase desde ahí. Mientras tanto, las comidas se registran y descuentan stock, pero no entran
        en ningún ciclo.
      </p>
      <div className="card" style={{ padding: '.6rem', marginBottom: '.7rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-around', textAlign: 'center' }}>
        <div><div className="muted" style={{ fontSize: '.72rem' }}>Ciclo</div><div className="mono" style={{ fontWeight: 700 }}>{dia != null ? `día ${dia} de ${CICLO_DIAS}` : '—'}</div></div>
        <div><div className="muted" style={{ fontSize: '.72rem' }}>Víveres</div><div className="mono" style={{ fontWeight: 700 }}>{num(totales?.viveres ?? 0)}</div></div>
        <div><div className="muted" style={{ fontSize: '.72rem' }}>Consumo del ciclo</div><div className="mono" style={{ fontWeight: 700 }}>{money(totales?.consumo_valor ?? 0)}</div></div>
      </div>
      <div className="form-row">
        <label htmlFor="motivo-descarte">Por qué se descarta</label>
        <textarea id="motivo-descarte" className="textarea" rows={3} value={motivo} disabled={guardando}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Qué pasó con este ciclo y por qué sus cifras no sirven de punto de partida." />
        {/* Obligatorio y con un mínimo real: dentro de seis meses, un ciclo que no cuenta y
            no dice por qué parece un error del sistema en vez de una decisión de alguien. */}
        {!motivoOk && (
          <small className="muted" style={{ color: motivo.trim() ? 'var(--danger)' : undefined }}>
            {motivo.trim()
              ? `Explicá un poco más: esto queda en el historial (${motivo.trim().length}/${MOTIVO_DESCARTE_MIN}).`
              : 'Obligatorio.'}
          </small>
        )}
      </div>
      <div className="form-row">
        <label htmlFor="clave-descarte">Para confirmar, escribí <strong className="mono">{clave}</strong></label>
        <input id="clave-descarte" className="input mono" value={escrito} disabled={guardando} autoComplete="off"
          onChange={(e) => setEscrito(e.target.value)} placeholder={clave}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void confirmar(); } }} />
        {escrito.trim() !== '' && !confirmado && <small className="muted" style={{ color: 'var(--danger)' }}>No coincide.</small>}
      </div>
    </Modal>
  );
}

function tituloRango(desde: string, hasta: string): string {
  if (desde && hasta) return `Consumo · ${desde} a ${hasta}`;
  if (desde) return `Consumo · desde ${desde}`;
  if (hasta) return `Consumo · hasta ${hasta}`;
  return 'Consumo · todo el histórico';
}

function KpiCard({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className="card" style={{ borderColor: destacado ? 'var(--brand, #ff8a00)' : undefined }}>
      <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{titulo}</div>
      <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800 }}>{valor}</div>
      {nota && <div className="muted" style={{ fontSize: '.75rem' }}>{nota}</div>}
    </div>
  );
}

/* ───────────── Añadir / editar movimiento (consumo de víveres) ───────────── */
function AddMovimientoModal({ viveres, actor, actorName, editar, onClose, onSaved }: {
  viveres: Producto[]; actor: string; actorName: string | null; editar?: CocinaMovimiento | null; onClose: () => void; onSaved: () => void;
}) {
  const esEdicion = !!editar;
  // Cantidades ya consumidas por este movimiento (al editar): liberan stock para la nueva cantidad.
  const oldQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of editar?.items ?? []) m.set(it.producto_id, (m.get(it.producto_id) ?? 0) + Number(it.cantidad || 0));
    return m;
  }, [editar]);
  // Datos de respaldo (sku/nombre/precio/almacén) de los víveres del movimiento, por si alguno
  // ya no está en el listado activo del inventario (así no se pierde al editar).
  const itemFallback = useMemo(() => {
    const m = new Map<string, { sku: string; nombre: string; precio: number; almacen: string | null }>();
    for (const it of editar?.items ?? []) m.set(it.producto_id, { sku: it.sku, nombre: it.nombre, precio: Number(it.precio) || 0, almacen: it.almacen ?? null });
    return m;
  }, [editar]);

  const [tipo, setTipo] = useState<TipoComida>(editar?.tipo_comida ?? 'almuerzo');
  const [platos, setPlatos] = useState(editar ? String(editar.platos ?? '') : '');
  const [nota, setNota] = useState(editar?.nota ?? '');
  // Fecha del servicio (por defecto hoy): permite cargar comidas de un día desfasado.
  const [fecha, setFecha] = useState(() => (editar?.at ? new Date(editar.at).toLocaleDateString('en-CA') : new Date().toLocaleDateString('en-CA')));
  // Selección tipo CHECK: producto_id → cantidad (texto). Marcar el check lo agrega
  // con cantidad 1; desmarcar lo quita. Se pueden elegir varios de un vistazo.
  const [sel, setSel] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    for (const it of editar?.items ?? []) s[it.producto_id] = String(it.cantidad ?? '');
    return s;
  });
  const [busqueda, setBusqueda] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prodMap = useMemo(() => new Map(viveres.map((p) => [p.id, p])), [viveres]);
  const searchRef = useRef<HTMLInputElement>(null);
  // Stock disponible para un víver: al editar, se suma lo que este movimiento ya había
  // consumido (que se reintegra), para no bloquear una edición válida.
  const dispDe = (p: Producto) => Number(p.stock) + (esEdicion ? (oldQty.get(p.id) ?? 0) : 0);

  function toggle(pid: string) {
    setSel((s) => {
      if (pid in s) { const { [pid]: _drop, ...rest } = s; return rest; }
      return { ...s, [pid]: '1' };
    });
    // Al marcar, el foco pasa a la CANTIDAD (el input se autoenfoca al montarse).
  }
  function setCant(pid: string, v: string) { setSel((s) => ({ ...s, [pid]: v })); }
  // Tras escribir la cantidad y presionar Enter, el cursor vuelve al buscador para
  // encontrar el siguiente producto (se limpia la búsqueda para empezar de cero).
  function irABusqueda() {
    setBusqueda('');
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  // Filtrado de la lista por texto (nombre / SKU), sin acentos ni mayúsculas.
  const viveresFiltrados = useMemo(() => {
    const q = norm(busqueda).trim();
    if (!q) return viveres;
    return viveres.filter((p) => norm(`${p.nombre} ${p.sku}`).includes(q));
  }, [viveres, busqueda]);

  // Líneas seleccionadas (para el resumen/validación/submit).
  const lineas = useMemo(() => Object.entries(sel).map(([pid, cantStr]) => {
    const p = prodMap.get(pid) ?? null;
    const fb = itemFallback.get(pid) ?? null;
    const cant = Number(cantStr) || 0;
    const precio = Number(p?.precio ?? fb?.precio) || 0;
    // Disponible = stock actual + (al editar) lo que este movimiento ya consumía (se reintegra).
    const disponible = p ? Number(p.stock) + (esEdicion ? (oldQty.get(pid) ?? 0) : 0) : Infinity;
    const info = p
      ? { id: p.id, sku: p.sku, nombre: p.nombre, almacen: p.almacen ?? null }
      : fb ? { id: pid, sku: fb.sku, nombre: fb.nombre, almacen: fb.almacen } : null;
    return { pid, info, cant, precio, subtotal: cant * precio, excede: cant > disponible };
  }), [sel, prodMap, itemFallback, esEdicion, oldQty]);
  const total = lineas.reduce((a, l) => a + l.subtotal, 0);
  const nSeleccionados = lineas.length;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const items: CocinaItem[] = lineas.filter((l) => l.info && l.cant > 0).map((l) => ({
      producto_id: l.info!.id, sku: l.info!.sku, nombre: l.info!.nombre, cantidad: l.cant, precio: l.precio, almacen: l.info!.almacen ?? null,
    }));
    if (!items.length) { setError('Marcá al menos un víver con cantidad mayor a 0.'); return; }
    const exc = lineas.find((l) => l.excede);
    if (exc) { setError(`No hay stock suficiente de ${exc.info?.nombre} (disponible ${num(Number((prodMap.get(exc.pid)?.stock ?? 0)) + (esEdicion ? (oldQty.get(exc.pid) ?? 0) : 0))}).`); return; }
    const nPlatos = Number(platos) || 0;
    if (nPlatos <= 0) { setError('Indicá cuántos platos se realizaron.'); return; }
    // Fecha del servicio: se combina el día elegido con una hora (para el orden dentro del
    // día). Si es una fecha desfasada, queda registrado en ese día.
    //
    // Al EDITAR se conserva la hora original, y si el día no cambió no se manda `at`. Antes se
    // le ponía la hora del momento de editar: una comida de la mañana editada por la tarde
    // podía pasar de un ciclo al siguiente cuando el límite cae a mitad del día, como el
    // descarte y el inicio del 14/09.
    let at: string | undefined;
    const original = editar?.at ? new Date(editar.at) : null;
    const diaOriginal = original ? original.toLocaleDateString('en-CA') : null;
    if (fecha && fecha !== diaOriginal) {
      const hora = (original ?? new Date()).toTimeString().slice(0, 8);
      const d = new Date(`${fecha}T${hora}`);
      if (!Number.isNaN(d.getTime())) at = d.toISOString();
    }
    setSaving(true);
    try {
      const r = esEdicion
        ? await actualizarMovimientoCocina(editar!.id, { tipoComida: tipo, platos: nPlatos, items, nota: nota || null, at, actor, actorName })
        : await crearMovimientoCocina({ tipoComida: tipo, platos: nPlatos, items, nota: nota || null, at, actor, actorName });
      notify(`Movimiento de cocina ${r.codigo} ${esEdicion ? 'actualizado' : ''} · ${labelTipoComida(tipo)} · ${money(Number(r.valor_total))}`, 'success', { link: '#/app/cocina' });
      onSaved();
    } catch (err) {
      // Los errores de Supabase (PostgrestError) NO son instancias de Error; igual traen
      // `message`. Se muestra el detalle real en vez del genérico para poder diagnosticar.
      const msg = err instanceof Error ? err.message
        : (err && typeof err === 'object' && 'message' in err && (err as { message?: unknown }).message)
          ? String((err as { message: unknown }).message)
          : 'No se pudo guardar.';
      setError(msg); setSaving(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="cocina-add" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : `${esEdicion ? 'Guardar cambios' : 'Registrar'} · ${money(total)}`}</button>
    </>
  );

  return (
    <Modal title={esEdicion ? `✏ Editar movimiento ${editar?.codigo ?? ''}` : 'Añadir movimiento de cocina'} size="lg" onClose={() => !saving && onClose()} footer={footer}>
      <form id="cocina-add" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        {/* Tipo de comida (una sola) */}
        <div className="form-row">
          <label>Tipo de comida</label>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {TIPOS_COMIDA.map((t) => (
              <label key={t.value} className="card" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: 0, padding: '.5rem .8rem', cursor: 'pointer', borderColor: tipo === t.value ? 'var(--brand, #ff8a00)' : 'var(--border)' }}>
                <input type="radio" name="tipo-comida" checked={tipo === t.value} onChange={() => setTipo(t.value)} />
                <span>{t.icono} {t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Fecha del servicio <span className="muted">(para comidas de un día desfasado)</span></label>
            <input className="input" type="date" value={fecha} max={new Date().toLocaleDateString('en-CA')} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>¿Cuántos platos se realizaron?</label>
            <input className="input mono" type="number" min={0} step="any" value={platos} onChange={(e) => setPlatos(e.target.value)} placeholder="Ej.: 24" required />
            {(Number(platos) || 0) > 0 && total > 0 && (
              <small className="muted">Prom. por plato: <strong className="mono" style={{ color: 'var(--brand, #ff8a00)' }}>{money(total / (Number(platos) || 1))}</strong></small>
            )}
          </div>
          <div className="form-row">
            <label>Nota (opcional)</label>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Comentario del servicio…" />
          </div>
        </div>

        {/* Víveres consumidos: checklist de TODOS los víveres del inventario (cualquier almacén) */}
        <div className="form-row">
          <label>Productos consumidos <span className="muted">(marcá los que se usaron · Alimentos, Víveres, Carnes, Proteínas, Hortalizas/Legumbres y Limpieza del inventario, sin importar el almacén)</span></label>
          <input ref={searchRef} className="input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder={viveres.length ? '🔍 Buscar víver por nombre o SKU…' : '— sin víveres en el inventario —'}
            style={{ marginBottom: '.5rem' }} disabled={!viveres.length} />
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {viveresFiltrados.length === 0 ? (
              <div className="muted" style={{ padding: '.7rem' }}>{viveres.length ? 'Sin coincidencias con la búsqueda.' : 'No hay productos de la categoría Víveres en el inventario.'}</div>
            ) : viveresFiltrados.map((p) => {
              const marcado = p.id in sel;
              const cant = Number(sel[p.id]) || 0;
              const disp = dispDe(p);
              const excede = marcado && cant > disp;
              return (
                <div key={p.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: '.5rem', alignItems: 'center',
                  padding: '.45rem .6rem', borderBottom: '1px solid var(--border)',
                  background: marcado ? 'var(--primary-soft, rgba(255,138,0,.10))' : 'transparent',
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '.55rem', cursor: 'pointer', minWidth: 0 }}>
                    <input type="checkbox" checked={marcado} onChange={() => toggle(p.id)} style={{ flex: '0 0 auto' }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{p.nombre}</span> <span className="muted" style={{ fontSize: '.78rem' }}>({p.sku})</span>
                      <span className="muted" style={{ display: 'block', fontSize: '.74rem' }}>
                        📦 {num(disp)} {p.unidad ?? ''}{esEdicion && (oldQty.get(p.id) ?? 0) > 0 ? <span title="Incluye lo que este movimiento ya consumía (se reintegra al editar)"> (incl. {num(oldQty.get(p.id) ?? 0)} de este mov.)</span> : ''} · {money(Number(p.precio) || 0)} · {p.almacen || 'sin almacén'}
                      </span>
                    </span>
                  </label>
                  {marcado && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flex: '0 0 auto' }}>
                      <input className="input mono" type="number" min={0} step="any" value={sel[p.id]} autoFocus
                        onChange={(e) => setCant(p.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); irABusqueda(); } }}
                        style={{ width: 84, textAlign: 'right', borderColor: excede ? 'var(--danger)' : undefined }} />
                      <span className="muted" style={{ fontSize: '.74rem', minWidth: 54, textAlign: 'right' }}>{money(cant * (Number(p.precio) || 0))}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.4rem', flexWrap: 'wrap', gap: '.4rem' }}>
            <small className="muted">Los precios salen del inventario (PMP). {esEdicion ? <>Al guardar, el inventario se <strong>ajusta por la diferencia</strong> (si bajás una cantidad, vuelve al stock; si la subís, se descuenta más).</> : <>Al registrar, cada víver se <strong>descuenta del stock</strong>.</>}</small>
            <span style={{ fontWeight: 700 }}>
              {nSeleccionados} seleccionado{nSeleccionados === 1 ? '' : 's'} · TOTAL {money(total)}
              {(Number(platos) || 0) > 0 && <> · Prom./plato <span style={{ color: 'var(--brand, #ff8a00)' }}>{money(total / (Number(platos) || 1))}</span></>}
            </span>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── Consumo / Resumen con barras ───────────── */
type Rango = 'hoy' | 'semana' | 'mes' | 'rango';
function ResumenModal({ viveres, onClose }: { viveres: Producto[]; onClose: () => void }) {
  const [rango, setRango] = useState<Rango>('hoy');
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [movs, setMovs] = useState<CocinaMovimiento[]>([]);
  const [loading, setLoading] = useState(true);

  // Calcula el rango efectivo según el botón elegido.
  const { d, h } = useMemo(() => {
    const hoy = hoyISO();
    if (rango === 'hoy') return { d: hoy, h: hoy };
    if (rango === 'semana') return { d: inicioSemana(hoy), h: hoy };
    if (rango === 'mes') return { d: inicioMes(hoy), h: hoy };
    return { d: desde, h: hasta };
  }, [rango, desde, hasta]);

  useEffect(() => {
    setLoading(true);
    listMovimientosCocina({ desde: d, hasta: h }).then(setMovs).catch(() => setMovs([])).finally(() => setLoading(false));
  }, [d, h]);

  const resumen: ResumenCocina = useMemo(() => resumirCocina(movs), [movs]);
  const barrasTop: ChartPoint[] = resumen.topProductos.slice(0, 10).map((p) => ({ label: p.nombre, value: p.valor, tooltip: `${p.nombre}: ${money(p.valor)} · ${num(p.cantidad)} und` }));
  const promPlatoTipo = (t: TipoComida) => (resumen.porTipo[t].platos > 0 ? resumen.porTipo[t].valor / resumen.porTipo[t].platos : 0);
  const barrasTipo: ChartPoint[] = (['desayuno', 'almuerzo', 'cena'] as const).map((t) => ({ label: labelTipoComida(t), value: resumen.porTipo[t].valor, tooltip: `${labelTipoComida(t)}: ${money(resumen.porTipo[t].valor)} · ${resumen.porTipo[t].platos} platos · prom. ${money(promPlatoTipo(t))}/plato` }));
  const etiquetaRango = rango === 'hoy' ? `Día ${desdeLegible(d)}` : `${desdeLegible(d)} a ${desdeLegible(h)}`;

  return (
    <Modal title="📊 Consumo / Resumen" size="lg" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={() => descargarCocinaPdf({ titulo: `Consumo · ${etiquetaRango}`, resumen, movs }).catch(() => toast('No se pudo generar el PDF', 'error'))}>↓ Reporte PDF</button>
      </>
    }>
      {/* Selector de rango */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.75rem', alignItems: 'flex-end' }}>
        {([['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['rango', 'Rango…']] as const).map(([val, txt]) => (
          <button key={val} className={rango === val ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'} onClick={() => setRango(val)}>{txt}</button>
        ))}
        {rango === 'rango' && (
          <>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} />
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} />
          </>
        )}
      </div>

      {/* Resumen tipo "Día 23/06/2026: 24 platos, $300 total, prom $12,5/plato" */}
      <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
        <div style={{ fontSize: '.95rem' }}>
          <strong>{etiquetaRango}</strong> · <strong className="mono">{num(resumen.platos)}</strong> platos ·
          consumo total <strong className="mono">{money(resumen.valorTotal)}</strong> ·
          promedio por plato <strong className="mono">{money(resumen.promedioPorPlato)}</strong>
          <span className="muted"> · {resumen.movimientos} movimiento(s)</span>
        </div>
      </div>

      {/* Desglose por tipo de comida con prom. por plato */}
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div className="card-title" style={{ marginBottom: '.4rem' }}>Por tipo de comida</div>
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead><tr>
              <th>Tipo de comida</th>
              <th style={{ textAlign: 'right' }}>Platos</th>
              <th style={{ textAlign: 'right' }}>Consumo</th>
              <th style={{ textAlign: 'right' }}>Prom./plato</th>
            </tr></thead>
            <tbody>
              {(['desayuno', 'almuerzo', 'cena'] as const).map((t) => (
                <tr key={t}>
                  <td>{TIPOS_COMIDA.find((x) => x.value === t)?.icono} {labelTipoComida(t)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(resumen.porTipo[t].platos)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(resumen.porTipo[t].valor)}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--brand, #ff8a00)' }}>{resumen.porTipo[t].platos > 0 ? money(promPlatoTipo(t)) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(resumen.platos)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(resumen.valorTotal)}</td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(resumen.promedioPorPlato)}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>

      {loading ? <p className="muted">Cargando…</p> : (
        <>
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Víveres más consumidos ($)</div>
            <BarChart data={barrasTop} color="#10b981" yFormatter={(n) => money(n)} emptyMessage="Sin consumo en el rango." />
          </div>
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Consumo por tipo de comida ($)</div>
            <BarChart data={barrasTipo} color="#ff8a00" yFormatter={(n) => money(n)} emptyMessage="Sin consumo en el rango." />
          </div>

          {/* Stock disponible de víveres */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Stock disponible de víveres</div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.82rem' }}>
                <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>
                  {viveres.map((p) => (
                    <tr key={p.id} style={{ opacity: Number(p.stock) <= 0 ? 0.5 : 1 }}>
                      <td>{p.nombre} <span className="muted mono" style={{ fontSize: '.72rem' }}>{p.sku}</span></td>
                      <td className="mono" style={{ textAlign: 'right', color: Number(p.stock) <= 0 ? 'var(--danger)' : undefined }}>{num(Number(p.stock))} {p.unidad ?? ''}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(Number(p.precio))}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(Number(p.stock) * Number(p.precio))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function desdeLegible(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
