/* ============================================================
   Golden Touch · RRHH · Ficha técnica del trabajador

   La hoja de vida de la persona en una sola pantalla: identificación,
   contacto, datos laborales y carga familiar. Hasta ahora esos datos vivían
   repartidos (y varios ni existían), así que para armar un expediente había
   que abrir el formulario de edición y copiar a mano.

   La edad y la antigüedad NO se guardan: se calculan de la fecha. Un número
   guardado envejece mal — al año siguiente miente.
   ============================================================ */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { date, money } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { Personal, PersonalFamiliar } from '@/shared/lib/types';
import { formatearRif } from '@/shared/lib/rif';
import { getFotoPersonalUrl } from './personal.repository';
import { listFamiliares } from './familiares.repository';
import {
  antiguedad, edad, labelEmpresa, labelEstadoCivil, labelGenero, labelParentesco,
} from './fichaPersonal';
import { descargarFichaTecnicaPdf } from './fichaTecnicaPdf';
import { etiquetaFicha } from './fichaNro';

/** Un dato de la ficha: etiqueta a la izquierda, valor a la derecha. */
function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.75rem',
      padding: '.45rem 0', borderBottom: '1px solid var(--border)',
    }}>
      <span className="muted" style={{ fontSize: '.82rem', flexShrink: 0 }}>{label}</span>
      <strong style={{ fontSize: '.88rem', textAlign: 'right', wordBreak: 'break-word' }}>{children}</strong>
    </div>
  );
}

const vacio = <span className="muted" style={{ fontWeight: 400 }}>—</span>;
const oVacio = (v: string | null | undefined): ReactNode => (v?.trim() ? v : vacio);

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: '.9rem 1rem', marginBottom: '.7rem' }}>
      <div style={{
        color: 'var(--primary)', fontWeight: 700, fontSize: '.78rem',
        textTransform: 'uppercase', letterSpacing: '.08em',
        borderBottom: '1px solid var(--primary)', paddingBottom: '.4rem', marginBottom: '.5rem',
      }}>{titulo}</div>
      {children}
    </div>
  );
}

