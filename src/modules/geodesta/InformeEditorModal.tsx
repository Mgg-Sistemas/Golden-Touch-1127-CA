/* ============================================================
   Golden Touch · Geodesta · editor del informe

   El geólogo arma aquí todo el informe: encabezado, logos, código del
   documento y la lista de apartados (cuadros y textos), que se pueden
   agregar, retitular, reordenar (botones o arrastre) y borrar.
   ============================================================ */
import { useEffect, useState, type DragEvent } from 'react';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { FechaInput } from '@/shared/ui/FechaInput';
import { toast } from '@/shared/ui/Toast';
import type { Apartado, InformeGeodesta } from '@/shared/lib/types';
import {
  apartadoCuadroVacio, apartadoTextoVacio, apartadoTieneContenido, errorInforme, type BorradorInforme,
} from './informeModelo';
import { borradorDesdeInforme } from './informeBorrador';
import { mover } from './informeOrden';
import {
  actualizarInforme, crearInforme, existeCodigo, getConfig, guardarConfig, proximoCodigo,
} from './informes.repository';
import { ApartadoCuadroEditor } from './ApartadoCuadroEditor';
import { ApartadoTextoEditor } from './ApartadoTextoEditor';

interface InformeEditorModalProps {
  /** `null` = alta. */
  informe: InformeGeodesta | null;
  actor: string;
  onClose: () => void;
  onGuardado: (inf: InformeGeodesta) => void;
}

/** Campos de texto del encabezado que la configuración precarga en un informe nuevo. */
const CAMPOS_CONFIG = [
  'ciudad', 'para_nombre', 'para_cargo', 'de_nombre', 'de_cargo',
  'firma_nombre', 'firma_cargo', 'direccion_pie',
] as const;
type CampoTexto = typeof CAMPOS_CONFIG[number];

const mensaje = (e: unknown, defecto: string) => (e instanceof Error && e.message ? e.message : defecto);

/**
 * El `key` hace que cambiar de informe remonte el formulario: sin él, el estado
 * inicial (que se toma una sola vez) se quedaría con lo del informe anterior.
 */
export function InformeEditorModal(props: InformeEditorModalProps) {
  return <InformeEditorForm key={props.informe?.id ?? 'nuevo'} {...props} />;
}

