import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { todasLasFilas } from '@/shared/lib/todasLasFilas';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import { mensajeError } from '@/shared/lib/errores';
import { Modal } from '@/shared/ui/Modal';
import { PaginasCompras, POR_PAGINA_COMPRAS } from './ComprasListaCompacta';

interface Excedente {
  id: string; codigo: string; proveedor: string; fecha: string; nota: string | null;
  items: { sku: string; nombre: string; cantidad: number; cantidad_recibida: number; excedente: number; unidad: string }[];
}
export function ExcedentesRecepcion() {
  const [open, setOpen] = useState(false);
  const [filas, setFilas] = useState<Excedente[]>([]);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(1);
  const cargar = useCallback(async () => {
    try {
      const datos = await todasLasFilas<Excedente>((a, b) => supabase.rpc('compras_excedentes_recepcion').order('fecha', { ascending: false }).order('id').range(a, b));
      setFilas(datos); setError('');
    } catch (e) { setError(mensajeError(e, 'No se pudieron consultar los excedentes')); }
  }, []);
  useEffect(() => { void cargar(); const t = setInterval(() => { if (!document.hidden) void cargar(); }, 30000); return () => clearInterval(t); }, [cargar]);
  useRealtime(['ordenes'], () => { void cargar(); });
  const visibles = filas.filter(f => [f.codigo, f.proveedor, f.nota, ...f.items.map(i => i.sku + ' ' + i.nombre)].join(' ').toLocaleLowerCase().includes(buscar.trim().toLocaleLowerCase()));
  const actual = Math.min(pagina, Math.max(1, Math.ceil(visibles.length / POR_PAGINA_COMPRAS)));
  return <>
    <button className={'btn ' + (filas.length ? 'btn-primary' : 'btn-ghost')} onClick={() => { setOpen(true); void cargar(); }}>📦 Excedentes ({filas.length})</button>
    {open && <Modal title="📦 Excedentes entregados por proveedores" onClose={() => setOpen(false)}>
      <div className="compras-panel"><p className="muted">Diferencias registradas por Almacén para revisión de Compras. No modifican automáticamente el importe comprado.</p>
        <div className="compras-barra"><input className="input" aria-label="Buscar excedentes" placeholder="OC, proveedor o producto…" value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(1); }} /><button className="btn btn-ghost" onClick={() => void cargar()}>Actualizar</button></div>
        {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        {visibles.slice((actual - 1) * POR_PAGINA_COMPRAS, actual * POR_PAGINA_COMPRAS).map(f => <details className="compras-fila" key={f.id}><summary><strong>{f.codigo}</strong><span>{f.proveedor}</span><span className="badge warning">{f.items.length} productos con excedente</span></summary><div className="compras-detalle"><p>📅 Recibido: {dateTime(f.fecha)}</p><p>👷 Motivo del almacenista: {f.nota || 'Sin observación registrada'}</p><table className="compras-productos"><thead><tr><th>Producto</th><th>Pedido</th><th>Recibido</th><th>De más</th></tr></thead><tbody>{f.items.map((i, n) => <tr key={n}><td>{i.nombre}<small>{i.sku}</small></td><td>{i.cantidad}</td><td>{i.cantidad_recibida}</td><td><strong>+{i.excedente} {i.unidad}</strong></td></tr>)}</tbody></table></div></details>)}
        {!visibles.length && !error && <p className="compras-vacio">No hay excedentes que coincidan con estos filtros.</p>}
        <PaginasCompras total={visibles.length} pagina={actual} onChange={setPagina} />
      </div>
    </Modal>}
  </>;
}
