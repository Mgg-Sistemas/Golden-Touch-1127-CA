-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 11/09/2026
-- La categoría nueva del Centro de Acopio sigue la numeración
--
-- QUÉ PASABA
-- Al agregar una categoría, el sistema le ponía `orden = 999` fijo. La
-- primera pasaba desapercibida; a partir de la segunda se amontonaban
-- todas en 999 y la lista, que ordena por `orden`, se rompía: PEAJE y
-- CENTRO DE ACOPIO quedaron las dos en 999, detrás del 22, y entre
-- ellas se desempataba por orden alfabético. La numeración dejaba de
-- decir nada.
--
-- CÓMO QUEDA
-- El número lo pone la BASE, no la pantalla: al insertar sin `orden`
-- (queda en 0 por defecto) o con 999 —que es lo que manda la versión
-- vieja, y una pestaña sin recargar la sigue mandando— toma el
-- siguiente del GRUPO. Vale igual si la categoría entra desde el modal,
-- desde un script o desde otra pantalla que se agregue mañana.
--
-- Las que quedaron en 999 se reacomodan al final de su grupo.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.acopio_clasificacion_numera()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $fn$
begin
  -- 999 era el valor que mandaba la pantalla vieja: se trata como "sin número".
  if new.orden is null or new.orden <= 0 or new.orden = 999 then
    select coalesce(max(orden), 0) + 1 into new.orden
      from public.acopio_clasificaciones
     where grupo = new.grupo and orden < 999;
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_acopio_clasificacion_numera on public.acopio_clasificaciones;
create trigger trg_acopio_clasificacion_numera
  before insert on public.acopio_clasificaciones
  for each row execute function public.acopio_clasificacion_numera();


-- ── Reacomodo de las que quedaron en 999 ────────────────────────────
-- Sin fecha de creación en la tabla, se ordenan por nombre: es lo único
-- estable que hay y deja el resultado repetible.
with amontonadas as (
  select id, grupo,
         row_number() over (partition by grupo order by valor) as puesto
    from public.acopio_clasificaciones
   where orden = 999
),
techo as (
  select grupo, max(orden) as ultimo
    from public.acopio_clasificaciones
   where orden < 999
   group by grupo
)
update public.acopio_clasificaciones c
   set orden = coalesce(t.ultimo, 0) + a.puesto
  from amontonadas a
  left join techo t on t.grupo = a.grupo
 where c.id = a.id;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select json_agg(t) from (
  select grupo, count(*) as categorias, min(orden) as desde, max(orden) as hasta,
         count(*) filter (where orden = 999) as todavia_en_999,
         count(*) - count(distinct orden)    as numeros_repetidos
    from public.acopio_clasificaciones
   group by grupo order by grupo
) t;
