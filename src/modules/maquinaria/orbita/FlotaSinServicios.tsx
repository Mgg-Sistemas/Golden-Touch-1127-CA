/* ============================================================
   Golden Touch · Control de Maquinaria · la Órbita · la flota
   La de la maqueta, SIN SERVICIOS: activos, estado, horómetro, operador
   y ubicación, segmentada por lo que se eligió arriba. Con tokens.
   La categoría de cada equipo se asigna aquí, en su chip (D22, maqueta:
   queda en este navegador).
   ============================================================ */
import { forwardRef, useMemo, useState } from 'react';
import { num } from '@/shared/lib/format';
import { norm } from '@/shared/lib/texto';
import { BUCKETS_FLOTA, ESTADOS_EQUIPO } from '../flota';
import {
  CATEGORIAS, ID_GENERAL, ID_OTROS, type CategoriaEquipo, type CategoriaId, type ConteoEstados, type FilaFlota, type PropietarioOrbita,
} from './orbitaDatos';
import type { VistaFlota } from './orbitaPreferencias';
import { BarraMezcla } from './TarjetaPropietario';

export function ChipCategoria({ valor, onCambiar, nombre }: {
  valor: CategoriaId;
  onCambiar: (c: CategoriaEquipo | 'por_asignar') => void;
  nombre: string;
}) {
  return (
    <label className={`orb-chip-cat orb-cat-${valor}`} title="Categoría del equipo (maqueta: queda en este navegador)">
      <select value={valor} onChange={(e) => onCambiar(e.target.value as CategoriaEquipo | 'por_asignar')} aria-label={`Categoría de ${nombre}`}>
        {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.label}</option>)}
      </select>
    </label>
  );
}

const Cifra = ({ n, label, tono }: { n: number; label: string; tono?: string }) => (
  <div className={`orb-cifra${tono ? ` tono-${tono}` : ''}`}><strong>{n}</strong><span>{label}</span></div>
);

