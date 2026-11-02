/* ============================================================
   Golden Touch · Pasar un aviso por WhatsApp

   El que carga el movimiento manda el aviso al grupo apenas lo guarda. Lo
   usan el surtidor de combustible y la vista de teléfono de comidas.

   POR QUÉ SE COMPARTE Y NO SE ABRE UN ENLACE (29/09/2026). El botón abría
   `wa.me/?text=…`, que mete el mensaje ENTERO dentro de una dirección web.
   El enlace se arma bien —se comprobó: el texto vuelve idéntico al
   decodificarlo—, pero WhatsApp muestra antes una pantalla propia,
   «Compartir en WhatsApp», y ahí los emojis salían como ◆? y los renglones
   quedaban pegados en un párrafo corrido. Eso ya no es algo que se arregle
   de este lado: el mensaje viaja bien, lo pinta mal la página del medio.

   La salida es no meterlo en una dirección: `navigator.share` le pasa el
   TEXTO al menú de compartir del teléfono, que se lo entrega a WhatsApp tal
   cual. Emojis y saltos de línea llegan enteros y se elige el chat de una.
   Donde ese menú no existe —una PC— se sigue usando el enlace, que para eso
   abre WhatsApp Web y ahí el texto sí entra bien en la caja del mensaje.

   FOTOS (02/11/2026). Con `fotos`, el mismo menú de compartir lleva las
   imágenes junto con el texto (en WhatsApp el texto queda como pie de foto).
   Un enlace `wa.me` no puede llevar archivos: donde el menú no acepta fotos
   se abre el enlace y las fotos se descargan para arrastrarlas al chat.
   ============================================================ */
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { toast } from '@/shared/ui/Toast';
import { enlaceWhatsapp } from '@/shared/lib/whatsapp';

/** Baja cada foto como archivo, para soltarla en el chat de WhatsApp Web. */
function descargarFotos(fotos: File[]) {
  fotos.forEach((f, i) => {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url; a.download = f.name || `foto-${i + 1}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
}

const SIN_FOTOS: File[] = [];

export function CompartirWhatsapp({ texto, fotos = SIN_FOTOS }: { texto: string; fotos?: File[] }) {
  const [copiado, setCopiado] = useState(false);
  // El menú de compartir del teléfono. En una PC no existe y se cae al enlace.
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  // ¿El menú acepta estas fotos? (Firefox de PC, por ejemplo, no comparte archivos.)
  const puedeConFotos = useMemo(() => {
    if (!puedeCompartir || !fotos.length || typeof navigator.canShare !== 'function') return false;
    try { return navigator.canShare({ files: fotos }); } catch { return false; }
  }, [puedeCompartir, fotos]);
  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => { previas.forEach((u) => URL.revokeObjectURL(u)); }, [previas]);

  async function compartir(e: MouseEvent<HTMLAnchorElement>) {
    if (fotos.length && !puedeConFotos) {
      // Sigue el href (WhatsApp con el texto) y las fotos se bajan para adjuntarlas.
      descargarFotos(fotos);
      toast(`Se descargaron ${fotos.length === 1 ? 'la foto' : `las ${fotos.length} fotos`}: arrástralas al chat de WhatsApp.`, 'info');
      return;
    }
    if (!puedeCompartir) return;   // sin menú nativo, que siga el href de siempre
    e.preventDefault();
    try {
      await navigator.share(puedeConFotos ? { text: texto, files: fotos } : { text: texto });
    } catch (err) {
      // Cancelar el menú NO es un error: no se le avisa nada a nadie. Cualquier
      // otra falla cae al enlace de siempre, que es lo que había antes.
      if ((err as { name?: string })?.name === 'AbortError') return;
      window.open(enlaceWhatsapp(texto), '_blank', 'noopener,noreferrer');
      if (fotos.length) descargarFotos(fotos);
    }
  }

  async function copiar() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(texto);
      else {
        // Navegador viejo o sin permiso: se copia con un textarea escondido.
        const ta = document.createElement('textarea');
        ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      setCopiado(true);
      toast('Mensaje copiado', 'success');
      setTimeout(() => setCopiado(false), 2500);
    } catch { toast('No se pudo copiar. Mantén el dedo sobre el texto para copiarlo.', 'error'); }
  }

  return (
    <div className="surt-compartir">
      <div className="surt-compartir-txt">{texto}</div>
      {!!fotos.length && (
        <div className="rep-fotos" style={{ marginBottom: '.5rem' }}>
          {fotos.map((f, i) => (
            <div key={`${f.name}-${i}`} className="rep-foto"><img src={previas[i]} alt={f.name} /></div>
          ))}
        </div>
      )}
      <div className="surt-compartir-btns">
        <a className="btn btn-wsp btn-grande" href={enlaceWhatsapp(texto)} target="_blank" rel="noopener noreferrer"
          onClick={(e) => void compartir(e)}>
          {fotos.length ? `📲 Enviar por WhatsApp con ${fotos.length === 1 ? 'la foto' : `${fotos.length} fotos`}` : '📲 Enviar por WhatsApp'}
        </a>
        <button type="button" className="btn btn-ghost btn-grande" onClick={() => void copiar()}>
          {copiado ? '✅ Copiado' : '📋 Copiar'}
        </button>
      </div>
      {fotos.length > 0 && !puedeConFotos ? (
        <small className="muted" style={{ display: 'block', marginTop: '.45rem' }}>
          Este navegador no le pasa fotos a WhatsApp: se abre el chat con el mensaje y las fotos
          se descargan para que las arrastres al chat.
        </small>
      ) : puedeCompartir && (
        <small className="muted" style={{ display: 'block', marginTop: '.45rem' }}>
          Se abre el menú de compartir: elige WhatsApp y el chat. Así el mensaje llega con los
          emojis y los renglones enteros{fotos.length ? ', y las fotos van junto con el texto' : ''}.
        </small>
      )}
    </div>
  );
}
