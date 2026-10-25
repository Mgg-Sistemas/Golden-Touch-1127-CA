/* ============================================================
   Golden Touch · Asignaciones · La ventana del acta de entrega (12/10/2026)

   El número del acta, quién recibe, quién suscribe por la empresa (se
   corrige aquí), lo entregado, el anexo fotográfico (hasta 4 fotos) y el
   escaneo del acta ya firmada. Desde aquí se ve la carta en PDF.
   ============================================================ */
import { Quien } from '@/shared/ui/Quien';
import { useEffect, useMemo, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { date as fmtDate } from '@/shared/lib/format';
import { CATEGORIA, ESTADO_LABEL, nombreDe, type Asignacion, type PersonaMin } from './asignacionesReglas';
import { MAX_FOTOS_ACTA, cedulaConPuntos, errorFotosActa } from './actas';
import {
  actualizarActa, dataUrlArchivoActa, firmanteParaActa, quitarActaFirmada, quitarFotoActa, subirActaFirmada, subirFotosActa,
  urlArchivoActa, type ActaAsignacion, type DatosFirmante, type Firmante,
} from './actas.repository';
import { FirmanteCampos } from './FirmantesActa';

export function ActaModal({ acta: inicial, items, personal, firmantes, canWrite, actor, onClose, onChanged, onCatalogo }: {
  acta: ActaAsignacion;
  items: Asignacion[];
  personal: PersonaMin[];
  firmantes: Firmante[];
  canWrite: boolean;
  actor: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onCatalogo: () => void;
}) {
  const [acta, setActa] = useState(inicial);
  useEffect(() => { setActa(inicial); }, [inicial]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const [porQuitar, setPorQuitar] = useState<{ tipo: 'foto'; path: string } | { tipo: 'firmada' } | null>(null);
  const [entrega, setEntrega] = useState<DatosFirmante | null>(null);

  const recibe = useMemo(() => personal.find((p) => p.id === acta.personal_id) ?? null, [personal, acta.personal_id]);

  // Miniaturas del anexo: URL firmada por foto (10 min), solo de las que faltan.
  useEffect(() => {
    let vivo = true;
    (async () => {
      for (const f of acta.fotos) {
        if (miniaturas[f.path]) continue;
        try { const u = await urlArchivoActa(f.path); if (vivo) setMiniaturas((m) => ({ ...m, [f.path]: u })); }
        catch { /* sin miniatura, el nombre alcanza */ }
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acta.fotos]);

  async function hecho(nuevo: ActaAsignacion, msg: string) {
    setActa(nuevo); toast(msg, 'success'); await onChanged();
  }

  async function agregarFotos(files: FileList | null) {
    const lista = Array.from(files ?? []);
    if (!lista.length) return;
    const mal = errorFotosActa(lista, acta.fotos.length);
    if (mal) { toast(mal, 'warning'); return; }
    setOcupado('fotos');
    try { await hecho(await subirFotosActa(acta, lista), lista.length === 1 ? 'Foto agregada al anexo' : `${lista.length} fotos agregadas al anexo`); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron subir las fotos', 'error'); }
    finally { setOcupado(null); }
  }

  async function subirFirmada(file: File | null | undefined) {
    if (!file) return;
    setOcupado('firmada');
    try { await hecho(await subirActaFirmada(acta, file, actor), 'Acta firmada guardada'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo subir el acta firmada', 'error'); }
    finally { setOcupado(null); }
  }

  async function confirmarQuitar() {
    const q = porQuitar; setPorQuitar(null);
    if (!q) return;
    try {
      if (q.tipo === 'foto') await hecho(await quitarFotoActa(acta, q.path), 'Foto quitada del anexo');
      else await hecho(await quitarActaFirmada(acta), 'Acta firmada quitada');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo quitar', 'error'); }
  }

  async function ver(path: string, nombreArchivo: string) {
    try { previewArchivo(await urlArchivoActa(path), nombreArchivo); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo abrir', 'error'); }
  }

  async function verPdf() {
    setOcupado('pdf');
    try {
      const fotos: { dataUrl: string; filename: string }[] = [];
      for (const f of acta.fotos) {
        try { fotos.push({ dataUrl: await dataUrlArchivoActa(f.path), filename: f.filename }); }
        catch { /* una foto que no baja no frena el acta */ }
      }
      const { verActaEntregaPdf } = await import('./actaEntregaPdf');
      await verActaEntregaPdf(acta, items, recibe, fotos);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el acta', 'error'); }
    finally { setOcupado(null); }
  }

  async function guardarEntrega() {
    if (!entrega) return;
    setOcupado('entrega');
    try {
      const f = await firmanteParaActa(entrega, firmantes, actor);
      await hecho(await actualizarActa(acta.id, { entrega, firmanteId: f?.id ?? null }), 'Quien suscribe actualizado');
      setEntrega(null);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setOcupado(null); }
  }

  const etiqueta = { fontSize: '.7rem', letterSpacing: '.04em' } as const;

  return (
    <Modal title={`📝 Acta de entrega · ASIGNACIÓN ${acta.numero}`} size="lg" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={() => void verPdf()} disabled={ocupado === 'pdf'}>{ocupado === 'pdf' ? 'Generando…' : '📝 Ver acta en PDF'}</button>
      </>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.6rem', marginBottom: '.7rem' }}>
        <div className="card" style={{ padding: '.55rem .7rem', margin: 0 }}>
          <div className="muted" style={etiqueta}>RECIBE</div>
          <strong>{nombreDe(recibe)}</strong>
          <div className="muted" style={{ fontSize: '.76rem' }}>{[recibe?.cedula ? `C.I. ${cedulaConPuntos(recibe.cedula)}` : '', recibe?.cargo ?? ''].filter(Boolean).join(' · ') || '—'}</div>
        </div>
        <div className="card" style={{ padding: '.55rem .7rem', margin: 0 }}>
          <div className="muted" style={{ ...etiqueta, display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            QUIEN SUSCRIBE (POR LA EMPRESA)
            {canWrite && !entrega && (
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} title="Cambiar quien suscribe"
                onClick={() => setEntrega({ nombre: acta.entrega_nombre ?? '', cedula: acta.entrega_cedula ?? '', cargo: acta.entrega_cargo ?? '' })}>✎</button>
            )}
          </div>
          {entrega ? (
            <div style={{ display: 'grid', gap: '.4rem', marginTop: '.3rem' }}>
              <FirmanteCampos id="acta-firmante" valor={entrega} onChange={setEntrega} catalogo={firmantes} onCatalogo={onCatalogo} />
              <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setEntrega(null)} disabled={ocupado === 'entrega'}>Cancelar</button>
                <button className="btn btn-sm btn-primary" onClick={() => void guardarEntrega()} disabled={ocupado === 'entrega'}>{ocupado === 'entrega' ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </div>
          ) : (
            <>
              <strong>{acta.entrega_nombre || '— en blanco (se escribe a mano) —'}</strong>
              <div className="muted" style={{ fontSize: '.76rem' }}>{[acta.entrega_cedula ? `C.I. ${cedulaConPuntos(acta.entrega_cedula)}` : '', acta.entrega_cargo ?? ''].filter(Boolean).join(' · ') || '—'}</div>
            </>
          )}
        </div>
        <div className="card" style={{ padding: '.55rem .7rem', margin: 0 }}>
          <div className="muted" style={etiqueta}>FECHA · REGISTRÓ</div>
          <strong>{fmtDate(acta.fecha)}</strong>
          <div className="muted" style={{ fontSize: '.76rem' }}><Quien nombre={acta.actor_name} correo={acta.creado_por} vacio="—" /></div>
        </div>
      </div>

      {acta.observaciones && <p className="muted" style={{ fontSize: '.84rem', marginTop: 0 }}>Observación: {acta.observaciones}</p>}

      <div style={{ overflowX: 'auto', marginBottom: '.8rem' }}>
        <table className="table">
          <thead><tr><th>#</th><th>Código</th><th>Tipo</th><th>Lo entregado</th><th>Estado</th></tr></thead>
          <tbody>
            {items.map((a, i) => (
              <tr key={a.id}>
                <td className="muted">{i + 1}</td>
                <td className="mono">{a.codigo}</td>
                <td>{CATEGORIA[a.categoria]?.icono} {CATEGORIA[a.categoria]?.label ?? a.categoria}</td>
                <td>{a.descripcion}{a.serial ? <span className="muted"> · S/N {a.serial}</span> : null}{a.numero_linea ? <span className="muted"> · línea {a.numero_linea}</span> : null}{Number(a.cantidad) > 1 ? <span className="muted"> · {a.cantidad} {a.unidad ?? 'und'}</span> : null}</td>
                <td>{ESTADO_LABEL[a.estado] ?? a.estado}</td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={5} className="muted">Esta acta ya no tiene artículos.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Anexo fotográfico ── */}
      <div className="card" style={{ padding: '.6rem .75rem', marginBottom: '.6rem' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          📷 Anexo fotográfico <span className="muted" style={{ fontWeight: 400 }}>· {acta.fotos.length} de {MAX_FOTOS_ACTA}</span>
          {canWrite && acta.fotos.length < MAX_FOTOS_ACTA && (
            <label className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto', cursor: 'pointer' }}>
              {ocupado === 'fotos' ? 'Subiendo…' : '+ Agregar fotos'}
              <input type="file" accept="image/*" multiple hidden disabled={ocupado === 'fotos'} onChange={(e) => { void agregarFotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
        {!acta.fotos.length && <div className="muted" style={{ fontSize: '.82rem' }}>Sin fotos. La foto de lo entregado va en la segunda hoja del acta.</div>}
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {acta.fotos.map((f) => (
            <div key={f.path} style={{ width: 150, border: '1px solid var(--border)', borderRadius: 6, padding: '.3rem', fontSize: '.72rem' }}>
              <button type="button" onClick={() => void ver(f.path, f.filename)} title="Ver en grande"
                style={{ display: 'block', width: '100%', height: 100, padding: 0, border: 0, background: 'var(--bg-1)', borderRadius: 4, overflow: 'hidden', cursor: 'pointer' }}>
                {miniaturas[f.path] ? <img src={miniaturas[f.path]} alt={f.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="muted">cargando…</span>}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', marginTop: '.25rem' }}>
                <span className="muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.filename}>{f.filename}</span>
                {canWrite && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)', padding: '0 .3rem' }} title="Quitar foto" onClick={() => setPorQuitar({ tipo: 'foto', path: f.path })}>🗑</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── El acta firmada ── */}
      <div className="card" style={{ padding: '.6rem .75rem' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          🖊 Acta firmada
          {canWrite && (
            <label className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto', cursor: 'pointer' }}>
              {ocupado === 'firmada' ? 'Subiendo…' : acta.firmada_path ? '⬆ Reemplazar' : '⬆ Subir escaneo'}
              <input type="file" accept="application/pdf,image/*" hidden disabled={ocupado === 'firmada'} onChange={(e) => { void subirFirmada(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          )}
        </div>
        {acta.firmada_path
          ? (
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '.84rem' }}>
              <span>✔ <strong>{acta.firmada_nombre}</strong></span>
              <span className="muted" style={{ fontSize: '.76rem' }}>subida {fmtDate(acta.firmada_at)}{acta.firmada_por ? ` por ${acta.firmada_por}` : ''}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => void ver(acta.firmada_path as string, acta.firmada_nombre ?? 'acta-firmada')}>👁 Ver</button>
              {canWrite && <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setPorQuitar({ tipo: 'firmada' })}>🗑</button>}
            </div>
          )
          : <div className="muted" style={{ fontSize: '.82rem' }}>Todavía no se subió. Imprime el acta, fírmala con huella y sube aquí el escaneo o la foto.</div>}
      </div>

      {porQuitar && (
        <ConfirmDialog title={porQuitar.tipo === 'foto' ? 'Quitar foto' : 'Quitar acta firmada'} danger confirmText="Sí, quitar"
          message={porQuitar.tipo === 'foto' ? 'La foto sale del anexo fotográfico y se borra del sistema.' : 'Se borra el escaneo del acta firmada. El acta y sus artículos no se tocan.'}
          onConfirm={() => { void confirmarQuitar(); }} onCancel={() => setPorQuitar(null)} />
      )}
    </Modal>
  );
}
