/* ============================================================
   Golden Touch · Pre-salidas / Borradores con aprobación por WhatsApp (17/11/2026)

   Flujo de 4 pasos:
   1. Crear Borrador (Pre-salida PRE-AAAA-####): Destino/Equipo, Solicitante y
      lista de materiales SIN descontar stock ni tocar el kardex.
   2. Enviar a WhatsApp: mensaje limpio preformateado para el grupo de supervisores.
   3. Aprobación y ajuste: agregar, quitar o editar cantidades en cualquier momento,
      o descartar/cancelar el borrador si fue rechazado.
   4. Confirmar salida definitiva: elegir quién autorizó (respaldado en WhatsApp) +
      adjuntar captura opcional del chat → descuenta stock real y pasa al kardex.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from '@/shared/ui/Toast';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { useRealtime } from '@/shared/lib/useRealtime';
import { listCatalogos } from '@/modules/combustible/tanques.repository';
import { listEquipos, type MaquinariaEquipo } from '@/modules/maquinaria/maquinariaEquipos.repository';
import { TIPOS_MANTENIMIENTO } from '@/modules/maquinaria/maquinariaMant.repository';
import { nombreCortoEquipo } from '@/modules/maquinaria/flota';
import type { Producto } from '@/shared/lib/types';
import {
  MAX_FOTOS_SALIDA_MINA,
  MAX_ITEMS_LOTE_MOVIL,
  errorFotosSalidaMina,
  errorItemsLote,
  fechaHoraVE,
  leerCantidad,
  mensajeSalidasMina,
  num,
  type SalidaMina,
} from './salidasMina';
import { docSalidasMovil } from './inventarioMovilPdf';
import { Listo, type ItemLoteMovil } from './SalidaMinaMovil';
import {
  errorPreSalida,
  etiquetaAlmacenPreSalida,
  mensajePreSalidaWhatsapp,
  type ItemPreSalida,
  type PreSalidaAlmacen,
} from './preSalidasMina';
import {
  actualizarPreSalida,
  cancelarPreSalida,
  confirmarPreSalida,
  crearPreSalida,
  listPreSalidas,
} from './preSalidasMina.repository';

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

export interface SemillaPreSalida {
  items: ItemLoteMovil[];
  motivo?: string;
  equipoId?: string;
  equipoNombre?: string | null;
  tipoMant?: string;
  retorna?: boolean | null;
}

/** Selector de renglones para borrador (permite arrancar vacío, agregar, quitar cualquiera y editar cantidades). */
function ItemsBorradorEditor({
  items,
  onChange,
  productos,
  lugar,
  disabled,
}: {
  items: ItemLoteMovil[];
  onChange: (items: ItemLoteMovil[]) => void;
  productos: Producto[];
  lugar: string;
  disabled?: boolean;
}) {
  const [agregando, setAgregando] = useState(items.length === 0);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (items.length === 0) setAgregando(true);
  }, [items.length]);

  const candidatos = useMemo(() => {
    const ya = new Set(items.map((it) => it.producto.id));
    const base = productos.filter((p) => !ya.has(p.id) && Number(p.stock) > 0);
    const q = sinAcentos(busca.trim());
    return (q ? base.filter((p) => sinAcentos(`${p.nombre} ${p.sku} ${p.categoria}`).includes(q)) : base).slice(0, 15);
  }, [items, productos, busca]);

  const cambiar = (i: number, cantidad: string) =>
    onChange(items.map((it, j) => (j === i ? { ...it, cantidad } : it)));

  return (
    <div className="surt-campo">
      <span className="surt-rotulo">
        Materiales a despachar {items.length > 0 ? `(${items.length})` : '*'}
      </span>
      {items.map((it, i) => {
        const stock = Number(it.producto.stock) || 0;
        const cant = leerCantidad(it.cantidad);
        return (
          <div key={it.producto.id} className="surt-lote-item">
            <div className="surt-lote-cab">
              <strong>{it.producto.nombre}</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`Quitar ${it.producto.nombre}`}
                disabled={disabled}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ✕ Quitar
              </button>
            </div>
            <div className="muted" style={{ fontSize: '.8rem' }}>
              {it.producto.sku} · disponible hoy: {num(stock)} {it.producto.unidad} en {lugar}
            </div>
            <input
              className="input surt-litros"
              inputMode="decimal"
              value={it.cantidad}
              placeholder="Cantidad"
              disabled={disabled}
              aria-label={`Cantidad de ${it.producto.nombre} (${it.producto.unidad})`}
              onChange={(e) => cambiar(i, e.target.value)}
            />
            {cant > 0 && (
              cant > stock
                ? <small className="surt-alerta">No alcanza: en {lugar} hay {num(stock)} {it.producto.unidad}.</small>
                : <small className="muted">En borrador no descuenta · al confirmar quedarían {num(stock - cant)} {it.producto.unidad}.</small>
            )}
          </div>
        );
      })}

      {agregando ? (
        <div className="surt-lote-agregar">
          <input
            className="input surt-input"
            type="search"
            placeholder="🔍 Buscar material con stock para agregar…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            autoComplete="off"
            aria-label="Buscar material para pre-salida"
          />
          {!candidatos.length && (
            <small className="muted">
              {busca.trim() ? 'Ningún producto con stock coincide.' : 'No hay más productos con stock disponible.'}
            </small>
          )}
          {candidatos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="surt-mov"
              onClick={() => {
                onChange([...items, { producto: p, cantidad: '1' }]);
                setBusca('');
                setAgregando(false);
              }}
            >
              <span className="icono" aria-hidden>📦</span>
              <span style={{ minWidth: 0 }}>
                <div className="titulo">{p.nombre}</div>
                <div className="sub">{p.sku} · {p.categoria}</div>
              </span>
              <span className="litros">{num(Number(p.stock) || 0)} <small>{p.unidad}</small></span>
            </button>
          ))}
          {items.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => { setAgregando(false); setBusca(''); }}>
              Cerrar buscador
            </button>
          )}
        </div>
      ) : items.length < MAX_ITEMS_LOTE_MOVIL && (
        <button type="button" className="btn btn-ghost btn-grande" disabled={disabled} onClick={() => setAgregando(true)}>
          ＋ Agregar otro material
        </button>
      )}
    </div>
  );
}

