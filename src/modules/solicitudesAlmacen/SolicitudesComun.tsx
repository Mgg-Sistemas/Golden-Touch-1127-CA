/* ============================================================
   Golden Touch · Solicitudes de Pedido · Piezas comunes (29/10/2026)
   Lo que comparten la pantalla de PC y la de teléfono: el aviso de flujo
   apagado, la existencia con su color, la barra de cobertura, el modal de
   WhatsApp y el «Marcar como revisada» (confirmación → RPC → WhatsApp).
   ============================================================ */
import { useState, type ReactNode } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { toast } from '@/shared/ui/Toast';
import { num } from '@/shared/lib/format';
import { mensajeError } from '@/shared/lib/errores';
import { revisarSolicitud, CLAVE_INTERRUPTOR, type SolicitudConRevision } from './solicitudesAlmacen.repository';
import {
  avisoLote, estadoExistencia, resumenRevision, textoWhatsappRevision,
  type ModoLote, type RenglonSP, type ResumenRevision, type RevisionRenglon,
} from './revisionAlmacen';
import type { useBorradores, useSolicitudesAlmacen } from './useSolicitudesAlmacen';
import './solicitudesAlmacen.css';

/** Nombre de cada botón de lote (PC y teléfono). */
export const BOTONES_LOTE: { modo: ModoLote; texto: string; clase: string }[] = [
  { modo: 'todo_disponible_segun_stock', texto: '✔ Según existencias', clase: 'spa-lote-stock' },
  { modo: 'todo_disponible', texto: '✔ Todo disponible', clase: 'spa-lote-todo' },
  { modo: 'todo_a_compras', texto: '🛒 Todo a Compras', clase: 'spa-lote-compras' },
];

/**
 * 02/11/2026 · Los botones de lote, iguales en PC y teléfono. Cada uno responde con un
 * toast (antes «Todo a Compras» con Los Pinos ya en 0 parecía fallar):
 * · «Según existencias» consulta la existencia DEL MOMENTO en la base (mientras, el botón
 *   dice «Consultando…») y propone con ella; lo sin vincular toma la del parecido.
 * · «Todo disponible» propone todo de Los Pinos.
 * · «Todo a Compras» pone todo en 0 y abre de una vez la confirmación de «Marcar como
 *   revisada»; al confirmar se guarda y sale el WhatsApp de la revisión.
 */
export function useLotes(
  datos: ReturnType<typeof useSolicitudesAlmacen>,
  bor: ReturnType<typeof useBorradores>,
  marcar: Pick<ReturnType<typeof useMarcarRevisada>, 'pedir'>,
  despues?: (modo: ModoLote) => void,
) {
  const [consultando, setConsultando] = useState<string | null>(null);

  const aplicar = async (s: SolicitudConRevision, modo: ModoLote) => {
    if (modo === 'todo_disponible_segun_stock') {
      if (consultando) return;
      setConsultando(s.orden.id);
      try {
        const fresco = await datos.consultarExistencias(s);
        bor.lote(s, modo, fresco.stock, fresco.sugerido);
        const a = avisoLote(modo, s.orden.items, fresco.stock, fresco.sugerido);
        toast(a.texto, a.tipo, { silent: true });
        despues?.(modo);
      } catch (e) {
        toast(mensajeError(e, 'No se pudo consultar el inventario de Los Pinos.'), 'error');
      } finally {
        setConsultando(null);
      }
      return;
    }
    const revision = bor.lote(s, modo);
    const a = avisoLote(modo, s.orden.items, datos.stock, datos.sugerido);
    toast(a.texto, a.tipo, { silent: true });
    if (modo === 'todo_a_compras') marcar.pedir(s, revision, bor.nota(s.orden.id));
    despues?.(modo);
  };

  /** Texto y estado de cada botón para la SP `s`. */
  const botones = (s: SolicitudConRevision) => BOTONES_LOTE.map((b) => ({
    ...b,
    texto: b.modo === 'todo_disponible_segun_stock' && consultando === s.orden.id ? '⏳ Consultando…' : b.texto,
    disabled: consultando != null,
  }));

  return { aplicar, botones, consultando };
}

export function AvisoApagado({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div style={{ display: 'grid', gap: '.6rem', maxWidth: 720 }}>
      <div className="aviso info">
        <span className="aviso-icono">🕒</span>
        <div>
          Este flujo todavía no está activo. Mientras tanto, las solicitudes siguen llegando directo a Compras
          como siempre. Se activa cuando la gerencia lo indique.
        </div>
      </div>
      {isAdmin && (
        <div className="aviso sm">
          <span className="aviso-icono">🔌</span>
          <div>
            Interruptor <code>{CLAVE_INTERRUPTOR}</code>: <strong>apagado</strong> (o todavía no creado en la base).
            Se enciende por SQL en <code>sistema_interruptores</code> cuando la usuaria lo pida.
          </div>
        </div>
      )}
    </div>
  );
}

