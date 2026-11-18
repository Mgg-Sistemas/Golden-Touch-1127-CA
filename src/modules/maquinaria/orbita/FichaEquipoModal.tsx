/* ============================================================
   Golden Touch · Control de Maquinaria · la Órbita · ficha del equipo
   «Ver ficha técnica» de la maqueta, solo lectura y sin servicios. Arriba,
   la categoría del equipo (D22), que se asigna aquí o en su chip.
   ============================================================ */
import { num } from '@/shared/lib/format';
import { Modal } from '@/shared/ui/Modal';
import { ESTADOS_EQUIPO } from '../flota';
import { textoAviso, tonoAviso } from '../avisoEquipo';
import type { CategoriaEquipo, FilaFlota } from './orbitaDatos';
import { ChipCategoria } from './FlotaSinServicios';

export function FichaEquipoModal({ f, onCategoria, onCerrar }: {
  f: FilaFlota;
  onCategoria: (c: CategoriaEquipo | 'por_asignar') => void;
  onCerrar: () => void;
}) {
  const e = ESTADOS_EQUIPO[f.estado];
  const filas: [string, string | null][] = [
    ['Empresa / propietario', f.propietarioNombre + (f.traspasado ? ' (traspaso de maqueta)' : '')],
    ['Tipo de maquinaria', f.tipo],
    ['Marca y modelo', [f.marca, f.modelo].filter(Boolean).join(' · ') || null],
    ['Año y color', [f.anio, f.color].filter(Boolean).join(' · ') || null],
    ['Serial de chasis', f.serial],
    ['Placa', f.placa],
    ['Horómetro vigente', f.horometro == null ? 'sin lectura' : `${num(f.horometro)} h`],
    ['Combustible', [f.combustible, f.consumoPorHora != null ? `${f.consumoPorHora} L/h est.` : null].filter(Boolean).join(' · ') || null],
    ['Operador responsable', f.operador],
    ['Ubicación', f.ubicacion],
  ];
  return (
    <Modal title={`🚜 ${f.equipo}`} compact onClose={onCerrar}
      footer={<button type="button" className="btn btn-ghost" onClick={onCerrar}>Cerrar</button>}>
      <div className="orb-ficha">
        <div className="orb-ficha-estado">
          <span className={`tone-${e.tono}`}>{e.icon} {e.label}</span>
          <span className={`tono-${tonoAviso(f.aviso)}`}>Mantenimiento: {textoAviso(f.aviso)}</span>
          <ChipCategoria valor={f.categoria} nombre={f.equipo} onCambiar={onCategoria} />
        </div>
        <dl>
          {filas.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <p className="orb-maqueta">Solo lectura. La categoría es de maqueta: queda en este navegador.</p>
      </div>
    </Modal>
  );
}
