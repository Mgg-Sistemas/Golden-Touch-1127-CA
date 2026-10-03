/* ============================================================
   Golden Touch · Geodesta · apartado de tipo Cuadro

   Tabla cuyas columnas define el usuario (nombre + tipo texto/imagen), con
   filas ilimitadas. Componente controlado: no guarda copia de `apartado`,
   cada cambio sube por `onCambio` con un apartado nuevo armado con la lógica
   pura de `informeOrden` / `informeModelo`.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { ApartadoCuadro, FilaCuadro, TipoColumna } from '@/shared/lib/types';
import { filaVaciaDe } from './informeModelo';
import {
  MAX_COLUMNAS_COMODAS, agregarColumna, cambiarTipoColumna, celdasConDatoEnColumna, mover, quitarColumna,
} from './informeOrden';
import { ACEPTA_IMAGEN, listImagenes, subirImagen, urlImagen } from './informeImagenes.repository';

interface ApartadoCuadroEditorProps {
  apartado: ApartadoCuadro;
  /** null hasta que el informe se guarda por primera vez: sin esto no se suben imágenes. */
  informeId: string | null;
  actor: string;
  onCambio: (a: ApartadoCuadro) => void;
}

type Arrastre = { tipo: 'columna' | 'fila'; desde: number };
type Pendiente =
  | { tipo: 'columna' | 'fila'; id: string }
  | { tipo: 'tipo'; id: string; nuevo: TipoColumna };

const TITULO_SIN_INFORME = 'Guardá el informe primero para poder subir imágenes';

/** Textarea que crece solo con el contenido. */
function AreaCrece({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref} className="input" rows={1} value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ resize: 'none', overflow: 'hidden', width: '100%' }}
    />
  );
}

const filaTieneDato = (f: FilaCuadro) => Object.values(f.celdas).some((v) => (v ?? '').trim() !== '');

