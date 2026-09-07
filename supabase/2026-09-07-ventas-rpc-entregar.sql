-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Módulo de Ventas · `entregar_venta` — el paso en que se mueve el MATERIAL
--
-- LA REGLA QUE ORDENA EL MÓDULO
-- Al confirmar se mueve el dinero. Al entregar se mueve el material.
-- Esta función es la segunda mitad: saca del almacén lo que se vendió y, si es
-- permuta, mete lo que el cliente entregó a cambio. NO toca caja, NO toca la
-- cuenta por cobrar, no vuelve a calcular totales: todo eso ya pasó al
-- confirmar y volver a tocarlo sería cobrar dos veces.
--
-- POR QUÉ VIVE EN LA BASE Y NO EN EL NAVEGADOR
-- Una entrega de ocho renglones son ocho movimientos de kardex más ocho
-- `update` de existencias más el cambio de estado del documento. Valen todos o
-- ninguno. Hecho desde el navegador, un corte de luz en el renglón cinco deja
-- media venta entregada: tres productos que salieron del sistema pero siguen en
-- el estante, y un documento que dice «confirmada» como si no hubiera pasado
-- nada. Acá adentro es una sola transacción de Postgres.
--
-- POR QUÉ EL `exception` DE ABAJO VUELVE A LANZAR
-- Se atrapa el error de `registrar_movimiento_stock` con un único propósito:
-- que el vendedor lea «de ESTE producto faltan TANTAS» en vez de un error de
-- Postgres. Después se relanza. Si se lo tragara —un `exception when others
-- then null`, o peor, un `continue`— la transacción seguiría viva y la venta
-- terminaría en «entregada» con la mitad del material sin descontar. El
-- atomicidad no la da un `if`: la da el error que sube hasta arriba.
--
-- POR QUÉ EL RECIBIDO ENTRA CON `precio_unitario`
-- El material de una permuta no llega con factura: llega con un valor pactado
-- en la mesa (`ventas_recibidos.valor_unit`). Se lo pasa a
-- `registrar_movimiento_stock` como `precio_unitario` para que la función
-- recalcule sola el costo promedio ponderado de esa ficha. Si entrara sin
-- precio, el sistema heredaría el costo viejo —o cero— y el día que se venda
-- ese material la ganancia saldría inventada.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.entregar_venta(
  p_venta_id   uuid,
  p_actor      text default null,
  p_actor_name text default null
) returns public.ventas
language plpgsql
security invoker
set search_path = public
as $$
declare
  v            public.ventas;
  r            record;
  v_mov        public.movimientos;
  v_nombre     text;
  v_hay        numeric;
  v_faltan     numeric;
  v_msg        text;
  v_state      text;
  v_actor      text := nullif(trim(coalesce(p_actor, '')), '');
  v_actor_name text := nullif(trim(coalesce(p_actor_name, '')), '');
  v_salieron   numeric;
  v_entraron   numeric;
