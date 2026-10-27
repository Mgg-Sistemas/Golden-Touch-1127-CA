-- 26/10/2026 · Vista `maquinaria_lecturas_unificadas`: emparejar Combustible ↔ Maquinaria con la
-- MISMA normalización que el RPC `combustible_lectura_vigente` (sin acentos, minúsculas, solo
-- letras y números) y sin duplicar movimientos.
--
-- Antes (23/10/2026) el tramo de Combustible emparejaba por texto EXACTO (`btrim`) con un
-- LEFT JOIN con OR entre `combustible_equipo` y `equipo`: un surtido cargado como
-- «Hilux  roja» o «HILUX ROJA» no llegaba al horómetro de Maquinaria, y si dos equipos
-- compartían el texto (uno por vínculo y otro por nombre) el mismo movimiento aparecía dos veces.
--
-- Ahora:
--   · Normalización: regexp_replace(lower(extensions.unaccent(coalesce(x, ''))), '[^a-z0-9]', '', 'g')
--     (idéntica a la del RPC `combustible_lectura_vigente`).
--   · Un movimiento → UN solo equipo (LEFT JOIN LATERAL … LIMIT 1) con prioridad al vínculo
--     explícito `combustible_equipo`; solo si no hay vínculo se usa el nombre `equipo`. A igualdad,
--     gana el equipo activo y luego el más antiguo (orden estable).
--   · Mismas columnas y tipos que hoy (equipo_id uuid, equipo_comb text, origen text, referencia text,
--     fecha timestamptz, horometro numeric, kilometraje numeric, es_correccion boolean, actor text):
--     el RPC `maquinaria_lecturas_vigentes` y la app dependen de ellas.
--
-- Comparación hecha antes de aplicar (26/10/2026): 269 filas antes y después (265 combustible,
-- 3 bitácora, 1 maquinaria); 223 movimientos de combustible con equipo en ambas; ningún movimiento
-- duplicado hoy; los 42 surtidos sin equipo (OLYMPIA GEP550 (PERKINS), ENCAVA EP-1000-A96BM3R (3),
-- JUMBO XCMG, …) siguen sin equipo porque no existen en Maquinaria con ningún nombre parecido.
-- La migración es preventiva: a partir de ahora espacios/acentos/mayúsculas no rompen el emparejamiento.

CREATE OR REPLACE VIEW public.maquinaria_lecturas_unificadas AS
 SELECT l.equipo_id,
    COALESCE(NULLIF(btrim(e.combustible_equipo), ''::text), btrim(e.equipo)) AS equipo_comb,
    'maquinaria'::text AS origen,
    l.id::text AS referencia,
    l.fecha,
    l.horometro,
    l.kilometraje,
    l.es_correccion,
    COALESCE(l.actor_name, l.actor) AS actor
   FROM public.maquinaria_lecturas l
     JOIN public.maquinaria_equipos e ON e.id = l.equipo_id
UNION ALL
 SELECT eq.equipo_id,
    btrim(m.equipo) AS equipo_comb,
    'combustible'::text AS origen,
    m.id::text AS referencia,
    public.maquinaria_momento(m.fecha, m.hora, m.created_at) AS fecha,
    m.horometro_fin AS horometro,
    m.kilometraje,
    false AS es_correccion,
    COALESCE(m.actor_name, m.created_by) AS actor
   FROM public.combustible_tanque_movimientos m
     -- Texto del surtido normalizado una sola vez por movimiento.
     CROSS JOIN LATERAL (
       SELECT regexp_replace(lower(extensions.unaccent(coalesce(m.equipo, ''))), '[^a-z0-9]', '', 'g') AS norm
     ) n
     -- UN solo equipo por movimiento: primero el vínculo explícito, después el nombre.
     LEFT JOIN LATERAL (
       SELECT e.id AS equipo_id
         FROM public.maquinaria_equipos e
        WHERE n.norm <> ''::text
          AND (
            regexp_replace(lower(extensions.unaccent(coalesce(e.combustible_equipo, ''))), '[^a-z0-9]', '', 'g') = n.norm
            OR regexp_replace(lower(extensions.unaccent(coalesce(e.equipo, ''))), '[^a-z0-9]', '', 'g') = n.norm
          )
        ORDER BY
          (regexp_replace(lower(extensions.unaccent(coalesce(e.combustible_equipo, ''))), '[^a-z0-9]', '', 'g') = n.norm) DESC,
          e.activo DESC,
          e.created_at ASC,
          e.id ASC
        LIMIT 1
     ) eq ON true
  WHERE COALESCE(btrim(m.equipo), ''::text) <> ''::text AND (m.horometro_fin IS NOT NULL OR m.kilometraje IS NOT NULL)
UNION ALL
 SELECT b.equipo_id,
    COALESCE(NULLIF(btrim(e.combustible_equipo), ''::text), btrim(e.equipo)) AS equipo_comb,
    'bitacora'::text AS origen,
    b.id::text AS referencia,
    ((b.fecha::timestamp without time zone + (b.created_at AT TIME ZONE 'America/Caracas'::text)::time without time zone::interval) AT TIME ZONE 'America/Caracas'::text) AS fecha,
    b.horometro,
    b.kilometraje,
    false AS es_correccion,
    COALESCE(b.actor_name, b.created_by) AS actor
   FROM public.maquinaria_mantenimientos b
     JOIN public.maquinaria_equipos e ON e.id = b.equipo_id
  WHERE b.horometro IS NOT NULL OR b.kilometraje IS NOT NULL;

-- RPC `maquinaria_lecturas_vigentes()` tal como está en la base (26/10/2026). No cambia: se
-- versiona aquí porque no estaba en el repo. Lee la vista de arriba y devuelve, por equipo, el
-- horómetro y el km vigentes (el mayor desde el último corte de corrección), con fecha y origen.
CREATE OR REPLACE FUNCTION public.maquinaria_lecturas_vigentes()
 RETURNS TABLE(equipo_id uuid, horometro numeric, horometro_fecha timestamp with time zone, horometro_origen text, kilometraje numeric, km_fecha timestamp with time zone, km_origen text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with u as (select * from public.maquinaria_lecturas_unificadas where equipo_id is not null),
  ch as (select equipo_id, max(fecha) corte from u where es_correccion and horometro is not null group by 1),
  ck as (select equipo_id, max(fecha) corte from u where es_correccion and kilometraje is not null group by 1),
  h as (
    select distinct on (u.equipo_id) u.equipo_id, u.horometro, u.fecha, u.origen
      from u left join ch on ch.equipo_id = u.equipo_id
     where u.horometro is not null and u.fecha >= coalesce(ch.corte, '-infinity'::timestamptz)
     order by u.equipo_id, u.horometro desc, u.fecha desc),
  k as (
    select distinct on (u.equipo_id) u.equipo_id, u.kilometraje, u.fecha, u.origen
      from u left join ck on ck.equipo_id = u.equipo_id
     where u.kilometraje is not null and u.fecha >= coalesce(ck.corte, '-infinity'::timestamptz)
     order by u.equipo_id, u.kilometraje desc, u.fecha desc)
  select coalesce(h.equipo_id, k.equipo_id), h.horometro, h.fecha, h.origen, k.kilometraje, k.fecha, k.origen
    from h full join k on k.equipo_id = h.equipo_id;
$function$;