export function ApartadoCuadroEditor({ apartado, informeId, actor, onCambio }: ApartadoCuadroEditorProps) {
  // Siempre la última versión, para que una subida que termina tarde no pise cambios posteriores.
  const ultimo = useRef(apartado);
  useEffect(() => { ultimo.current = apartado; }, [apartado]);

  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  // Solo UI efímera: miniaturas ya firmadas (id de imagen -> URL), para no firmar en cada render.
  const [urls, setUrls] = useState<Record<string, string>>({});
  const pedidas = useRef<Set<string>>(new Set());
  // Ids que no existen en el informe (borradas): se muestran como no disponibles, no como cargando.
  const [noDisponibles, setNoDisponibles] = useState<Set<string>>(new Set());

  const clave = apartado.columnas
    .filter((c) => c.tipo === 'imagen')
    .flatMap((c) => apartado.filas.map((f) => f.celdas[c.id] ?? ''))
    .filter((v) => v !== '')
    .join('|');

  useEffect(() => {
    if (!informeId) return;
    const faltan = clave.split('|').filter((id) => id && !pedidas.current.has(id));
    if (faltan.length === 0) return;
    faltan.forEach((id) => pedidas.current.add(id));
    let vivo = true;
    const resueltas = new Set<string>();
    const cache = pedidas.current;
    (async () => {
      try {
        const todas = await listImagenes(informeId);
        const nuevas: Record<string, string> = {};
        const sinImagen: string[] = [];
        for (const id of faltan) {
          const img = todas.find((i) => i.id === id);
          if (img) nuevas[id] = await urlImagen(img.path);
          else sinImagen.push(id);
          resueltas.add(id);
        }
        // Se aplica aunque el efecto ya se haya limpiado: esos ids quedaron como
        // resueltos y no se volverían a pedir. (Actualizar estado tras desmontar es inocuo.)
        setUrls((p) => ({ ...p, ...nuevas }));
        if (sinImagen.length > 0) setNoDisponibles((p) => new Set([...p, ...sinImagen]));
      } catch {
        if (vivo) toast('No se pudieron cargar algunas miniaturas.', 'error');
      }
    })();
    return () => {
      vivo = false;
      // Lo que esta pasada no alcanzó a resolver se vuelve a pedir en la próxima.
      faltan.forEach((id) => { if (!resueltas.has(id)) cache.delete(id); });
    };
  }, [clave, informeId]);

  const { columnas, filas } = apartado;

  const nombreCol = (id: string) => {
    const i = columnas.findIndex((c) => c.id === id);
    return columnas[i]?.nombre.trim() || `columna ${i + 1}`;
  };

  const cambiarColumna = (id: string, parche: { nombre?: string }) =>
    onCambio({ ...apartado, columnas: columnas.map((c) => (c.id === id ? { ...c, ...parche } : c)) });

  const cambiarCelda = (filaId: string, colId: string, valor: string) =>
    onCambio({
      ...apartado,
      filas: filas.map((f) => (f.id === filaId ? { ...f, celdas: { ...f.celdas, [colId]: valor } } : f)),
    });

  const moverColumna = (desde: number, hacia: number) =>
    onCambio({ ...apartado, columnas: mover(columnas, desde, hacia) });
  const moverFila = (desde: number, hacia: number) =>
    onCambio({ ...apartado, filas: mover(filas, desde, hacia) });

  const pedirCambiarTipo = (id: string, nuevo: TipoColumna) => {
    if (celdasConDatoEnColumna(apartado, id) > 0) setPendiente({ tipo: 'tipo', id, nuevo });
    else onCambio(cambiarTipoColumna(apartado, id, nuevo));
  };
  const pedirQuitarColumna = (id: string) => {
    if (celdasConDatoEnColumna(apartado, id) > 0) setPendiente({ tipo: 'columna', id });
    else onCambio(quitarColumna(apartado, id));
  };
  const quitarFila = (id: string) => onCambio({ ...apartado, filas: filas.filter((f) => f.id !== id) });
  const pedirQuitarFila = (f: FilaCuadro) => {
    if (filaTieneDato(f)) setPendiente({ tipo: 'fila', id: f.id });
    else quitarFila(f.id);
  };

  async function subir(filaId: string, colId: string, file: File) {
    if (!informeId) return;
    setSubiendo(`${filaId}:${colId}`);
    try {
      const img = await subirImagen(informeId, file, actor);
      const url = await urlImagen(img.path).catch(() => '');
      pedidas.current.add(img.id);
      if (url) setUrls((p) => ({ ...p, [img.id]: url }));
      const a = ultimo.current;
      onCambio({
        ...a,
        filas: a.filas.map((f) => (f.id === filaId ? { ...f, celdas: { ...f.celdas, [colId]: img.id } } : f)),
      });
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'No se pudo subir la imagen.', 'error');
    } finally {
      setSubiendo(null);
    }
  }

  // Arrastrar con el asa: solo ese elemento es `draggable`, para no pelear con la selección de texto de los campos.
  const asa = (tipo: Arrastre['tipo'], i: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${tipo}:${i}`);
      setArrastre({ tipo, desde: i });
    },
    onDragEnd: () => setArrastre(null),
  });
  const destino = (tipo: Arrastre['tipo'], i: number) => ({
    onDragOver: (e: DragEvent) => { if (arrastre?.tipo === tipo) e.preventDefault(); },
    onDrop: (e: DragEvent) => {
      if (arrastre?.tipo !== tipo) return;
      e.preventDefault();
      if (tipo === 'columna') moverColumna(arrastre.desde, i);
      else moverFila(arrastre.desde, i);
      setArrastre(null);
    },
  });

  const estiloAsa = { cursor: 'grab', userSelect: 'none' as const, padding: '0 .25rem' };
  const estiloFlecha = { padding: '0 .35rem' };
  const nPerdidas = pendiente && pendiente.tipo !== 'fila' ? celdasConDatoEnColumna(apartado, pendiente.id) : 0;

  return (
    <div>
      {columnas.length > MAX_COLUMNAS_COMODAS && (
        <p style={{ color: 'var(--warning, #f97316)', fontSize: '.85rem', margin: '0 0 .5rem' }}>
          Con tantas columnas el informe impreso queda apretado. Lo ideal es no pasar de {MAX_COLUMNAS_COMODAS}.
        </p>
      )}

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead>
            <tr>
              <th style={{ width: '4.5rem' }} />
              {columnas.map((c, i) => (
                <th key={c.id} {...destino('columna', i)} style={{ minWidth: '11rem', verticalAlign: 'top' }}>
                  <div style={{ display: 'flex', gap: '.25rem', alignItems: 'center', marginBottom: '.25rem' }}>
                    <span {...asa('columna', i)} title="Arrastrá para mover la columna" aria-hidden style={estiloAsa}>⠿</span>
                    <button type="button" className="btn btn-sm btn-ghost" style={estiloFlecha}
                      title="Mover columna a la izquierda" aria-label="Mover columna a la izquierda"
                      disabled={i === 0} onClick={() => moverColumna(i, i - 1)}>←</button>
                    <button type="button" className="btn btn-sm btn-ghost" style={estiloFlecha}
                      title="Mover columna a la derecha" aria-label="Mover columna a la derecha"
                      disabled={i === columnas.length - 1} onClick={() => moverColumna(i, i + 1)}>→</button>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ ...estiloFlecha, color: 'var(--danger)', marginLeft: 'auto' }}
                      title="Quitar columna" aria-label="Quitar columna"
                      onClick={() => pedirQuitarColumna(c.id)}>🗑</button>
                  </div>
                  <input className="input" value={c.nombre} placeholder="Nombre de la columna"
                    aria-label={`Nombre de la columna ${i + 1}`}
                    onChange={(e) => cambiarColumna(c.id, { nombre: e.target.value })} />
                  <select className="input" value={c.tipo} style={{ marginTop: '.25rem' }}
                    aria-label={`Tipo de la columna ${nombreCol(c.id)}`}
                    onChange={(e) => pedirCambiarTipo(c.id, e.target.value as TipoColumna)}>
                    <option value="texto">Texto</option>
                    <option value="imagen">Imagen</option>
                  </select>
                </th>
              ))}
              <th style={{ verticalAlign: 'top' }}>
                <button type="button" className="btn btn-sm btn-ghost"
                  onClick={() => onCambio(agregarColumna(apartado))}>+ Columna</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id} {...destino('fila', i)}>
                <td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  <span {...asa('fila', i)} title="Arrastrá para mover la fila" aria-hidden style={estiloAsa}>⠿</span>
                  <button type="button" className="btn btn-sm btn-ghost" style={estiloFlecha}
                    title="Subir fila" aria-label="Subir fila"
                    disabled={i === 0} onClick={() => moverFila(i, i - 1)}>↑</button>
                  <button type="button" className="btn btn-sm btn-ghost" style={estiloFlecha}
                    title="Bajar fila" aria-label="Bajar fila"
                    disabled={i === filas.length - 1} onClick={() => moverFila(i, i + 1)}>↓</button>
                </td>
                {columnas.map((c) => {
                  const valor = f.celdas[c.id] ?? '';
                  return (
                    <td key={c.id} style={{ verticalAlign: 'top' }}>
                      {c.tipo === 'texto' ? (
                        <AreaCrece value={valor} onChange={(v) => cambiarCelda(f.id, c.id, v)} />
                      ) : valor ? (
                        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
                          {urls[valor]
                            ? <img src={urls[valor]} alt="Imagen de la celda" style={{ maxWidth: '8rem', maxHeight: '6rem', borderRadius: 4 }} />
                            : <span style={{ opacity: 0.6 }}>{noDisponibles.has(valor) ? 'Imagen no disponible' : 'Cargando…'}</span>}
                          <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                            title="Quitar imagen" aria-label="Quitar imagen"
                            onClick={() => cambiarCelda(f.id, c.id, '')}>✕</button>
                        </div>
                      ) : (
                        <label
                          className="btn btn-sm btn-ghost"
                          title={informeId ? 'Elegir imagen' : TITULO_SIN_INFORME}
                          style={!informeId || subiendo ? { opacity: 0.5, cursor: 'not-allowed' } : { cursor: 'pointer' }}
                        >
                          {subiendo === `${f.id}:${c.id}` ? 'Subiendo…' : 'Elegir imagen'}
                          <input
                            type="file" accept={ACEPTA_IMAGEN} hidden
                            disabled={!informeId || subiendo !== null}
                            title={informeId ? 'Elegir imagen' : TITULO_SIN_INFORME}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (file) void subir(f.id, c.id, file);
                            }}
                          />
                        </label>
                      )}
                    </td>
                  );
                })}
                <td style={{ verticalAlign: 'top' }}>
                  <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                    title="Quitar fila" aria-label="Quitar fila"
                    onClick={() => pedirQuitarFila(f)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }}
        onClick={() => onCambio({ ...apartado, filas: [...filas, filaVaciaDe(columnas)] })}>+ Fila</button>

      {pendiente?.tipo === 'columna' && (
        <ConfirmDialog
          title="Quitar columna" danger confirmText="Sí, quitar"
          message={`La columna «${nombreCol(pendiente.id)}» tiene ${nPerdidas} ${nPerdidas === 1 ? 'celda con contenido' : 'celdas con contenido'}. Si la quitás, ${nPerdidas === 1 ? 'se pierde' : 'se pierden'}. ¿Seguro que querés quitarla?`}
          onConfirm={() => { onCambio(quitarColumna(apartado, pendiente.id)); setPendiente(null); }}
          onCancel={() => setPendiente(null)}
        />
      )}
      {pendiente?.tipo === 'tipo' && (
        <ConfirmDialog
          title="Cambiar tipo de columna" confirmText="Sí, cambiar"
          message={`La columna «${nombreCol(pendiente.id)}» tiene ${nPerdidas} ${nPerdidas === 1 ? 'celda con contenido' : 'celdas con contenido'}. Al cambiar el tipo se vacían, porque un texto no sirve como imagen ni al revés. ¿Cambiar igual?`}
          onConfirm={() => { onCambio(cambiarTipoColumna(apartado, pendiente.id, pendiente.nuevo)); setPendiente(null); }}
          onCancel={() => setPendiente(null)}
        />
      )}
      {pendiente?.tipo === 'fila' && (
        <ConfirmDialog
          title="Quitar fila" danger confirmText="Sí, quitar"
          message="Esta fila tiene datos escritos. Si la quitás, se pierden. ¿Seguro que querés quitarla?"
          onConfirm={() => { quitarFila(pendiente.id); setPendiente(null); }}
          onCancel={() => setPendiente(null)}
        />
      )}
    </div>
  );
}
