begin;

-- Las compras recibidas siguen habilitando el trabajo del taller. Al finalizar
-- la compra o el servicio, se cierra la orden de maquinaria enlazada.
create or replace function public.compras_cerrar_mantenimiento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.maquinaria_ordenes_servicio os
     set estado = 'realizada',
         cerrada_at = coalesce(new.finalizada_en, now()),
         nota_cierre = 'Finalizada desde Compras (' || coalesce(new.oc_codigo, new.codigo, 'compra') || ').'
   where os.orden_compra_id = new.id
     and os.estado in ('abierta', 'repuestos', 'en_proceso');
  return null;
end;
$$;

-- Cada transición tiene un solo responsable. El trigger anterior conserva
-- recepción, cancelación, rechazo y desistimiento.
drop trigger if exists trg_compras_sincroniza_ordenes_servicio on public.ordenes;
create trigger trg_compras_sincroniza_ordenes_servicio
  after update of estado on public.ordenes
  for each row when (new.estado::text <> 'finalizada')
  execute function public.compras_sincroniza_ordenes_servicio();

drop trigger if exists trg_compras_cerrar_mantenimiento on public.ordenes;
create trigger trg_compras_cerrar_mantenimiento
  after update of estado on public.ordenes
  for each row when (new.estado::text = 'finalizada' and old.estado is distinct from new.estado)
  execute function public.compras_cerrar_mantenimiento();

-- Regulariza órdenes que quedaron activas con Compras ya finalizada.
update public.maquinaria_ordenes_servicio os
   set estado = 'realizada',
       cerrada_at = coalesce(c.finalizada_en, now()),
       nota_cierre = 'Finalizada desde Compras (' || coalesce(c.oc_codigo, c.codigo, 'compra') || ').'
  from public.ordenes c
 where os.orden_compra_id = c.id
   and c.estado = 'finalizada'
   and os.estado in ('abierta', 'repuestos', 'en_proceso');

commit;
