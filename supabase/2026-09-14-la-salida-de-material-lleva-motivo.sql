-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 14/09/2026
-- La salida de material exige decir POR QUÉ sale
--
-- QUÉ PASABA
-- Desde el 09/09 el movimiento cargado a mano en Inventario (entrada,
-- salida, ajuste, consumo) no se guarda sin motivo: lo cuida la regla
-- `movimiento_manual_lleva_motivo` sobre `movimientos`.
-- Pero la SALIDA DE MATERIAL del módulo Salidas no pasa por ahí. Nace como
-- una solicitud (`solicitudes_salida`), se aprueba, y al ejecutarla escribe
-- el movimiento con `ref_tipo = 'salida_modulo'`, que esa regla no mira.
-- Su campo «Motivo / detalle» era opcional: 7 salidas ejecutadas se fueron
-- sin decir por qué, y en el kardex quedaron 43 salidas sin detalle.
--
-- CÓMO SE ARREGLA
-- La regla se pone donde nace la salida: en la solicitud. Si la solicitud
-- trae motivo, el movimiento lo hereda al ejecutarse.
--
-- NO SE CONGELA LO VIEJO
-- Es un trigger y no un CHECK a propósito. Un CHECK NOT VALID se saltea las
-- filas viejas al crearse, pero las EXIGE en cualquier UPDATE posterior: el
-- 10/09 eso dejó sin poder pagar 28 órdenes de mantenimiento. Acá:
--   · al CREAR una salida de material, el motivo es obligatorio;
--   · al EDITAR, solo se rechaza BORRAR un motivo que ya estaba. Una salida
--     vieja sin motivo se puede seguir tocando (aprobar, ejecutar, anular).
-- Hoy ninguna salida por aprobar o aprobada está sin motivo, así que nada
-- pendiente queda trabado.
--
-- LO QUE NO CAMBIA
-- Traslados y salidas de dinero siguen como estaban: no se pidió.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.salida_material_lleva_motivo()
returns trigger language plpgsql security invoker set search_path to 'public' as $fn$
declare
  v_msg text := 'Escribí el motivo de la salida de material (al menos 3 letras). Queda en el historial del producto y es lo que permite explicarla después.';
begin
  if new.scope is distinct from 'salida' or new.tipo is distinct from 'material' then
    return new;
  end if;
  if length(btrim(coalesce(new.motivo, ''))) >= 3 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception '%', v_msg using errcode = '23514';
  end if;
  -- UPDATE: solo se rechaza si ANTES tenía motivo (no se permite borrarlo).
  if length(btrim(coalesce(old.motivo, ''))) >= 3 then
    raise exception '%', v_msg using errcode = '23514';
  end if;
  return new;
end $fn$;

drop trigger if exists trg_salida_material_lleva_motivo on public.solicitudes_salida;
create trigger trg_salida_material_lleva_motivo
  before insert or update of motivo on public.solicitudes_salida
  for each row execute function public.salida_material_lleva_motivo();


-- ═══════════════════════════════════════════════════════════════════
-- Prueba: borrarle el motivo a una salida que lo tiene TIENE que fallar.
-- Corre en una subtransacción: si el candado funciona, el error se atrapa y
-- no se toca nada. Si NO funcionara, se tira 'EL_CANDADO_NO_BLOQUEO', que no
-- se atrapa, y toda esta migración se deshace.
-- ═══════════════════════════════════════════════════════════════════
do $$
declare
  v_id public.solicitudes_salida.id%type;
begin
  select id into v_id
    from public.solicitudes_salida
   where scope = 'salida' and tipo = 'material'
     and length(btrim(coalesce(motivo, ''))) >= 3
   limit 1;
  if v_id is null then return; end if;
  begin
    update public.solicitudes_salida set motivo = '' where id = v_id;
    raise exception 'EL_CANDADO_NO_BLOQUEO';
  exception when sqlstate '23514' then
    null;  -- bloqueó, que es lo esperado
  end;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from pg_trigger
    where tgname = 'trg_salida_material_lleva_motivo')                         as candado_puesto,
  (select count(*) from public.solicitudes_salida
    where scope = 'salida' and tipo = 'material'
      and estado in ('por_aprobar', 'aprobada')
      and length(btrim(coalesce(motivo, ''))) < 3)                             as pendientes_sin_motivo,
  (select count(*) from public.solicitudes_salida
    where scope = 'salida' and tipo = 'material'
      and length(btrim(coalesce(motivo, ''))) < 3)                             as viejas_sin_motivo_que_se_respetan;
