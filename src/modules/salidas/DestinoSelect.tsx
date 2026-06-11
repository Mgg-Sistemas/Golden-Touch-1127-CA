import { useEffect, useState } from 'react';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { listDirectorioUsuarios, type PersonaDirectorio } from './salidas.repository';

type Modo = 'almacen' | 'persona';

/**
 * Selector de destino ("a quién va dirigido") con switch:
 *  - Almacén  → desplegable de almacenes registrados (+ Consumo Interno).
 *  - Persona  → desplegable de usuarios registrados (cargo · nombre apellido).
 */
export function DestinoSelect({
  value,
  onChange,
  almacenes,
  label = 'A quién va dirigido',
}: {
  value: string;
  onChange: (v: string) => void;
  almacenes: string[];
  label?: string;
}) {
  const ESPECIALES = ['Consumo Interno'];
  const opcionesAlmacen = [...ESPECIALES, ...almacenes.filter((a) => !ESPECIALES.includes(a))];

  const [modo, setModo] = useState<Modo>('almacen');
  const [personas, setPersonas] = useState<PersonaDirectorio[]>([]);
  const [cargando, setCargando] = useState(false);

  // Carga el directorio de personas la primera vez que se entra a ese modo.
  useEffect(() => {
    if (modo !== 'persona' || personas.length || cargando) return;
    setCargando(true);
    listDirectorioUsuarios()
      .then(setPersonas)
      .catch(() => setPersonas([]))
      .finally(() => setCargando(false));
  }, [modo, personas.length, cargando]);

  function cambiarModo(next: Modo) {
    setModo(next);
    onChange(''); // limpiar la selección al cambiar de tipo de destino
  }

  function etiquetaPersona(p: PersonaDirectorio): string {
    const nombre = `${p.nombre} ${p.apellido}`.trim();
    return p.cargo ? `${nombre} · ${p.cargo}` : nombre;
  }

  return (
    <div className="form-row">
      <label>{label}</label>
      <div className="view-toggle" role="tablist" aria-label="Tipo de destino" style={{ marginBottom: '.4rem', marginLeft: 0 }}>
        <button type="button" className={modo === 'almacen' ? 'active' : ''} onClick={() => cambiarModo('almacen')}>▣ Almacén</button>
        <button type="button" className={modo === 'persona' ? 'active' : ''} onClick={() => cambiarModo('persona')}>👤 Persona</button>
      </div>

      {modo === 'almacen' ? (
        <select className="select" value={opcionesAlmacen.includes(value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— elegí el almacén —</option>
          {opcionesAlmacen.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      ) : (
        <SearchSelect value={value} onChange={onChange} disabled={cargando}
          placeholder={cargando ? 'Cargando…' : '🔍 Buscar persona…'}
          options={personas.map((p) => { const l = etiquetaPersona(p); return { value: l, label: l }; })} />
      )}
    </div>
  );
}
