-- 26/10/2026 · Compras → Maquinaria: la base sincroniza la orden de servicio con su compra
--
-- Una orden de servicio (OS) que pide repuestos queda enlazada a la solicitud/orden de
-- compra por maquinaria_ordenes_servicio.orden_compra_id. Hasta hoy:
--   · la cancelación la sincronizaba el NAVEGADOR (pedidos.repository.ts) con un try/catch
--     silencioso, y además escribía estado 'cancelada', que el CHECK de la OS no admite
--     (solo 'anulada'): nunca funcionó y nadie se enteraba;
--   · la recepción la hacía el trigger trg_maquinaria_os_compra_recibida (OS → en_proceso)
--     sin avisar a nadie; rechazada y desistida no hacían nada.
--
-- Este trigger reemplaza a los dos caminos. Corre con el permiso del servidor (security
-- definer), así que da igual si el usuario de Compras tiene o no permiso en Maquinaria.
--
-- Estados de la compra que atiende (AFTER UPDATE OF estado ON ordenes):
--   · recibida / finalizada  → si la OS esperaba repuestos pasa a «en proceso» (igual que
--                              antes y que el texto del asistente); el equipo pasa a taller
--                              solo si estaba en taller/repuestos (si lo tenían operativo no
--                              se toca; queda el evento en la bitácora). Notifica a Maquinaria.
--   · cancelada / rechazada  → la OS queda ANULADA con nota de cierre «Cancelada desde
--                              Compras (OC): motivo» y, si el equipo no tiene otra orden
--                              activa, vuelve a su estado previo (mismo criterio que
--                              maquinaria_avanzar_orden_servicio). Notifica a Maquinaria.
--   · desistida_proveedor    → la compra SIGUE VIVA (Compras vuelve a cotizar), así que la
--                              OS no cambia; solo se avisa a Maquinaria.
--   · pagada                 → no hace nada: pagar no significa que llegaron los repuestos.
--
-- Notificación persistente (tabla notificaciones, como maquinaria_notificar_compras_piezas):
-- una fila por cada rol de roles_permisos con escritura o full en el módulo «maquinaria»
-- (el lector solo ve las de su rol), con dedup por evento + OS + rol y enlace al expediente.
-- Si algo falla, no se bloquea el cambio de la compra: se registra un warning y se avisa al
-- rol admin para que no vuelva a pasar en silencio.
--
-- Aplicada el 26/10/2026 con apply_migration (name: compras_sincroniza_ordenes_servicio).

create or replace function public.compras_sincroniza_ordenes_servicio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  os record;
  rol record;
  v_estado   text := new.estado::text;
  v_oc       text;
  v_fecha    text;
  v_motivo   text;
  v_equipo   text;
  v_email    text;
  v_nombre   text;
  v_actual   text;
  v_otras    int;
  v_restaurar text;
  v_titulo   text;
  v_msg      text;
  v_kind     public.notif_kind;
  v_link     text;
  v_dedup    text;