begin
  if p_venta_id is null then
    raise exception 'Falta decir qué venta se entrega.' using errcode = 'check_violation';
  end if;

  -- `for update` porque dos usuarios pueden apretar «Entregar» en el mismo
  -- segundo: el segundo espera acá y se encuentra el estado ya en «entregada»,
  -- que es exactamente lo que rechaza la guarda de abajo. Sin el candado, los
  -- dos leerían «confirmada» y el stock saldría dos veces.
  select * into v from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'No existe la venta %.', p_venta_id using errcode = 'no_data_found';
  end if;

  if v.estado <> 'confirmada' then
    raise exception 'La venta % está en «%»: solo se entrega una venta confirmada.',
      v.codigo, v.estado using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.ventas_renglones where venta_id = v.id) then
    raise exception 'La venta % no tiene renglones: no hay nada que entregar.',
      v.codigo using errcode = 'check_violation';
  end if;

  -- Red de seguridad contra una entrega repetida que se le escapara al estado:
  -- `mov_id` lleno significa que ese renglón ya salió del almacén una vez.
  if exists (select 1 from public.ventas_renglones where venta_id = v.id and mov_id is not null) then
    raise exception 'La venta % ya tiene renglones descargados del almacén: no se entrega dos veces.',
      v.codigo using errcode = 'check_violation';
  end if;

  -- ═════════════════════════════════════════════════════════════════
  -- 1 · Sale lo vendido
  -- ═════════════════════════════════════════════════════════════════
  for r in
    select * from public.ventas_renglones where venta_id = v.id order by orden, id
  loop
    v_nombre := coalesce(nullif(r.producto_nombre, ''), nullif(r.producto_sku, ''),
                         (select p.nombre from public.productos p where p.id = r.producto_id),
                         'este producto');
    begin
      v_mov := public.registrar_movimiento_stock(jsonb_build_object(
        'producto_id', r.producto_id,
        'tipo',        'salida',
        'delta',       -r.cantidad,
        'ref_tipo',    'venta',
        'ref_id',      v.id::text,
        'ref_codigo',  v.codigo,
        'actor',       coalesce(v_actor, v.actor),
        'actor_name',  coalesce(v_actor_name, v.actor_name),
        'destino',     coalesce(nullif(v.cliente_nombre, ''), 'Cliente'),
        'detalle',     format('Entrega de la venta %s · %s', v.codigo, v_nombre)
      ));
    exception when others then
      -- Se traduce el error, no se lo perdona: las dos ramas terminan en un
      -- `raise`, así que la transacción entera se va abajo y el stock de los
      -- renglones anteriores vuelve solo.
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      select coalesce(sum(e.stock), 0) into v_hay
        from public.existencias e where e.producto_id = r.producto_id;
      v_faltan := r.cantidad - v_hay;
      if v_state = '23514' and v_faltan > 0 then
        raise exception 'No se entregó la venta %: de «%» hacen falta % y hay %. Faltan %. No se movió nada del almacén.',
          v.codigo, v_nombre,
          trim(to_char(r.cantidad, 'FM999999990.####')),
          trim(to_char(v_hay,      'FM999999990.####')),
          trim(to_char(v_faltan,   'FM999999990.####'))
          using errcode = 'check_violation';
      end if;
      raise exception 'No se entregó la venta %: falló la salida de «%» (%). No se movió nada del almacén.',
        v.codigo, v_nombre, v_msg using errcode = v_state;
    end;

    -- Guarda de sanidad: lo que dice el kardex que salió tiene que ser lo que
    -- el renglón dice que se vendió. Si algún día un trigger recorta la salida,
    -- acá se ve; no en el inventario físico tres meses después.
    v_salieron := v_mov.stock_antes - v_mov.stock_despues;
    if round(v_salieron, 4) <> round(r.cantidad, 4) then
      raise exception 'Descuadre entregando %: de «%» se pidió sacar % y el kardex sacó %.',
        v.codigo, v_nombre,
        trim(to_char(r.cantidad,  'FM999999990.####')),
        trim(to_char(v_salieron, 'FM999999990.####'))
        using errcode = 'check_violation';
    end if;

    update public.ventas_renglones set mov_id = v_mov.id where id = r.id;
  end loop;

  -- ═════════════════════════════════════════════════════════════════
  -- 2 · Entra lo recibido (solo permuta)
  -- ═════════════════════════════════════════════════════════════════
  -- El intercambio ocurre físicamente en un solo acto: la misma transacción que
  -- saca lo vendido mete lo que el cliente trajo.
  if v.tipo = 'permuta' then
    for r in
      select * from public.ventas_recibidos where venta_id = v.id order by orden, id
    loop
      v_nombre := coalesce(nullif(r.producto_nombre, ''), nullif(r.producto_sku, ''),
                           (select p.nombre from public.productos p where p.id = r.producto_id),
                           'este producto');
      begin
        v_mov := public.registrar_movimiento_stock(jsonb_build_object(
          'producto_id',     r.producto_id,
          'tipo',            'entrada',
          'delta',           r.cantidad,
          -- El valor pactado ES el costo de ingreso: con esto el promedio
          -- ponderado de la ficha se recalcula solo.
          'precio_unitario', r.valor_unit,
          'ref_tipo',        'venta',
          'ref_id',          v.id::text,
          'ref_codigo',      v.codigo,
          'actor',           coalesce(v_actor, v.actor),
          'actor_name',      coalesce(v_actor_name, v.actor_name),
          'detalle',         format('Material recibido en la permuta %s · %s (valor pactado %s por %s)',
                                    v.codigo, v_nombre,
                                    trim(to_char(r.valor_unit, 'FM999999990.00')),
                                    coalesce(nullif(r.unidad, ''), 'unidad'))
        ));
      exception when others then
        get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
        raise exception 'No se entregó la permuta %: falló la entrada de «%» (%). No se movió nada del almacén.',
          v.codigo, v_nombre, v_msg using errcode = v_state;
      end;

      v_entraron := v_mov.stock_despues - v_mov.stock_antes;
      if round(v_entraron, 4) <> round(r.cantidad, 4) then
        raise exception 'Descuadre entregando %: de «%» se pidió meter % y el kardex metió %.',
          v.codigo, v_nombre,
          trim(to_char(r.cantidad,  'FM999999990.####')),
          trim(to_char(v_entraron, 'FM999999990.####'))
          using errcode = 'check_violation';
      end if;

      update public.ventas_recibidos set mov_id = v_mov.id where id = r.id;
    end loop;
  end if;

  -- ═════════════════════════════════════════════════════════════════
  -- 3 · El documento pasa a entregada
  -- ═════════════════════════════════════════════════════════════════
  -- `entregada_por` guarda el actor (el correo), igual que `cerrada_por` y
  -- `aprobada_por` en el resto del sistema; el nombre se muestra buscándolo.
  update public.ventas
     set estado        = 'entregada',
         entregada_at  = now(),
         entregada_por = coalesce(v_actor, v_actor_name, v.actor),
         updated_at    = now()
   where id = v.id
   returning * into v;

  return v;