export function FichaTecnicaPersonal({
  persona, onClose, onEditar,
}: {
  persona: Personal;
  onClose: () => void;
  onEditar?: () => void;
}) {
  const [familiares, setFamiliares] = useState<PersonalFamiliar[]>([]);
  const [foto, setFoto] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  const recargar = useCallback(async () => {
    try { setFamiliares(await listFamiliares(persona.id)); }
    catch { setFamiliares([]); }
  }, [persona.id]);

  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['personal_familiares'], () => { void recargar(); });

  useEffect(() => {
    let vivo = true;
    if (!persona.foto_path) { setFoto(null); return; }
    getFotoPersonalUrl(persona.foto_path)
      .then((u) => { if (vivo) setFoto(u); })
      .catch(() => { if (vivo) setFoto(null); });
    return () => { vivo = false; };
  }, [persona.foto_path]);

  const nombre = `${persona.nombre} ${persona.apellido ?? ''}`.trim();
  const anios = edad(persona.fecha_nacimiento);
  const anti = antiguedad(persona.fecha_ingreso);

  async function pdf() {
    setGenerando(true);
    try {
      await descargarFichaTecnicaPdf(persona, familiares);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar la ficha', 'error');
    } finally { setGenerando(false); }
  }

  return (
    <Modal
      title={`Ficha técnica · ${nombre}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {onEditar && <button className="btn btn-ghost" onClick={onEditar}>✎ Editar datos</button>}
          <button className="btn btn-primary" disabled={generando} onClick={() => void pdf()}>
            {generando ? 'Generando…' : '↓ PDF (vista previa)'}
          </button>
        </>
      }
    >
      {/* Cabecera: quién es, de un vistazo. */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '.8rem' }}>
        <div style={{
          width: 110, height: 130, flexShrink: 0, borderRadius: 'var(--r-md)',
          border: '1px solid var(--border-strong)', background: 'var(--surface-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {foto
            ? <img src={foto} alt={`Foto de ${nombre}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span className="muted" style={{ fontSize: '1.8rem' }}>👤</span>}
        </div>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{nombre}</h3>
          <div className="muted" style={{ fontSize: '.84rem', marginTop: '.2rem' }}>
            {etiquetaFicha(persona.ficha_nro) || 'Sin número de ficha'}
            {persona.cargo ? ` · ${persona.cargo}` : ''}
            {persona.departamento ? ` · ${persona.departamento}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.45rem', flexWrap: 'wrap' }}>
            <span className={`badge ${persona.activo ? 'success' : ''}`}>{persona.activo ? 'Activo' : 'Inactivo'}</span>
            <span className="badge primary">{labelEmpresa(persona.empresa)}</span>
            {anios !== null && <span className="badge">{anios} años</span>}
            {anti && <span className="badge">{anti.texto} en la empresa</span>}
          </div>
        </div>
      </div>

      <Seccion titulo="Identificación">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', columnGap: '1.2rem' }}>
          <Dato label="Cédula">{oVacio(persona.cedula)}</Dato>
          <Dato label="RIF">{persona.rif ? formatearRif(persona.rif) : vacio}</Dato>
          <Dato label="Fecha de nacimiento">{persona.fecha_nacimiento ? date(persona.fecha_nacimiento) : vacio}</Dato>
          <Dato label="Edad">{anios !== null ? `${anios} años` : vacio}</Dato>
          <Dato label="Grupo sanguíneo">{oVacio(persona.grupo_sanguineo)}</Dato>
          <Dato label="Género">{persona.genero ? labelGenero(persona.genero) : vacio}</Dato>
          <Dato label="Nacionalidad">{oVacio(persona.nacionalidad)}</Dato>
          <Dato label="Estado civil">{persona.estado_civil ? labelEstadoCivil(persona.estado_civil) : vacio}</Dato>
        </div>
      </Seccion>

      <Seccion titulo="Contacto">
        <Dato label="Teléfono">{oVacio(persona.telefono)}</Dato>
        <Dato label="En una emergencia, llamar a">
          {persona.contacto_emergencia?.trim()
            ? `${persona.contacto_emergencia}${persona.telefono_emergencia ? ` · ${persona.telefono_emergencia}` : ''}`
            : vacio}
        </Dato>
        <Dato label="Dirección">{oVacio(persona.direccion)}</Dato>
      </Seccion>

      <Seccion titulo="Datos laborales">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', columnGap: '1.2rem' }}>
          <Dato label="Cargo">{oVacio(persona.cargo)}</Dato>
          <Dato label="Departamento">{oVacio(persona.departamento)}</Dato>
          <Dato label="Fecha de ingreso">{persona.fecha_ingreso ? date(persona.fecha_ingreso) : vacio}</Dato>
          <Dato label="Antigüedad">{anti ? anti.texto : vacio}</Dato>
          <Dato label="Nómina">{labelEmpresa(persona.empresa)}</Dato>
          <Dato label="Sueldo base mensual">
            {Number(persona.sueldo_base) > 0 ? money(persona.sueldo_base) : vacio}
          </Dato>
        </div>
      </Seccion>

      <Seccion titulo={`Carga familiar${familiares.length ? ` · ${familiares.length}` : ''}`}>
        {!familiares.length && (
          <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
            Sin carga familiar cargada. Se agrega desde <strong>✎ Editar</strong>.
          </p>
        )}
        {!!familiares.length && (
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.82rem' }}>
              <thead>
                <tr>
                  <th>Nombre</th><th>Parentesco</th><th>Nacimiento</th>
                  <th style={{ textAlign: 'right' }}>Edad</th><th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {familiares.map((f) => {
                  const e = edad(f.fecha_nacimiento);
                  const marcas = [f.estudia ? 'estudia' : '', f.discapacidad ? 'discapacidad' : '']
                    .filter(Boolean).join(' · ');
                  return (
                    <tr key={f.id}>
                      <td>{f.nombre}{f.cedula ? <span className="muted"> · {f.cedula}</span> : null}</td>
                      <td>{labelParentesco(f.parentesco)}</td>
                      <td className="mono">{f.fecha_nacimiento ? date(f.fecha_nacimiento) : '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{e !== null ? e : '—'}</td>
                      <td className="muted" style={{ fontSize: '.78rem' }}>
                        {[marcas, f.observacion].filter(Boolean).join(' · ') || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </Modal>
  );
}
