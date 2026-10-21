/* ============================================================
   Golden Touch · Proveedores · Diálogo «Descargar datos de proveedores»
   Casillas para elegir qué datos salen, orientación de la hoja y
   Excel o PDF (con vista previa para imprimir).
   Salen los proveedores que se están viendo (con los filtros aplicados).
   ============================================================ */
import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { Proveedor } from '@/shared/lib/types';
import {
  CAMPOS_PROVEEDOR,
  CAMPOS_POR_DEFECTO,
  descargarProveedoresExcel,
  descargarProveedoresPdf,
  orientacionFinal,
  type OrientacionHoja,
} from './proveedoresReporte';

const CLAVE_LOCAL = 'proveedores.exportar-proveedores.campos';

/** La última selección se recuerda en este navegador (si se puede). */
function seleccionGuardada(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LOCAL) ?? 'null');
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length) return v;
  } catch { /* sin almacenamiento: se usa la de por defecto */ }
  return CAMPOS_POR_DEFECTO;
}

function guardarSeleccion(claves: string[]) {
  try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(claves)); } catch { /* no es crítico */ }
}

interface Props {
  proveedores: Proveedor[];
  /** Cuántos hay en total en el módulo (para indicar si hay filtros activos). */
  total: number;
  filtro?: string;
  onClose: () => void;
}

export function ExportarProveedoresModal({ proveedores, total, filtro, onClose }: Props) {
  const [marcados, setMarcados] = useState<string[]>(seleccionGuardada);
  const [ocupado, setOcupado] = useState<'xlsx' | 'pdf' | null>(null);
  const [orientacion, setOrientacion] = useState<OrientacionHoja>('auto');

  const alternar = (clave: string) =>
    setMarcados((m) => (m.includes(clave) ? m.filter((x) => x !== clave) : [...m, clave]));

  async function descargar(formato: 'xlsx' | 'pdf') {
    setOcupado(formato);
    try {
      guardarSeleccion(marcados);
      const op = { filtro, claves: marcados, orientacion };
      if (formato === 'xlsx') await descargarProveedoresExcel(proveedores, op);
      else await descargarProveedoresPdf(proveedores, op);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el archivo', 'error');
    } finally {
      setOcupado(null);
    }
  }

  const nada = marcados.length === 0;
  const orientacionReal = orientacionFinal(marcados, orientacion);

  return (
    <Modal
      title="⬇ Descargar datos de proveedores"
      size="md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={!!ocupado}>
            Cerrar
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => void descargar('xlsx')}
            disabled={nada || !!ocupado || !proveedores.length}
          >
            {ocupado === 'xlsx' ? 'Generando…' : '📊 Excel'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void descargar('pdf')}
            disabled={nada || !!ocupado || !proveedores.length}
          >
            {ocupado === 'pdf' ? 'Generando…' : '📄 PDF (imprimir)'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: '.84rem', marginTop: 0 }}>
        Marca los datos que quieres que salgan. Se descargan <strong>{proveedores.length}</strong> proveedor(es)
        {proveedores.length !== total ? <> de {total}, los que deja ver el filtro aplicado</> : null}, ordenados por razón social.
      </p>

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setMarcados(['rif', 'razon_social'])}
        >
          Solo razón y RIF
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setMarcados(CAMPOS_PROVEEDOR.map((c) => c.clave))}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '.3rem .8rem' }}>
        {CAMPOS_PROVEEDOR.map((c) => (
          <label key={c.clave} style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.86rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              id={`exp-prov-${c.clave}`}
              checked={marcados.includes(c.clave)}
              onChange={() => alternar(c.clave)}
            />
            {c.etiqueta}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginTop: '.9rem' }}>
        <label htmlFor="exp-prov-orientacion" style={{ fontSize: '.86rem', fontWeight: 600 }}>Hoja</label>
        <select
          id="exp-prov-orientacion"
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
          Sale en {orientacionReal === 'portrait' ? 'vertical' : 'horizontal'}. Al imprimir, elige la misma orientación.
        </small>
      </div>

      {nada && (
        <p className="muted" style={{ fontSize: '.78rem', color: 'var(--warning)', marginTop: '.6rem' }}>
          Marca al menos un dato.
        </p>
      )}
    </Modal>
  );
}