begin
  if new.estado is not distinct from old.estado then return null; end if;
  if v_estado not in ('recibida', 'finalizada', 'cancelada', 'rechazada', 'desistida_proveedor') then
    return null;
  end if;

  v_oc := coalesce(new.oc_codigo, new.codigo, 'compra');
  v_fecha := to_char(now() at time zone 'America/Caracas', 'DD/MM/YYYY');
  -- Motivo: el del rechazo, o el del último evento del historial si es el de este cambio.
  v_motivo := coalesce(
    case when v_estado = 'rechazada' then nullif(btrim(coalesce(new.motivo_rechazo, '')), '') end,
    case when (new.historial -> -1 ->> 'evento') = v_estado then nullif(btrim(coalesce(new.historial -> -1 ->> 'motivo', '')), '') end,
    'sin motivo');
  select u.email, nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), '') into v_email, v_nombre
    from public.usuarios u where u.id = auth.uid();

  for os in
    select o.id, o.codigo, o.equipo_id, o.estado, o.estado_equipo_previo
      from public.maquinaria_ordenes_servicio o
     where o.orden_compra_id = new.id
       and o.estado in ('abierta', 'repuestos', 'en_proceso')
     for update
  loop
    begin
      select e.equipo into v_equipo from public.maquinaria_equipos e where e.id = os.equipo_id;
      v_equipo := coalesce(v_equipo, 'Equipo');
      v_link := '#/app/maquinaria/equipo/' || os.equipo_id || '?tab=servicios';

      if v_estado in ('recibida', 'finalizada') then
        -- ── Llegaron los repuestos ──
        if os.estado = 'repuestos' then
          update public.maquinaria_ordenes_servicio set estado = 'en_proceso' where id = os.id;
          select public.maquinaria_estado_efectivo(e.estado_operativo, e.status, e.activo) into v_actual
            from public.maquinaria_equipos e where e.id = os.equipo_id;
          if v_actual in ('taller', 'repuestos') then
            perform public.maquinaria_set_estado_interno(os.equipo_id, 'taller',
              os.codigo || ' · Repuestos recibidos (' || v_oc || ') · ' || v_fecha, null, null, os.id);
          else
            -- El equipo lo tenían trabajando: no se le cambia el estado, solo queda la constancia.
            insert into public.maquinaria_estado_eventos(equipo_id, estado_anterior, estado, motivo, nota, orden_servicio_id, actor, actor_name)
            values (os.equipo_id, v_actual, v_actual,
                    os.codigo || ' · Repuestos recibidos (' || v_oc || ') · ' || v_fecha,
                    'La orden pasó a «en proceso»; el equipo seguía ' || v_actual || '.',
                    os.id, coalesce(v_email, 'sistema'), v_nombre);
          end if;
          v_msg := v_equipo || ' · ' || os.codigo || ': llegaron los repuestos de la compra ' || v_oc
                   || ' (' || v_fecha || '). La orden de servicio pasó a «en proceso»: el taller ya puede trabajar.';
        else
          v_msg := v_equipo || ' · ' || os.codigo || ': se recibió la compra ' || v_oc || ' (' || v_fecha || ').';
        end if;
        v_titulo := '📦 Repuestos recibidos · ' || os.codigo;
        v_kind := 'success';

      elsif v_estado in ('cancelada', 'rechazada') then
        -- ── La compra no va: la orden de servicio se anula ──
        update public.maquinaria_ordenes_servicio
           set estado = 'anulada',
               nota_cierre = case when v_estado = 'cancelada' then 'Cancelada desde Compras (' else 'Rechazada en Compras (' end
                             || v_oc || '): ' || v_motivo,
               cerrada_at = now()
         where id = os.id;

        select count(*) into v_otras from public.maquinaria_ordenes_servicio
         where equipo_id = os.equipo_id and id <> os.id and estado in ('abierta', 'repuestos', 'en_proceso');
        if v_otras = 0 then
          v_restaurar := case when os.estado_equipo_previo in ('averiada', 'parada', 'espera') then os.estado_equipo_previo else 'operativa' end;
          perform public.maquinaria_set_estado_interno(os.equipo_id, v_restaurar,
            os.codigo || ' · orden anulada: compra ' || v_oc || case when v_estado = 'cancelada' then ' cancelada' else ' rechazada' end || ' en Compras',
            null, v_motivo, os.id);
        end if;

        v_titulo := case when v_estado = 'cancelada' then '⛔ Compra cancelada · ' else '⛔ Compra rechazada · ' end || os.codigo;
        v_msg := v_equipo || ' · ' || os.codigo || ': la compra ' || v_oc
                 || case when v_estado = 'cancelada' then ' fue cancelada' else ' fue rechazada' end
                 || ' en Compras (' || v_motivo || '). La orden de servicio quedó anulada; si los repuestos siguen haciendo falta, abre una orden nueva.';
        v_kind := 'warning';

      else
        -- ── desistida_proveedor: la compra sigue, Compras re-cotiza ──
        v_titulo := '🔁 Proveedor desistió · ' || os.codigo;
        v_msg := v_equipo || ' · ' || os.codigo || ': el proveedor de la compra ' || v_oc || ' desistió (' || v_motivo
                 || '). Compras vuelve a cotizar; la orden de servicio sigue igual.';
        v_kind := 'info';
      end if;

      -- Aviso a todos los roles que trabajan en Maquinaria (uno por rol: el lector ve solo el suyo).
      for rol in
        select rp.role from public.roles_permisos rp
         where coalesce((rp.permisos -> 'maquinaria' ->> 'escritura')::boolean, false)
            or coalesce((rp.permisos -> 'maquinaria' ->> 'full')::boolean, false)
      loop
        v_dedup := 'maq-os-oc-' || v_estado || '-' || os.id || '-' || rol.role;
        if not exists (select 1 from public.notificaciones n where n.dedup_key = v_dedup and n.read = false) then
          insert into public.notificaciones(destino, kind, title, message, link, dedup_key)
          values (rol.role, v_kind, v_titulo, v_msg, v_link, v_dedup);
        end if;
      end loop;

    exception when others then
      -- No se frena el cambio de la compra, pero tampoco se pierde en silencio.
      raise warning 'compras_sincroniza_ordenes_servicio (% → %): %', os.codigo, v_estado, sqlerrm;
      insert into public.notificaciones(destino, kind, title, message, link, dedup_key)
      values ('admin', 'error',
        '⚠️ Maquinaria no se sincronizó · ' || os.codigo,
        'La compra ' || v_oc || ' pasó a «' || v_estado || '» pero la orden de servicio ' || os.codigo
          || ' no se pudo actualizar: ' || sqlerrm,
        '#/app/maquinaria/equipo/' || os.equipo_id || '?tab=servicios',
        'maq-os-oc-error-' || os.id);
    end;
  end loop;

  return null;
end $$;

comment on function public.compras_sincroniza_ordenes_servicio() is
  'Compras → Maquinaria: al cambiar el estado de una compra, anula (cancelada/rechazada), avanza (recibida) o solo avisa (desistida) la orden de servicio enlazada y notifica a los roles de Maquinaria.';

-- El trigger viejo (solo recepción, sin aviso) queda reemplazado por este. El MCP de Supabase
-- rechaza los DROP, así que su función se deja como no-op (el trigger trg_maquinaria_os_compra_recibida
-- sigue colgado de ordenes pero ya no hace nada); se puede borrar a mano cuando se quiera:
--   drop trigger trg_maquinaria_os_compra_recibida on public.ordenes;
--   drop function public.maquinaria_os_compra_recibida();
create or replace function public.maquinaria_os_compra_recibida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Sustituida el 26/10/2026 por compras_sincroniza_ordenes_servicio(). No hace nada.
  return null;
end $$;

comment on function public.maquinaria_os_compra_recibida() is
  'OBSOLETA (26/10/2026): no hace nada. La sincronización Compras → Maquinaria la hace compras_sincroniza_ordenes_servicio().';

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_compras_sincroniza_ordenes_servicio' and tgrelid = 'public.ordenes'::regclass) then
    create trigger trg_compras_sincroniza_ordenes_servicio
      after update of estado on public.ordenes
      for each row execute function public.compras_sincroniza_ordenes_servicio();
  end if;
end $$;
