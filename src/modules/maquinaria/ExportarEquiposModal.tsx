/* ============================================================
   Golden Touch · Control de Maquinaria · Diálogo «Descargar datos de equipos»
   (26/10/2026)

   Casillas para elegir qué datos salen (idéntico a RRHH):
   - Selección de columnas personalizables.
   - Opción para agrupar por empresa / propietario.
   - Excel o PDF (con vista previa para imprimir).
   - Recuerda las preferencias del usuario en localStorage.
   ============================================================ */
import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';
import {
  CAMPOS_EQUIPO,
  CAMPOS_POR_DEFECTO_EQUIPOS,
  descargarEquiposExcelPersonalizado,
  descargarEquiposPdfPersonalizado,
  orientacionFinal,
  type ContextoEquipoExportar,
  type OrientacionHoja,
} from './exportarEquipos';

const CLAVE_LOCAL_CAMPOS = 'maquinaria.exportar-equipos.campos';
const CLAVE_LOCAL_AGRUPAR = 'maquinaria.exportar-equipos.agrupar';

function seleccionGuardada(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LOCAL_CAMPOS) ?? 'null');
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length) return v;
  } catch { /* usa valor por defecto */ }
  return CAMPOS_POR_DEFECTO_EQUIPOS;
}

function agruparGuardado(): boolean {
  try {
    const v = localStorage.getItem(CLAVE_LOCAL_AGRUPAR);
    if (v !== null) return v === 'true';
  } catch { /* usa valor por defecto */ }
  return true; // Por defecto agrupado por empresa como solicitó el usuario
}

function guardarPreferencias(claves: string[], agrupar: boolean) {
  try {
    localStorage.setItem(CLAVE_LOCAL_CAMPOS, JSON.stringify(claves));
    localStorage.setItem(CLAVE_LOCAL_AGRUPAR, String(agrupar));
  } catch { /* no crítico */ }
}

interface Props {
  equipos: MaquinariaEquipo[];
  total: number;
  contextoMap?: Map<string, ContextoEquipoExportar>;
  onClose: () => void;
  formatoInicial?: 'pdf' | 'xlsx' | null;
}

export function ExportarEquiposModal({ equipos, total, contextoMap, onClose }: Props) {
  const [marcados, setMarcados] = useState<string[]>(seleccionGuardada);
  const [agrupar, setAgrupar] = useState<boolean>(agruparGuardado);
  const [ocupado, setOcupado] = useState<'xlsx' | 'pdf' | null>(null);
  const [orientacion, setOrientacion] = useState<OrientacionHoja>('auto');

  const alternar = (clave: string) =>
    setMarcados((m) => (m.includes(clave) ? m.filter((x) => x !== clave) : [...m, clave]));

  async function descargar(formato: 'xlsx' | 'pdf') {
    setOcupado(formato);
    try {
      guardarPreferencias(marcados, agrupar);
      if (formato === 'xlsx') {
        await descargarEquiposExcelPersonalizado(equipos, marcados, agrupar, contextoMap, orientacion);
      } else {
        await descargarEquiposPdfPersonalizado(equipos, marcados, agrupar, contextoMap, orientacion);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el archivo', 'error');
    } finally {
      setOcupado(null);
    }
  }

  const nada = marcados.length === 0;

  return (
    <Modal
      title="⬇ Descargar datos de maquinaria y vehículos"
      size="md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={!!ocupado}>Cerrar</button>
          <button
            className="btn btn-ghost"
            onClick={() => void descargar('xlsx')}
            disabled={nada || !!ocupado || !equipos.length}
          >
            {ocupado === 'xlsx' ? 'Generando…' : '📊 Excel'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void descargar('pdf')}
            disabled={nada || !!ocupado || !equipos.length}
          >
            {ocupado === 'pdf' ? 'Generando…' : '📄 PDF (imprimir)'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: '.84rem', marginTop: 0 }}>
        Marca los datos que quieres que salgan. Se descargan <strong>{equipos.length}</strong> equipo(s)
        {equipos.length !== total ? <> de {total}, los que deja ver el filtro aplicado</> : null}.
      </p>

      {/* Opción destacada: Agrupar por Empresa / Propietario */}
      <div style={{
        background: 'var(--surface-2, #182230)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '.6rem .75rem',
        marginBottom: '.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <label htmlFor="exp-agrupar-empresa" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', fontSize: '.88rem', fontWeight: 600 }}>
          <input
            type="checkbox"
            id="exp-agrupar-empresa"
            checked={agrupar}
            onChange={(e) => setAgrupar(e.target.checked)}
          />
          🏢 Agrupar equipos por empresa / propietario
        </label>
        <span className="muted" style={{ fontSize: '.76rem' }}>
          {agrupar ? 'Subtotales y secciones separadas' : 'Listado corrido'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setMarcados(CAMPOS_POR_DEFECTO_EQUIPOS)}
        >
          Solo principales
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setMarcados(CAMPOS_EQUIPO.map((c) => c.clave))}
        >
          Marcar todos
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setMarcados([])}
        >
          Ninguno
        </button>
      </div>

      {/* Grid de casillas de verificación */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '.3rem .8rem' }}>
        {CAMPOS_EQUIPO.map((c) => (
          <label key={c.clave} style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.86rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              id={`exp-equipo-${c.clave}`}
              checked={marcados.includes(c.clave)}
              onChange={() => alternar(c.clave)}
            />
            {c.etiqueta}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginTop: '.9rem' }}>
        <label htmlFor="exp-equipo-orientacion" style={{ fontSize: '.86rem', fontWeight: 600 }}>Hoja</label>
        <select
          id="exp-equipo-orientacion"
          className="input"
          style={{ width: 'auto' }}
          value={orientacion}
          onChange={(e) => setOrientacion(e.target.value as OrientacionHoja)}
        >
          <option value="auto">Automática (según las columnas)</option>
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select>
        <small className="muted">
          Sale en {orientacionFinal(marcados, orientacion) === 'portrait' ? 'vertical' : 'horizontal'}. Al imprimir, elige la misma orientación.
        </small>
      </div>

      {nada && <p className="muted" style={{ fontSize: '.78rem', color: 'var(--warning, #f59e0b)' }}>Marca al menos un dato.</p>}
    </Modal>
  );
}
export default ExportarEquiposModal;
