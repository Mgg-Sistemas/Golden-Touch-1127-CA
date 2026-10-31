import { useEffect, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { num as fmtNum } from '@/shared/lib/format';
import { solicitarCompraDeOrden, type OrdenServicio } from './flota.repository';
import { getEquipo } from './maquinariaEquipos.repository';

import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { textoCompraRepuestosWhatsapp, type DatosCompraRepuestosWhatsapp } from './maquinariaWhatsapp';

/**
 * Datos del WhatsApp de la solicitud de compra (26/10/2026): el EQUIPO es el dato principal
 * («EQUIPO DESTINO: …») y la orden de servicio va como referencia. Se listan las piezas que
 * realmente van a Compras (todo lo que tenga algo a comprar, no solo las piezas nuevas).
 * Sin nombre de equipo cae a «Equipo de la orden OS-…» para no mandar «Orden OS-…» como equipo.
 */
export function datosWhatsappPedirCompra(
  orden: Pick<OrdenServicio, 'codigo' | 'repuestos'>,
  equipo: string | null | undefined,
  solicitudServicio: string,
): DatosCompraRepuestosWhatsapp {
  const nombre = (equipo ?? '').trim();
  return {
    ordenServicio: orden.codigo,
    solicitudServicio,
    equipo: nombre || `Equipo de la orden ${orden.codigo}`,
    piezas: orden.repuestos.filter((r) => r.a_comprar > 0).map((r) => ({ nombre: r.nombre, cantidad: r.a_comprar, unidad: r.unidad })),
  };
}

/**
 * «🛒 Pedir compra»: los repuestos entran a Compras como SOLICITUD DE SERVICIO (SS-…, Pedidos →
 * 🔧 Servicios) con su nombre general (30/10/2026). Maquinaria NO da de alta productos: el
 * analista de compras, al cargar la cotización, le pone a cada pieza el producto del inventario
 * o crea uno nuevo con el nombre que corresponde.
 */
export function PedirCompraModal({ orden, equipo, onClose, onDone }: {
  orden: OrdenServicio;
  /** Nombre del equipo (para el WhatsApp). Si no viene, se busca por `orden.equipo_id`. */
  equipo?: string | null;
  onClose: () => void; onDone: () => void;
}) {
  // Todo lo que tenga algo a comprar va a la solicitud (con producto o con nombre general).
  const porComprar = orden.repuestos.filter((r) => r.a_comprar > 0);
  const [saving, setSaving] = useState(false);
  const [whatsappTexto, setWhatsappTexto] = useState<string | null>(null);
  const [nombreEquipo, setNombreEquipo] = useState<string | null>(equipo ?? null);

  useEffect(() => {
    if (equipo) { setNombreEquipo(equipo); return; }
    let vivo = true;
    getEquipo(orden.equipo_id).then((e) => { if (vivo && e) setNombreEquipo(e.equipo); }).catch(() => { /* el texto cae al código de la orden */ });
    return () => { vivo = false; };
  }, [equipo, orden.equipo_id]);

  async function pedir() {
    setSaving(true);
    try {
      const codigo = await solicitarCompraDeOrden(orden);
      toast(`${orden.codigo}: Solicitud de Servicio ${codigo} enviada a Compras.`, 'success');
      setWhatsappTexto(textoCompraRepuestosWhatsapp(datosWhatsappPedirCompra(orden, nombreEquipo, codigo)));
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : (e as { message?: string })?.message || 'No se pudo pedir la compra', 'error');
    } finally { setSaving(false); }
  }

  if (whatsappTexto) {
    return (
      <Modal title={`📲 Compartir por WhatsApp · ${nombreEquipo ?? orden.codigo}`} size="md" onClose={onClose}
        footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}>
        <div style={{ display: 'grid', gap: '.75rem' }}>
          <div className="aviso success sm">
            <span className="aviso-icono">✅</span>
            <div>Solicitud de Servicio enviada a Compras. Comparte el reporte con el grupo o comprador por WhatsApp:</div>
          </div>
          <CompartirWhatsapp texto={whatsappTexto} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`🛒 Enviar a Compras · ${orden.codigo}`} size="md" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => void pedir()} disabled={saving || !porComprar.length}>
          {saving ? 'Enviando…' : '🔧 Enviar Solicitud de Servicio'}
        </button>
      </>}>
      <div className="flo" style={{ display: 'grid', gap: '.75rem' }}>
        <div className="aviso info sm">
          <span className="aviso-icono">💡</span>
          <div>
            Las piezas entran a <strong>Compras (Pedidos → 🔧 Servicios)</strong> como <strong>Solicitud de Servicio</strong> con
            el nombre general que indicaste. El analista de compras, al cargar la cotización, le pone a cada una
            el producto del inventario (o crea uno nuevo con el nombre que corresponde).
          </div>
        </div>

        <div style={{ display: 'grid', gap: '.5rem' }}>
          {porComprar.map((n, i) => (
            <div key={`${n.producto_id ?? n.nombre}-${i}`} className="flo-linea" style={{ padding: '.65rem .85rem', background: 'var(--surface-2)', borderRadius: 'var(--r-md)' }}>
              <div className="flo-linea-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{n.nombre}</strong>
                  <div className="muted" style={{ fontSize: '.76rem' }}>{nombreEquipo ? `${nombreEquipo} · ` : ''}Para orden {orden.codigo}{n.producto_id ? '' : ' · nombre general'}</div>
                </div>
                <span className="flo-chip tone-primary">
                  {fmtNum(n.a_comprar)} {n.unidad} a comprar
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
