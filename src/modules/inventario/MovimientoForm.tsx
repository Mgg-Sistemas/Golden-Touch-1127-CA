import { useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { money, num, dosDecimales } from '@/shared/lib/format';
import type { Existencia, Producto, TipoMovimiento } from '@/shared/lib/types';
import { calcularPMP, type MovimientoInput } from './movimientos.repository';

interface MovimientoFormProps {
  producto: Producto;
  /** Existencias del producto por almacén (stock + costo propios). */
  existencias: Existencia[];
  /** Nombres de almacén disponibles para los selectores. */
  almacenesList: string[];
  /** Si viene, el almacén queda fijo (ej. desde el detalle de un almacén). */
  fixedAlmacen?: string | null;
  actorEmail: string;
  actorName?: string | null;
  onClose: () => void;
  onSubmit: (data: MovimientoInput, transfer?: { almacenDestino: string }) => Promise<void>;
}

type TipoManual = 'entrada' | 'salida' | 'ajuste' | 'transferencia' | 'consumo' | 'fundicion' | 'fin_fundicion';

const OPCIONES: { value: TipoManual; label: string; sign: 'pos' | 'neg' | 'any' | 'zero' }[] = [
  { value: 'entrada',       label: 'Entrada (suma stock)',                sign: 'pos' },
  { value: 'salida',        label: 'Salida (resta stock)',                sign: 'neg' },
  { value: 'consumo',       label: 'Consumo en proceso',                  sign: 'neg' },
  { value: 'transferencia', label: 'Transferencia a otro almacén',        sign: 'neg' },
  { value: 'fundicion',     label: '🔥 Iniciar producción (marca el producto)', sign: 'zero' },
  { value: 'fin_fundicion', label: '✓ Fin de producción (libera el producto)', sign: 'zero' },
  { value: 'ajuste',        label: 'Ajuste manual (cualquier signo)',     sign: 'any' },
];

export function MovimientoForm({ producto, existencias, almacenesList, fixedAlmacen, actorEmail, actorName, onClose, onSubmit }: MovimientoFormProps) {
  // Por defecto se abre en el almacén que TIENE stock (el de mayor existencia); así
  // un ajuste no apunta a un almacén vacío mientras el stock está en otro (ej. el
  // producto dice "LOS PINOS" pero el stock entró a "General" por la recepción).
  const almacenConStock = useMemo(() => {
    const conStock = existencias.filter((e) => Number(e.stock) > 0).sort((a, b) => Number(b.stock) - Number(a.stock));
    return conStock[0]?.almacen ?? null;
  }, [existencias]);
  const almacenInicial = fixedAlmacen || almacenConStock || producto.almacen || almacenesList[0] || 'General';
  const [almacen, setAlmacen] = useState(almacenInicial);
  const [tipo, setTipo] = useState<TipoManual>('entrada');
  const [cantidad, setCantidad] = useState('1');
  // Carga por CAJA/BULTO: la "cantidad" se ingresa en cajas/bultos y se multiplica
  // por las unidades por bulto → el stock se mueve en UNIDADES (ej. 2 × 20 = 40 und).
  const [porBulto, setPorBulto] = useState(false);
  const [undPorBulto, setUndPorBulto] = useState('');
  const [almacenDestino, setAlmacenDestino] = useState('');
  const [signoAjuste, setSignoAjuste] = useState<'pos' | 'neg'>('pos');
  const [detalle, setDetalle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lista de almacenes para los selectores (incluye el del producto aunque sea legado).
  const opcionesAlmacen = useMemo(() => {
    const set = new Set<string>([almacenInicial, ...almacenesList]);
    return Array.from(set).filter(Boolean);
  }, [almacenInicial, almacenesList]);

  // Existencia (stock + costo) del almacén seleccionado.
  const exSel = existencias.find((e) => e.almacen === almacen);
  const stockAlmacen = Number(exSel?.stock) || 0;
  const costoAlmacen = Number(exSel?.costo_promedio) || 0;

  const [costoUnit, setCostoUnit] = useState(String(costoAlmacen || producto.precio || 0));

  const opcion = OPCIONES.find((o) => o.value === tipo)!;
  const cantidadRaw = Number(cantidad) || 0;           // cajas/bultos si porBulto; si no, unidades
  const undXBulto = Number(undPorBulto) || 0;
  // Cantidad efectiva EN UNIDADES (lo que mueve el stock).
  const cantidadNum = porBulto && undXBulto > 0 ? cantidadRaw * undXBulto : cantidadRaw;
  const delta =
    opcion.sign === 'zero'
      ? 0
      : opcion.sign === 'pos'
        ? Math.abs(cantidadNum)
        : opcion.sign === 'neg'
          ? -Math.abs(cantidadNum)
          : signoAjuste === 'pos'
            ? Math.abs(cantidadNum)
            : -Math.abs(cantidadNum);

  const stockResultante = Math.max(0, stockAlmacen + delta);
  const isFundicion = tipo === 'fundicion' || tipo === 'fin_fundicion';
  const esEntradaConCosto = tipo === 'entrada';
  const esTransferencia = tipo === 'transferencia';
  const costoUnitNum = Number(costoUnit) || 0;
  const nuevoPMP =
    esEntradaConCosto && cantidadNum > 0
      ? calcularPMP(stockAlmacen, costoAlmacen, cantidadNum, costoUnitNum)
      : costoAlmacen;

  function onChangeAlmacen(value: string) {
    setAlmacen(value);
    // Al cambiar de almacén, el costo por defecto de la entrada sigue el costo de ese almacén.
    const ex = existencias.find((e) => e.almacen === value);
    setCostoUnit(String(Number(ex?.costo_promedio) || producto.precio || 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isFundicion && porBulto && undXBulto <= 0) {
      setError('Indicá cuántas unidades trae cada caja/bulto.');
      return;
    }
    if (!isFundicion && cantidadNum <= 0) {
      setError('La cantidad debe ser mayor que 0.');
      return;
    }
    if (esTransferencia && !almacenDestino) {
      setError('Indica el almacén destino para la transferencia.');
      return;
    }
    if (esTransferencia && almacenDestino === almacen) {
      setError('El almacén destino debe ser distinto del de origen.');
      return;
    }
    if ((tipo === 'salida' || tipo === 'consumo' || tipo === 'transferencia') && cantidadNum > stockAlmacen) {
      setError(`No hay stock suficiente en ${almacen}. Disponible: ${num(stockAlmacen)} ${producto.unidad}.`);
      return;
    }
    if (tipo === 'fundicion' && producto.en_fundicion) {
      setError('El producto ya está marcado como en proceso de producción.');
      return;
    }
    if (tipo === 'fin_fundicion' && !producto.en_fundicion) {
      setError('El producto no está marcado como en proceso de producción.');
      return;
    }

    setSaving(true);
    try {
      if (esTransferencia) {
        // La transferencia la resuelve el padre (salida origen + entrada destino).
        const payload: MovimientoInput = {
          producto_id: producto.id,
          tipo: 'transferencia',
          delta,
          almacen,
          actor: actorEmail,
          actor_name: actorName ?? null,
          ref_tipo: 'manual',
          detalle: detalle || null,
        };
        await onSubmit(payload, { almacenDestino });
        onClose();
        return;
      }

      const tipoSchema: TipoMovimiento = tipo;
      const payload: MovimientoInput = {
        producto_id: producto.id,
        tipo: tipoSchema,
        delta,
        almacen,
        actor: actorEmail,
        actor_name: actorName ?? null,
        ref_tipo: 'manual',
        detalle: detalle || null,
        precio_unitario: esEntradaConCosto ? costoUnitNum : null,
      };
      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento.');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
        Cancelar
      </button>
      <button type="submit" form="mov-form" className="btn btn-primary" disabled={saving}>
        {saving ? 'Registrando…' : esTransferencia ? 'Transferir' : 'Registrar movimiento'}
      </button>
    </>
  );

  return (
    <Modal title={`Movimiento · ${producto.sku}`} onClose={onClose} footer={footer}>
      <form id="mov-form" onSubmit={handleSubmit}>
        {error && (
          <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="card" style={{ marginBottom: '.75rem', padding: '.75rem 1rem' }}>
          <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Producto
          </div>
          <div style={{ fontWeight: 600 }}>{producto.nombre}</div>
          <div className="muted mono" style={{ fontSize: '.78rem' }}>
            Stock en <strong>{almacen}</strong>: <strong>{num(stockAlmacen)} {producto.unidad}</strong> · costo {money(costoAlmacen)}
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Almacén</label>
            <select
              className="select"
              value={almacen}
              onChange={(e) => onChangeAlmacen(e.target.value)}
              disabled={!!fixedAlmacen}
            >
              {opcionesAlmacen.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Tipo de movimiento</label>
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoManual)}>
              {OPCIONES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {!isFundicion && (
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: '.6rem', cursor: 'pointer',
              padding: '.55rem .8rem', borderRadius: 8, marginBottom: '.75rem',
              border: `1px solid ${porBulto ? 'var(--brand, #ff8a00)' : 'var(--border)'}`,
              background: porBulto ? 'rgba(255,138,0,.10)' : 'transparent',
            }}
          >
            <input type="checkbox" checked={porBulto} onChange={(e) => setPorBulto(e.target.checked)} />
            <span style={{ fontWeight: 700, color: porBulto ? 'var(--brand, #ff8a00)' : 'inherit' }}>📦 Ingresar por caja / bulto</span>
            <span className="muted" style={{ fontSize: '.74rem' }}>La cantidad se multiplica por las unidades por bulto y el stock se mueve en unidades.</span>
          </label>
        )}

        <div className="form-grid">
          {!isFundicion && (
            <div className="form-row">
              <label>{porBulto ? 'Cantidad de cajas / bultos' : `Cantidad (${producto.unidad})`}</label>
              <input
                className="input mono"
                type="number"
                min={0}
                step="any"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                required={!isFundicion}
              />
            </div>
          )}
          {!isFundicion && porBulto && (
            <div className="form-row">
              <label>Unidades por caja / bulto</label>
              <input
                className="input mono"
                type="number"
                min={0}
                step="any"
                value={undPorBulto}
                onChange={(e) => setUndPorBulto(e.target.value)}
                placeholder="ej. 20"
              />
              <small className="muted" style={{ fontSize: '.72rem' }}>
                {undXBulto > 0
                  ? <>{cantidadRaw} caja{cantidadRaw === 1 ? '' : 's'} × {undXBulto} = <strong>{num(cantidadNum)} {producto.unidad}</strong></>
                  : <>Indicá cuántas unidades trae cada caja/bulto.</>}
              </small>
            </div>
          )}
          {esEntradaConCosto && (
            <div className="form-row">
              <label>Costo unitario del proveedor (USD)</label>
              <input
                className="input mono"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={costoUnit}
                onChange={(e) => setCostoUnit(dosDecimales(e.target.value))}
              />
              <small className="muted" style={{ fontSize: '.72rem' }}>
                Precio pagado en esta compra (admite decimales, ej. 0,35). Se promedia con el costo del almacén (PMP).
              </small>
            </div>
          )}
          {opcion.sign === 'any' && (
            <div className="form-row">
              <label>Signo del ajuste</label>
              <select
                className="select"
                value={signoAjuste}
                onChange={(e) => setSignoAjuste(e.target.value as 'pos' | 'neg')}
              >
                <option value="pos">+ aumenta stock</option>
                <option value="neg">− disminuye stock</option>
              </select>
            </div>
          )}
        </div>

        {esTransferencia && (
          <div className="form-row">
            <label>Almacén destino</label>
            <select
              className="select"
              value={almacenDestino}
              onChange={(e) => setAlmacenDestino(e.target.value)}
              required
            >
              <option value="">— elegí el destino —</option>
              {opcionesAlmacen.filter((a) => a !== almacen).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <small className="muted" style={{ fontSize: '.72rem' }}>
              Se descuenta de {almacen} y se suma al destino llevando su costo (PMP).
            </small>
          </div>
        )}

        <div className="form-row">
          <label>Detalle (opcional)</label>
          <input
            className="input"
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Motivo, referencia, observación…"
          />
        </div>

        <div
          className="card"
          style={{
            padding: '.65rem .85rem',
            borderLeft: '3px solid var(--primary)',
            background: 'var(--bg-1)',
            margin: 0,
          }}
        >
          <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Vista previa {esTransferencia ? `· ${almacen} → ${almacenDestino || '—'}` : `· ${almacen}`}
          </div>
          <div className="mono" style={{ fontSize: '.9rem' }}>
            {num(stockAlmacen)} → <strong>{num(stockResultante)}</strong>{' '}
            <span style={{ color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              ({delta >= 0 ? '+' : ''}{num(delta)})
            </span>{' '}
            {producto.unidad}
          </div>
          {esEntradaConCosto && (
            <div className="mono" style={{ fontSize: '.9rem', marginTop: '.35rem' }}>
              Costo base (PMP): {money(costoAlmacen)} →{' '}
              <strong style={{ color: 'var(--primary-3)' }}>{money(nuevoPMP)}</strong>
              {nuevoPMP !== costoAlmacen && (
                <span className="muted"> · {num(stockAlmacen)}×{money(costoAlmacen)} + {num(cantidadNum)}×{money(costoUnitNum)}</span>
              )}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
