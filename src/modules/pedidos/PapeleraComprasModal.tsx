import { useCallback, useEffect, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { getImagenOrdenSignedUrl, urlAdjuntoOc } from './pedidos.repository';
import { urlAdjuntoDirecto } from './adjuntosDirectos.repository';
import { cambiarPapeleraCompras, listPapeleraCompras, type RegistroPapeleraCompras } from './papeleraCompras';

const tipos = { orden: 'Orden', compra: 'Compra directa', servicio: 'Servicio directo' } as const;

export function PapeleraComprasModal({ onChanged, onClose }: { onChanged: () => Promise<void>; onClose: () => void }) {
  const { can, isAdmin, permisos } = usePermissions();
  const escritura = can('compras', 'escritura');
  const puedeVaciar = escritura && (permisos?.compras?.vaciarPapelera ?? isAdmin);
  const [filas, setFilas] = useState<RegistroPapeleraCompras[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const recuperables = filas.filter((f) => !f.contabilizada);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setFilas(await listPapeleraCompras()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar la papelera', 'error'); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function restaurar(fila: RegistroPapeleraCompras) {
    setOcupado(true);
    try {
      await cambiarPapeleraCompras(fila.tipo, [fila.id], 'restaurar');
      toast('Documento restaurado', 'success');
      await Promise.all([cargar(), onChanged()]);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo restaurar', 'error'); }
    finally { setOcupado(false); }
  }

  async function vaciar() {
    setConfirmar(false);
    setOcupado(true);
    try {
      const resultados = await Promise.allSettled((['orden', 'compra', 'servicio'] as const).map((tipo) =>
        cambiarPapeleraCompras(tipo, recuperables.filter((f) => f.tipo === tipo).map((f) => f.id), 'vaciar')));
      const total = resultados.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value : 0), 0);
      const fallo = resultados.find((r) => r.status === 'rejected');
      if (fallo) toast(fallo.reason instanceof Error ? fallo.reason.message : 'No se pudo completar el vaciado', 'error');
      if (total) toast(`${total} documento(s) retirado(s) con resguardo`, 'success');
      if (!fallo && total < recuperables.length) toast('La lista cambió. Revisa los documentos pendientes.', 'warning');
      await cargar();
    } finally { setOcupado(false); }
  }

  async function verAdjunto(tipo: RegistroPapeleraCompras['tipo'], archivo: RegistroPapeleraCompras['adjuntos'][number]) {
    try {
      const url = tipo === 'orden'
        ? await (archivo.imagenOrden ? getImagenOrdenSignedUrl(archivo.path) : urlAdjuntoOc(archivo.path))
        : await urlAdjuntoDirecto(tipo, archivo.path);
      previewArchivo(url, archivo.nombre);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo abrir el adjunto', 'error'); }
  }

  return (
    <Modal title="Papelera de Compras" size="lg" onClose={() => { if (!ocupado) onClose(); }} footer={<>
      {puedeVaciar && <button className="btn btn-danger" disabled={cargando || ocupado || !recuperables.length}
        onClick={() => setConfirmar(true)}>Vaciar papelera</button>}
      <button className="btn btn-ghost" disabled={ocupado} onClick={onClose}>Cerrar</button>
    </>}>
      {cargando ? <p>Cargando…</p> : !filas.length ? <p>La papelera está vacía.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Documento</th><th>Tipo</th><th>Adjuntos</th><th>Acción</th></tr></thead>
            <tbody>{filas.map((f) => (
              <tr key={`${f.tipo}-${f.id}`}>
                <td>{f.codigo}</td><td>{tipos[f.tipo]}</td>
                <td>{f.adjuntos.map((a) => <button key={`${!!a.imagenOrden}-${a.path}`} className="btn btn-sm btn-ghost"
                  onClick={() => void verAdjunto(f.tipo, a)}>{a.nombre}</button>)}</td>
                <td>{f.contabilizada ? 'Revertido · consulta' : escritura && (
                  <button className="btn btn-sm btn-ghost" disabled={ocupado} onClick={() => void restaurar(f)}>Restaurar</button>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {confirmar && <ConfirmDialog title="Vaciar papelera de Compras" danger requireText="BORRAR"
        message="Se retiran los documentos sin contabilizar y quedan resguardados con sus archivos. Las órdenes revertidas siguen disponibles para consulta."
        confirmText="Vaciar papelera" onCancel={() => setConfirmar(false)} onConfirm={() => { void vaciar(); }} />}
    </Modal>
  );
}
