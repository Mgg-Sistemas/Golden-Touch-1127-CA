/* ============================================================
   Golden Touch · Pedidos · Mensaje de pago de una orden, para WhatsApp

   Antes el botón «↓ TXT» bajaba un archivo que luego había que abrir, copiar y
   pegar en el chat. Ahora abre el mensaje ya armado —con sus emojis— y se manda
   o se copia de una vez, igual que el aviso de Combustible.

   En modo «aprobación» (OC pendiente por aprobar) el aviso lleva además todas
   las cotizaciones de la solicitud, numeradas en $ y Bs, la elegida y qué
   analista la escogió (02/11/2026).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import type { OfertaProveedor, Orden, Proveedor } from '@/shared/lib/types';
import { textoOrdenAprobacion, textoOrdenPagar } from './confirmadasPagarTxt';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';
import { listOfertasByOrden } from './ofertas.repository';

export function OrdenPagarWhatsappModal({ orden, proveedor, modo = 'pagar', personas, proveedorMap, onClose }: {
  orden: Orden;
  proveedor: Proveedor | null;
  /** 'pagar': instrucción de pago (Confirmada pagar / crédito). 'aprobacion': aviso al Gerente General. */
  modo?: 'pagar' | 'aprobacion';
  /** correo (minúsculas) → nombre, para decir quién solicitó, autorizó y es el analista. */
  personas?: Map<string, string>;
  /** id → proveedor, para nombrar a cada proveedor que cotizó (modo aprobación). */
  proveedorMap?: Map<string, Proveedor>;
  onClose: () => void;
}) {
  // Tasa BCV del día: «Monto en Bs» del pago y conversión $/Bs de las cotizaciones
  // (sin tasa, esas líneas salen solo en su moneda).
  const [tasaUsd, setTasaUsd] = useState<number | null>(null);
  useEffect(() => {
    let cancel = false;
    getTasaHoy().then((t) => { if (!cancel) setTasaUsd(t.usd ?? null); }).catch(() => { /* sin tasa */ });
    return () => { cancel = true; };
  }, []);
  // Las cotizaciones cargadas para la solicitud (solo en el aviso de aprobación).
  const [ofertas, setOfertas] = useState<OfertaProveedor[]>([]);
  useEffect(() => {
    // 04/11/2026: también en el aviso para pagar (las cotizaciones y cuál se escogió).
    let cancel = false;
    listOfertasByOrden(orden.id).then((of) => { if (!cancel) setOfertas(of); }).catch(() => { /* sin cotizaciones */ });
    return () => { cancel = true; };
  }, [modo, orden.id]);
  const texto = useMemo(
    () => (modo === 'aprobacion'
      ? textoOrdenAprobacion(orden, proveedor, personas, {
        ofertas,
        nombreProveedor: (id) => proveedorMap?.get(id)?.razon_social ?? (id === proveedor?.id ? proveedor?.razon_social : null),
        tasaUsd,
      })
      : textoOrdenPagar(orden, proveedor, personas, tasaUsd, {
        ofertas,
        nombreProveedor: (id) => proveedorMap?.get(id)?.razon_social ?? (id === proveedor?.id ? proveedor?.razon_social : null),
      })),
    [orden, proveedor, modo, personas, tasaUsd, ofertas, proveedorMap],
  );
  return (
    <Modal
      title={`💬 WhatsApp · ${orden.oc_codigo ?? orden.codigo}`}
      onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      <p style={{ marginTop: 0 }}>
        {modo === 'aprobacion'
          ? 'Lo que el Gerente General necesita para aprobar: proveedor, quién solicita, analista a cargo, productos, todas las cotizaciones (en $ y Bs) con la elegida, y el total. Envíalo por WhatsApp o cópialo.'
          : 'Quién solicitó, quién autorizó, el analista a cargo, quién cobra, cuánto y por dónde se le paga. Envíalo por WhatsApp o cópialo para pegarlo donde haga falta.'}
      </p>
      <CompartirWhatsapp texto={texto} />
    </Modal>
  );
}