/** Paso 1 y Paso 3: Crear nueva pre-salida o editar un borrador existente. */
function FormPreSalida({
  almacen,
  productos,
  actor,
  actorName,
  inicial,
  semilla,
  onGuardada,
  onCancel,
}: {
  almacen: string;
  productos: Producto[];
  actor: string;
  actorName: string | null;
  inicial?: PreSalidaAlmacen | null;
  semilla?: SemillaPreSalida | null;
  onGuardada: (pre: PreSalidaAlmacen) => void;
  onCancel: () => void;
}) {
  const lugar = almacen === 'General' ? 'el almacén' : almacen;
  const prodPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const [items, setItems] = useState<ItemLoteMovil[]>(() => {
    if (inicial) {
      return inicial.items.map((it) => {
        const p = prodPorId.get(it.producto_id) ?? ({
          id: it.producto_id,
          sku: it.producto_sku,
          nombre: it.producto_nombre,
          unidad: it.unidad,
          categoria: '',
          almacen,
          stock: 0,
          stock_min: 0,
          precio: 0,
          estado: 'activo',
        } as Producto);
        return { producto: p, cantidad: String(it.cantidad) };
      });
    }
    if (semilla?.items?.length) return semilla.items;
    return [];
  });

  const [destinoEquipo, setDestinoEquipo] = useState(
    inicial?.destino_equipo ?? semilla?.equipoNombre ?? '',
  );
  const [equipoId, setEquipoId] = useState(inicial?.equipo_id ?? semilla?.equipoId ?? '');
  const [tipoMant, setTipoMant] = useState(inicial?.tipo_mantenimiento ?? semilla?.tipoMant ?? '');
  const [solicitante, setSolicitante] = useState(inicial?.solicitante ?? '');
  const [motivo, setMotivo] = useState(inicial?.motivo ?? semilla?.motivo ?? '');
  const [retorna, setRetorna] = useState<boolean | null>(
    inicial ? inicial.retorna : (semilla?.retorna ?? null),
  );
  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    listEquipos()
      .then((xs) => setEquipos(xs.filter((x) => x.activo !== false)))
      .catch(() => {});
  }, []);

  const equipoSel = useMemo(() => equipos.find((x) => x.id === equipoId) ?? null, [equipos, equipoId]);

  function elegirMaquina(id: string) {
    setEquipoId(id);
    const eq = equipos.find((x) => x.id === id);
    if (eq && !destinoEquipo.trim()) {
      setDestinoEquipo(eq.equipo);
    } else if (eq && equipoSel && destinoEquipo.trim() === equipoSel.equipo) {
      setDestinoEquipo(eq.equipo);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const itemsCalc = items.map((it) => {
      const pVivo = prodPorId.get(it.producto.id) ?? it.producto;
      return {
        producto_id: pVivo.id,
        producto_sku: pVivo.sku,
        producto_nombre: pVivo.nombre,
        unidad: pVivo.unidad || 'und',
        cantidad: leerCantidad(it.cantidad),
        stock: Number(pVivo.stock) || 0,
      };
    });
    const mal = errorPreSalida({
      items: itemsCalc,
      destinoEquipo,
      solicitante,
    });
    if (mal) return toast(mal, 'error');

    const itemsLimpios: ItemPreSalida[] = itemsCalc.map(({ stock: _s, ...rest }) => {
      void _s;
      return rest;
    });

    setGuardando(true);
    try {
      const eqNombre = equipoSel?.equipo ?? (equipoId ? inicial?.equipo_nombre ?? semilla?.equipoNombre ?? null : null);
      const res = inicial
        ? await actualizarPreSalida(inicial, {
            destino_equipo: destinoEquipo,
            equipo_id: equipoId || null,
            equipo_nombre: equipoId ? eqNombre : null,
            tipo_mantenimiento: equipoId ? (tipoMant || null) : null,
            solicitante,
            motivo: motivo || null,
            retorna,
            items: itemsLimpios,
          })
        : await crearPreSalida({
            almacen,
            destino_equipo: destinoEquipo,
            equipo_id: equipoId || null,
            equipo_nombre: equipoId ? eqNombre : null,
            tipo_mantenimiento: equipoId ? (tipoMant || null) : null,
            solicitante,
            motivo: motivo || null,
            retorna,
            items: itemsLimpios,
            actor,
            actor_name: actorName,
          });
      toast(
        inicial
          ? `Pre-salida ${res.codigo} actualizada (sin descontar stock).`
          : `Pre-salida ${res.codigo} guardada en borrador.`,
        'success',
      );
      onGuardada(res);
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar la pre-salida'), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="surt-form" onSubmit={(e) => void submit(e)}>
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>📝</span>
        <strong>{inicial ? `Editar ${inicial.codigo}` : 'Nueva Pre-salida / Borrador'} · {etiquetaAlmacenPreSalida(almacen)}</strong>
      </div>

      <div className="aviso info sm" style={{ margin: '0 0 .5rem' }}>
        <span className="aviso-icono">ℹ️</span>
        <div>
          <strong>Modo borrador:</strong> NO descuenta stock del inventario ni altera el kardex. Guárdala, envíala al grupo de WhatsApp y confírmala cuando te aprueben.
        </div>
      </div>

      <div className="surt-campo">
        <label htmlFor="pre-destino">🚜 Destino / Equipo / Frente de trabajo *</label>
        <input
          id="pre-destino"
          className="input surt-input"
          value={destinoEquipo}
          onChange={(e) => setDestinoEquipo(e.target.value)}
          placeholder="Ej.: Payloader CAT 966, Taller, Planta, Frente Norte…"
          autoComplete="off"
        />
        {equipos.length > 0 && (
          <div style={{ marginTop: '.4rem' }}>
            <small className="muted" style={{ display: 'block', marginBottom: '.25rem' }}>
              Opcional · si es para el mantenimiento de una máquina, vincúlala aquí (al confirmar le llegará a Maquinaria):
            </small>
            <div className="surt-buscable">
              <SearchSelect
                value={equipoId}
                onChange={elegirMaquina}
                placeholder="🔧 Vincular máquina de la flota (opcional)…"
                options={[
                  { value: '', label: '— Sin vincular a Maquinaria (frente / área general) —' },
                  ...equipos.map((x) => ({
                    value: x.id,
                    label: x.equipo,
                    hint: nombreCortoEquipo(x),
                    keywords: [x.placa ?? '', x.serial ?? '', x.alias ?? ''].filter(Boolean),
                  })),
                ]}
              />
            </div>
            {equipoId && (
              <select
                className="input surt-input"
                style={{ marginTop: '.35rem' }}
                value={tipoMant}
                onChange={(e) => setTipoMant(e.target.value)}
                aria-label="Tipo de mantenimiento opcional"
              >
                <option value="">— Tipo de mantenimiento (lo indica Maquinaria) —</option>
                {TIPOS_MANTENIMIENTO.filter((t) => t.value !== 'lectura').map((t) => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="surt-campo">
        <label htmlFor="pre-solicitante">👷 Solicitado por (quién retira en físico) *</label>
        <input
          id="pre-solicitante"
          className="input surt-input"
          value={solicitante}
          onChange={(e) => setSolicitante(e.target.value)}
          placeholder="Ej.: Juan Pérez"
          autoComplete="off"
        />
      </div>

      <ItemsBorradorEditor
        items={items}
        onChange={setItems}
        productos={productos}
        lugar={lugar}
        disabled={guardando}
      />

      <div className="surt-campo">
        <label htmlFor="pre-motivo">📝 Observación / Motivo adicional (opcional)</label>
        <input
          id="pre-motivo"
          className="input surt-input"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Opcional: detalle de la tarea o frente…"
          autoComplete="off"
        />
      </div>

      <div className="surt-campo">
        <span className="surt-rotulo" id="pre-retorna-lbl">¿Retorna al almacén? (opcional ahora)</span>
        <div className="surt-sino" role="group" aria-labelledby="pre-retorna-lbl">
          <button
            type="button"
            className={`surt-btn si${retorna === true ? ' sel' : ''}`}
            aria-pressed={retorna === true}
            onClick={() => setRetorna(true)}
          >
            <span className="icono" aria-hidden>🔄</span><span>SÍ</span><small>Retorna luego</small>
          </button>
          <button
            type="button"
            className={`surt-btn no${retorna === false ? ' sel' : ''}`}
            aria-pressed={retorna === false}
            onClick={() => setRetorna(false)}
          >
            <span className="icono" aria-hidden>❌</span><span>NO</span><small>Se consume</small>
          </button>
        </div>
      </div>

      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando}>
        {guardando
          ? 'Guardando borrador…'
          : inicial
            ? '💾 Guardar cambios y ver WhatsApp'
            : '📲 Guardar Pre-salida y enviar a WhatsApp'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>
        Cancelar
      </button>
    </form>
  );
}

/** Paso 4: Confirmar salida definitiva con Autorizado por + captura opcional de WhatsApp. */
function ConfirmarPreSalidaForm({
  pre,
  productos,
  actor,
  actorName,
  onConfirmada,
  onEditar,
  onVolver,
}: {
  pre: PreSalidaAlmacen;
  productos: Producto[];
  actor: string;
  actorName: string | null;
  onConfirmada: (res: { salidas: SalidaMina[]; entregaCodigo: string | null; entregaFallo: string | null; fotos: File[] }) => void;
  onEditar: () => void;
  onVolver: () => void;
}) {
  const prodPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const [autorizado, setAutorizado] = useState('');
  const [autorizadores, setAutorizadores] = useState<string[]>([]);
  const [retorna, setRetorna] = useState<boolean | null>(pre.retorna ?? false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  const cargarAutorizadores = useCallback(() => {
    listCatalogos()
      .then((cs) => setAutorizadores(cs.filter((c) => c.tipo === 'autorizado' && c.activo).map((c) => c.valor)))
      .catch(() => {});
  }, []);
  useEffect(() => { cargarAutorizadores(); }, [cargarAutorizadores]);
  useRealtime(['combustible_catalogos'], cargarAutorizadores);

  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => { previas.forEach((u) => URL.revokeObjectURL(u)); }, [previas]);

  const renglonesStock = useMemo(() => pre.items.map((it) => {
    const p = prodPorId.get(it.producto_id);
    const stock = Number(p?.stock) || 0;
    return {
      producto: p ?? ({ id: it.producto_id, nombre: it.producto_nombre, unidad: it.unidad, stock } as Producto),
      nombre: it.producto_nombre,
      unidad: it.unidad || 'und',
      cantidad: it.cantidad,
      stock,
    };
  }), [pre.items, prodPorId]);

  const errorStock = errorItemsLote(renglonesStock);

  function agregarFotos(lista: FileList | null) {
    const nuevas = Array.from(lista ?? []);
    const mal = errorFotosSalidaMina(nuevas, fotos.length);
    if (mal) toast(mal, 'warning');
    setFotos((xs) => [
      ...xs,
      ...nuevas.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)),
    ].slice(0, MAX_FOTOS_SALIDA_MINA));
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (errorStock) return toast(`${errorStock} Ajusta el borrador antes de confirmar.`, 'error');
    if (!autorizado.trim()) return toast('Selecciona quién autorizó la salida en el grupo de WhatsApp.', 'error');
    if (retorna === null) return toast('Indica si el material retorna (SÍ o NO).', 'error');

    setConfirmando(true);
    try {
      const res = await confirmarPreSalida(pre, {
        autorizadoPor: autorizado,
        retorna,
        fotos,
        actor,
        actorName,
      });
      toast(
        res.salidas.length === 1
          ? `Salida ${res.salidas[0].codigo} confirmada y descontada del stock.`
          : `Salida confirmada (${res.salidas.length} materiales descontados del stock).`,
        'success',
      );
      onConfirmada({
        salidas: res.salidas,
        entregaCodigo: res.entregaCodigo,
        entregaFallo: res.entregaFallo,
        fotos,
      });
    } catch (err) {
      toast(errMsg(err, 'No se pudo confirmar la salida'), 'error');
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <form className="surt-form" onSubmit={(e) => void confirmar(e)}>
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>✅</span>
        <strong>Confirmar salida · {pre.codigo}</strong>
      </div>

      <div className="card" style={{ padding: '.7rem .85rem', margin: '0 0 .6rem', borderLeft: '4px solid var(--brand, #ff8a00)' }}>
        <div><strong>🚜 Destino / Equipo:</strong> {pre.destino_equipo}</div>
        <div><strong>👷 Solicitado por:</strong> {pre.solicitante}</div>
        {pre.motivo && <div><strong>📝 Observación:</strong> {pre.motivo}</div>}
        <div style={{ marginTop: '.45rem' }}>
          <strong>Materiales a descontar de {etiquetaAlmacenPreSalida(pre.almacen)}:</strong>
          <ul style={{ margin: '.25rem 0 0 1.1rem', padding: 0 }}>
            {renglonesStock.map((r) => (
              <li key={r.producto.id}>
                <strong>{num(r.cantidad)} {r.unidad}</strong> · {r.nombre}{' '}
                <small className={r.cantidad > r.stock ? 'surt-alerta' : 'muted'}>
                  (stock actual: {num(r.stock)} {r.unidad})
                </small>
              </li>
            ))}
          </ul>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '.5rem' }} onClick={onEditar} disabled={confirmando}>
          ✎ Ajustar materiales o cantidades (si pidieron cambios en WhatsApp)
        </button>
      </div>

      {errorStock && (
        <div className="aviso warning sm" style={{ marginBottom: '.6rem' }}>
          <span className="aviso-icono">⚠</span>
          <div>{errorStock} Toca «✎ Ajustar materiales o cantidades» para corregir el borrador.</div>
        </div>
      )}

      <div className="surt-campo">
        <label htmlFor="conf-autorizado">Autorizado por (quién aprobó en WhatsApp) *</label>
        <div className="surt-buscable">
          <SearchSelect
            id="conf-autorizado"
            value={autorizado}
            onChange={setAutorizado}
            placeholder="🔍 Busca quién autorizó en WhatsApp…"
            options={autorizadores.map((v) => ({ value: v, label: v }))}
          />
        </div>
        <small className="muted">
          Selecciona al supervisor/jefe que dio el visto bueno por escrito en el grupo de WhatsApp.
        </small>
      </div>

      <div className="surt-campo">
        <span className="surt-rotulo" id="conf-retorna">¿Retorna al almacén? *</span>
        <div className="surt-sino" role="group" aria-labelledby="conf-retorna">
          <button
            type="button"
            className={`surt-btn si${retorna === true ? ' sel' : ''}`}
            aria-pressed={retorna === true}
            onClick={() => setRetorna(true)}
          >
            <span className="icono" aria-hidden>🔄</span><span>SÍ</span><small>Queda por retornar</small>
          </button>
          <button
            type="button"
            className={`surt-btn no${retorna === false ? ' sel' : ''}`}
            aria-pressed={retorna === false}
            onClick={() => setRetorna(false)}
          >
            <span className="icono" aria-hidden>❌</span><span>NO</span><small>Se consume / entrega</small>
          </button>
        </div>
      </div>

      <div className="surt-campo">
        <label htmlFor="conf-fotos">
          📷 Captura del chat de WhatsApp / Fotos ({fotos.length}/{MAX_FOTOS_SALIDA_MINA}) · opcional recomendado
        </label>
        {fotos.length < MAX_FOTOS_SALIDA_MINA && (
          <input
            id="conf-fotos"
            className="input surt-input"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => { agregarFotos(e.target.files); e.target.value = ''; }}
          />
        )}
        <small className="muted">
          Puedes adjuntar la captura de pantalla de la aprobación en WhatsApp y/o foto de la entrega como respaldo digital.
        </small>
        {!!fotos.length && (
          <div className="rep-fotos" style={{ marginTop: '.4rem' }}>
            {fotos.map((f, i) => (
              <div key={`${f.name}-${i}`} className="rep-foto surt-foto-quitar">
                <img src={previas[i]} alt={f.name} />
                <button
                  type="button"
                  aria-label={`Quitar ${f.name}`}
                  onClick={() => setFotos((xs) => xs.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        className="btn btn-primary surt-guardar"
        disabled={confirmando || !!errorStock || !autorizado.trim() || retorna === null}
      >
        {confirmando ? 'Confirmando y descontando stock…' : '✓ Confirmar salida definitiva'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onVolver} disabled={confirmando}>
        ← Volver a pre-salidas
      </button>
    </form>
  );
}

/** Bandeja completa de Pre-salidas / Borradores de un almacén o depósito. */
export function PreSalidasMovilView({
  almacen,
  productos,
  actor,
  actorName,
  canWrite,
  semillaInicial,
  onSemillaConsumida,
  onCambioStock,
  onVolver,
}: {
  almacen: string;
  productos: Producto[];
  actor: string;
  actorName: string | null;
  canWrite: boolean;
  semillaInicial?: SemillaPreSalida | null;
  onSemillaConsumida?: () => void;
  onCambioStock: () => void;
  onVolver: () => void;
}) {
  const [modo, setModo] = useState<'lista' | 'nueva' | 'editar' | 'whatsapp' | 'confirmar' | 'listo'>(
    semillaInicial ? 'nueva' : 'lista',
  );
  const [semilla] = useState<SemillaPreSalida | null>(semillaInicial ?? null);
  const [tab, setTab] = useState<'pendientes' | 'cerradas'>('pendientes');
  const [lista, setLista] = useState<PreSalidaAlmacen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [activa, setActiva] = useState<PreSalidaAlmacen | null>(null);
  const [confirmadaRes, setConfirmadaRes] = useState<{
    salidas: SalidaMina[];
    entregaCodigo: string | null;
    entregaFallo: string | null;
    fotos: File[];
  } | null>(null);

  useEffect(() => {
    if (semillaInicial && onSemillaConsumida) onSemillaConsumida();
  }, [semillaInicial, onSemillaConsumida]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const filas = await listPreSalidas(almacen, tab === 'cerradas');
      setLista(tab === 'cerradas' ? filas.filter((f) => f.estado !== 'borrador') : filas.filter((f) => f.estado === 'borrador'));
    } catch (e) {
      toast(errMsg(e, 'No se pudieron cargar las pre-salidas'), 'error');
    } finally {
      setCargando(false);
    }
  }, [almacen, tab]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['pre_salidas_almacen'], () => { void cargar(); });

  const prodPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  async function descartar(pre: PreSalidaAlmacen) {
    if (!window.confirm(`¿Descartar/cancelar el borrador ${pre.codigo} (${pre.destino_equipo})? No afectará el inventario.`)) return;
    try {
      await cancelarPreSalida(pre, 'Descartada / rechazada en WhatsApp');
      toast(`Pre-salida ${pre.codigo} descartada (el stock no se tocó).`, 'info');
      void cargar();
    } catch (e) {
      toast(errMsg(e, 'No se pudo descartar la pre-salida'), 'error');
    }
  }

  if (modo === 'listo' && confirmadaRes) {
    const { salidas, entregaCodigo, entregaFallo, fotos } = confirmadaRes;
    return (
      <>
        {entregaCodigo && (
          <div className="surt-campo" style={{ borderLeft: '4px solid var(--success)', paddingLeft: '.6rem', marginBottom: '.5rem' }}>
            🔧 Entrega <strong>{entregaCodigo}</strong> enviada automáticamente a Maquinaria.
          </div>
        )}
        {entregaFallo && (
          <div className="surt-campo" style={{ borderLeft: '4px solid var(--warning)', paddingLeft: '.6rem', marginBottom: '.5rem' }}>
            ⚠ La salida quedó confirmada, pero no se pudo avisar a Maquinaria: {entregaFallo}
          </div>
        )}
        <Listo
          titulo={salidas.length === 1 ? `Salida ${salidas[0].codigo} confirmada` : `Salida confirmada (${salidas.length} materiales)`}
          texto={mensajeSalidasMina(salidas, actorName ?? actor)}
          fotos={fotos}
          pdf={docSalidasMovil(salidas, (id) => prodPorId.get(id), almacen, { actor, nombre: actorName })}
          onListo={() => {
            setConfirmadaRes(null);
            setActiva(null);
            setModo('lista');
            onCambioStock();
            void cargar();
          }}
        />
      </>
    );
  }

  if (modo === 'nueva') {
    return (
      <FormPreSalida
        almacen={almacen}
        productos={productos}
        actor={actor}
        actorName={actorName}
        semilla={semilla}
        onGuardada={(pre) => {
          setActiva(pre);
          setModo('whatsapp');
          void cargar();
        }}
        onCancel={() => {
          if (semilla) onVolver();
          else setModo('lista');
        }}
      />
    );
  }

  if (modo === 'editar' && activa) {
    return (
      <FormPreSalida
        almacen={almacen}
        productos={productos}
        actor={actor}
        actorName={actorName}
        inicial={activa}
        onGuardada={(pre) => {
          setActiva(pre);
          setModo('whatsapp');
          void cargar();
        }}
        onCancel={() => setModo('lista')}
      />
    );
  }

  if (modo === 'whatsapp' && activa) {
    return (
      <div className="surt-form">
        <div className="surt-form-titulo">
          <span className="icono" aria-hidden>📲</span>
          <strong>Borrador {activa.codigo} · Enviar a WhatsApp</strong>
        </div>
        <div className="aviso info sm" style={{ marginBottom: '.6rem' }}>
          <span className="aviso-icono">⏳</span>
          <div>
            <strong>Aún NO se descontó del inventario.</strong> Envía este mensaje al grupo de WhatsApp y, cuando el supervisor responda aprobando, entra a «Confirmar salida».
          </div>
        </div>
        <CompartirWhatsapp texto={mensajePreSalidaWhatsapp(activa)} />
        {canWrite && activa.estado === 'borrador' && (
          <div style={{ display: 'grid', gap: '.5rem', marginTop: '.6rem' }}>
            <button type="button" className="btn btn-primary btn-grande" onClick={() => setModo('confirmar')}>
              ✓ Ya aprobaron en WhatsApp · Confirmar salida
            </button>
            <button type="button" className="btn btn-ghost btn-grande" onClick={() => setModo('editar')}>
              ✎ Ajustar materiales o cantidades
            </button>
          </div>
        )}
        <button type="button" className="btn btn-ghost btn-grande" style={{ marginTop: '.4rem' }} onClick={() => setModo('lista')}>
          ← Ver todas las pre-salidas
        </button>
      </div>
    );
  }

  if (modo === 'confirmar' && activa) {
    return (
      <ConfirmarPreSalidaForm
        pre={activa}
        productos={productos}
        actor={actor}
        actorName={actorName}
        onConfirmada={(res) => {
          setConfirmadaRes(res);
          setModo('listo');
          onCambioStock();
        }}
        onEditar={() => setModo('editar')}
        onVolver={() => setModo('lista')}
      />
    );
  }

  return (
    <div className="surt-form">
      <div className="surt-form-titulo" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
          <span className="icono" aria-hidden>📝</span>
          <strong>Pre-salidas / Borradores · {etiquetaAlmacenPreSalida(almacen)}</strong>
        </div>
        {canWrite && (
          <button type="button" className="btn btn-primary" onClick={() => { setActiva(null); setModo('nueva'); }}>
            ＋ Nueva Pre-salida
          </button>
        )}
      </div>

      <p className="muted" style={{ margin: '0 0 .6rem', fontSize: '.85rem' }}>
        Arma el borrador de salida (sin descontar stock), envíalo al grupo de WhatsApp para su aprobación, ajusta materiales si te lo piden y confirma la salida con quien autorizó.
      </p>

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'pendientes' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('pendientes')}
        >
          ⏳ Borradores pendientes
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'cerradas' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('cerradas')}
        >
          🕘 Procesadas / Canceladas
        </button>
      </div>

      {cargando ? (
        <p className="muted">Cargando pre-salidas…</p>
      ) : lista.length === 0 ? (
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <p className="muted" style={{ margin: 0 }}>
            {tab === 'pendientes'
              ? 'No hay pre-salidas pendientes de aprobación.'
              : 'Todavía no hay pre-salidas procesadas o canceladas.'}
          </p>
          {tab === 'pendientes' && canWrite && (
            <button type="button" className="btn btn-primary" style={{ marginTop: '.6rem' }} onClick={() => { setActiva(null); setModo('nueva'); }}>
              ＋ Crear primera Pre-salida / Borrador
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '.65rem' }}>
          {lista.map((pre) => (
            <div
              key={pre.id}
              className="card"
              style={{
                margin: 0,
                padding: '.75rem .9rem',
                borderLeft: `4px solid ${pre.estado === 'borrador' ? 'var(--warning)' : pre.estado === 'procesada' ? 'var(--success)' : 'var(--border)'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong className="mono" style={{ fontSize: '1rem' }}>{pre.codigo}</strong>
                <span className={`badge ${pre.estado === 'borrador' ? 'warning' : pre.estado === 'procesada' ? 'success' : 'muted'}`}>
                  {pre.estado === 'borrador' ? '⏳ En borrador (sin descontar)' : pre.estado === 'procesada' ? '✅ Procesada' : '✕ Descartada'}
                </span>
              </div>
              <div style={{ fontSize: '.86rem', marginTop: '.3rem' }}>
                <div><strong>🚜 Destino / Equipo:</strong> {pre.destino_equipo}</div>
                <div><strong>👷 Solicitado por:</strong> {pre.solicitante}</div>
                {pre.motivo && <div><strong>📝 Observación:</strong> {pre.motivo}</div>}
                {pre.autorizado_por && <div><strong>✅ Autorizado por:</strong> {pre.autorizado_por}</div>}
                {pre.salida_codigos?.length ? (
                  <div><strong>🔖 Salida oficial:</strong> <span className="mono">{pre.salida_codigos.join(', ')}</span></div>
                ) : null}
                <div className="muted" style={{ fontSize: '.78rem', marginTop: '.15rem' }}>
                  Creada {fechaHoraVE(pre.created_at)} por {pre.actor_name || pre.actor}
                </div>
              </div>
              <ul style={{ margin: '.4rem 0 .5rem 1.1rem', padding: 0, fontSize: '.86rem' }}>
                {pre.items.map((it) => (
                  <li key={it.producto_id}>
                    <strong>{num(it.cantidad)} {it.unidad || 'und'}</strong> · {it.producto_nombre}
                  </li>
                ))}
              </ul>

              {pre.estado === 'borrador' && (
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                  {canWrite && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => { setActiva(pre); setModo('confirmar'); }}
                    >
                      ✓ Confirmar salida
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-wsp btn-sm"
                    onClick={() => { setActiva(pre); setModo('whatsapp'); }}
                  >
                    📲 Enviar a WhatsApp
                  </button>
                  {canWrite && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setActiva(pre); setModo('editar'); }}
                    >
                      ✎ Editar / Ajustar
                    </button>
                  )}
                  {canWrite && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => void descartar(pre)}
                    >
                      ✕ Descartar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-grande" style={{ marginTop: '.75rem' }} onClick={onVolver}>
        ← Volver a {etiquetaAlmacenPreSalida(almacen)}
      </button>
    </div>
  );
}