/** Existencia actual con su color: verde alcanza, ámbar parcial, rojo 0 o sin vincular. */
export function BadgeExistencia({ solicitada, stock, unidad }: { solicitada: number; stock: number | null; unidad?: string | null }) {
  const e = estadoExistencia(solicitada, stock);
  if (e === 'sin_vincular') return <span className="badge danger" title="El renglón no tiene un producto del inventario">sin vincular</span>;
  const cls = e === 'alcanza' ? 'success' : e === 'parcial' ? 'warning' : 'danger';
  return <span className={`badge ${cls} mono`}>{num(stock ?? 0)} {unidad ?? ''}</span>;
}

/** Verde = lo que entrega Almacén; el resto (naranja) sigue a Compras. */
export function BarraCobertura({ solicitada, disponible }: { solicitada: number; disponible: number }) {
  const pct = solicitada > 0 ? Math.min(100, Math.max(0, (disponible / solicitada) * 100)) : 0;
  return (
    <div className="spa-barra" role="img" aria-label={`Almacén tiene el ${Math.round(pct)} % de lo solicitado`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ModalWhatsapp({ titulo, texto, onClose }: { titulo: string; texto: string; onClose: () => void }) {
  return (
    <Modal title={titulo} compact onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <CompartirWhatsapp texto={texto} />
    </Modal>
  );
}

export function ResumenListas({ resumen }: { resumen: ResumenRevision }) {
  const lista = (ls: ResumenRevision['disponibles']) => (
    <ul>{ls.map((l, i) => (
      <li key={i}><b className="mono">{num(l.cantidad)} {l.unidad.toUpperCase()}</b> · {l.nombre}</li>
    ))}</ul>
  );
  return (
    <div className="spa-resumen" style={{ padding: '.4rem 0 0' }}>
      <div>
        <h3>✅ Tiene Los Pinos</h3>
        {resumen.disponibles.length ? lista(resumen.disponibles) : <div className="vacio">Nada de lo solicitado</div>}
      </div>
      <div>
        <h3>🛒 Va a Compras</h3>
        {resumen.aCompras.length ? lista(resumen.aCompras) : <div className="vacio">Nada: Almacén cubre todo</div>}
      </div>
    </div>
  );
}

/** Renglones a mostrar de una SP: lo original si ya se revisó (la orden quedó solo con lo faltante). */
export const renglonesDe = (s: SolicitudConRevision): RenglonSP[] =>
  Array.isArray(s.revision?.items_original) && s.revision!.items_original!.length ? s.revision!.items_original! : s.orden.items;

/**
 * «Marcar como revisada»: confirma mostrando el resumen, llama a la RPC y abre el
 * WhatsApp con el mensaje de la revisión. Devuelve la función que lo dispara y
 * los diálogos que hay que pintar.
 */
export function useMarcarRevisada(quien: string, onHecho: (ordenId: string) => void) {
  const [pedido, setPedido] = useState<{ s: SolicitudConRevision; revision: RevisionRenglon[]; nota: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [wsp, setWsp] = useState<{ titulo: string; texto: string } | null>(null);

  async function confirmar() {
    if (!pedido) return;
    const { s, revision, nota } = pedido;
    const resumen = resumenRevision(s.orden.items, revision);
    const texto = textoWhatsappRevision(s.orden, resumen, quien, nota);
    setGuardando(true);
    try {
      const r = await revisarSolicitud(s.orden.id, revision, nota, texto);
      setPedido(null);
      const cubreTodo = r.estado_orden === 'finalizada' || (!r.estado_orden && !resumen.aCompras.length);
      toast(cubreTodo
        ? `${s.orden.codigo}: Almacén cubre todo, la solicitud quedó finalizada.`
        : `${s.orden.codigo}: revisada. ${r.renglones_a_compras ?? resumen.aCompras.length} renglón(es) siguen a Compras para cotizar.`, 'success');
      onHecho(s.orden.id);
      setWsp({ titulo: `📲 Revisión de ${s.orden.codigo}`, texto });
    } catch (e) {
      toast(mensajeError(e, 'No se pudo marcar como revisada.'), 'error');
    } finally {
      setGuardando(false);
    }
  }

  const pedir = (s: SolicitudConRevision, revision: RevisionRenglon[], nota: string) => setPedido({ s, revision, nota });

  const dialogos: ReactNode = (
    <>
      {pedido && (
        <ConfirmDialog
          title={`Marcar ${pedido.s.orden.codigo} como revisada`}
          success
          confirmText={guardando ? 'Guardando…' : '✓ Marcar como revisada'}
          message={<>Lo que tiene Almacén se entrega desde el inventario; lo que falta pasa a Compras para que lo acepte y cotice.</>}
          preview={<ResumenListas resumen={resumenRevision(pedido.s.orden.items, pedido.revision)} />}
          onConfirm={() => { if (!guardando) void confirmar(); }}
          onCancel={() => { if (!guardando) setPedido(null); }}
        />
      )}
      {wsp && <ModalWhatsapp titulo={wsp.titulo} texto={wsp.texto} onClose={() => setWsp(null)} />}
    </>
  );

  return { pedir, dialogos, guardando };
}
