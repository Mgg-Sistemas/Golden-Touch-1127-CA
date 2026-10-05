/* ============================================================
   Golden Touch · Cocina · Gestionar las categorías que entran a Cocina
   Cada categoría del inventario: no entra, Comida (la descuenta solo
   Distribución de comidas; una salida a COCINA es vale de entrega) o
   Limpieza (entra al catálogo, pero sale por Salidas y sí descuenta).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import { norm } from '@/shared/lib/texto';
import { getCategorias, listProductos } from '@/modules/inventario/inventario.repository';
import type { TipoCategoriaCocina } from './categoriasCocina';
import { cargarCategoriasCocina, guardarCategoriaCocina, type CategoriaCocina } from './categoriasCocina.repository';

interface Props {
  canWrite: boolean;
  actor: string;
  onClose: () => void;
  /** Se llama tras cada cambio para recargar el catálogo de Cocina. */
  onCambio: () => void;
}

const OPCIONES: { valor: TipoCategoriaCocina | ''; texto: string }[] = [
  { valor: '', texto: 'No entra' },
  { valor: 'comida', texto: '🍽 Comida' },
  { valor: 'limpieza', texto: '🧽 Limpieza' },
];

export function CategoriasCocinaModal({ canWrite, actor, onClose, onCambio }: Props) {
  const [config, setConfig] = useState<CategoriaCocina[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [conteo, setConteo] = useState<Map<string, number>>(new Map());
  const [guardando, setGuardando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(() => {
    void cargarCategoriasCocina().then(setConfig).catch(() => setConfig([]));
  }, []);
  useEffect(() => {
    cargar();
    // Las categorías del Inventario General con cuántos productos activos tiene cada una.
    listProductos().then(async (ps) => {
      const activos = ps.filter((p) => p.estado === 'activo');
      const m = new Map<string, number>();
      activos.forEach((p) => { const k = norm(p.categoria ?? ''); if (k) m.set(k, (m.get(k) ?? 0) + 1); });
      setConteo(m);
      setCategorias(await getCategorias(activos));
    }).catch(() => setCategorias([]));
  }, [cargar]);
  useRealtime(['cocina_categorias'], cargar);

  const tipoDe = useMemo(() => new Map(config.map((c) => [norm(c.categoria), c])), [config]);
  // Las configuradas que ya no existen en el inventario también se muestran (para poder quitarlas).
  const filas = useMemo(() => {
    const todas = new Map<string, string>();
    categorias.forEach((c) => todas.set(norm(c), c));
    config.forEach((c) => { if (!todas.has(norm(c.categoria))) todas.set(norm(c.categoria), c.categoria); });
    const q = norm(filtro);
    return [...todas.entries()]
      .filter(([k]) => !q || k.includes(q))
      .sort(([ka], [kb]) => {
        const a = tipoDe.has(ka) ? 0 : 1; const b = tipoDe.has(kb) ? 0 : 1;
        return a - b || ka.localeCompare(kb, 'es');
      });
  }, [categorias, config, filtro, tipoDe]);

  async function cambiar(clave: string, nombre: string, valor: TipoCategoriaCocina | '') {
    // Si ya estaba configurada se usa su nombre guardado (la clave de la tabla).
    const guardada = tipoDe.get(clave)?.categoria ?? nombre;
    setGuardando(clave);
    try {
      await guardarCategoriaCocina(guardada, valor || null, actor);
      cargar();
      onCambio();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setGuardando(null);
    }
  }

  const nComida = config.filter((c) => c.tipo === 'comida').length;
  const nLimpieza = config.filter((c) => c.tipo === 'limpieza').length;

  return (
    <Modal title="⚙ Categorías de cocina" size="md" onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}>
      <p className="muted" style={{ fontSize: '.84rem', marginTop: 0 }}>
        Elige qué categorías del inventario entran a Cocina. <strong>🍽 Comida</strong>: la descuenta solo Distribución de comidas,
        y una salida de esos productos a COCINA es un vale de entrega (no toca el stock). <strong>🧽 Limpieza</strong>: aparece en
        Cocina, pero sale por Salidas y sí descuenta. Hoy: <strong>{nComida}</strong> de comida y <strong>{nLimpieza}</strong> de limpieza.
      </p>
      <input className="input" placeholder="🔍 Buscar categoría…" value={filtro} onChange={(e) => setFiltro(e.target.value)}
        style={{ marginBottom: '.6rem' }} aria-label="Buscar categoría" />
      <div className="table-wrap" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.84rem' }}>
          <thead><tr><th>Categoría</th><th style={{ textAlign: 'right' }}>Productos</th><th>En Cocina</th></tr></thead>
          <tbody>
            {filas.map(([clave, nombre]) => {
              const actual = tipoDe.get(clave)?.tipo ?? '';
              return (
                <tr key={clave}>
                  <td>{nombre}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{conteo.get(clave) ?? 0}</td>
                  <td>
                    <select className="select" value={actual} disabled={!canWrite || guardando === clave}
                      aria-label={`${nombre} en Cocina`}
                      onChange={(e) => void cambiar(clave, nombre, e.target.value as TipoCategoriaCocina | '')}>
                      {OPCIONES.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
            {!filas.length && <tr><td colSpan={3} className="muted">Sin categorías.</td></tr>}
          </tbody>
        </table>
      </div>
      {!canWrite && <p className="muted" style={{ fontSize: '.78rem' }}>Solo lectura: necesitas permiso de escritura en Cocina para cambiarlas.</p>}
    </Modal>
  );
}
