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
import { textoOrdenPagar } from './confirmadasPagarTxt';

export function OrdenPagarWhatsappModal({ orden, proveedor, onClose }: {
  orden: Orden;
  proveedor: Proveedor | null;
  onClose: () => void;
}) {
  const texto = useMemo(() => textoOrdenPagar(orden, proveedor), [orden, proveedor]);
  return (
    <Modal
      title={`💬 WhatsApp · ${orden.oc_codigo ?? orden.codigo}`}
      onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      <p style={{ marginTop: 0 }}>
        Quién cobra, cuánto y por dónde se le paga. Envíalo por WhatsApp o cópialo para pegarlo donde haga falta.
      </p>
      <CompartirWhatsapp texto={texto} />
    </Modal>
  );
}
