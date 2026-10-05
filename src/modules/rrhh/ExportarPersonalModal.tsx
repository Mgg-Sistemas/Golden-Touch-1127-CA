/* ============================================================
   Golden Touch · RRHH · Diálogo «Descargar datos del personal»
   Casillas para elegir qué datos salen, y Excel o PDF (con vista previa
   para imprimir). Salen las personas que se están viendo (con los filtros).
   ============================================================ */
import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { Personal } from '@/shared/lib/types';
import { CAMPOS_PERSONAL, CAMPOS_POR_DEFECTO, descargarPersonalExcel, descargarPersonalPdf } from './exportarPersonal';

const CLAVE_LOCAL = 'rrhh.exportar-personal.campos';

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
  personas: Personal[];
  /** Cuántas hay en total (para decir si hay filtros recortando la lista). */
  total: number;
  titulo: string;
  onClose: () => void;
}

export function ExportarPersonalModal({ personas, total, titulo, onClose }: Props) {
  const [marcados, setMarcados] = useState<string[]>(seleccionGuardada);
  const [ocupado, setOcupado] = useState<'xlsx' | 'pdf' | null>(null);

  const alternar = (clave: string) =>
    setMarcados((m) => (m.includes(clave) ? m.filter((x) => x !== clave) : [...m, clave]));

  async function descargar(formato: 'xlsx' | 'pdf') {
    setOcupado(formato);
    try {
      guardarSeleccion(marcados);
      if (formato === 'xlsx') await descargarPersonalExcel(personas, marcados, titulo);
      else await descargarPersonalPdf(personas, marcados, titulo);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el archivo', 'error');
    } finally {
      setOcupado(null);
    }
  }

  const nada = marcados.length === 0;
  return (
    <Modal title="⬇ Descargar datos del personal" size="md" onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={!!ocupado}>Cerrar</button>
          <button className="btn btn-ghost" onClick={() => void descargar('xlsx')} disabled={nada || !!ocupado || !personas.length}>
            {ocupado === 'xlsx' ? 'Generando…' : '📊 Excel'}
          </button>
          <button className="btn btn-primary" onClick={() => void descargar('pdf')} disabled={nada || !!ocupado || !personas.length}>
            {ocupado === 'pdf' ? 'Generando…' : '📄 PDF (imprimir)'}
          </button>
        </>
      }>
      <p className="muted" style={{ fontSize: '.84rem', marginTop: 0 }}>
        Marca los datos que quieres que salgan. Se descargan <strong>{personas.length}</strong> persona(s)
        {personas.length !== total ? <> de {total}, las que deja ver el filtro aplicado</> : null}, ordenadas por apellido.
      </p>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMarcados(['nombre', 'apellido', 'cedula'])}>Solo nombre y cédula</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMarcados(CAMPOS_PERSONAL.map((c) => c.clave))}>Marcar todos</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMarcados([])}>Ninguno</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '.3rem .8rem' }}>
        {CAMPOS_PERSONAL.map((c) => (
          <label key={c.clave} style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.86rem', cursor: 'pointer' }}>
            <input type="checkbox" id={`exp-personal-${c.clave}`} checked={marcados.includes(c.clave)} onChange={() => alternar(c.clave)} />
            {c.etiqueta}
          </label>
        ))}
      </div>
      {nada && <p className="muted" style={{ fontSize: '.78rem', color: 'var(--warning)' }}>Marca al menos un dato.</p>}
    </Modal>
  );
}
