/* ============================================================
   Golden Touch · Ventas · Formulario de venta (alta / edición de borrador)

   Lo que hace esta pantalla, y en qué orden:
     1. Se elige el cliente (del padrón de Tesorería, o se lo da de alta acá).
     2. Se cargan los renglones. El precio se PRECARGA de `productos.precio_venta`
        pero queda editable: hoy ningún producto lo tiene cargado, así que el
        campo arranca vacío y eso es normal, no un error.
     3. Cada renglón muestra su ganancia EN VIVO y, si corresponde, sus avisos.
     4. Si la condición es contado, se reparte el cobro en patas de pago.
     5. «Guardar borrador» no mueve nada. «Confirmar» SÍ mueve plata, así que
        pide confirmación explícita.

   El cliente, la grilla de renglones (con sus tres avisos) y la tabla de patas
   de pago son las MISMAS que las de la permuta: viven en `ventasFormPartes`.
   Los tres avisos del renglón son el corazón de la pantalla y por eso están
   escritos una sola vez, allá:
     · Costo en 0 → la ganancia de ese renglón no es real (el margen sale 100 %
       y es mentira). Hoy hay 145 productos activos sin costo cargado.
     · Precio por debajo del costo → se avisa, NO se bloquea: a veces se remata.
     · Cantidad mayor al stock → se avisa, NO se bloquea: el material se entrega
       después (al ENTREGAR), y para entonces puede haber entrado más.

   Los totales salen SIEMPRE de `resumenDeVenta` (que por dentro es
   `calcularTotalesVenta`). Acá no se vuelve a escribir la cuenta ni en el JSX:
   el bug de «el IVA no se suma» ya volvió varias veces por tenerla en varios
   lados. Lo mismo con la ganancia: NUNCA es `total − costo`, porque el total
   lleva IVA y el IVA no es ganancia de nadie.
   ============================================================ */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { dosDecimales, montoMoneda, num } from '@/shared/lib/format';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { listProductos } from '@/modules/inventario/inventario.repository';
import { listCajasActivas } from '@/modules/salidas/cajas.repository';
import { listSaldos } from '@/modules/tesoreria/cajaSaldos.repository';
import type { Caja, CajaSaldo, Producto } from '@/shared/lib/types';
import { round2 } from './ventasCalculos';
import {
  ClienteSelector, MONEDAS_DOC, TablaPagoLegs, TablaRenglonesVenta,
  calcularFilas, legsAPago, nuevaLeg, nuevaLinea, proximoId,
  useClienteVenta, type LegUI, type LineaUI,
} from './ventasFormPartes';
import {
  actualizarBorrador, confirmarVenta, crearBorrador,
  listClientes, listExistenciasVenta, resumenDeVenta, sumaPagoLegs,
  type CondicionVenta, type ExistenciaProducto,
  type PagoLeg, type RenglonInput, type VentaCompleta, type VentaInput,
} from './ventas.repository';

export interface VentaFormProps {
  /** Borrador a editar. Si viene `null`/ausente, es un alta. */
  venta?: VentaCompleta | null;
  /** Se llama con el documento ya guardado (o confirmado). */
  onSaved: (venta: VentaCompleta) => void;
  onCancel: () => void;
}

