-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 09/09/2026
-- Un producto dado de baja guarda CUÁNDO se desactivó y QUIÉN lo hizo
--
-- POR QUÉ
-- El inventario ya no muestra productos inactivos (se quitó el selector de
-- estado ese mismo día). Para que la baja no sea un agujero negro, ahora hay
-- una pantalla aparte —«Productos inactivos»— desde donde se consultan y se
-- pueden reactivar. Esa pantalla necesita decir de quién fue la decisión y
-- cuándo se tomó, y ese dato no existía: `productos` solo tenía `updated_at`,
-- que se mueve con CUALQUIER edición.
--
-- CÓMO SE LLENA
-- Con un trigger, no desde la pantalla. Da igual por qué camino se cambie el
-- estado —el botón del inventario, una importación, un script—: si el producto
-- pasa a inactivo queda sellado. El correo sale del token de la sesión
-- (`auth.jwt()`), así que no se puede falsear desde el cliente.
-- Al reactivar, el sello se borra: el producto vuelve a estar vivo y no tiene
-- sentido que arrastre la fecha de una baja que ya no rige.
--
-- LOS 79 QUE YA ESTABAN DE BAJA
-- Su fecha se rellena con `updated_at`, que es lo único que hay. Es una
-- APROXIMACIÓN razonable: esas 79 bajas se hicieron en 6 días concretos
-- (10/08, 21/08, 31/08, 02/09, 04/09 y 07/09), o sea limpiezas por tanda, y
-- `updated_at` quedó en el día de cada tanda. El AUTOR se deja en NULL a
-- propósito: nunca se registró y no se va a inventar. La pantalla muestra
-- «sin registro» para esos, y el dato exacto empieza a partir de hoy.
-- ═══════════════════════════════════════════════════════════════════

alter table public.productos
  add column if not exists desactivado_at  timestamptz,
  add column if not exists desactivado_por text;

comment on column public.productos.desactivado_at  is
  'Cuándo pasó a inactivo. Lo sella un trigger. Para las bajas anteriores al 09/09/2026 es una aproximación tomada de updated_at.';
comment on column public.productos.desactivado_por is
  'Correo de quien lo dio de baja, tomado del token de la sesión. NULL en las bajas anteriores al 09/09/2026: no se registraba.';

create or replace function public.productos_sella_la_baja()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado::text = 'inactivo' then
      new.desactivado_at  := now();
      -- Si el cambio no viene de una sesión (script, service_role) queda NULL:
      -- mejor un vacío honesto que un autor inventado.
      new.desactivado_por := nullif(auth.jwt() ->> 'email', '');
    else
      -- Vuelve a estar activo: el sello de la baja anterior deja de aplicar.
      new.desactivado_at  := null;
      new.desactivado_por := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_productos_sella_la_baja on public.productos;
create trigger trg_productos_sella_la_baja
  before update of estado on public.productos
  for each row
  execute function public.productos_sella_la_baja();

-- Relleno de las bajas viejas (solo la fecha, y solo si está vacía).
update public.productos
   set desactivado_at = updated_at
 where estado::text = 'inactivo'
   and desactivado_at is null;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación: cuántas bajas hay, cuántas tienen fecha y cuántas autor
-- ═══════════════════════════════════════════════════════════════════
select count(*)                                          as inactivos,
       count(desactivado_at)                             as con_fecha,
       count(desactivado_por)                            as con_autor,
       min(desactivado_at)::date                         as baja_mas_vieja,
       max(desactivado_at)::date                         as baja_mas_nueva
  from public.productos
 where estado::text = 'inactivo';
