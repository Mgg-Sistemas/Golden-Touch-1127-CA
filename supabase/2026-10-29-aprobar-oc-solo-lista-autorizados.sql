-- ============================================================
-- 29/10/2026 · Aprobar OC: SOLO los usuarios de la lista «Usuarios autorizados para:»
-- La usuaria quitó al ADMINISTRADOR de la lista y le seguía saliendo «Aprobar»:
-- el rol admin aprobaba por sí solo. Ahora decide únicamente la lista (opción
-- «Aprobar órdenes de compra»), también para cancelar una OC ya firmada
-- (trigger oc_aprobada_solo_gerente_cancela, que usa esta misma función).
-- Se mantiene `auth.uid() is null` en los triggers (procesos internos del sistema).
-- ============================================================
create or replace function public.puede_aprobar_oc()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.usuarios u
      join public.usuarios_autorizados a on a.email = lower(u.email)
     where u.id = auth.uid()
       and a.aprobar_oc
  );
$$;

create or replace function public.enforce_admin_aprueba_orden()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if (new.oc_aprobada_por is distinct from old.oc_aprobada_por and new.oc_aprobada_por is not null) then
    if not (public.puede_aprobar_oc() or auth.uid() is null) then
      raise exception 'Solo los usuarios autorizados para «Aprobar órdenes de compra» (Roles y Permisos) pueden aprobar la orden de compra.';
    end if;
  end if;
  return new;
end $function$;

create or replace function public.oc_aprobada_solo_gerente_cancela()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada'
     and old.estado in ('confirmada_metodo', 'oc_aprobada') then
    if not (public.puede_aprobar_oc() or auth.uid() is null) then
      raise exception 'Esta OC ya fue aprobada por el Gerente General: solo un usuario autorizado para aprobar órdenes de compra puede cancelarla o anularla.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$;