export function VentaForm({ venta, onSaved, onCancel }: VentaFormProps) {
  const esEdicion = !!venta;
  const { user } = useSession();
  const { appUser } = usePermissions();
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  /* ── Catálogos ── */
  const [productos, setProductos] = useState<Producto[]>([]);
  const [existencias, setExistencias] = useState<Record<string, ExistenciaProducto>>({});
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [saldos, setSaldos] = useState<CajaSaldo[]>([]);
  const [cargando, setCargando] = useState(true);

  /* ── Cabecera ── */
  const cliente = useClienteVenta(venta?.venta.cliente_id ?? '');
  const [condicion, setCondicion] = useState<CondicionVenta>(venta?.venta.condicion ?? 'contado');
  const [moneda, setMoneda] = useState(venta?.venta.moneda ?? 'USD');
  const [tasaBs, setTasaBs] = useState(venta?.venta.tasa_bs ? String(venta.venta.tasa_bs) : '');
  const [ivaPct, setIvaPct] = useState(venta ? String(venta.venta.iva_pct) : '16');
  const [descuento, setDescuento] = useState(venta?.venta.descuento ? String(venta.venta.descuento) : '');
  // La nota va NO controlada (defaultValue + ref): un re-render no puede comerse
  // lo que se está tecleando. Se lee del DOM al guardar.
  const notaRef = useRef<HTMLTextAreaElement>(null);

  /* ── Renglones y patas ── */
  const [lineas, setLineas] = useState<LineaUI[]>(() => {
    if (!venta || !venta.renglones.length) return [nuevaLinea(1)];
    return venta.renglones.map((r, i) => ({
      id: i + 1,
      productoId: r.producto_id,
      cantidad: String(r.cantidad),
      precio: r.precio_unit ? String(r.precio_unit) : '',
      descuento: r.descuento ? String(r.descuento) : '',
    }));
  });
  const [legs, setLegs] = useState<LegUI[]>(() =>
    (venta?.venta.pago_legs ?? []).map((l, i) => ({
      id: i + 1,
      cajaId: l.cajaId ?? '',
      cuenta: l.cuenta ?? 'general',
      moneda: l.moneda ?? 'USD',
      monto: l.monto ? String(l.monto) : '',
    })));

  /* ── Guardado ── */
  const [guardando, setGuardando] = useState(false);
  const [pidiendoConfirmar, setPidiendoConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setClientes = cliente.setClientes;
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [prods, clis, exis, cjs, sds] = await Promise.all([
          listProductos(), listClientes(), listExistenciasVenta(), listCajasActivas(), listSaldos(),
        ]);
        if (cancel) return;
        setProductos(prods); setClientes(clis); setExistencias(exis); setCajas(cjs); setSaldos(sds);
      } catch (e) {
        if (!cancel) toast(e instanceof Error ? e.message : 'No se pudieron cargar los catálogos', 'error');
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
  }, [setClientes]);

  const activos = useMemo(() => productos.filter((p) => p.estado === 'activo'), [productos]);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  /* ── Cuentas del renglón (y sus avisos): compartidas con la permuta ── */
  const filas = useMemo(
    () => calcularFilas(lineas, porId, existencias, (c) => resumenDeVenta([c], [], 0, 0)),
    [lineas, porId, existencias],
  );

  const ivaPctNum = Math.max(0, Number(ivaPct) || 0);
  const descuentoNum = Math.max(0, Number(descuento) || 0);
  // LA cuenta del documento. Una sola llamada, un solo lugar.
  const resumen = useMemo(
    () => resumenDeVenta(filas.map((f) => f.calculo), [], ivaPctNum, descuentoNum),
    [filas, ivaPctNum, descuentoNum],
  );

  /* ── Patas de pago: lo cargado contra lo que hay que cobrar ── */
  const legsCargadas = useMemo<PagoLeg[]>(() => legsAPago(legs), [legs]);
  const pagado = sumaPagoLegs(legsCargadas);
  // En una venta normal `diferencia` es el total (no hay material recibido).
  const aCobrar = resumen.diferencia;
  const falta = round2(aCobrar - pagado);
  const esContado = condicion === 'contado';
  const patasCuadran = !esContado || aCobrar <= 0 || Math.abs(falta) <= 0.01;
  const legSinCaja = legsCargadas.some((l) => !l.cajaId);

  const productosSinCosto = filas.filter((f) => f.sinCosto).length;

  /* ─────────────────────────── Edición de la grilla ─────────────────────────── */

  function setLinea(id: number, patch: Partial<LineaUI>) {
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function agregarLinea() { setLineas((ls) => [...ls, nuevaLinea(proximoId(ls))]); }
  function quitarLinea(id: number) { setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls)); }

  function setLeg(id: number, patch: Partial<LegUI>) {
    setLegs((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function agregarLeg() {
    setLegs((ls) => [...ls, nuevaLeg(proximoId(ls), cajas[0]?.id ?? '', cajas[0]?.moneda ?? moneda)]);
  }
  function quitarLeg(id: number) { setLegs((ls) => ls.filter((l) => l.id !== id)); }

  /* ─────────────────────────── Guardar / confirmar ─────────────────────────── */

  /** Arma el input del repositorio. Una sola vez, para guardar y para confirmar. */
  function construirInput(): VentaInput {
    const renglones: RenglonInput[] = filas
      .filter((f) => f.linea.productoId && f.cantidad > 0)
      .map((f) => ({
        producto_id: f.linea.productoId,
        producto_sku: f.producto?.sku ?? null,
        producto_nombre: f.producto?.nombre ?? null,
        unidad: f.producto?.unidad ?? null,
        cantidad: f.cantidad,
        precio_unit: f.precio,
        // Referencial: al confirmar, la base lo pisa con `existencias.costo_promedio`.
        costo_unit: f.costo,
        descuento: Math.max(0, Number(f.linea.descuento) || 0),
      }));
    const cli = cliente.clientes.find((c) => c.id === cliente.clienteId) ?? null;
    return {
      tipo: 'venta',
      clienteId: cliente.clienteId || null,
      clienteNombre: cli?.nombre ?? null,
      clienteRif: cli?.rif ?? null,
      condicion, moneda,
      tasaBs: Number(tasaBs) > 0 ? Number(tasaBs) : null,
      ivaPct: ivaPctNum,
      descuento: descuentoNum,
      pagoLegs: esContado ? legsCargadas : [],
      nota: notaRef.current?.value ?? '',
      renglones,
      actor, actorName,
    };
  }

  /** Guarda el borrador (alta o edición) y devuelve el documento leído de la base. */
  async function guardarBorrador(): Promise<VentaCompleta> {
    // Da de alta el cliente si se lo estaba creando al vuelo: devuelve la ficha,
    // porque el `setState` de recién no se ve todavía en esta pasada.
    const cli = await cliente.resolver();
    const input = construirInput();
    input.clienteId = cli?.id ?? null;
    input.clienteNombre = cli?.nombre ?? null;
    input.clienteRif = cli?.rif ?? null;
    return esEdicion && venta ? actualizarBorrador(venta.venta.id, input) : crearBorrador(input);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const guardada = await guardarBorrador();
      notify(`Borrador ${guardada.venta.codigo} guardado · ${montoMoneda(guardada.venta.total, guardada.venta.moneda)}`,
        'success', { link: '#/app/ventas' });
      onSaved(guardada);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la venta.');
      setGuardando(false);
    }
  }

  /** Confirmar mueve plata: guarda primero y después llama a la RPC. */
  async function handleConfirmar() {
    setPidiendoConfirmar(false);
    setError(null);
    setGuardando(true);
    try {
      const guardada = await guardarBorrador();
      const confirmada = await confirmarVenta(guardada.venta.id, actor, actorName ?? actor);
      notify(
        `Venta ${confirmada.codigo} confirmada · ${montoMoneda(confirmada.total, confirmada.moneda)}`
        + (confirmada.condicion === 'credito' ? ' · a crédito (cuenta del cliente)' : ' · cobrada'),
        'success', { link: '#/app/ventas' },
      );
      onSaved({ ...guardada, venta: confirmada });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar la venta.');
      setGuardando(false);
    }
  }

  /* ─────────────────────────── Pantalla ─────────────────────────── */

  const puedeConfirmar = !guardando && !cargando && resumen.total > 0 && patasCuadran && !legSinCaja;

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={guardando}>Cancelar</button>
      <button type="submit" form="venta-form" className="btn btn-primary" disabled={guardando || cargando}>
        {guardando ? 'Guardando…' : '💾 Guardar borrador'}
      </button>
      <button type="button" className="btn btn-primary" disabled={!puedeConfirmar}
        onClick={() => setPidiendoConfirmar(true)}
        title={patasCuadran
          ? 'Guarda y confirma: mueve el dinero (caja o cuenta del cliente)'
          : 'Las patas de pago tienen que sumar exactamente lo que hay que cobrar'}>
        ✔ Confirmar venta
      </button>
    </>
  );

  return (
    <Modal title={esEdicion ? `Editar venta ${venta?.venta.codigo ?? ''}` : 'Nueva venta'} size="xl"
      onClose={onCancel} footer={footer}>
      <form id="venta-form" onSubmit={handleSubmit}>
        {error && (
          <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ── Cliente ── */}
        <ClienteSelector {...cliente.selector} />

        {/* ── Condición, moneda, IVA, descuento ── */}
        <div className="form-grid">
          <div className="form-row">
            <label>Condición</label>
            <select className="select" value={condicion} onChange={(e) => setCondicion(e.target.value as CondicionVenta)}>
              <option value="contado">Contado (se cobra ahora)</option>
              <option value="credito">Crédito (cuenta por cobrar)</option>
            </select>
            <small className="muted">
              {esContado
                ? 'Al confirmar entra la plata a la caja, por las patas de pago de abajo.'
                : 'Al confirmar se le carga la deuda a la cuenta corriente del cliente (la comparte con sus otras ventas).'}
            </small>
          </div>
          <div className="form-row">
            <label>Moneda</label>
            <select className="select" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              {MONEDAS_DOC.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Tasa Bs/$ <span className="muted">(opcional)</span></label>
            <input className="input mono" inputMode="decimal" value={tasaBs}
              onChange={(e) => setTasaBs(dosDecimales(e.target.value))} placeholder="0,00" />
          </div>
          <div className="form-row">
            <label>IVA %</label>
            <input className="input mono" inputMode="decimal" value={ivaPct}
              onChange={(e) => setIvaPct(dosDecimales(e.target.value))} placeholder="16" />
            <small className="muted">Se aplica sobre el subtotal menos el descuento.</small>
          </div>
          <div className="form-row">
            <label>Descuento del documento</label>
            <input className="input mono" inputMode="decimal" value={descuento}
              onChange={(e) => setDescuento(dosDecimales(e.target.value))} placeholder="0,00" />
            <small className="muted">Baja el total y también la ganancia.</small>
          </div>
        </div>

        {/* ── Renglones ── */}
        <h4 style={{ margin: '1rem 0 .5rem' }}>Material que vendo</h4>
        <TablaRenglonesVenta
          filas={filas} activos={activos} existencias={existencias} porId={porId} moneda={moneda}
          onSetLinea={setLinea} onAgregar={agregarLinea} onQuitar={quitarLinea}
          verboSobreStock="vendiendo"
          textoSinPrecio="sin precio: este renglón no cobra nada"
          textoNoBloquea="Ninguno de estos avisos bloquea la venta: son para que quede claro qué se está vendiendo."
        />

        {/* ── Totales y ganancia, en vivo ── */}
        <div className="card" style={{ marginTop: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Totales</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem' }}>
            <div>Subtotal: <strong className="mono">{montoMoneda(resumen.subtotal, moneda)}</strong></div>
            <div>Descuento: <strong className="mono">− {montoMoneda(resumen.descuento, moneda)}</strong></div>
            <div>IVA ({num(resumen.ivaPct)} %): <strong className="mono">{montoMoneda(resumen.ivaMonto, moneda)}</strong></div>
            <div>Total a cobrar: <strong className="mono">{montoMoneda(resumen.total, moneda)}</strong></div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem', marginTop: '.4rem' }}>
            <div className="muted">Costo del material: <strong className="mono">{montoMoneda(resumen.costoTotal, moneda)}</strong></div>
            {/* La ganancia va SEPARADA del total a cobrar a propósito: el total lleva
                IVA y el IVA no es ganancia. */}
            <div>Ganancia estimada:{' '}
              <strong className="mono" style={{ color: resumen.gananciaTotal < 0 ? 'var(--danger)' : 'var(--success, #22c55e)' }}>
                {montoMoneda(resumen.gananciaTotal, moneda)}
              </strong>
            </div>
          </div>
          <small className="muted">La ganancia no incluye el IVA ni se calcula como total − costo. Se congela al confirmar.</small>
        </div>

        {/* ── Patas de pago (solo contado) ── */}
        {esContado && (
          <>
            <h4 style={{ margin: '1rem 0 .5rem' }}>Cobro · ¿en qué cajas entra la plata?</h4>
            <TablaPagoLegs
              legs={legs} cajas={cajas} saldos={saldos}
              aCobrar={aCobrar} pagado={pagado} falta={falta} legSinCaja={legSinCaja} moneda={moneda}
              onSetLeg={setLeg} onAgregar={agregarLeg} onQuitar={quitarLeg}
              etiquetaObjetivo="de"
              textoCuadran="✔ las patas cuadran"
            />
            <small className="muted">
              Al confirmar entra una entrada de caja por cada forma de pago, atada a esta venta (Tesorería la muestra como «Cobro de venta»).
            </small>
          </>
        )}

        {!esContado && (
          <div className="card" style={{ marginTop: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title" style={{ marginBottom: '.25rem' }}>Venta a crédito</div>
            <div className="muted" style={{ fontSize: '.82rem' }}>
              Al confirmar se le cargan <strong className="mono">{montoMoneda(aCobrar, moneda)}</strong> a la cuenta
              corriente del cliente. Esa cuenta es una sola por cliente y acumula todas sus ventas a crédito: los
              cobros se registran desde Tesorería.
            </div>
          </div>
        )}

        <div className="form-row" style={{ marginTop: '.75rem' }}>
          <label>Nota / observación <span className="muted">(opcional)</span></label>
          <textarea className="input" rows={2} ref={notaRef} defaultValue={venta?.venta.nota ?? ''}
            placeholder="Detalle de la venta (se muestra en el comprobante)…" />
        </div>

        {cargando && <p className="muted" style={{ marginTop: '.5rem' }}>Cargando productos, clientes y existencias…</p>}
      </form>

      {pidiendoConfirmar && (
        <ConfirmDialog
          title="Confirmar venta"
          message={
            `Confirmar mueve el dinero: ${esContado
              ? `entran ${montoMoneda(aCobrar, moneda)} a la(s) caja(s) elegida(s)`
              : `se le cargan ${montoMoneda(aCobrar, moneda)} a la cuenta del cliente`}`
            + `. El costo de cada renglón se congela ahora contra el costo promedio de existencias, y la ganancia queda fijada en `
            + `${montoMoneda(resumen.gananciaTotal, moneda)}. El material NO sale del inventario todavía: eso pasa al entregar.`
            + (productosSinCosto > 0
              ? ` OJO: ${productosSinCosto === 1 ? 'hay 1 renglón' : `hay ${productosSinCosto} renglones`} con costo en 0, así que esa ganancia no es real.`
              : '')
            + ' Para deshacerla después hay que anularla.'
          }
          confirmText="Sí, confirmar"
          onConfirm={handleConfirmar}
          onCancel={() => setPidiendoConfirmar(false)}
        />
      )}
    </Modal>
  );
}