function InformeEditorForm({ informe, actor, onClose, onGuardado }: InformeEditorModalProps) {
  // `b` es lo que hay en pantalla; `base`, lo último guardado (o precargado). Juntos, para actualizarlos a la vez.
  const [est, setEst] = useState(() => {
    const inicial = borradorDesdeInforme(informe, null);
    return { b: inicial, base: inicial };
  });
  const { b, base } = est;
  const cambiar = (parche: Partial<BorradorInforme>) => setEst((s) => ({ ...s, b: { ...s.b, ...parche } }));
  const cambiarApartados = (fn: (l: Apartado[]) => Apartado[]) =>
    setEst((s) => ({ ...s, b: { ...s.b, apartados: fn(s.b.apartados) } }));

  // Tras el primer guardado de un informe nuevo, el modal pasa a modo edición con este id.
  const [informeId, setInformeId] = useState<string | null>(informe?.id ?? null);
  const [ocupado, setOcupado] = useState(false);
  const [pidiendoCodigo, setPidiendoCodigo] = useState(false);
  const [confirmaSalir, setConfirmaSalir] = useState(false);
  const [aBorrar, setABorrar] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [guardandoDefectos, setGuardandoDefectos] = useState(false);

  // Un archivo soltado fuera de una zona de carga haría que el navegador abra la
  // foto y se pierda el informe sin guardar. Las zonas legítimas ya atienden su
  // propio drop (y detienen la propagación); todo lo demás se ignora.
  useEffect(() => {
    const frenar = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', frenar);
    window.addEventListener('drop', frenar);
    return () => {
      window.removeEventListener('dragover', frenar);
      window.removeEventListener('drop', frenar);
    };
  }, []);

  /** Pide el código sugerido. Si falla, avisa y el campo sigue editable: nunca bloquea el alta. */
  async function pedirCodigo(soloSiVacio: boolean, vivo: () => boolean = () => true) {
    setPidiendoCodigo(true);
    try {
      const codigo = await proximoCodigo(b.fecha);
      if (!vivo()) return;
      const poner = (x: BorradorInforme) => (soloSiVacio && x.codigo !== '' ? x : { ...x, codigo });
      setEst((s) => ({ b: poner(s.b), base: soloSiVacio ? poner(s.base) : s.base }));
    } catch (e) {
      if (vivo()) toast(`No se pudo pedir el código: ${mensaje(e, 'error de conexión')}. Escribilo a mano.`, 'error');
    } finally {
      if (vivo()) setPidiendoCodigo(false);
    }
  }

  // Alta: precarga los valores por defecto y el código sugerido (sin pisar lo que ya se haya escrito).
  useEffect(() => {
    if (informe) return;
    let vivo = true;
    getConfig()
      .then((cfg) => {
        if (!vivo || !cfg) return;
        const d = borradorDesdeInforme(null, cfg);
        setEst((s) => {
          const aplicar = (x: BorradorInforme, intacto: (k: keyof BorradorInforme) => boolean) => {
            const sig: BorradorInforme = { ...x };
            CAMPOS_CONFIG.forEach((k) => { if (intacto(k)) sig[k] = d[k]; });
            if (intacto('logo_gt')) sig.logo_gt = d.logo_gt;
            if (intacto('logo_cvm')) sig.logo_cvm = d.logo_cvm;
            return sig;
          };
          return {
            b: aplicar(s.b, (k) => s.b[k] === s.base[k]),
            base: aplicar(s.base, () => true),
          };
        });
      })
      .catch((e) => {
        if (vivo) toast(`No se pudo cargar la configuración: ${mensaje(e, 'error de conexión')}. Completá los datos a mano.`, 'error');
      });
    void pedirCodigo(true, () => vivo);
    return () => { vivo = false; };
    // Solo al montar: el `key` del envoltorio remonta el formulario si cambia el informe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hayCambios = JSON.stringify(b) !== JSON.stringify(base);

  /** Cancelar y la ✕: si hay cambios sin guardar, primero se pregunta. Mientras guarda, se ignora. */
  function intentarCerrar() {
    if (ocupado) return;
    if (hayCambios) setConfirmaSalir(true); else onClose();
  }

  async function guardar() {
    const error = errorInforme(b);
    if (error) { toast(error, 'error'); return; }
    const guardado = b;
    setOcupado(true);
    try {
      const inf = informeId
        ? await actualizarInforme(informeId, guardado, actor)
        : await crearInforme(guardado, actor);
      setEst((s) => ({ ...s, base: guardado }));
      if (informeId) {
        toast('Informe actualizado.', 'success');
      } else {
        // Se queda abierto y pasa a edición: con el id ya se pueden subir imágenes.
        setInformeId(inf.id);
        toast('Informe guardado: ya podés subir imágenes.', 'success');
      }
      onGuardado(inf);
      // Aviso, nunca bloqueo: el código repetido se guardó igual.
      void existeCodigo(guardado.codigo, inf.id).then((repetido) => {
        if (repetido) {
          toast(`Ojo: ya existe otro informe con el código ${guardado.codigo.trim()}. Se guardó igual; si fue sin querer, cambialo.`, 'warning');
        }
      });
    } catch (e) {
      toast(mensaje(e, 'No se pudo guardar el informe.'), 'error');
    } finally { setOcupado(false); }
  }

  async function guardarComoDefecto() {
    setGuardandoDefectos(true);
    try {
      await guardarConfig({
        ciudad: b.ciudad, para_nombre: b.para_nombre, para_cargo: b.para_cargo,
        de_nombre: b.de_nombre, de_cargo: b.de_cargo, firma_nombre: b.firma_nombre,
        firma_cargo: b.firma_cargo, direccion_pie: b.direccion_pie,
        logo_gt: b.logo_gt, logo_cvm: b.logo_cvm,
      });
      toast('Listo: los próximos informes nuevos arrancan con estos datos.', 'success');
    } catch (e) {
      toast(`No se pudieron guardar los valores por defecto: ${mensaje(e, 'error de conexión')}`, 'error');
    } finally { setGuardandoDefectos(false); }
  }

  const reemplazar = (a: Apartado) =>
    cambiarApartados((l) => l.map((x) => (x.id === a.id ? a : x)));
  const moverA = (desde: number, hacia: number) => cambiarApartados((l) => mover(l, desde, hacia));
  const pedirBorrar = (a: Apartado) => {
    if (apartadoTieneContenido(a)) setABorrar(a.id);
    else cambiarApartados((l) => l.filter((x) => x.id !== a.id));
  };

  const asa = (i: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `apartado:${i}`);
      setArrastrando(i);
    },
    onDragEnd: () => setArrastrando(null),
  });
  const destino = (i: number) => ({
    onDragOver: (e: DragEvent) => { if (arrastrando !== null) e.preventDefault(); },
    onDrop: (e: DragEvent) => {
      if (arrastrando === null) return;
      e.preventDefault();
      moverA(arrastrando, i);
      setArrastrando(null);
    },
  });

  const raiz = import.meta.env.BASE_URL;
  const titulo = informeId ? `Informe ${b.codigo}`.trim() : 'Nuevo informe de geología';
  const campo = (etiqueta: string, k: CampoTexto) => (
    <div className="form-row">
      <label>{etiqueta}</label>
      <input className="input" value={b[k]} onChange={(e) => cambiar({ [k]: e.target.value })} />
    </div>
  );

  return (
    <>
      <Modal
        size="xl" title={titulo} onClose={intentarCerrar}
        footer={
          <>
            <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={intentarCerrar}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void guardar()}>
              {ocupado ? 'Guardando…' : 'Guardar informe'}
            </button>
          </>
        }
      >
        <section style={{ marginBottom: '1.2rem' }}>
          <h4 style={{ margin: '0 0 .5rem' }}>Documento</h4>
          <div className="form-grid">
            <div className="form-row">
              <label>Código del documento *</label>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <input className="input" value={b.codigo} onChange={(e) => cambiar({ codigo: e.target.value })} />
                {!informe && (
                  <button type="button" className="btn btn-sm btn-ghost" disabled={pidiendoCodigo}
                    title="Pedir otro código sugerido" aria-label="Pedir otro código sugerido"
                    onClick={() => void pedirCodigo(false)}>🔄</button>
                )}
              </div>
            </div>
            <div className="form-row">
              <label>Fecha *</label>
              <FechaInput value={b.fecha} onChange={(iso) => cambiar({ fecha: iso })} />
            </div>
            <div className="form-row">
              <label>Estado</label>
              <select className="input" value={b.estado}
                onChange={(e) => cambiar({ estado: e.target.value as BorradorInforme['estado'] })}>
                <option value="borrador">Borrador</option>
                <option value="finalizado">Finalizado</option>
              </select>
            </div>
            {campo('Ciudad', 'ciudad')}
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '.6rem' }}>
            <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={b.logo_gt} onChange={(e) => cambiar({ logo_gt: e.target.checked })} />
              <img src={`${raiz}LOGO.jpg`} alt="" height={28} style={{ opacity: b.logo_gt ? 1 : 0.3 }} />
              Logo Golden Touch
            </label>
            <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={b.logo_cvm} onChange={(e) => cambiar({ logo_cvm: e.target.checked })} />
              <img src={`${raiz}cvm.jpg`} alt="" height={28} style={{ opacity: b.logo_cvm ? 1 : 0.3 }} />
              Logo CVM
            </label>
          </div>
        </section>

        <section style={{ marginBottom: '1.2rem' }}>
          <h4 style={{ margin: '0 0 .5rem' }}>Encabezado y firma</h4>
          <div className="form-grid">
            {campo('Para (nombre)', 'para_nombre')}
            {campo('Para (cargo)', 'para_cargo')}
            {campo('De (nombre)', 'de_nombre')}
            {campo('De (cargo)', 'de_cargo')}
            {campo('Firma (nombre)', 'firma_nombre')}
            {campo('Firma (cargo)', 'firma_cargo')}
          </div>
          <div style={{ marginTop: '.5rem' }}>{campo('Dirección del pie de página', 'direccion_pie')}</div>
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }}
            disabled={ocupado || guardandoDefectos} onClick={() => void guardarComoDefecto()}>
            Guardar como valores por defecto
          </button>
        </section>

        <section>
          <h4 style={{ margin: '0 0 .5rem' }}>Apartados</h4>
          {b.apartados.length === 0 && (
            <p className="muted" style={{ fontSize: '.88rem' }}>
              Todavía no hay apartados. Agregá un cuadro (tabla) o un texto con imágenes.
            </p>
          )}
          {b.apartados.map((a, i) => (
            <div key={a.id} {...destino(i)}
              style={{
                border: '1px solid var(--border)', borderRadius: 8, padding: '.6rem', marginBottom: '.8rem',
                opacity: arrastrando === i ? 0.5 : 1,
              }}>
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginBottom: '.5rem' }}>
                <span {...asa(i)} title="Arrastrá para mover el apartado" aria-hidden
                  style={{ cursor: 'grab', userSelect: 'none', padding: '0 .25rem' }}>⠿</span>
                <span className="muted" style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>
                  {a.tipo === 'cuadro' ? 'Cuadro' : 'Texto'}
                </span>
                <input className="input" placeholder="Título del apartado" value={a.titulo}
                  onChange={(e) => reemplazar({ ...a, titulo: e.target.value })} />
                <button type="button" className="btn btn-sm btn-ghost" disabled={i === 0}
                  title="Subir" aria-label="Subir apartado" onClick={() => moverA(i, i - 1)}>↑</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={i === b.apartados.length - 1}
                  title="Bajar" aria-label="Bajar apartado" onClick={() => moverA(i, i + 1)}>↓</button>
                <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                  title="Quitar apartado" aria-label="Quitar apartado" onClick={() => pedirBorrar(a)}>🗑</button>
              </div>
              {a.tipo === 'cuadro'
                ? <ApartadoCuadroEditor apartado={a} informeId={informeId} actor={actor} onCambio={reemplazar} />
                : <ApartadoTextoEditor apartado={a} informeId={informeId} actor={actor} onCambio={reemplazar} />}
            </div>
          ))}
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button type="button" className="btn btn-sm btn-ghost"
              onClick={() => cambiarApartados((l) => [...l, apartadoCuadroVacio()])}>+ Agregar cuadro</button>
            <button type="button" className="btn btn-sm btn-ghost"
              onClick={() => cambiarApartados((l) => [...l, apartadoTextoVacio()])}>+ Agregar texto</button>
          </div>
        </section>
      </Modal>
      {confirmaSalir && (
        <ConfirmDialog
          title="Descartar cambios" danger confirmText="Sí, descartar"
          message="Hay datos escritos que no se han guardado. Si cerrás ahora, se pierden. ¿Seguro que querés descartarlos?"
          onConfirm={() => { setConfirmaSalir(false); onClose(); }}
          onCancel={() => setConfirmaSalir(false)}
        />
      )}
      {aBorrar && (
        <ConfirmDialog
          title="Quitar apartado" danger confirmText="Sí, quitar"
          message="Este apartado tiene contenido. Si lo quitás, se pierde. ¿Seguro que querés quitarlo?"
          onConfirm={() => { cambiarApartados((l) => l.filter((x) => x.id !== aBorrar)); setABorrar(null); }}
          onCancel={() => setABorrar(null)}
        />
      )}
    </>
  );
}
