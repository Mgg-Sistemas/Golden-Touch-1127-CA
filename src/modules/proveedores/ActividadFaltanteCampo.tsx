/* ============================================================
   Campo «Actividad económica» para cuando el proveedor NO la tiene (o es nuevo):
   es obligatoria y, al guardar, queda en su ficha. Si ya la tiene no se pinta
   nada (ver `pideActividad`). Lo usan Compra directa y Servicio directo.
   ============================================================ */
import { ActividadEconomicaSelect } from './ActividadEconomicaSelect';
import { useActividadesEconomicas } from './actividadesEconomicas.repository';

export function ActividadFaltanteCampo({ id, nuevo, value, onChange }: {
  id: string; nuevo: boolean; value: string; onChange: (codigo: string) => void;
}) {
  const { actividades, recargar } = useActividadesEconomicas();
  return (
    <div className="form-row">
      <label htmlFor={id}>Actividad económica del proveedor (CIIU · SENIAT) *</label>
      <ActividadEconomicaSelect id={id} value={value} onChange={onChange} actividades={actividades} onCreada={recargar} />
      <small className="muted">{nuevo
        ? 'Obligatoria para dar de alta al proveedor; queda en su ficha.'
        : 'Este proveedor no la tiene cargada: es obligatoria y queda en su ficha (se pide una sola vez).'}</small>
    </div>
  );
}
