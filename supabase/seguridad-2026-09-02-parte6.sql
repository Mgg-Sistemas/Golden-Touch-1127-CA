-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 6
-- GT-INT-06 · Movimientos que entran a una caja YA CERRADA
--
-- QUÉ PASA
-- El formulario de Acopio manda el `caja_id` que tenía la pantalla cargada. Si
-- entre que se abrió el formulario y se guardó otra persona cerró la caja, el
-- movimiento entra igual: queda dentro de una caja cerrada.
--
-- No es sólo cosmético. La caja cerrada ya tiene su foto (`resumen_json`) y su
-- `saldo_final` congelados, y el arrastre a la caja nueva ya se calculó. Ese
-- movimiento no aparece en la foto, no entra en el saldo arrastrado y no está
-- en la caja abierta: es un gasto que existe en la tabla y en ningún reporte.
--
-- QUÉ CAMBIA
-- Un trigger que rechaza INSERTAR en una caja cerrada, con un mensaje que dice
-- qué hacer. La validación queda en el servidor, que es el único lugar donde
-- vale: la pantalla puede tener el dato viejo, la base no.
--
-- SOLO en INSERT, a propósito. El cierre reserva la caja (la marca cerrada) y
-- RECIÉN DESPUÉS barre los movimientos sin asignar hacia ella —un UPDATE de
-- `caja_id` sobre una caja ya cerrada—. Si el trigger corriera también en
-- UPDATE, bloquearía el propio cierre.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.bloquear_movimiento_en_caja_cerrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estado text;
  v_numero text;
begin
  if new.caja_id is null then
    return new;
  end if;

  select estado::text, numero into v_estado, v_numero
    from public.acopio_cajas where id = new.caja_id;

  if v_estado = 'cerrada' then
    raise exception 'La caja "%" ya fue cerrada. Actualizá la pantalla: el movimiento va en la caja nueva.',
      coalesce(v_numero, 'de acopio')
      using errcode = 'check_violation';
  end if;

  return new;
end $fn$;

drop trigger if exists trg_movimiento_en_caja_cerrada on public.acopio_caja_movimientos;
create trigger trg_movimiento_en_caja_cerrada
  before insert on public.acopio_caja_movimientos
  for each row execute function public.bloquear_movimiento_en_caja_cerrada();


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select case
         when count(*) = 1 then 'OK · trigger activo (solo INSERT)'
         else 'FALTA · el trigger no esta'
       end as estado
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relname = 'acopio_caja_movimientos'
  and t.tgname = 'trg_movimiento_en_caja_cerrada';
