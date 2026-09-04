-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Un SERVICIO nunca mueve inventario · la regla baja a la base de datos
--
-- LA REGLA
-- Un servicio se PRESTA: no llega mercadería que guardar. Vale para las dos
-- formas de montarlo:
--   · Orden de SERVICIO (Solicitud SS → Control de Servicio CS)
--   · SERVICIO DIRECTO (servicios_directos)
-- Vale además AUNQUE el servicio traiga renglones con producto: los repuestos
-- de un mantenimiento se montan en el equipo, no se guardan en el almacén. El
-- rastro del servicio queda en el historial del equipo y en el reinicio del
-- contador de mantenimiento; nunca en el kardex.
--
-- POR QUÉ HACE FALTA EN LA BASE
-- Hasta hoy la regla vivía SOLO en el cliente, en `ordenAfectaInventario()`.
-- Eso alcanza mientras todo el mundo pase por esa función, pero el cliente
-- habla directo con Postgres: cualquier camino nuevo —una pantalla, un script,
-- una corrección a mano— podía volver a sumar stock sin enterarse de la regla.
-- Ya pasó una vez: el 19/08 la orden de servicio SS-2026-0003 / CS-2026-0004
-- sumó +1 de MAT-010 «RECARGA DE GAS 43KG» al recibirse desde Inventario, y
-- hubo que revertirlo a mano el 03/09. El flag `afecta_inventario` no servía
-- de criterio: las 40 órdenes de servicio lo tenían en true.
-- Con el disparador, el intento FALLA en el servidor, venga de donde venga.
--
-- QUÉ BLOQUEA — y qué no
-- Bloquea insertar un movimiento de kardex que:
--   · referencie (`ref_tipo = 'orden'`) una orden cuyo `tipo` es 'servicio', o
--   · venga marcado como servicio directo (`ref_tipo = 'servicio_directo'`).
-- NO bloquea las correcciones: `correccion_servicio` es justamente el tipo con
-- el que se revirtió la entrada del 19/08, y tiene que poder seguir usándose
-- si aparece otra. Tampoco toca ningún otro origen (cocina, salidas, compras,
-- acopio, producción, unificaciones…).
--
-- ESTADO ACTUAL VERIFICADO ANTES DE INSTALARLO
-- No queda ningún movimiento vivo nacido de una orden de servicio: el único
-- que hubo (19/08) está compensado por su reverso del 03/09.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.movimientos_sin_servicios()
returns trigger
language plpgsql
as $function$
declare
  v_tipo_orden text;
begin
  -- Servicio directo: nunca hay nada que guardar en el almacén.
  if new.ref_tipo = 'servicio_directo' then
    raise exception 'Un SERVICIO DIRECTO no mueve inventario: se presta el servicio, no llega mercadería que guardar.'
      using errcode = 'check_violation';
  end if;

  -- Orden de servicio (SS → CS): se mira el TIPO de la orden, no el flag
  -- `afecta_inventario`, que en los servicios quedó en true por costumbre.
  if new.ref_tipo = 'orden' and coalesce(new.ref_id, '') <> '' then
    select o.tipo::text into v_tipo_orden
      from public.ordenes o where o.id::text = new.ref_id;
    if v_tipo_orden = 'servicio' then
      raise exception 'La orden de SERVICIO % no mueve inventario: el servicio se presta y queda en el historial del equipo, no en el almacén.',
        coalesce(new.ref_codigo, 'referenciada')
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.movimientos_sin_servicios() is
  'Impide que una orden de servicio (SS/CS) o un servicio directo sumen o resten stock. La regla vivía solo en el cliente (ordenAfectaInventario) y se escapó una vez el 19/08/2026.';

drop trigger if exists trg_movimientos_sin_servicios on public.movimientos;
create trigger trg_movimientos_sin_servicios
  before insert on public.movimientos
  for each row execute function public.movimientos_sin_servicios();


-- ═══════════════════════════════════════════════════════════════════
-- Verificación · el disparador tiene que RECHAZAR un servicio y DEJAR PASAR
-- todo lo demás. Se prueba de verdad contra una orden de servicio real y
-- después se limpia lo que se creó.
-- ═══════════════════════════════════════════════════════════════════
create temp table _v(caso text, resultado text);

do $$
declare
  v_orden   public.ordenes;
  v_prod    uuid;
  v_mov     uuid;
  v_msg     text;
begin
  select * into v_orden from public.ordenes where tipo = 'servicio' order by created_at desc limit 1;
  select id into v_prod from public.productos where sku = 'MAT-010';

  -- 1 · Una entrada nacida de una orden de SERVICIO debe fallar.
  begin
    insert into public.movimientos (producto_id, tipo, delta, almacen, stock_antes, stock_despues,
                                    actor, ref_tipo, ref_id, ref_codigo)
    values (v_prod, 'entrada', 1, 'General', 0, 1, 'prueba', 'orden',
            v_orden.id::text, v_orden.oc_codigo)
    returning id into v_mov;
    delete from public.movimientos where id = v_mov;
    insert into _v values ('1 · entrada desde orden de SERVICIO', 'MAL: la dejó pasar');
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    insert into _v values ('1 · entrada desde orden de SERVICIO', 'RECHAZADA · ' || v_msg);
  end;

  -- 2 · Un servicio directo debe fallar.
  begin
    insert into public.movimientos (producto_id, tipo, delta, almacen, stock_antes, stock_despues,
                                    actor, ref_tipo)
    values (v_prod, 'entrada', 1, 'General', 0, 1, 'prueba', 'servicio_directo')
    returning id into v_mov;
    delete from public.movimientos where id = v_mov;
    insert into _v values ('2 · entrada de SERVICIO DIRECTO', 'MAL: la dejó pasar');
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    insert into _v values ('2 · entrada de SERVICIO DIRECTO', 'RECHAZADA · ' || v_msg);
  end;

  -- 3 · La corrección de un servicio SÍ debe poder registrarse.
  begin
    insert into public.movimientos (producto_id, tipo, delta, almacen, stock_antes, stock_despues,
                                    actor, ref_tipo)
    values (v_prod, 'ajuste', 0, 'General', 0, 0, 'prueba', 'correccion_servicio')
    returning id into v_mov;
    delete from public.movimientos where id = v_mov;
    insert into _v values ('3 · corrección de servicio', 'PASA (correcto)');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into _v values ('3 · corrección de servicio', 'MAL: la bloqueó · ' || v_msg);
  end;

  -- 4 · Una compra normal SÍ debe poder registrarse.
  begin
    insert into public.movimientos (producto_id, tipo, delta, almacen, stock_antes, stock_despues,
                                    actor, ref_tipo)
    values (v_prod, 'entrada', 1, 'General', 0, 1, 'prueba', 'compra_directa')
    returning id into v_mov;
    delete from public.movimientos where id = v_mov;
    insert into _v values ('4 · compra directa normal', 'PASA (correcto)');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into _v values ('4 · compra directa normal', 'MAL: la bloqueó · ' || v_msg);
  end;
end $$;

select * from _v order by caso;
