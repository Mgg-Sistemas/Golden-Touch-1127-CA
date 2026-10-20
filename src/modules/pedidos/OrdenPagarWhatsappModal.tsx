/* ============================================================
   Golden Touch · Pedidos · Mensaje de pago de una orden, para WhatsApp

   Antes el botón «↓ TXT» bajaba un archivo que luego había que abrir, copiar y
   pegar en el chat. Ahora abre el mensaje ya armado —con sus emojis— y se manda
   o se copia de una vez, igual que el aviso de Combustible.
   ============================================================ */
import { useMemo } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import type { Orden, Proveedor } from '@/shared/lib/types';
import { textoOrdenAprobacion, textoOrdenPagar } from './confirmadasPagarTxt';

export function OrdenPagarWhatsappModal({ orden, proveedor, modo = 'pagar', personas, onClose }: {
  orden: Orden;
  proveedor: Proveedor | null;
  /** 'pagar': instrucción de pago (Confirmada pagar / crédito). 'aprobacion': aviso al Gerente General. */
  modo?: 'pagar' | 'aprobacion';
  /** correo (minúsculas) → nombre, para decir quién solicitó, autorizó y es el analista. */
  personas?: Map<string, string>;
  onClose: () => void;
}) {
  const texto = useMemo(
    () => (modo === 'aprobacion' ? textoOrdenAprobacion(orden, proveedor, personas) : textoOrdenPagar(orden, proveedor, personas)),
    [orden, proveedor, modo, personas],
  );
  return (
    <Modal
      title={`💬 WhatsApp · ${orden.oc_codigo ?? orden.codigo}`}
      onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      <p style={{ marginTop: 0 }}>
        {modo === 'aprobacion'
          ? 'Lo que el Gerente General necesita para aprobar: proveedor, quién solicita, analista a cargo, productos y total. Envíalo por WhatsApp o cópialo.'
          : 'Quién solicitó, quién autorizó, el analista a cargo, quién cobra, cuánto y por dónde se le paga. Envíalo por WhatsApp o cópialo para pegarlo donde haga falta.'}
      </p>
      <CompartirWhatsapp texto={texto} />
    </Modal>
  );
}
