-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Avisar si el producto que se va a crear ya existe con otro nombre
--
-- QUÉ PASABA
-- Al cargar un producto nuevo desde la Solicitud de Pedido, el sistema solo
-- rechazaba el nombre EXACTO (ahora también ignorando tildes). Pero la gente
-- no repite el nombre exacto: escribe «FILTRO HIDRAULICO RETORNO» cuando ya
-- existe «FILTRO HIDRÁULICO DE RETORNO 14509379», o «ACEITE 15W40» cuando hay
-- «ACEITE DE MOTOR 15W-40». Así nacieron los duplicados que hubo que limpiar.
--
-- QUÉ HACE ESTA FUNCIÓN
-- Devuelve los productos activos que se PARECEN a lo que se está por crear,
-- para poder mostrárselos al usuario antes de que confirme.
--
-- CÓMO MIDE EL PARECIDO
-- No compara solo el nombre: arma un texto con TODAS las características que
-- identifican al producto —nombre, nombre de búsqueda, marca, modelo, código,
-- número de parte y SKU— y lo compara sin tildes ni mayúsculas. Así, escribir
-- un número de parte encuentra el producto aunque su nombre sea otro.
--
-- Se combinan dos señales, y basta con que una dé:
--   · TRIGRAMAS (`similarity`) para el parecido difuso — tolera palabras de
--     más, de menos y errores de tipeo. Es lo que usa el buscador de Google
--     cuando dice «quizás quisiste decir».
--   · CONTENCIÓN (`like`) para cuando uno es parte del otro. Los trigramas
--     castigan mucho la diferencia de largo, así que «ACEITE» contra «ACEITE
--     DE MOTOR 15W-40 SINTÉTICO» puntúa bajo aunque sea evidentemente lo
--     mismo. El `like` lo rescata.
--
-- NO ES SECURITY DEFINER a propósito: al consultar `productos` como el
-- usuario, las políticas RLS siguen aplicando. Nadie ve por acá lo que no
-- podría ver en el inventario.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.productos_parecidos(
  p_nombre    text,
  p_categoria text default null,
  p_limite    int  default 6
)
returns table (
  id        uuid,
  sku       text,
  nombre    text,
  categoria text,
  unidad    text,
  marca     text,
  modelo    text,
  almacen   text,
  stock     numeric,
  parecido  real,
  misma_categoria boolean
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  with buscado as (
    select public.sin_acentos(btrim(coalesce(p_nombre, ''))) as q
  ),
  candidatos as (
    select
      p.id, p.sku, p.nombre, p.categoria, p.unidad, p.marca, p.modelo, p.almacen,
      -- Todas las características que identifican al producto, en un solo texto.
      public.sin_acentos(concat_ws(' ',
        p.nombre, p.nombre_busqueda, p.marca, p.modelo, p.codigo, p.numero, p.sku
      )) as ficha,
      public.sin_acentos(p.nombre) as nom
    from public.productos p
    where p.estado = 'activo'
  )
  select
    c.id, c.sku, c.nombre, c.categoria, c.unidad, c.marca, c.modelo, c.almacen,
    coalesce((select sum(e.stock) from public.existencias e where e.producto_id = c.id), 0)::numeric as stock,
    -- El puntaje que se muestra: el mejor de las dos señales.
    greatest(
      extensions.similarity(c.nom, b.q),
      extensions.similarity(c.ficha, b.q),
      -- Contención: si uno está adentro del otro vale 0,80 fijo, suficiente
      -- para aparecer arriba sin desplazar a una coincidencia casi exacta.
      case when b.q <> '' and (c.ficha like '%' || b.q || '%' or b.q like '%' || c.nom || '%')
           then 0.80::real else 0::real end
    ) as parecido,
    (p_categoria is not null and c.categoria = p_categoria) as misma_categoria
  from candidatos c, buscado b
  where b.q <> ''
    and (
      extensions.similarity(c.nom, b.q)   >= 0.34
      or extensions.similarity(c.ficha, b.q) >= 0.34
      or c.ficha like '%' || b.q || '%'
      or b.q like '%' || c.nom || '%'
    )
  -- Primero lo más parecido; a igual parecido, lo de la misma categoría.
  order by parecido desc, (p_categoria is not null and c.categoria = p_categoria) desc, c.nombre
  limit greatest(1, least(coalesce(p_limite, 6), 20));
$$;

comment on function public.productos_parecidos(text, text, int) is
  'Productos activos parecidos a un nombre, comparando nombre + marca + modelo + código + SKU '
  'sin tildes. Combina trigramas (parecido difuso) y contención (uno dentro del otro). '
  'Se usa para avisar antes de crear un producto que quizá ya existe.';

grant execute on function public.productos_parecidos(text, text, int) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación · con casos reales del inventario
-- ═══════════════════════════════════════════════════════════════════
select 'FILTRO HIDRAULICO RETORNO' as se_escribio,
       (select count(*) from public.productos_parecidos('FILTRO HIDRAULICO RETORNO')) as encontrados,
       (select nombre from public.productos_parecidos('FILTRO HIDRAULICO RETORNO') limit 1) as el_mas_parecido
union all
select 'PLATANO',
       (select count(*) from public.productos_parecidos('PLATANO')),
       (select nombre from public.productos_parecidos('PLATANO') limit 1)
union all
select 'XYZQW COSA INEXISTENTE',
       (select count(*) from public.productos_parecidos('XYZQW COSA INEXISTENTE')),
       (select nombre from public.productos_parecidos('XYZQW COSA INEXISTENTE') limit 1);
