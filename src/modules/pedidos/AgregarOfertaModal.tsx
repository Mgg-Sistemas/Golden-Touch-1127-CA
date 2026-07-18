import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { notify } from '@/shared/lib/notify';
import { money } from '@/shared/lib/format';
import { PREFIJOS_RIF, partirRif } from '@/shared/lib/rif';
import type { CostoLogistico, FichaOferta, ItemOrden, Orden, OfertaProveedor, OrigenProveedor, Proveedor } from '@/shared/lib/types';
import { crearOferta, actualizarOferta, subirAdjuntosOferta, getPdfOfertaSignedUrl, CONDICIONES_PAGO } from './ofertas.repository';
import { getStatsForProveedores, type ProveedorStats } from './evaluaciones.repository';
import { hayVariantes, totalesRepresentativos } from './variantesOferta';
import { esRecargaAgua } from './servicios.repository';
import { insert as crearProveedor } from '@/modules/proveedores/proveedores.repository';
import { getTasaHoy, round2 } from '@/modules/tesoreria/tasas.repository';

/** Estrellas ★ según un promedio 1–5. */
function estrellas(avg: number): string {
  const full = Math.round(avg);
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

interface Props {
  orden: Orden;
  proveedores: Proveedor[];
  proveedoresYaOfertados: Set<string>;
  registradoPorEmail: string;
  /** Si se pasa, el modal edita esa oferta (en vez de crear una nueva). */
  ofertaEditar?: OfertaProveedor | null;
  onClose: () => void;
  onCreated: () => void;
}

interface FormItem extends ItemOrden {
  /** Id estable de la fila (clave de React): NO depende del sku ni del índice, para
   *  que agregar/quitar variantes no remonte ni revuelva las demás filas. */
  uid: string;
  precio: number;          // Pago en Bs a BCV (unitario, en $)
  precio_usd: number;      // Pago en USD (unitario, en $)
  marca: string;           // Marca ofertada para este producto (variante)
  modelo: string;          // Modelo ofertado
}

let _ofertaUidSeq = 0;
function nuevoUid(): string {
  _ofertaUidSeq += 1;
  return `fi-${_ofertaUidSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AgregarOfertaModal({
  orden,
  proveedores,
  proveedoresYaOfertados,
  registradoPorEmail,
  ofertaEditar,
  onClose,
  onCreated,
}: Props) {
  const editando = !!ofertaEditar;
  const opcionesProveedor = useMemo(
    // Al editar, el proveedor de la oferta debe seguir disponible para elegir.
    () => proveedores.filter((p) => p.estado === 'activo' && (p.id === ofertaEditar?.proveedor_id || !proveedoresYaOfertados.has(p.id))),
    [proveedores, proveedoresYaOfertados, ofertaEditar]
  );

  // Modo proveedor: si el checkbox está activo, se crea uno nuevo en línea.
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  const [proveedorId, setProveedorId] = useState<string>(ofertaEditar?.proveedor_id ?? opcionesProveedor[0]?.id ?? '');

  // Campos del proveedor nuevo (cuando nuevoProveedor=true)
  const [provRazon, setProvRazon] = useState('');
  const [provRif, setProvRif] = useState('');
  const [provTelefono, setProvTelefono] = useState('');
  const [provEmail, setProvEmail] = useState('');
  const [provDireccion, setProvDireccion] = useState('');
  const [provOrigen, setProvOrigen] = useState<OrigenProveedor>('nacional');
  const rifPartes = partirRif(provRif);
  // Los inputs del proveedor nuevo son no-controlados (defaultValue): si el navegador
  // los AUTOCOMPLETA, el DOM se llena pero el estado de React puede quedar atrás. Estos
  // refs permiten leer el valor REAL del DOM en el submit y no rechazar datos válidos.
  const razonRef = useRef<HTMLInputElement>(null);
  const rifNumeroRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);

  // Calificación histórica de los proveedores (se guarda al finalizar cada pedido).
  const [stats, setStats] = useState<Map<string, ProveedorStats>>(new Map());
  useEffect(() => {
    const ids = opcionesProveedor.map((p) => p.id);
    if (!ids.length) return;
    getStatsForProveedores(ids).then(setStats).catch(() => setStats(new Map()));
  }, [opcionesProveedor]);
  const statSel = !nuevoProveedor ? stats.get(proveedorId) : undefined;

  // Al editar, se cargan los ítems de la oferta tal cual se guardaron (con su
  // marca/modelo/precio). Al CREAR una oferta nueva, los ítems "comprar" de la OP
  // pero EN LIMPIO: precio/precio_usd/marca/modelo en blanco (esos campos son de
  // cada oferta, no de la orden, que puede traer precios de ofertas/repartos previos).
  const [items, setItems] = useState<FormItem[]>(
    (ofertaEditar
      ? ofertaEditar.items
      : orden.items.filter((i) => i.comprar !== false)
    ).map((i) => ({
      ...i, uid: nuevoUid(),
      precio: editando ? Number(i.precio) || 0 : 0,
      precio_usd: editando ? Number((i as ItemOrden).precio_usd) || 0 : 0,
      marca: editando ? (i as ItemOrden).marca ?? '' : '',
      modelo: editando ? (i as ItemOrden).modelo ?? '' : '',
    })),
  );
  const [fechaEntrega, setFechaEntrega] = useState<string>(ofertaEditar?.fecha_entrega_prometida ?? '');
  const [condiciones, setCondiciones] = useState(ofertaEditar?.condiciones_pago ?? '');
  const [notas, setNotas] = useState(ofertaEditar?.notas ?? '');
  // Descuento obtenido (monto $): se resta del total de la factura. Opcional.
  const [descuento, setDescuento] = useState(ofertaEditar?.descuento_obtenido != null && ofertaEditar.descuento_obtenido > 0 ? String(ofertaEditar.descuento_obtenido) : '');
  // Adjuntos: PDF o varias imágenes de la cotización (multi-archivo).
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  // Al EDITAR: adjuntos ya guardados que se conservan (se pueden quitar uno a uno).
  const [adjuntosExistentes, setAdjuntosExistentes] = useState<{ path: string; filename: string }[]>(ofertaEditar?.adjuntos ?? []);
  const [submitting, setSubmitting] = useState(false);

  // Tasa BCV (Bs por $) para el conversor: los precios se guardan en $, pero el
  // proveedor suele cotizar en Bs. Prellenada con la tasa del día (editable).
  const [tasa, setTasa] = useState<number>(0);
  useEffect(() => { getTasaHoy().then((t) => { if (t.usd != null) setTasa(t.usd); }).catch(() => { /* sin tasa */ }); }, []);
  // Conversor auxiliar Bs↔$ (no toca las columnas; ayuda a pasar el precio del proveedor).
  const [convMonto, setConvMonto] = useState('');
  const [convDir, setConvDir] = useState<'bs_a_usd' | 'usd_a_bs'>('bs_a_usd');
  const convResultado = (() => {
    const m = Number(convMonto) || 0;
    if (m <= 0 || !(tasa > 0)) return null;
    return convDir === 'bs_a_usd' ? round2(m / tasa) : round2(m * tasa);
  })();

  function quitarAdjuntoExistente(idx: number) {
    setAdjuntosExistentes((prev) => prev.filter((_, k) => k !== idx));
  }
  async function verAdjunto(path: string) {
    try { previewArchivo(await getPdfOfertaSignedUrl(path), path.split('/').pop() || 'adjunto'); }
    catch { toast('No se pudo abrir el adjunto', 'error'); }
  }

  // Ficha del producto ofertado + costos logísticos (todo opcional).
  const [ficha, setFicha] = useState<FichaOferta>(ofertaEditar?.ficha ?? {});
  function setFichaField(k: keyof Omit<FichaOferta, 'logistica'>, v: string) {
    setFicha((f) => ({ ...f, [k]: v }));
  }
  function setLogistica(k: 'flete' | 'transporte' | 'embalaje' | 'seguros', v: CostoLogistico) {
    setFicha((f) => ({ ...f, logistica: { ...(f.logistica ?? {}), [k]: v } }));
  }
  /** Devuelve la ficha solo si tiene algún dato; si no, null (no se guarda vacía). */
  function fichaLimpia(): FichaOferta | null {
    const base: FichaOferta = {};
    (['marca', 'modelo', 'procedencia', 'materiales', 'dimensiones', 'peso', 'nivel_calidad'] as const).forEach((k) => {
      const v = (ficha[k] ?? '').toString().trim();
      if (v) base[k] = v;
    });
    const log = ficha.logistica ?? {};
    const logClean: NonNullable<FichaOferta['logistica']> = {};
    (['flete', 'transporte', 'embalaje', 'seguros'] as const).forEach((k) => {
      if (log[k]) logClean[k] = log[k];
    });
    if (Object.keys(logClean).length) base.logistica = logClean;
    return Object.keys(base).length ? base : null;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite volver a elegir el mismo archivo y acumular
    if (!elegidos.length) return;
    const validos: File[] = [];
    for (const f of elegidos) {
      if (f.type !== 'application/pdf' && !f.type.startsWith('image/')) {
        toast(`"${f.name}": debe ser PDF o imagen`, 'error'); continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast(`"${f.name}": no puede superar 10 MB`, 'error'); continue;
      }
      validos.push(f);
    }
    // Acumula con lo ya elegido, evitando duplicados por nombre+tamaño.
    setPdfFiles((prev) => {
      const clave = (f: File) => `${f.name}-${f.size}`;
      const vistos = new Set(prev.map(clave));
      return [...prev, ...validos.filter((f) => !vistos.has(clave(f)))];
    });
  }
  function quitarArchivo(idx: number) {
    setPdfFiles((prev) => prev.filter((_, k) => k !== idx));
  }

  // Totales: el de Bs a BCV es el precio_total de referencia; el de USD/divisa es
  // la suma de los precios USD por ítem. IMPORTANTE: cuando un producto tiene varias
  // marcas/modelos (mismo sku), son ALTERNATIVAS y NO se suman: se cuenta UNA por
  // producto (la más cara). La marca definitiva se elige al aceptar la oferta.
  const totalesRep = totalesRepresentativos(items);
  const precioTotal = totalesRep.bcv;   // Pago en Bs a BCV (una variante por producto)
  const totalUsd = totalesRep.usd;      // Pago en USD (una variante por producto)
  const conAlternativas = hayVariantes(items);
  const descuentoNum = Math.max(0, Number(descuento) || 0);
  // Total NETO de la factura tras el descuento obtenido (referencia BCV y, si aplica, USD).
  const netoBcv = Math.max(0, Math.round((precioTotal - descuentoNum) * 100) / 100);
  const netoUsd = Math.max(0, Math.round((totalUsd - descuentoNum) * 100) / 100);
  const tieneUsd = items.some((i) => i.precio_usd > 0);
  const diferencia = tieneUsd ? precioTotal - totalUsd : 0;
  const ahorroPct = tieneUsd && precioTotal > 0 ? (diferencia / precioTotal) * 100 : 0;

  function updateItem(idx: number, patch: Partial<Pick<FormItem, 'precio' | 'precio_usd' | 'marca' | 'modelo'>>) {
    setItems((prev) => prev.map((it, k) => {
      if (k !== idx) return it;
      const next = { ...it, ...patch };
      next.precio = Math.max(0, next.precio);
      next.precio_usd = Math.max(0, next.precio_usd);
      return next;
    }));
  }

  // Agrega otra variante (misma producto, otra marca/modelo) justo debajo de la fila.
  function addVariante(idx: number) {
    setItems((prev) => {
      const base = prev[idx];
      if (!base) return prev;
      const variante: FormItem = { ...base, uid: nuevoUid(), precio: 0, precio_usd: 0, marca: '', modelo: '' };
      const copy = [...prev];
      copy.splice(idx + 1, 0, variante);
      return copy;
    });
  }
  // Quita una fila (variante). Se permite mientras quede al menos una.
  function removeItem(idx: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, k) => k !== idx)));
  }
  // ¿Cuántas filas hay de este mismo producto (sku)? Para saber si se puede quitar.
  function countSku(sku: string): number {
    return items.filter((i) => i.sku === sku).length;
  }

  async function handleSubmit() {
    // El proveedor puede cotizar SOLO en Bs (BCV) o SOLO en $: basta con que uno
    // de los dos totales sea mayor a cero.
    if (precioTotal <= 0 && totalUsd <= 0) {
      toast('Ingresá el precio en Bs (BCV) o en USD (al menos uno)', 'error');
      return;
    }
    if (!condiciones.trim()) {
      toast('Elegí la condición de pago (define el flujo: contado, crédito, contra entrega…)', 'error');
      return;
    }
    setSubmitting(true);
    try {
      // 1) Resolver proveedor (existente o crear uno nuevo)
      let provId = proveedorId;
      if (nuevoProveedor) {
        // Leemos el valor REAL del DOM (refs) por si el navegador autocompletó los campos
        // sin disparar onChange: en ese caso el estado quedaría vacío y rechazaría datos válidos.
        const razonReal = (razonRef.current?.value ?? provRazon).trim();
        const rifNumeroReal = (rifNumeroRef.current?.value ?? rifPartes.numero).replace(/\D/g, '').slice(0, 10);
        const telefonoReal = (telefonoRef.current?.value ?? provTelefono).replace(/\D/g, '').slice(0, 15);
        const emailReal = (emailRef.current?.value ?? provEmail).trim();
        const direccionReal = (direccionRef.current?.value ?? provDireccion).trim();
        if (!razonReal || !rifNumeroReal) {
          toast('Razón social y RIF (con número) son obligatorios para el nuevo proveedor', 'error');
          setSubmitting(false);
          return;
        }
        if (emailReal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailReal)) {
          toast('El correo del proveedor no tiene un formato válido', 'error');
          setSubmitting(false);
          return;
        }
        const creado = await crearProveedor({
          razon_social: razonReal.toUpperCase(),
          rif: `${rifPartes.letra}-${rifNumeroReal}`,
          contacto: null,
          telefono: telefonoReal || null,
          email: emailReal || null,
          direccion: direccionReal.toUpperCase() || null,
          categorias: [],
          origen: provOrigen,
          estado: 'activo',
        });
        provId = creado.id;
        notify(`Proveedor "${creado.razon_social}" registrado`, 'success', { link: '#/app/proveedores' });
      } else if (!provId) {
        toast('Selecciona un proveedor', 'error');
        setSubmitting(false);
        return;
      }

      // 2) Subir adjuntos (PDF y/o varias imágenes). El primero queda también en
      //    pdf_path/pdf_filename para compatibilidad con vistas/PDF que leen ese campo.
      let pdf_path: string | null = null;
      let pdf_filename: string | null = null;
      let adjuntos: { path: string; filename: string }[] = [];
      if (pdfFiles.length) {
        adjuntos = await subirAdjuntosOferta(orden.id, provId, pdfFiles);
        pdf_path = adjuntos[0]?.path ?? null;
        pdf_filename = adjuntos[0]?.filename ?? null;
      }

      // 3) Crear oferta. Cada ítem guarda precio (Bs a BCV), precio_usd y descuento.
      //    Si el proveedor cotizó SOLO en $ (Bs en blanco), usamos ese valor en $ como
      //    el precio canónico del ítem (ambos están en $), para que el ranking, la OC y
      //    la recepción a inventario tengan un costo válido.
      const itemsGuardar: ItemOrden[] = items.map((i) => {
        const soloUsd = (!i.precio || i.precio <= 0) && i.precio_usd > 0;
        return {
          ...i,
          precio: soloUsd ? i.precio_usd : i.precio,
          precio_usd: i.precio_usd > 0 ? i.precio_usd : null,
          marca: i.marca.trim() || null,
          modelo: i.modelo.trim() || null,
        };
      });
      // Total de referencia (Bs a BCV, en $) recalculado tras la copia: para una oferta
      // solo-$ queda igual al total en USD; para Bs o mixtas, igual que antes. Las
      // variantes del mismo producto (alternativas) cuentan como UNA (la más cara).
      const precioTotalGuardar = totalesRepresentativos(itemsGuardar).bcv;
      if (editando) {
        // Al editar: los adjuntos CONSERVADOS (los que no se quitaron) + los nuevos.
        const adjuntosFinal = [...adjuntosExistentes, ...adjuntos];
        // El pdf_path/filename de compatibilidad sigue al primer adjunto resultante.
        const primero = adjuntosFinal[0] ?? null;
        await actualizarOferta(ofertaEditar!.id, {
          proveedor_id: provId,
          items: itemsGuardar,
          precio_total: precioTotalGuardar,
          precio_divisa: tieneUsd ? totalUsd : null,
          descuento_obtenido: descuentoNum,
          fecha_entrega_prometida: fechaEntrega || null,
          condiciones_pago: condiciones.trim() || null,
          notas: notas.trim() || null,
          ficha: fichaLimpia(),
          adjuntos: adjuntosFinal,
          pdf_path: primero?.path ?? null,
          pdf_filename: primero?.filename ?? null,
        });
        notify(`Oferta actualizada · ${orden.codigo}`, 'success', { link: '#/app/pedidos' });
        onCreated();
        return;
      }
      await crearOferta({
        orden_id: orden.id,
        proveedor_id: provId,
        items: itemsGuardar,
        precio_total: precioTotalGuardar,
        fecha_entrega_prometida: fechaEntrega || null,
        condiciones_pago: condiciones.trim() || null,
        notas: notas.trim() || null,
        registrada_por_email: registradoPorEmail,
        pdf_path,
        pdf_filename,
        adjuntos,
        ficha: fichaLimpia(),
        precio_divisa: tieneUsd ? totalUsd : null,
        descuento_obtenido: descuentoNum,
      });
      notify(`Oferta registrada para ${orden.codigo}`, 'success', { link: '#/app/pedidos' });
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al registrar', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={`${editando ? 'Editar' : 'Agregar'} oferta · ${orden.codigo}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar oferta'}
          </button>
        </>
      }
    >
      <div className="form-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={nuevoProveedor}
            onChange={(e) => setNuevoProveedor(e.target.checked)}
          />
          <span>Proveedor no registrado (lo creo ahora junto con la oferta)</span>
        </label>
      </div>

      {nuevoProveedor ? (
        <div className="card" style={{ background: 'var(--bg-2)', padding: '1rem', marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>
            <span>Datos del nuevo proveedor</span>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Razón social *</label>
              <input
                className="input"
                name="prov-razon"
                ref={razonRef}
                defaultValue={provRazon}
                onChange={(e) => {
                  e.target.value = e.target.value.toUpperCase();
                  setProvRazon(e.target.value);
                }}
              />
            </div>
            <div className="form-row">
              <label>RIF *</label>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <select
                  className="select"
                  value={rifPartes.letra}
                  onChange={(e) => setProvRif(`${e.target.value}-${rifPartes.numero}`)}
                  style={{ width: 'auto', flex: '0 0 auto' }}
                  aria-label="Tipo de RIF"
                >
                  {PREFIJOS_RIF.map((p) => (
                    <option key={p.letra} value={p.letra}>{p.letra} · {p.desc}</option>
                  ))}
                </select>
                <input
                  className="input mono"
                  name="prov-rif-numero"
                  ref={rifNumeroRef}
                  defaultValue={rifPartes.numero}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                    e.target.value = digits;
                    setProvRif(`${rifPartes.letra}-${digits}`);
                  }}
                  placeholder="40778442"
                  inputMode="numeric"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Teléfono</label>
              <input
                className="input"
                name="prov-telefono"
                ref={telefonoRef}
                inputMode="numeric"
                defaultValue={provTelefono}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 15);
                  e.target.value = digits;
                  setProvTelefono(digits);
                }}
                maxLength={15}
                placeholder="Solo dígitos"
              />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input
                className="input"
                type="email"
                name="prov-email"
                ref={emailRef}
                defaultValue={provEmail}
                onChange={(e) => setProvEmail(e.target.value)}
                placeholder="correo@dominio.com"
              />
            </div>
          </div>
          <div className="form-row">
            <label>Dirección</label>
            <input
              className="input"
              name="prov-direccion"
              ref={direccionRef}
              defaultValue={provDireccion}
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase();
                setProvDireccion(e.target.value);
              }}
            />
          </div>
          <div className="form-row">
            <label>Origen</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
              {([
                { val: 'nacional', txt: '🇻🇪 Nacional' },
                { val: 'internacional', txt: '🌎 Internacional' },
              ] as const).map((o) => {
                const checked = provOrigen === o.val;
                return (
                  <label
                    key={o.val}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '.3rem',
                      padding: '.35rem .65rem',
                      background: checked ? 'var(--brand-soft, rgba(255,138,0,.12))' : 'var(--bg-1)',
                      border: `1px solid ${checked ? 'var(--brand, #ff8a00)' : 'var(--border)'}`,
                      borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => setProvOrigen(o.val)} />
                    <span style={{ fontSize: '.82rem' }}>{o.txt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="form-row">
          <label>Proveedor</label>
          {opcionesProveedor.length ? (
            <>
              <SearchSelect
                value={proveedorId}
                onChange={setProveedorId}
                options={opcionesProveedor.map((p) => ({ value: p.id, label: `${p.razon_social} (${p.rif})` }))}
                placeholder="Buscar proveedor por nombre o RIF…"
                emptyText="Ningún proveedor coincide"
              />
              {statSel && (
                <div className="card" style={{ marginTop: '.4rem', padding: '.45rem .6rem', background: 'var(--bg-1)', fontSize: '.82rem' }}>
                  {statSel.total_evaluaciones > 0 ? (
                    <span>
                      <strong style={{ color: 'var(--warning)' }}>{estrellas(statSel.calidad_avg)}</strong>{' '}
                      <strong>{statSel.calidad_avg.toFixed(1)}/5</strong> calidad ·{' '}
                      {Math.round(statSel.puntualidad_pct * 100)}% puntual ·{' '}
                      <span className="muted">{statSel.total_evaluaciones} evaluación{statSel.total_evaluaciones !== 1 ? 'es' : ''} previa{statSel.total_evaluaciones !== 1 ? 's' : ''}</span>
                    </span>
                  ) : (
                    <span className="muted">Proveedor sin evaluaciones previas (calificación neutra hasta su primer pedido recibido).</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
              No quedan proveedores activos sin oferta. Marca <strong>"Proveedor no registrado"</strong> arriba para crear uno nuevo.
            </p>
          )}
        </div>
      )}

      {/* Conversor Bs↔$ a la tasa del día (o la que se escriba): ayuda a pasar el precio
          que el proveedor dio en Bs a $ (o al revés) para tipearlo en las columnas. */}
      <div className="card" style={{ padding: '.6rem .8rem', marginBottom: '.6rem', borderColor: 'var(--brand, #ff8a00)', display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-end' }}>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ fontSize: '.72rem' }}>Conversor · monto</label>
          <input className="input mono" type="number" min={0} step="any" value={convMonto} onChange={(e) => setConvMonto(e.target.value)} placeholder="0,00" style={{ width: 140 }} />
        </div>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ fontSize: '.72rem' }}>Dirección</label>
          <select className="select" value={convDir} onChange={(e) => setConvDir(e.target.value as 'bs_a_usd' | 'usd_a_bs')} style={{ width: 150 }}>
            <option value="bs_a_usd">Bs → $</option>
            <option value="usd_a_bs">$ → Bs</option>
          </select>
        </div>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ fontSize: '.72rem' }}>Tasa BCV (Bs/$)</label>
          <input className="input mono" type="number" min={0} step="any" value={tasa || ''} onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder="0,00" style={{ width: 120 }} />
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: '.72rem' }}>Equivale a</div>
          <strong className="mono" style={{ fontSize: '1.05rem' }}>
            {convResultado != null ? (convDir === 'bs_a_usd' ? money(convResultado) : `Bs ${convResultado.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`) : '—'}
          </strong>
        </div>
      </div>

      <div className="form-row">
        <label>Cotización por ítem · Pago en Bs (BCV) vs Pago en USD <span className="muted" style={{ fontWeight: 400 }}>(podés llenar solo una columna si el proveedor cotiza en una sola moneda)</span></label>
        <div className="table-wrap">
          <table className="items-table" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Descripción</th>
                <th rowSpan={2} className="num" style={{ verticalAlign: 'bottom' }}>Cant</th>
                <th colSpan={2} className="num" style={{ textAlign: 'center', background: 'rgba(96,165,250,.12)' }}>Pago en Bs a BCV</th>
                <th colSpan={2} className="num" style={{ textAlign: 'center', background: 'rgba(248,113,113,.12)' }}>Pago en USD</th>
                <th rowSpan={2} className="num" style={{ verticalAlign: 'bottom' }}>Diferencia</th>
                <th rowSpan={2} className="num" style={{ verticalAlign: 'bottom' }}>Variación %</th>
              </tr>
              <tr>
                <th className="num" style={{ background: 'rgba(96,165,250,.12)' }}>Precio</th>
                <th className="num" style={{ background: 'rgba(96,165,250,.12)' }}>Total</th>
                <th className="num" style={{ background: 'rgba(248,113,113,.12)' }}>Precio</th>
                <th className="num" style={{ background: 'rgba(248,113,113,.12)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const totalBs = it.cantidad * it.precio;
                const totalU = it.cantidad * it.precio_usd;
                const dif = (it.precio - it.precio_usd) * it.cantidad;
                const pct = it.precio > 0 ? ((it.precio - it.precio_usd) / it.precio) * 100 : 0;
                return (
                  <tr key={it.uid}>
                    <td>
                      {it.nombre}
                      <div className="muted mono" style={{ fontSize: '.72rem' }}>{it.sku}</div>
                      {it.es_servicio && (it.categoria_servicio || it.equipo_nombre) && (
                        <div className="muted" style={{ fontSize: '.72rem' }}>
                          {[it.categoria_servicio && `🗂 ${it.categoria_servicio}`, it.equipo_nombre && `🚜 ${it.equipo_nombre}`].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {(it.bombonas || it.kg_recarga) && (() => {
                        const agua = esRecargaAgua(it.categoria_servicio, it.nombre);
                        return (
                        <div className="muted" style={{ fontSize: '.72rem' }}>
                          {agua ? '💧 ' : '⛽ '}{[it.bombonas && `${it.bombonas} ${agua ? 'cisterna(s)' : 'bombona(s)'}`, it.kg_recarga && `${it.kg_recarga} ${agua ? 'litros' : 'kg'}`].filter(Boolean).join(' · ')}
                        </div>
                        );
                      })()}
                      <div style={{ display: 'flex', gap: '.3rem', marginTop: '.25rem' }}>
                        {/* No controlado (defaultValue) como los precios: así un re-render
                            por realtime no borra lo que se está tecleando. La key={it.uid}
                            del <tr> conserva el DOM por variante. */}
                        <input className="input" style={{ fontSize: '.74rem', padding: '.2rem .4rem' }} placeholder="Marca"
                          defaultValue={it.marca} onChange={(e) => updateItem(idx, { marca: e.target.value })} />
                        <input className="input" style={{ fontSize: '.74rem', padding: '.2rem .4rem' }} placeholder="Modelo"
                          defaultValue={it.modelo} onChange={(e) => updateItem(idx, { modelo: e.target.value })} />
                      </div>
                      <div style={{ display: 'flex', gap: '.4rem', marginTop: '.2rem' }}>
                        <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .35rem', fontSize: '.72rem' }}
                          onClick={() => addVariante(idx)} title="Cotizar este mismo producto en otra marca/modelo">+ Otra marca/modelo</button>
                        {countSku(it.sku) > 1 && (
                          <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .35rem', fontSize: '.72rem', color: 'var(--danger)' }}
                            onClick={() => removeItem(idx)} title="Quitar esta variante">✕</button>
                        )}
                      </div>
                    </td>
                    <td className="num">{it.cantidad}</td>
                    <td className="num">
                      <input type="number" className="input mono" style={{ width: 90, textAlign: 'right' }} min={0} step={0.01}
                        defaultValue={it.precio} onChange={(e) => updateItem(idx, { precio: Number(e.target.value) || 0 })} />
                      {tasa > 0 && it.precio > 0 && <div className="muted mono" style={{ fontSize: '.66rem' }}>≈ Bs {round2(it.precio * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                    </td>
                    <td className="num mono">{money(totalBs)}</td>
                    <td className="num">
                      <input type="number" className="input mono" style={{ width: 90, textAlign: 'right' }} min={0} step={0.01}
                        defaultValue={it.precio_usd} onChange={(e) => updateItem(idx, { precio_usd: Number(e.target.value) || 0 })} />
                      {tasa > 0 && it.precio_usd > 0 && <div className="muted mono" style={{ fontSize: '.66rem' }}>≈ Bs {round2(it.precio_usd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                    </td>
                    <td className="num mono">{money(totalU)}</td>
                    <td className="num mono" style={{ color: dif >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(dif)}</td>
                    <td className="num mono">{pct.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={3} className="num">TOTAL{conAlternativas ? ' *' : ''}</td>
                <td className="num mono">{money(precioTotal)}</td>
                <td></td>
                <td className="num mono">{money(totalUsd)}</td>
                <td className="num mono" style={{ color: diferencia >= 0 ? 'var(--success)' : 'var(--danger)' }}>{tieneUsd ? money(diferencia) : '—'}</td>
                <td className="num mono">{tieneUsd ? `${ahorroPct.toFixed(2)}%` : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {conAlternativas && (
          <div className="hint" style={{ marginTop: '.35rem', color: 'var(--warning, #d97706)' }}>
            ⚠️ Hay <strong>productos con varias marcas/modelos</strong> (alternativas). El total <strong>NO suma todas</strong>:
            cuenta <strong>una por producto</strong> (la de mayor precio, como estimado). La <strong>marca definitiva se elige al aceptar</strong> la oferta y solo esa entra a la OC.
          </div>
        )}
        <small className="muted">
          <strong>Pago en Bs a BCV</strong> y <strong>Pago en USD</strong> son ambos en $. Si el proveedor cotiza en una sola moneda, <strong>llená solo esa columna</strong> (la otra puede quedar en blanco). La <strong>Diferencia</strong> = (Bs − USD)
          y la <strong>Variación %</strong> = (Bs − USD) / Bs por producto. El total en USD se guarda como precio en divisa.
          Si el proveedor ofrece el <strong>mismo producto en varias marcas/modelos</strong>, usá <strong>+ Otra marca/modelo</strong> para cargar cada variante con su precio.
        </small>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Fecha de entrega prometida</label>
          <input type="date" className="input" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Condiciones del Pago *</label>
          <select className="select" value={condiciones} onChange={(e) => setCondiciones(e.target.value)} required>
            <option value="">— elegir —</option>
            {CONDICIONES_PAGO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Descuento obtenido: se resta del total de la factura (sincroniza el monto). */}
      <div className="form-row">
        <label>Descuento obtenido <span className="muted">(opcional, $)</span></label>
        <input className="input mono" type="number" min={0} step="any" value={descuento}
          onChange={(e) => setDescuento(e.target.value)} placeholder="0,00" style={{ maxWidth: 200 }} />
        {descuentoNum > 0 && (
          <small className="muted">
            Total con descuento: <strong className="mono">{money(netoBcv)}</strong>
            {tieneUsd && <> · en USD <strong className="mono">{money(netoUsd)}</strong></>}
            {' '}(antes {money(precioTotal)}{tieneUsd ? ` / ${money(totalUsd)}` : ''}).
          </small>
        )}
      </div>

      <div className="form-row">
        <label>Ficha del producto ofertado <span className="muted">(opcional)</span></label>
        <div className="form-grid">
          <input className="input" placeholder="Marca" value={ficha.marca ?? ''} onChange={(e) => setFichaField('marca', e.target.value)} />
          <input className="input" placeholder="Modelo" value={ficha.modelo ?? ''} onChange={(e) => setFichaField('modelo', e.target.value)} />
        </div>
        <div className="form-grid" style={{ marginTop: '.4rem' }}>
          <input className="input" placeholder="Procedencia" value={ficha.procedencia ?? ''} onChange={(e) => setFichaField('procedencia', e.target.value)} />
          <input className="input" placeholder="Nivel de calidad" value={ficha.nivel_calidad ?? ''} onChange={(e) => setFichaField('nivel_calidad', e.target.value)} />
        </div>
        <div className="form-grid" style={{ marginTop: '.4rem' }}>
          <input className="input" placeholder="Dimensiones" value={ficha.dimensiones ?? ''} onChange={(e) => setFichaField('dimensiones', e.target.value)} />
          <input className="input" placeholder="Peso" value={ficha.peso ?? ''} onChange={(e) => setFichaField('peso', e.target.value)} />
        </div>
        <input className="input" placeholder="Materiales" value={ficha.materiales ?? ''} onChange={(e) => setFichaField('materiales', e.target.value)} style={{ marginTop: '.4rem' }} />
      </div>

      <div className="form-row">
        <label>Costos logísticos <span className="muted">(¿incluido en el precio o por cuenta del comprador?)</span></label>
        <div style={{ display: 'grid', gap: '.4rem' }}>
          {([['flete', 'Flete'], ['transporte', 'Transporte'], ['embalaje', 'Embalaje'], ['seguros', 'Seguros']] as const).map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap' }}>
              <span style={{ width: 100, fontSize: '.85rem', fontWeight: 600 }}>{label}</span>
              {([['incluido', 'Incluido'], ['comprador', 'Por cuenta del comprador']] as const).map(([val, txt]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer', fontSize: '.82rem' }}>
                  <input type="radio" name={`log-${key}`} checked={ficha.logistica?.[key] === val} onChange={() => setLogistica(key, val)} />
                  {txt}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label>Notas</label>
        <textarea className="textarea" name="oferta-notas" placeholder="Comentarios sobre la oferta, exclusiones, garantías…" defaultValue={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      <div className="form-row">
        <label>Cargue la cotización del proveedor (opcional · varios archivos)</label>
        {editando && (
          <div style={{ marginBottom: '.5rem' }}>
            {adjuntosExistentes.length > 0 ? (
              <div style={{ display: 'grid', gap: '.25rem' }}>
                <div className="muted" style={{ fontSize: '.74rem' }}>Adjuntos actuales (tocá ✕ para quitar; podés agregar más abajo):</div>
                {adjuntosExistentes.map((a, i) => (
                  <div key={a.path} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.78rem' }}>
                    <span className="muted">📎</span>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ flex: 1, justifyContent: 'flex-start', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => void verAdjunto(a.path)} title="Ver">
                      {a.filename || `Adjunto ${i + 1}`}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => quitarAdjuntoExistente(i)} title="Quitar este adjunto">✕</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: '.74rem' }}>Sin adjuntos guardados. Podés cargar nuevos abajo.</div>
            )}
          </div>
        )}
        <input type="file" className="input" accept="application/pdf,image/*" multiple onChange={handleFileChange} />
        {pdfFiles.length > 0 && (
          <div style={{ display: 'grid', gap: '.25rem', marginTop: '.4rem' }}>
            {pdfFiles.map((f, i) => (
              <div key={`${f.name}-${f.size}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.78rem' }}>
                <span className="muted">{f.type.startsWith('image/') ? '🖼' : '📄'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span className="muted mono">{(f.size / 1024).toFixed(0)} KB</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => quitarArchivo(i)} title="Quitar">✕</button>
              </div>
            ))}
            <div className="muted" style={{ fontSize: '.74rem' }}>{pdfFiles.length} archivo(s) seleccionado(s).</div>
          </div>
        )}
        <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
          PDF o imágenes · máximo 10 MB c/u. Podés seleccionar varias fotos de la cotización; el jefe podrá verlas todas antes de aprobar.
        </div>
      </div>
    </Modal>
  );
}
