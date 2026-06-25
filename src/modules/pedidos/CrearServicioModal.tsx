import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect, SearchCreateSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import type { ItemOrden, Usuario } from '@/shared/lib/types';
import { crearOrden } from './pedidos.repository';
import { listActivosPedido, addCatalogoPedido } from './pedidoCatalogos.repository';
import {
  CATEGORIAS_SERVICIO, CATEGORIA_MANTENIMIENTO, esRecargaGas, TIPOS_RECARGA,
  listServiciosActivos, addServicioCatalogo, type ServicioCatalogo,
} from './servicios.repository';
import { listEquipos, type MaquinariaEquipo } from '@/modules/maquinaria/maquinariaEquipos.repository';
import { TIPOS_MANTENIMIENTO } from '@/modules/maquinaria/maquinariaMant.repository';

/**
 * Solicitud de Servicio (SS). Mismo procedimiento que la SP de productos, pero
 * en vez de productos de inventario se piden SERVICIOS (recargas, mantenimientos…)
 * tomados de un catálogo gestionable. Al adjudicar la oferta se convierte en
 * Control de Servicio (CS). Cuando la categoría es MANTENIMIENTO, el servicio se
 * casa con un equipo de Control de Maquinaria.
 */
export function CrearServicioModal({
  usuario, authEmail, onClose, onCreated,
}: {
  usuario: Usuario | null;
  authEmail: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [items, setItems] = useState<ItemOrden[]>([]);
  const [notas, setNotas] = useState('');
  const [urgente, setUrgente] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Solicitante (persona): nombre y apellido del usuario (NO el correo). Editable.
  // Campo CONTROLADO (estado): así no se borra lo tecleado en un re-render (realtime),
  // a diferencia de un input no controlado con defaultValue.
  const nombreSolicitante = [usuario?.nombre, usuario?.apellido].filter(Boolean).join(' ').toUpperCase().trim();
  const [solicitante, setSolicitante] = useState(nombreSolicitante);
  // Si los datos del usuario llegan después de montar, precargamos el nombre una sola
  // vez (solo si el campo sigue vacío y el usuario aún no escribió nada).
  const solicitanteTocado = useRef(false);
  useEffect(() => {
    if (!solicitanteTocado.current && !solicitante && nombreSolicitante) setSolicitante(nombreSolicitante);
  }, [nombreSolicitante, solicitante]);
  const [unidadSolicitante, setUnidadSolicitante] = useState((usuario?.departamento ?? '').toUpperCase());
  const [unidadOpciones, setUnidadOpciones] = useState<string[]>([]);

  // Catálogo de servicios + equipos de maquinaria.
  const [catalogo, setCatalogo] = useState<ServicioCatalogo[]>([]);
  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);

  // Builder del ítem de servicio.
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_SERVICIO[0]);
  const [servicio, setServicio] = useState('');
  const [equipoId, setEquipoId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [medida, setMedida] = useState('');
  // Recarga de gas / oxígeno / extintores: cantidad de bombonas + KG a recargar.
  const [bombonas, setBombonas] = useState('');
  const [kg, setKg] = useState('');

  useEffect(() => {
    listServiciosActivos().then(setCatalogo).catch(() => setCatalogo([]));
    listEquipos().then((e) => setEquipos(e.filter((x) => x.activo))).catch(() => setEquipos([]));
    listActivosPedido('unidad_solicitante').then(setUnidadOpciones).catch(() => setUnidadOpciones([]));
  }, []);

  const esMantenimiento = categoria === CATEGORIA_MANTENIMIENTO;
  const esGas = esRecargaGas(categoria, servicio);
  // Servicios del catálogo para la categoría elegida (nombres), para el desplegable.
  // En MANTENIMIENTO (Control de Maquinaria) la lista de "tipo de servicio" se
  // arma desde el catálogo de tipos de mantenimiento (cambio de aceite, filtro,
  // servicio/preventivo, reparación…) + lo que ya se haya cargado en el catálogo.
  const serviciosCat = useMemo(() => {
    const delCatalogo = catalogo.filter((s) => s.categoria === categoria).map((s) => s.nombre);
    // En RECARGA los tipos son GAS / OXÍGENO / EXTINTORES.
    if (esRecargaGas(categoria)) {
      const tipos = [...TIPOS_RECARGA] as string[];
      const vistos = new Set(tipos.map((t) => t.toLowerCase()));
      return [...tipos, ...delCatalogo.filter((s) => !vistos.has(s.toLowerCase()))];
    }
    if (!esMantenimiento) return delCatalogo;
    const tipos = TIPOS_MANTENIMIENTO.map((t) => `${t.icon} ${t.label}`);
    const vistos = new Set(tipos.map((t) => t.toLowerCase()));
    return [...tipos, ...delCatalogo.filter((s) => !vistos.has(s.toLowerCase()))];
  }, [catalogo, categoria, esMantenimiento]);
  const equipoOptions = useMemo(
    () => equipos.map((e) => ({ value: e.id, label: e.placa ? `${e.equipo} · ${e.placa}` : e.equipo })),
    [equipos],
  );

  /** Construye el ítem desde el builder (valida y guarda el servicio nuevo en el
   *  catálogo). Devuelve el ítem o null si falta algo. NO toca el estado. */
  async function buildItem(): Promise<ItemOrden | null> {
    const nom = servicio.trim();
    if (!nom) { toast('Elegí o escribí el servicio', 'error'); return null; }
    const gas = esRecargaGas(categoria, nom);
    // En recargas (gas/oxígeno/extintores) la cantidad la dan las bombonas (no hay campo Cantidad).
    const cant = gas
      ? (Number(String(bombonas).replace(',', '.')) || 0)
      : (Number(String(cantidad).replace(',', '.')) || 0);
    if (cant <= 0) { toast(gas ? 'Indicá la cantidad de bombonas' : 'La cantidad debe ser mayor a 0', 'error'); return null; }
    let equipoNombre: string | null = null;
    if (esMantenimiento) {
      if (!equipoId) { toast('Seleccioná la máquina/vehículo del mantenimiento', 'error'); return null; }
      equipoNombre = equipos.find((e) => e.id === equipoId)?.equipo ?? null;
    }
    // Si el servicio no existe en el catálogo, lo guardamos para reutilizarlo.
    if (!serviciosCat.some((s) => s.toLowerCase() === nom.toLowerCase())) {
      try {
        const nuevo = await addServicioCatalogo(categoria, nom, usuario?.email ?? authEmail);
        setCatalogo((prev) => [...prev, nuevo]);
      } catch { /* si ya existe o no se pudo, seguimos igual */ }
    }
    const sku = `SRV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const nombreItem = equipoNombre ? `${nom} · ${equipoNombre}` : nom;
    return {
      sku, nombre: nombreItem, cantidad: cant, precio: 0, comprar: true,
      unidad: medida.trim() || undefined,
      es_servicio: true, categoria_servicio: categoria,
      equipo_id: esMantenimiento ? equipoId : null,
      equipo_nombre: equipoNombre,
      bombonas: gas && bombonas ? Number(bombonas) : null,
      kg_recarga: gas && kg ? Number(kg) : null,
    };
  }

  async function addServicioItem(): Promise<boolean> {
    const it = await buildItem();
    if (!it) return false;
    setItems((prev) => [...prev, it]);
    // Reset del builder (conserva la categoría para cargar varios del mismo tipo).
    setServicio(''); setEquipoId(''); setCantidad('1'); setMedida(''); setBombonas(''); setKg('');
    return true;
  }

  function quitarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    // Si no se tocó "+ Añadir" pero hay un servicio cargado en el builder, lo
    // agregamos automáticamente para que "Crear solicitud" funcione igual.
    let lista = items;
    if (!lista.length) {
      if (servicio.trim()) {
        const it = await buildItem();
        if (!it) return; // buildItem ya avisó qué falta
        lista = [it];
      } else {
        toast('Añadí al menos un servicio', 'error');
        return;
      }
    }
    const solicitanteFinal = (solicitante || nombreSolicitante).toUpperCase().trim();
    const unidad = unidadSolicitante.trim();
    setSubmitting(true);
    try {
      const email = usuario?.email ?? authEmail;
      // Guardar unidad nueva en el catálogo si no existe.
      if (unidad && !unidadOpciones.some((u) => u.toLowerCase() === unidad.toLowerCase())) {
        await addCatalogoPedido('unidad_solicitante', unidad).catch(() => {});
      }
      const saved = await crearOrden({
        tipo: 'servicio',
        proveedor_id: null,
        items: lista,
        notas: notas.trim() || null,
        motivo: null,
        finalidad: null,
        clasificacion: ['Servicios'],
        urgente,
        imagen_path: null,
        solicitante_email: email,
        solicitante: solicitanteFinal || null,
        unidad_solicitante: unidad || null,
        ci_solicitante: null,
      });
      notify(`Nueva solicitud de servicio ${saved.codigo} enviada para aprobación`, 'success',
        { link: '#/app/pedidos', destino: 'admin' });
      toast(`Solicitud de servicio ${saved.codigo} creada`, 'success');
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear la solicitud', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="🔧 Nueva Solicitud de Servicio"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void handleSubmit()} disabled={submitting || (!items.length && !servicio.trim())}>
            {submitting ? 'Creando…' : 'Crear solicitud'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: '.75rem' }}>
        {/* Solicitante / unidad */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
          <div>
            <label className="label">Solicitante</label>
            <input className="input" name="ss-solicitante"
              value={solicitante}
              placeholder="Nombre y apellido del solicitante"
              onChange={(e) => { solicitanteTocado.current = true; setSolicitante(e.target.value.toUpperCase()); }} />
          </div>
          <div>
            <label className="label">Unidad solicitante</label>
            <SearchCreateSelect options={unidadOpciones} value={unidadSolicitante}
              onChange={(v) => setUnidadSolicitante(v.toUpperCase())} placeholder="Unidad / área…" />
          </div>
        </div>

        {/* Builder de servicio */}
        <div className="card" style={{ padding: '.75rem', display: 'grid', gap: '.6rem' }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Agregar servicio</div>
          <div style={{ display: 'grid', gridTemplateColumns: esMantenimiento ? '1fr 1fr' : '1fr 1fr', gap: '.6rem' }}>
            <div>
              <label className="label">Categoría</label>
              <select className="select" value={categoria}
                onChange={(e) => { setCategoria(e.target.value); setServicio(''); setEquipoId(''); }}>
                {CATEGORIAS_SERVICIO.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{esMantenimiento ? 'Tipo de servicio' : 'Servicio'}</label>
              <SearchCreateSelect options={serviciosCat} value={servicio} onChange={setServicio}
                placeholder={esMantenimiento ? 'Elegí el tipo (caucho, repuesto, aceite, pintura…)' : 'Elegí o escribí un servicio…'}
                emptyText="Sin servicios en esta categoría" />
            </div>
          </div>
          {esMantenimiento && (
            <div>
              <label className="label">Máquina / Vehículo (Control de Maquinaria)</label>
              <SearchSelect value={equipoId} onChange={setEquipoId} options={equipoOptions}
                placeholder="🔍 Buscar equipo…" emptyText="Sin equipos" />
            </div>
          )}
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end' }}>
            {esGas ? (
              <>
                {/* Recarga de gas / oxígeno / extintores: solo bombonas + KG. */}
                <div style={{ width: 160 }}>
                  <label className="label">Cantidad de bombonas</label>
                  <input className="input mono" value={bombonas} inputMode="decimal"
                    onChange={(e) => setBombonas(e.target.value)} placeholder="Ej. 4" />
                </div>
                <div style={{ width: 160 }}>
                  <label className="label">KG a recargar</label>
                  <input className="input mono" value={kg} inputMode="decimal"
                    onChange={(e) => setKg(e.target.value)} placeholder="Ej. 40" />
                </div>
              </>
            ) : (
              <>
                <div style={{ width: 120 }}>
                  <label className="label">Cantidad</label>
                  <input className="input" value={cantidad} inputMode="decimal"
                    onChange={(e) => setCantidad(e.target.value)} />
                </div>
                <div style={{ width: 160 }}>
                  <label className="label">Medida</label>
                  <input className="input" value={medida}
                    onChange={(e) => setMedida(e.target.value)}
                    placeholder="L, und, m, kg, juego…" />
                </div>
              </>
            )}
            <button className="btn btn-primary" onClick={() => void addServicioItem()}>+ Añadir</button>
          </div>
          {esMantenimiento && (
            <div className="muted" style={{ fontSize: '.78rem' }}>
              🛠 El mantenimiento queda casado a la máquina seleccionada de Control de Maquinaria.
            </div>
          )}
        </div>

        {/* Lista de servicios añadidos */}
        {items.length > 0 && (
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr><th>Servicio</th><th>Categoría</th><th>Equipo</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Bombonas</th><th style={{ textAlign: 'right' }}>KG</th><th>Medida</th><th></th></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.sku}>
                    <td>{it.nombre}</td>
                    <td>{it.categoria_servicio || '—'}</td>
                    <td>{it.equipo_nombre || <span className="muted">—</span>}</td>
                    <td style={{ textAlign: 'right' }}>{it.cantidad}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{it.bombonas ? it.bombonas : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{it.kg_recarga ? it.kg_recarga : '—'}</td>
                    <td>{it.unidad || <span className="muted">—</span>}</td>
                    <td><button className="btn btn-sm btn-ghost" title="Quitar" onClick={() => quitarItem(i)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <label className="label">Nota / observación (opcional)</label>
          <textarea className="input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)}
            placeholder="Detalle del servicio requerido…" />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }}>
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} /> 🚨 Marcar URGENTE
        </label>
      </div>
    </Modal>
  );
}
