/* ============================================================
   Golden Touch · Selector de CATEGORÍA de producto

   Lista buscable del catálogo de categorías de inventario (el mismo que se
   administra en Inventario → «Categorías y medidas»), que además deja escribir
   una categoría nueva si no existe. Lo usan las altas rápidas de producto
   (solicitud de pedido, edición de OC y Tesorería), para que no se escriba a
   mano una variante de algo que ya existe («REPUESTO» vs «REPUESTOS»).

   Formato: siempre en MAYÚSCULAS y nunca GENERAL (la base la rechaza).
   La categoría nueva entra al catálogo recién al CREAR el producto, con
   `asegurarCategoria`: si coincide con una existente sin importar mayúsculas
   ni acentos de más, se usa la que ya estaba escrita en el catálogo.
   ============================================================ */
import { useEffect, useState } from 'react';
import { SearchCreateSelect } from '@/shared/ui/SearchSelect';
import { addCategoria, getCategorias } from './inventario.repository';
import { esCategoriaReal } from './categoriaReal';

/** Mayúsculas, sin espacios de más. */
export function formatoCategoria(v: string): string {
  return v.replace(/\s+/g, ' ').trimStart().toUpperCase();
}

/**
 * Deja la categoría en el catálogo (si no estaba) y devuelve cómo quedó escrita
 * allí. Si el catálogo no se puede tocar (permisos, red), sigue con la tecleada:
 * el producto igual se crea con esa categoría.
 */
export async function asegurarCategoria(categoria: string, actorEmail?: string | null): Promise<string> {
  const limpia = formatoCategoria(categoria).trim();
  try {
    const canonica = await addCategoria(limpia, actorEmail ?? undefined);
    return canonica ?? limpia;
  } catch {
    return limpia;
  }
}

export function CategoriaProductoSelect({
  value, onChange, id, placeholder = '🔍 Categoría * (buscá o escribí una nueva)', disabled,
}: {
  value: string;
  onChange: (categoria: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [opciones, setOpciones] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    getCategorias()
      .then((cs) => { if (vivo) setOpciones(cs.filter(esCategoriaReal)); })
      .catch(() => { if (vivo) setOpciones([]); });
    return () => { vivo = false; };
  }, []);

  return (
    <SearchCreateSelect
      id={id}
      options={opciones}
      value={value}
      onChange={(v) => onChange(formatoCategoria(v))}
      placeholder={placeholder}
      emptyText="Sin coincidencias: escribí el nombre para crearla"
      disabled={disabled}
    />
  );
}
