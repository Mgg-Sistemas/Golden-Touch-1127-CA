/* ============================================================
   Golden Touch · Pedidos · Mensaje de pago o solicitud para WhatsApp

   Antes el botón «↓ TXT» bajaba un archivo que luego había que abrir, copiar y
   pegar en el chat. Ahora abre el mensaje ya armado —con sus emojis— y se manda
   o se copia de una vez, igual que el aviso de Combustible.

   En modo «solicitud» (SP pendiente o en cotización) muestra los datos de la
   solicitud y, si Almacén ya la revisó, permite alternar entre la revisión de
   Almacén (lo que tiene Los Pinos y lo que va a Compras) y la SP.

   En modo «aprobación» (OC pendiente por aprobar) el aviso lleva además todas
   las cotizaciones de la solicitud, numeradas en $ y Bs, la elegida y qué
   analista la escogió (02/11/2026).
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { supabase } from '@/shared/lib/supabase';
import type { OfertaProveedor, Orden, Proveedor } from '@/shared/lib/types';
import type { RevisionAlmacenRow } from '@/modules/solicitudesAlmacen/solicitudesAlmacen.repository';
import {
  resumenRevision,
  revisionGuardada,
  textoWhatsappRevision,
  textoWhatsappSolicitud,
} from '@/modules/solicitudesAlmacen/revisionAlmacen';
import { textoOrdenAprobacion, textoOrdenPagar } from './confirmadasPagarTxt';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';
import { listOfertasByOrden } from './ofertas.repository';

export type ModoWhatsappOrden = 'pagar' | 'aprobacion' | 'solicitud';

export function OrdenPagarWhatsappModal({ orden, proveedor, modo = 'pagar', personas, proveedorMap, onClose }: {
  orden: Orden;
  proveedor: Proveedor | null;
  /** 'pagar': instrucción de pago. 'aprobacion': aviso al Gerente General. 'solicitud': SP / revisión de Almacén. */
  modo?: ModoWhatsappOrden;
  /** correo (minúsculas) → nombre, para decir quién solicitó, autorizó y es el analista. */
  personas?: Map<string, string>;
  /** id → proveedor, para nombrar a cada proveedor que cotizó (modo aprobación). */
  proveedorMap?: Map<string, Proveedor>;
  onClose: () => void;
}) {
  // Tasa BCV del día: «Monto en Bs» del pago y conversión $/Bs de las cotizaciones
  const [tasaUsd, setTasaUsd] = useState<number | null>(null);
  useEffect(() => {
    let cancel = false;
    getTasaHoy().then((t) => { if (!cancel) setTasaUsd(t.usd ?? null); }).catch(() => { /* sin tasa */ });
    return () => { cancel = true; };
  }, []);

  // Las cotizaciones cargadas para la solicitud (en aviso de aprobación o pagar).
  const [ofertas, setOfertas] = useState<OfertaProveedor[]>([]);
  useEffect(() => {
    if (modo === 'solicitud') return;
    let cancel = false;
    listOfertasByOrden(orden.id).then((of) => { if (!cancel) setOfertas(of); }).catch(() => { /* sin cotizaciones */ });
    return () => { cancel = true; };
  }, [modo, orden.id]);

  // Si es modo solicitud, verificar si Almacén ya la revisó para dar la opción de ver la revisión
  const [revision, setRevision] = useState<RevisionAlmacenRow | null>(null);
  const [subTipo, setSubTipo] = useState<'revision' | 'solicitud'>('revision');

  useEffect(() => {
    if (modo === 'solicitud' || (!orden.oc_codigo && ['pendiente', 'aprobada'].includes(orden.estado))) {
      let cancel = false;
      supabase
        .from('solicitudes_revision_almacen')
        .select('*')
        .eq('orden_id', orden.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancel && data) {
            setRevision(data as RevisionAlmacenRow);
            setSubTipo('revision');
          } else if (!cancel) {
            setRevision(null);
            setSubTipo('solicitud');
          }
        })
        .catch(() => {
          if (!cancel) {
            setRevision(null);
            setSubTipo('solicitud');
          }
        });
      return () => { cancel = true; };
    }
  }, [orden.id, modo, orden.estado, orden.oc_codigo]);

  const texto = useMemo(() => {
    if (modo === 'solicitud') {
      if (revision && subTipo === 'revision') {
        const guardado = revision.texto_whatsapp?.trim();
        const guardadoEsValido = guardado && !guardado.includes('') && !guardado.includes('\uFFFD');
        const items = orden.items ?? [];
        const res = resumenRevision(items, revisionGuardada(revision.items_revision));
        return (guardadoEsValido ? guardado : null)
          || textoWhatsappRevision(orden, res, revision.revisada_por_nombre, revision.nota);
      }
      return textoWhatsappSolicitud({
        codigo: orden.codigo,
        solicitante: orden.solicitante,
        unidad_solicitante: orden.unidad_solicitante,
        urgente: orden.urgente,
        motivo: orden.motivo || orden.notas,
        finalidad: orden.finalidad,
        created_at: orden.created_at,
        estado: orden.estado,
        items: orden.items ?? [],
      });
    }

    if (modo === 'aprobacion') {
      return textoOrdenAprobacion(orden, proveedor, personas, {
        ofertas,
        nombreProveedor: (id) => proveedorMap?.get(id)?.razon_social ?? (id === proveedor?.id ? proveedor?.razon_social : null),
        tasaUsd,
      });
    }

    return textoOrdenPagar(orden, proveedor, personas, tasaUsd, {
      ofertas,
      nombreProveedor: (id) => proveedorMap?.get(id)?.razon_social ?? (id === proveedor?.id ? proveedor?.razon_social : null),
    });
  }, [modo, revision, subTipo, orden, proveedor, personas, tasaUsd, ofertas, proveedorMap]);

  return (
    <Modal
      title={`💬 WhatsApp · ${orden.oc_codigo ?? orden.codigo}`}
      onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      <p style={{ marginTop: 0 }}>
        {modo === 'solicitud'
          ? (revision
            ? 'Esta orden fue revisada por Almacén. Puedes enviar o copiar el reporte de revisión (lo que cubre Los Pinos y lo que pasa a Compras) o el detalle de la solicitud de pedido.'
            : 'Detalle de la solicitud de pedido con solicitante, unidad, motivo y productos, listo para enviar o copiar por WhatsApp.')
          : modo === 'aprobacion'
          ? 'Lo que el Gerente General necesita para aprobar: proveedor, quién solicita, analista a cargo, productos, todas las cotizaciones (en $ y Bs) con la elegida, y el total. Envíalo por WhatsApp o cópialo.'
          : 'Quién solicitó, quién autorizó, el analista a cargo, quién cobra, cuánto y por dónde se le paga. Envíalo por WhatsApp o cópialo para pegarlo donde haga falta.'}
      </p>

      {modo === 'solicitud' && revision && (
        <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.85rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${subTipo === 'revision' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTipo('revision')}
          >
            📦 Revisión de Almacén
          </button>
          <button
            type="button"
            className={`btn btn-sm ${subTipo === 'solicitud' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSubTipo('solicitud')}
          >
            📝 Solicitud de Pedido
          </button>
        </div>
      )}

      <CompartirWhatsapp texto={texto} />
    </Modal>
  );
}