end;
$$;

comment on function public.entregar_venta(uuid, text, text) is
  'Entrega una venta confirmada: saca del kardex cada renglón y, en permuta, mete cada recibido a su valor pactado. No toca caja ni cuentas por cobrar. Todo o nada.';

grant execute on function public.entregar_venta(uuid, text, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- Prueba con datos de mentira
-- ═══════════════════════════════════════════════════════════════════
-- Tres escenarios, y el tercero es el que importa: cuando falta stock en un
-- renglón, los renglones que ya habían salido tienen que volver solos. Se
-- prueba a propósito con el faltante en el SEGUNDO renglón, porque si el
-- faltante estuviera en el primero no habría nada que revertir y la prueba
-- pasaría sin probar nada.
--
-- Todo lleva el prefijo `ZZ-TEST-ENTREGA-` para no chocar con los datos de
-- mentira de las otras RPC que se están escribiendo el mismo día, y se borra al
-- final. Si alguna aserción falla, el `raise exception` tira abajo el bloque
-- entero y no queda basura igual.
-- ═══════════════════════════════════════════════════════════════════
do $$
declare
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_vt uuid; v_pm uuid; v_vt2 uuid;
  v_res    public.ventas;
  v_stock  numeric;
  v_costo  numeric;
  v_p1_antes numeric; v_p2_antes numeric;
  v_movs   int;
  v_nulos  int;
  v_msg    text;
  v_fallo  boolean := false;
begin
  -- ── Fichas de mentira ────────────────────────────────────────────
  insert into public.productos (sku, nombre, categoria, unidad, estado)
  values ('ZZ-TEST-ENTREGA-P1', 'ZZ-TEST-ENTREGA-P1 tornillo de prueba', 'Repuestos', 'UND', 'activo')
  returning id into v_p1;
  insert into public.productos (sku, nombre, categoria, unidad, estado)
  values ('ZZ-TEST-ENTREGA-P2', 'ZZ-TEST-ENTREGA-P2 aceite de prueba', 'Repuestos', 'LTS', 'activo')
  returning id into v_p2;
  insert into public.productos (sku, nombre, categoria, unidad, estado)
  values ('ZZ-TEST-ENTREGA-P3', 'ZZ-TEST-ENTREGA-P3 chatarra de prueba', 'Repuestos', 'KG', 'activo')
  returning id into v_p3;

  -- Stock inicial por kardex, no a mano: 10 de P1 a $5 y 20 de P2 a $3.
  -- P3 arranca en cero: es lo que va a entrar por la permuta.
  perform public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_p1, 'tipo', 'entrada', 'delta', 10, 'precio_unitario', 5,
    'ref_tipo', 'prueba', 'ref_codigo', 'ZZ-TEST-ENTREGA-CARGA',
    'actor', 'prueba-entregar-venta'));
  perform public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_p2, 'tipo', 'entrada', 'delta', 20, 'precio_unitario', 3,
    'ref_tipo', 'prueba', 'ref_codigo', 'ZZ-TEST-ENTREGA-CARGA',
    'actor', 'prueba-entregar-venta'));

  -- ═══ Escenario 1 · entrega feliz ═════════════════════════════════
  insert into public.ventas (codigo, tipo, estado, cliente_nombre, condicion, moneda,
                             subtotal, iva_pct, iva_monto, total, diferencia,
                             actor, actor_name, confirmada_at, confirmada_por)
  values ('ZZ-TEST-ENTREGA-VT1', 'venta', 'confirmada', 'Cliente de prueba', 'contado', 'USD',
          65, 16, 10.4, 75.4, 75.4,
          'prueba@golden', 'Prueba', now(), 'prueba@golden')
  returning id into v_vt;

  insert into public.ventas_renglones (venta_id, orden, producto_id, producto_sku, producto_nombre,
                                       unidad, cantidad, precio_unit, costo_unit, subtotal, ganancia)
  values (v_vt, 1, v_p1, 'ZZ-TEST-ENTREGA-P1', 'ZZ-TEST-ENTREGA-P1 tornillo de prueba', 'UND', 4, 10, 5, 40, 20),
         (v_vt, 2, v_p2, 'ZZ-TEST-ENTREGA-P2', 'ZZ-TEST-ENTREGA-P2 aceite de prueba',   'LTS', 5,  5, 3, 25, 10);

  v_res := public.entregar_venta(v_vt, 'prueba@golden', 'Prueba Automatizada');

  if v_res.estado <> 'entregada' then
    raise exception 'ESCENARIO 1: la venta quedó en «%» y se esperaba «entregada».', v_res.estado;
  end if;
  if v_res.entregada_at is null or v_res.entregada_por is null then
    raise exception 'ESCENARIO 1: no quedó registrado quién entregó ni cuándo.';
  end if;

  select coalesce(sum(stock), 0) into v_stock from public.existencias where producto_id = v_p1;
  if round(v_stock, 4) <> 6 then
    raise exception 'ESCENARIO 1: P1 tenía 10, se vendieron 4 y quedaron % (se esperaban 6).', v_stock;
  end if;
  select coalesce(sum(stock), 0) into v_stock from public.existencias where producto_id = v_p2;
  if round(v_stock, 4) <> 15 then
    raise exception 'ESCENARIO 1: P2 tenía 20, se vendieron 5 y quedaron % (se esperaban 15).', v_stock;
  end if;

  select count(*) into v_nulos from public.ventas_renglones where venta_id = v_vt and mov_id is null;
  if v_nulos <> 0 then
    raise exception 'ESCENARIO 1: quedaron % renglones sin `mov_id`: sin ese enganche no hay prueba de que salieron del almacén.', v_nulos;
  end if;

  -- Y el movimiento tiene que quedar identificado con el código de la venta,
  -- que es lo que después mira el kardex para saber por qué salió el material.
  select count(*) into v_movs
    from public.movimientos m
    join public.ventas_renglones vr on vr.mov_id = m.id
   where vr.venta_id = v_vt and m.ref_tipo = 'venta' and m.ref_codigo = 'ZZ-TEST-ENTREGA-VT1'
     and m.tipo = 'salida';
  if v_movs <> 2 then
    raise exception 'ESCENARIO 1: se esperaban 2 salidas de kardex marcadas como venta ZZ-TEST-ENTREGA-VT1 y hay %.', v_movs;
  end if;

  -- ═══ Escenario 2 · permuta ═══════════════════════════════════════
  -- Sale 1 de P1 y entran 10 de P3 valorados en $7. P3 no tenía stock ni costo,
  -- así que su costo promedio tiene que quedar exactamente en 7.
  insert into public.ventas (codigo, tipo, estado, cliente_nombre, condicion, moneda,
                             subtotal, iva_pct, iva_monto, total, valor_recibido, diferencia,
                             actor, actor_name, confirmada_at, confirmada_por)
  values ('ZZ-TEST-ENTREGA-PM1', 'permuta', 'confirmada', 'Cliente de prueba', 'contado', 'USD',
          80, 0, 0, 80, 70, 10,
          'prueba@golden', 'Prueba', now(), 'prueba@golden')
  returning id into v_pm;

  insert into public.ventas_renglones (venta_id, orden, producto_id, producto_sku, producto_nombre,
                                       unidad, cantidad, precio_unit, costo_unit, subtotal, ganancia)
  values (v_pm, 1, v_p1, 'ZZ-TEST-ENTREGA-P1', 'ZZ-TEST-ENTREGA-P1 tornillo de prueba', 'UND', 1, 80, 5, 80, 75);

  insert into public.ventas_recibidos (venta_id, orden, producto_id, producto_sku, producto_nombre,
                                       unidad, cantidad, valor_unit, subtotal)
  values (v_pm, 1, v_p3, 'ZZ-TEST-ENTREGA-P3', 'ZZ-TEST-ENTREGA-P3 chatarra de prueba', 'KG', 10, 7, 70);

  v_res := public.entregar_venta(v_pm, 'prueba@golden', 'Prueba Automatizada');

  if v_res.estado <> 'entregada' then
    raise exception 'ESCENARIO 2: la permuta quedó en «%».', v_res.estado;
  end if;

  select coalesce(sum(stock), 0) into v_stock from public.existencias where producto_id = v_p1;
  if round(v_stock, 4) <> 5 then
    raise exception 'ESCENARIO 2: P1 tenía 6, salió 1 y quedaron % (se esperaban 5).', v_stock;
  end if;

  select coalesce(sum(stock), 0), coalesce(max(costo_promedio), 0)
    into v_stock, v_costo
    from public.existencias where producto_id = v_p3;
  if round(v_stock, 4) <> 10 then
    raise exception 'ESCENARIO 2: el material recibido no entró al kardex: P3 quedó con %.', v_stock;
  end if;
  if round(v_costo, 4) <> 7 then
    raise exception 'ESCENARIO 2: P3 entró a costo % y el valor pactado era 7: el costo promedio no se recalculó con `precio_unitario`.', v_costo;
  end if;

  if exists (select 1 from public.ventas_recibidos where venta_id = v_pm and mov_id is null) then
    raise exception 'ESCENARIO 2: el recibido quedó sin `mov_id`.';
  end if;

  -- ═══ Escenario 3 · falta stock (el importante) ═══════════════════
  -- Primer renglón: 5 de P2, que hay de sobra → sale.
  -- Segundo renglón: 999 de P1, del que quedan 5 → revienta.
  -- Lo que se verifica no es que falle: es que los 5 de P2 VUELVAN.
  select coalesce(sum(stock), 0) into v_p1_antes from public.existencias where producto_id = v_p1;
  select coalesce(sum(stock), 0) into v_p2_antes from public.existencias where producto_id = v_p2;

  insert into public.ventas (codigo, tipo, estado, cliente_nombre, condicion, moneda,
                             subtotal, iva_pct, iva_monto, total, diferencia,
                             actor, actor_name, confirmada_at, confirmada_por)
  values ('ZZ-TEST-ENTREGA-VT2', 'venta', 'confirmada', 'Cliente de prueba', 'contado', 'USD',
          10000, 0, 0, 10000, 10000,
          'prueba@golden', 'Prueba', now(), 'prueba@golden')
  returning id into v_vt2;

  insert into public.ventas_renglones (venta_id, orden, producto_id, producto_sku, producto_nombre,
                                       unidad, cantidad, precio_unit, costo_unit, subtotal, ganancia)
  values (v_vt2, 1, v_p2, 'ZZ-TEST-ENTREGA-P2', 'ZZ-TEST-ENTREGA-P2 aceite de prueba',   'LTS',   5, 5, 3, 25, 10),
         (v_vt2, 2, v_p1, 'ZZ-TEST-ENTREGA-P1', 'ZZ-TEST-ENTREGA-P1 tornillo de prueba', 'UND', 999, 10, 5, 9990, 4995);

  begin
    v_res := public.entregar_venta(v_vt2, 'prueba@golden', 'Prueba Automatizada');
  exception when others then
    v_fallo := true;
    get stacked diagnostics v_msg = message_text;
  end;

  if not v_fallo then
    raise exception 'ESCENARIO 3: la venta se entregó igual con 999 unidades de un producto del que hay %.', v_p1_antes;
  end if;
  if position('ZZ-TEST-ENTREGA-P1' in v_msg) = 0 then
    raise exception 'ESCENARIO 3: el mensaje no dice qué producto faltó. Decía: %', v_msg;
  end if;
  if position('altan' in v_msg) = 0 then
    raise exception 'ESCENARIO 3: el mensaje no dice cuánto falta. Decía: %', v_msg;
  end if;

  -- LA VERIFICACIÓN CLAVE · el renglón que sí tenía stock no se movió.
  select coalesce(sum(stock), 0) into v_stock from public.existencias where producto_id = v_p2;
  if round(v_stock, 4) <> round(v_p2_antes, 4) then
    raise exception 'ESCENARIO 3: quedó media entrega hecha. P2 tenía % y quedó en %: el renglón que salió antes del error no volvió.',
      v_p2_antes, v_stock;
  end if;
  select coalesce(sum(stock), 0) into v_stock from public.existencias where producto_id = v_p1;
  if round(v_stock, 4) <> round(v_p1_antes, 4) then
    raise exception 'ESCENARIO 3: P1 tenía % y quedó en %.', v_p1_antes, v_stock;
  end if;

  -- Y ni el documento ni los renglones quedaron marcados.
  select estado into v_msg from public.ventas where id = v_vt2;
  if v_msg <> 'confirmada' then
    raise exception 'ESCENARIO 3: la venta fallida quedó en «%» y tenía que seguir en «confirmada».', v_msg;
  end if;
  select count(*) into v_movs from public.ventas_renglones where venta_id = v_vt2 and mov_id is not null;
  if v_movs <> 0 then
    raise exception 'ESCENARIO 3: quedaron % renglones enganchados a un movimiento que ya no existe.', v_movs;
  end if;
  select count(*) into v_movs from public.movimientos where ref_codigo = 'ZZ-TEST-ENTREGA-VT2';
  if v_movs <> 0 then
    raise exception 'ESCENARIO 3: quedaron % movimientos de kardex de una entrega que falló.', v_movs;
  end if;

  -- ── Borrado ──────────────────────────────────────────────────────
  -- Las ventas primero: `on delete cascade` se lleva renglones y recibidos, y
  -- con ellos las referencias a `movimientos`, que recién ahí se pueden borrar.
  delete from public.ventas where codigo like 'ZZ-TEST-ENTREGA-%';
  delete from public.movimientos where producto_id in (v_p1, v_p2, v_p3);
  delete from public.existencias where producto_id in (v_p1, v_p2, v_p3);
  delete from public.productos where id in (v_p1, v_p2, v_p3);
  delete from public.auditoria_eventos where etiqueta like 'ZZ-TEST-ENTREGA-%';

  raise notice 'OK · los tres escenarios pasaron y los datos de mentira quedaron borrados.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
-- Va última porque `runsql.cjs` devuelve solo el resultado de la última
-- sentencia. Esperado: una fila con la función, `security invoker`, el grant a
-- `authenticated` en true, y `basura_de_prueba` en 0.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       pg_get_function_result(p.oid)             as devuelve,
       case when p.prosecdef then 'definer' else 'invoker' end as seguridad,
       has_function_privilege('authenticated', p.oid, 'execute')                as puede_authenticated,
       (select count(*)::int from public.ventas    where codigo like 'ZZ-TEST-ENTREGA-%')
     + (select count(*)::int from public.productos where sku    like 'ZZ-TEST-ENTREGA-%') as basura_de_prueba
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'entregar_venta';
