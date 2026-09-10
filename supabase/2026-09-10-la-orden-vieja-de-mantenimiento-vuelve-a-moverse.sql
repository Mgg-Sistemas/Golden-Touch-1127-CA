-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 10/09/2026
-- Las órdenes de mantenimiento viejas vuelven a poder pagarse
--
-- QUÉ PASÓ (error propio, del mismo día)
-- Al agregar «qué repuesto lleva este mantenimiento» se puso una
-- restricción sobre `ordenes`:
--     CHECK (servicio_mantenimiento_declara_insumo(items)) NOT VALID
-- El NOT VALID evita revisar las filas que ya estaban… PERO SOLO AL
-- CREARLA. En cuanto una de esas filas se ACTUALIZA, Postgres sí la
-- revisa. Y toda orden de mantenimiento anterior a la casilla no
-- declara repuesto, porque la casilla no existía cuando se cargó.
--
-- Resultado: 28 órdenes quedaron congeladas. Cualquier UPDATE sobre
-- ellas moría con
--     23514 · violates check constraint "mantenimiento_declara_insumo"
-- Pagar una empieza justamente por un UPDATE (la reserva del cierre),
-- así que CS-2026-0016 no se podía pagar. Tres estaban vivas:
--   CS-2026-0011 (oc_creada) · CS-2026-0012 (cuenta_abierta)
--   CS-2026-0016 (oc_aprobada, la que dio el error)
--
-- CÓMO SE ARREGLA
-- La regla sigue en pie para lo que se carga de ahora en adelante,
-- pero deja de ser un CHECK y pasa a ser un disparador que solo
-- prohíbe EMPEORAR:
--   · orden nueva → tiene que declarar.
--   · orden que YA declaraba → no puede dejar de declarar.
--   · orden vieja que nunca declaró → sigue su curso y se puede pagar.
-- No se rellena nada a la fuerza: marcarlas «sin repuesto» sería
-- afirmar algo que nadie afirmó.
-- ═══════════════════════════════════════════════════════════════════

alter table public.ordenes drop constraint if exists mantenimiento_declara_insumo;

create or replace function public.ordenes_exige_declarar_insumo()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $fn$
declare
  v_msg text := 'Cada renglón de MANTENIMIENTO tiene que decir qué repuesto del inventario lleva, o marcarse como «sin repuesto».';
begin
  -- Lo que se está guardando cumple: pasa siempre.
  if public.servicio_mantenimiento_declara_insumo(new.items) then
    return new;
  end if;

  -- No cumple. Si es nueva, no entra.
  if tg_op = 'INSERT' then
    raise exception '%', v_msg using errcode = '23514';
  end if;

  -- Es una edición. Si la orden YA declaraba, no se la puede dejar sin declarar.
  if public.servicio_mantenimiento_declara_insumo(old.items) then
    raise exception '%', v_msg using errcode = '23514';
  end if;

  -- Orden anterior a la casilla: nunca declaró y no se le exige ahora.
  return new;
end
$fn$;

drop trigger if exists trg_ordenes_exige_declarar_insumo on public.ordenes;
create trigger trg_ordenes_exige_declarar_insumo
  before insert or update of items on public.ordenes
  for each row execute function public.ordenes_exige_declarar_insumo();


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from pg_constraint con join pg_class c on c.oid=con.conrelid
    where c.relname='ordenes' and con.conname='mantenimiento_declara_insumo')            as check_que_queda,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='ordenes' and t.tgname='trg_ordenes_exige_declarar_insumo')          as trigger_puesto,
  (select count(*) from public.ordenes
    where not public.servicio_mantenimiento_declara_insumo(items))                       as ordenes_sin_declarar,
  (select count(*) from public.ordenes
    where not public.servicio_mantenimiento_declara_insumo(items)
      and estado not in ('cancelada','pagada','finalizada'))                             as de_esas_vivas;