export const FlotaSinServicios = forwardRef<HTMLElement, {
  elegido: string;
  /** El conteo de lo elegido (GENERAL o el propietario). */
  conteo: ConteoEstados;
  propietario?: PropietarioOrbita;
  flota: readonly FilaFlota[];
  vista: VistaFlota;
  onVista: (v: VistaFlota) => void;
  onVerGeneral: () => void;
  onFicha: (id: string) => void;
  onCategoria: (equipoId: string, c: CategoriaEquipo | 'por_asignar') => void;
}>(function FlotaSinServicios({ elegido, conteo, propietario, flota, vista, onVista, onVerGeneral, onFicha, onCategoria }, ref) {
  const [busqueda, setBusqueda] = useState('');
  const [bucket, setBucket] = useState('');
  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState('');

  const delElegido = useMemo(() => (elegido === ID_GENERAL ? flota : flota.filter((f) => f.tarjetaId === elegido)), [flota, elegido]);
  const tipos = useMemo(() => [...new Set(delElegido.map((f) => f.tipo))].sort((a, b) => a.localeCompare(b, 'es')), [delElegido]);
  const filas = useMemo(() => {
    const q = norm(busqueda);
    return delElegido.filter((f) =>
      (!bucket || ESTADOS_EQUIPO[f.estado].bucket === bucket)
      && (!tipo || f.tipo === tipo)
      && (!categoria || f.categoria === categoria)
      && (!q || norm(`${f.equipo} ${f.marca ?? ''} ${f.modelo ?? ''} ${f.serial ?? ''} ${f.placa ?? ''} ${f.operador ?? ''} ${f.ubicacion ?? ''}`).includes(q)));
  }, [delElegido, busqueda, bucket, tipo, categoria]);

  const titulo = elegido === ID_GENERAL ? 'GENERAL · Flota consolidada' : propietario?.nombre ?? '';
  const horas = (h: number | null) => (h == null ? 'sin lectura' : `${num(h)} h`);

  return (
    <section ref={ref} className="orb-flota" aria-label="Flota">
      <header className="orb-flota-cab">
        <div>
          <h2><span aria-hidden="true">{elegido === ID_GENERAL ? '👑' : elegido === ID_OTROS ? '🗂️' : '🏢'}</span> {titulo}</h2>
          {propietario && <BarraMezcla p={propietario} />}
          {propietario?.agrupa && <p className="orb-flota-sub">{propietario.agrupa.map((a) => `${a.nombre} (${a.cantidad})`).join(' · ')}</p>}
        </div>
        <div className="orb-cifras">
          <Cifra n={conteo.total} label="Total" />
          <Cifra n={conteo.operativos} label="Operativos" tono="success" />
          <Cifra n={conteo.enTaller} label="En taller" tono="warning" />
          <Cifra n={conteo.averiados} label="Averiados" tono="danger" />
          <Cifra n={conteo.enEspera + conteo.retirados} label="Espera / retirados" />
        </div>
      </header>

      <div className="orb-flota-barra">
        <input className="input orb-buscar" placeholder="🔍 Buscar por equipo, modelo, serial, operador o ubicación…"
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <select className="select" value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {BUCKETS_FLOTA.map((b) => <option key={b.id} value={b.id}>{b.icon} {b.label}</option>)}
        </select>
        <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.label}</option>)}
        </select>
        <div className="view-toggle" role="tablist" aria-label="Vista de la flota">
          <button type="button" role="tab" aria-selected={vista === 'cards'} className={vista === 'cards' ? 'active' : ''} onClick={() => onVista('cards')}>▦ Cuadrícula</button>
          <button type="button" role="tab" aria-selected={vista === 'tabla'} className={vista === 'tabla' ? 'active' : ''} onClick={() => onVista('tabla')}>☰ Tabla</button>
        </div>
      </div>

      <p className="orb-nota">
        🛡️ <strong>Vista pura de control de maquinaria:</strong> {filas.length} equipo(s). Activos, horómetros, operadores y ubicación; sin servicios ni órdenes.
        {elegido !== ID_GENERAL && <button type="button" className="btn btn-ghost btn-sm" onClick={onVerGeneral}>👑 Ver toda la flota</button>}
      </p>

      {!filas.length ? (
        <div className="orb-vacio"><span aria-hidden="true">🚜</span><strong>No se encontraron máquinas</strong><span>Ajusta la búsqueda o los filtros.</span></div>
      ) : vista === 'cards' ? (
        <div className="orb-grilla">
          {filas.map((f) => {
            const e = ESTADOS_EQUIPO[f.estado];
            return (
              <article key={f.id} className="orb-equipo">
                <header>
                  <div>
                    <span className="orb-equipo-tipo">{f.tipo}</span>
                    <strong className="orb-equipo-nom">{f.equipo}</strong>
                  </div>
                  <span className={`orb-estado tone-${e.tono}`}>{e.icon} {e.label}</span>
                </header>
                <ChipCategoria valor={f.categoria} nombre={f.equipo} onCambiar={(c) => onCategoria(f.id, c)} />
                <dl className="orb-equipo-datos">
                  <div><dt>Marca / modelo</dt><dd>{[f.marca, f.modelo].filter(Boolean).join(' · ') || '—'}{f.anio ? ` (${f.anio})` : ''}</dd></div>
                  <div><dt>Propietario</dt><dd className="orb-dueno">{f.propietarioNombre}{f.traspasado && <em> · traspaso de maqueta</em>}</dd></div>
                  <div><dt>⏱ Horómetro</dt><dd className="orb-mono">{horas(f.horometro)}</dd></div>
                  <div><dt>⛽ Consumo est.</dt><dd className="orb-mono">{f.consumoPorHora != null ? `${f.consumoPorHora} L/h` : '—'}</dd></div>
                  <div className="ancho"><dt>👤 Operador</dt><dd>{f.operador ?? 'Sin asignar'}</dd></div>
                  <div className="ancho"><dt>📍 Ubicación</dt><dd>{f.ubicacion ?? 'Sin ubicación'}</dd></div>
                </dl>
                <button type="button" className="btn btn-ghost btn-sm orb-ver-ficha" onClick={() => onFicha(f.id)}>🔍 Ver ficha técnica</button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap orb-tabla">
          <table className="table">
            <thead>
              <tr><th>Equipo</th><th>Tipo</th><th>Categoría</th><th>Propietario</th><th>Marca / modelo</th><th>Serial / placa</th><th>Horómetro</th><th>Operador</th><th>Ubicación</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const e = ESTADOS_EQUIPO[f.estado];
                return (
                  <tr key={f.id}>
                    <td><strong>{f.equipo}</strong></td>
                    <td>{f.tipo}</td>
                    <td><ChipCategoria valor={f.categoria} nombre={f.equipo} onCambiar={(c) => onCategoria(f.id, c)} /></td>
                    <td>{f.propietarioNombre}</td>
                    <td>{[f.marca, f.modelo].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="orb-mono">{[f.serial, f.placa].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="orb-mono">{horas(f.horometro)}</td>
                    <td>{f.operador ?? '—'}</td>
                    <td>{f.ubicacion ?? '—'}</td>
                    <td><span className={`orb-estado tone-${e.tono}`}>{e.icon} {e.label}</span></td>
                    <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => onFicha(f.id)}>Ficha</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});
