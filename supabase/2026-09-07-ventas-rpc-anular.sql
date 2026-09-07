-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Módulo de Ventas · `anular_venta` — deshacer, renglón por renglón
--
-- QUÉ ES ESTA FUNCIÓN
-- El espejo exacto de las otras dos. `confirmar_venta` mueve la PLATA,
-- `entregar_venta` mueve el MATERIAL, y esta deshace lo que cada una hizo, en
-- una sola transacción. Nada se borra: la venta queda en «anulada» con el
-- motivo y la firma de quien anuló, y cada reversa deja su propio rastro —un
-- movimiento de caja, un movimiento de kardex, un cargo negativo— para que la
-- historia se pueda leer completa seis meses después.
--
-- ══ LO QUE SE REVERSA ES LA DIFERENCIA, NO EL TOTAL ══
-- `confirmar_venta` cobra `diferencia = total − valor_recibido`. En una venta
-- normal `valor_recibido` es 0 y los dos números son el mismo; en una permuta
-- NO, porque el cliente ya pagó una parte con material. Si la anulación
-- reversara el TOTAL en una permuta, le devolvería de más y la cuenta
-- corriente quedaría por debajo de lo que el cliente realmente debe. Por eso
-- acá se lee `v.diferencia` —el mismo campo que escribió confirmar— y nunca
-- `v.total`. El escenario 4 de la prueba lo verifica con números: la cuenta
-- tiene que bajar 60,00 y no 100,00.
--
-- ══ LA CUENTA POR COBRAR ES CORRIENTE: SE RESTA, NO SE CIERRA ══
-- `cuentas_por_cobrar` es una cuenta corriente por cliente y moneda: acumula
-- todas las ventas a crédito de ese cliente. `ventas.cxc_id` apunta a una
-- cuenta COMPARTIDA. Anular una venta no puede cerrarla ni saldarla, porque se
-- llevaría puestas las otras ventas que viven ahí. Por eso se llama a
-- `revertir_cargo_cxc`, que le RESTA el monto y deja un cargo negativo como
-- rastro. El escenario 2 de la prueba verifica justamente eso: después de
-- anular una venta, la otra venta del mismo cliente sigue intacta y la cuenta
-- queda con el saldo de esa otra venta.
--
-- ══ SI LA CUENTA YA TIENE ABONOS COBRADOS, SE RECHAZA ══
-- Un abono es plata que ya entró a una caja. Bajar la deuda por debajo dejaría
-- un cobro sin venta que lo respalde: el dinero está en la caja y no hay
-- documento que explique por qué. Primero se devuelve la plata —desde
-- Tesorería, que es donde se registran las devoluciones— y recién después se
-- anula. La regla se aplica sobre la CUENTA y no sobre la venta, porque la
-- cuenta es compartida y el abono no dice a qué venta se imputó. Es a
-- propósito conservadora: preferimos frenar de más que descuadrar una caja.
--
-- ══ EL STOCK SOLO VUELVE SI LA VENTA ESTABA ENTREGADA ══
-- Si estaba nada más «confirmada», el material nunca salió del almacén, así
-- que devolverlo lo duplicaría. La condición es el ESTADO, no que existan
-- renglones. Un «borrador» tampoco tiene nada que reversar: no movió plata ni
-- material, y anularlo es solo marcarlo.
--
-- ══ POR QUÉ LA CAJA SE REVERSA LEYENDO `movimientos_caja` Y NO `pago_legs` ══
-- Podría recorrerse `ventas.pago_legs`, pero esa columna es lo que la PANTALLA
-- propuso cobrar; lo que de verdad entró a la caja son las filas que
-- `confirmar_venta` insertó con `ref_venta_id = <venta>` y
-- `categoria = 'cobro_venta'`. Leer los movimientos reales tiene tres ventajas
-- concretas:
--   · Un borrador puede traer `pago_legs` cargadas por el formulario sin que
--     se haya cobrado un centavo. Reversarlas sacaría plata que nunca entró.
--   · `confirmar_venta` saltea (`continue`) las patas con monto ≤ 0: esas no
--     generaron movimiento y no hay nada que sacar.
--   · Si una pata entró a una caja y otra a otra, cada reversa vuelve a SU
--     caja, con su moneda, su cuenta y su tasa, sin reinterpretar el JSON.
-- Y cubre el caso que dejó anotado confirmar: `pago_legs` queda en `[]` cuando
-- no se cobró nada —crédito, o permuta con diferencia ≤ 0—. Este bucle
-- simplemente no itera. Es «deshacer lo que se hizo», no «deshacer lo que se
-- pensaba hacer».
--
-- ══ EL SALDO NEGATIVO SE PERMITE A PROPÓSITO ══
-- `aplicar_saldo_caja(caja, −monto, true)`. Si entre el cobro y la anulación
-- ya gastaron esa plata, la caja va a quedar en rojo. Eso es exactamente lo que
-- pasó en la realidad y tiene que verse: bloquear la reversa dejaría la venta
-- anulada con el cobro todavía sumando, que es peor —un ingreso vivo sin
-- documento que lo respalde—. Una caja en negativo es un problema visible; un
-- cobro fantasma no lo es.
--
-- ══ EL MATERIAL VUELVE POR EL VALOR CON EL QUE SALIÓ ══
-- La entrada de devolución lleva `precio_unitario` = el `costo_promedio` que el
-- propio movimiento de salida registró (`movimientos.costo_promedio` del
-- `mov_id` del renglón). Ese es el valor que efectivamente salió del inventario
-- ese día, que no siempre es el `costo_unit` congelado al confirmar: entre
-- confirmar y entregar puede haber entrado material nuevo a otro precio y el
-- promedio se movió. Devolviendo por ese número, el valor total del inventario
-- vuelve al peso exacto que tenía. Si el movimiento ya no está se cae al
-- `costo_unit` del renglón; si tampoco hay costo, entra sin precio y el
-- promedio de la ficha se conserva tal cual.
--
-- `security invoker`: manda el RLS del usuario, igual que `confirmar_venta` y
-- `entregar_venta`.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.anular_venta(
  p_venta_id   uuid,
  p_actor      text default null,
  p_actor_name text default null,
  p_motivo     text default null
) returns public.ventas
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v              public.ventas;
  r              record;
  m              record;
  v_actor        text;
  v_quien        text;
  v_motivo       text;
  v_dif          numeric;
  v_abonos       int;
  v_cuenta_n     int;
  v_cargos_antes uuid[];
  v_saldo        jsonb;
  v_mov          public.movimientos;
  v_costo_ret    numeric;
  v_nombre       text;
  v_hay          numeric;
  v_msg          text;
  v_state        text;
  v_devuelto     numeric;
  v_sacado       numeric;
begin
  if p_venta_id is null then
    raise exception 'Falta decir qué venta se anula.' using errcode = 'P0001';
  end if;

  v_actor  := coalesce(nullif(btrim(coalesce(p_actor, '')), ''), 'sistema');
  v_quien  := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), v_actor);
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  -- ── 1 · Motivo obligatorio ────────────────────────────────────────
  -- Una anulación mueve plata y material para atrás. Sin motivo escrito,
  -- dentro de un mes nadie sabe si fue un error de carga, una devolución o una
  -- venta que se cayó.
  if v_motivo is null then
    raise exception 'Hay que escribir por que se anula la venta: el motivo queda guardado en el documento.'
      using errcode = 'P0001';
  end if;

  -- ── 2 · La venta, bloqueada hasta el fin de la transacción ────────
  -- Mismo `for update` que confirmar y entregar: dos pantallas apretando
  -- «Anular» a la vez tienen que hacer cola, no reversar dos veces.
  select * into v from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'No existe la venta %.', p_venta_id using errcode = 'P0001';
  end if;
  if v.estado = 'anulada' then
    raise exception 'La venta % ya esta anulada (%). No se anula dos veces.',
      v.codigo, coalesce(to_char(v.anulada_at, 'DD/MM/YYYY'), 'sin fecha')
      using errcode = 'P0001';
  end if;

  v_dif := round(coalesce(v.diferencia, 0), 2);

  -- ═════════════════════════════════════════════════════════════════
  -- 3 · La deuda del cliente: se RESTA de la cuenta corriente
  -- ═════════════════════════════════════════════════════════════════
  -- Solo si confirmar llegó a cargarla: hace falta que la venta esté
  -- confirmada o entregada, que sea a crédito, que haya quedado un `cxc_id` y
  -- que la diferencia haya sido positiva (una permuta pareja no endeudó a
  -- nadie, y confirmar no le abrió cuenta a nadie).
  if v.estado in ('confirmada', 'entregada')
     and v.condicion = 'credito'
     and v.cxc_id is not null
     and v_dif > 0 then

    select count(*) into v_cuenta_n from public.cuentas_por_cobrar where id = v.cxc_id;
    if v_cuenta_n = 0 then
      raise exception 'La venta % apunta a una cuenta por cobrar que ya no existe: revisa Tesoreria antes de anular.',
        v.codigo using errcode = 'P0001';
    end if;

    -- ── El freno: plata que ya se cobró ────────────────────────────
    select count(*) into v_abonos
      from public.cuentas_por_cobrar_abonos where cuenta_id = v.cxc_id;
    if v_abonos > 0 then
      raise exception 'La cuenta del cliente ya tiene cobros: hay que devolver esa plata antes de anular la venta %.',
        v.codigo using errcode = 'P0001';
    end if;

    -- `revertir_cargo_cxc` no recibe la venta, así que el cargo negativo nace
    -- sin `ref_venta_id`. Se lo sellamos acá identificándolo por descarte: el
    -- único cargo de esa cuenta que no estaba antes de llamarla. Es el dato que
    -- Tesorería mira para ver la anulación venta por venta —la cuenta acumula,
    -- el cargo no—.
    select coalesce(array_agg(id), '{}'::uuid[]) into v_cargos_antes
      from public.cuentas_por_cobrar_cargos where cuenta_id = v.cxc_id;

    perform public.revertir_cargo_cxc(
      v.cxc_id, v_dif,
      'Anulacion de la venta ' || v.codigo || ' · ' || v_motivo,
      v_actor, nullif(btrim(coalesce(p_actor_name, '')), ''));

    update public.cuentas_por_cobrar_cargos
       set ref_venta_id = v.id
     where cuenta_id = v.cxc_id
       and not (id = any (v_cargos_antes));
  end if;

  -- ═════════════════════════════════════════════════════════════════
  -- 4 · El material vuelve al almacén (solo si había salido)
  -- ═════════════════════════════════════════════════════════════════
  if v.estado = 'entregada' then

    -- ── 4.a · Vuelve lo vendido ────────────────────────────────────
    for r in
      select * from public.ventas_renglones where venta_id = v.id order by orden, id
    loop
      -- Un renglón sin `mov_id` nunca salió del almacén: devolverlo sería
      -- inventar stock. No debería pasar con la venta en «entregada», pero si
      -- pasa se saltea en vez de duplicar material.
      if r.mov_id is null then
        continue;
      end if;

      v_nombre := coalesce(nullif(r.producto_nombre, ''), nullif(r.producto_sku, ''),
                           (select p.nombre from public.productos p where p.id = r.producto_id),
                           'este producto');

      -- El valor con el que efectivamente salió, no el congelado al confirmar.
      select round(coalesce(mo.costo_promedio, 0), 4) into v_costo_ret
        from public.movimientos mo where mo.id = r.mov_id;
      v_costo_ret := coalesce(nullif(v_costo_ret, 0), round(coalesce(r.costo_unit, 0), 4), 0);

      begin
        v_mov := public.registrar_movimiento_stock(jsonb_build_object(
          'producto_id',     r.producto_id,
          'tipo',            'entrada',
          'delta',           r.cantidad,
          -- Un precio nulo en `registrar_movimiento_stock` significa «no me
          -- informaron precio» y deja el costo promedio como estaba, que para
          -- una devolución sin costo conocido también es la respuesta correcta.
          'precio_unitario', case when v_costo_ret > 0 then v_costo_ret else null end,
          'ref_tipo',        'venta_anulacion',
          'ref_id',          v.id::text,
          'ref_codigo',      v.codigo,
          'actor',           v_actor,
          'actor_name',      nullif(btrim(coalesce(p_actor_name, '')), ''),
          'detalle',         format('Devolucion por anulacion de la venta %s · %s · %s',
                                    v.codigo, v_nombre, v_motivo)
        ));
      exception when others then
        -- Se traduce el error, no se lo perdona: las dos ramas terminan en un
        -- `raise`, así que la transacción entera se cae y nada queda a medias.
        get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
        raise exception 'No se anulo la venta %: fallo la devolucion de «%» al almacen (%). No se movio nada.',
          v.codigo, v_nombre, v_msg using errcode = v_state;
      end;

      -- Guarda de sanidad: lo que el kardex dice que volvió tiene que ser lo
      -- que el renglón dice que se había vendido.
      v_devuelto := v_mov.stock_despues - v_mov.stock_antes;
      if round(v_devuelto, 4) <> round(r.cantidad, 4) then
        raise exception 'Descuadre anulando %: de «%» se pidio devolver % y el kardex devolvio %.',
          v.codigo, v_nombre,
          trim(to_char(r.cantidad, 'FM999999990.####')),
          trim(to_char(v_devuelto, 'FM999999990.####'))
          using errcode = 'P0001';
      end if;
    end loop;

    -- ── 4.b · Y sale lo que se había recibido en la permuta ────────
    -- El intercambio se deshace entero: si el material vendido vuelve al
    -- estante, el que el cliente entregó a cambio tiene que salir. Acá es donde
    -- una anulación puede fallar legítimamente: si ese material ya se vendió o
    -- se consumió, no está para devolverlo.
    if v.tipo = 'permuta' then
      for r in
        select * from public.ventas_recibidos where venta_id = v.id order by orden, id
      loop
        if r.mov_id is null then
          continue;
        end if;

        v_nombre := coalesce(nullif(r.producto_nombre, ''), nullif(r.producto_sku, ''),
                             (select p.nombre from public.productos p where p.id = r.producto_id),
                             'este producto');

        begin
          v_mov := public.registrar_movimiento_stock(jsonb_build_object(
            'producto_id', r.producto_id,
            'tipo',        'salida',
            'delta',       -r.cantidad,
            'ref_tipo',    'venta_anulacion',
            'ref_id',      v.id::text,
            'ref_codigo',  v.codigo,
            'actor',       v_actor,
            'actor_name',  nullif(btrim(coalesce(p_actor_name, '')), ''),
            'destino',     coalesce(nullif(v.cliente_nombre, ''), 'Cliente'),
            'detalle',     format('Salida del material recibido en la permuta %s por anulacion · %s · %s',
                                  v.codigo, v_nombre, v_motivo)
          ));
        exception when others then
          get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
          select coalesce(sum(e.stock), 0) into v_hay
            from public.existencias e where e.producto_id = r.producto_id;
          if v_state = '23514' then
            raise exception 'No se anulo la permuta %: el material que entrego el cliente («%») ya no esta en el almacen. Hacen falta % y hay %. Reponelo o corregi el inventario antes de anular.',
              v.codigo, v_nombre,
              trim(to_char(r.cantidad, 'FM999999990.####')),
              trim(to_char(v_hay,      'FM999999990.####'))
              using errcode = 'P0001';
          end if;
          raise exception 'No se anulo la permuta %: fallo la salida de «%» (%). No se movio nada.',
            v.codigo, v_nombre, v_msg using errcode = v_state;
        end;

        v_sacado := v_mov.stock_antes - v_mov.stock_despues;
        if round(v_sacado, 4) <> round(r.cantidad, 4) then
          raise exception 'Descuadre anulando %: de «%» se pidio sacar % y el kardex saco %.',
            v.codigo, v_nombre,
            trim(to_char(r.cantidad, 'FM999999990.####')),
            trim(to_char(v_sacado,   'FM999999990.####'))
            using errcode = 'P0001';
        end if;
      end loop;
    end if;
  end if;

  -- ═════════════════════════════════════════════════════════════════
  -- 5 · La plata sale de la caja por donde entró
  -- ═════════════════════════════════════════════════════════════════
  -- Una fila por cada cobro real. El movimiento original NO se borra ni se
  -- edita: la caja tiene que poder mostrar que entraron 197,20 el martes y que
  -- salieron 197,20 el jueves por una anulación. Un libro de caja se corrige
  -- agregando renglones, no tachando.
  for m in
    select mc.* from public.movimientos_caja mc
     where mc.ref_venta_id = v.id
       and mc.categoria = 'cobro_venta'
       and mc.tipo = 'ingreso'
     order by mc.at, mc.id
  loop
    if round(coalesce(m.monto, 0), 2) <= 0 then
      continue;
    end if;

    -- `true` = se permite dejar la caja en negativo. Ver el encabezado.
    v_saldo := public.aplicar_saldo_caja(m.caja_id, -round(m.monto, 2), true);

    insert into public.movimientos_caja (
      caja_id, tipo, monto, moneda, cuenta, tasa_bs,
      saldo_antes, saldo_despues, motivo, categoria, beneficiario,
      ref_venta_id, actor, actor_name
    ) values (
      m.caja_id, 'salida', round(m.monto, 2), m.moneda, m.cuenta, m.tasa_bs,
      (v_saldo->>'saldo_antes')::numeric, (v_saldo->>'saldo_despues')::numeric,
      'Reverso por anulacion de la venta ' || v.codigo || ' · ' || v_motivo,
      -- La marca que pide Tesorería para poder rastrear estos movimientos.
      'reverso_venta', m.beneficiario,
      v.id, v_actor, nullif(btrim(coalesce(p_actor_name, '')), '')
    );
  end loop;

  -- ═════════════════════════════════════════════════════════════════
  -- 6 · El documento queda anulado, con su firma y su motivo
  -- ═════════════════════════════════════════════════════════════════
  -- Los totales, el costo congelado y la ganancia NO se borran: una venta
  -- anulada sigue siendo un documento que hay que poder leer e imprimir. Los
  -- reportes filtran por estado, no por campos vacíos.
  update public.ventas
     set estado           = 'anulada',
         anulada_at       = now(),
         anulada_por      = v_quien,
         motivo_anulacion = v_motivo,
         updated_at       = now()
   where id = v.id
   returning * into v;

  return v;
end $fn$;

comment on function public.anular_venta(uuid, text, text, text) is
  'Anula una venta o permuta deshaciendo lo que hicieron confirmar_venta y entregar_venta: resta de la cuenta corriente del cliente la DIFERENCIA (total - valor_recibido, nunca el total), devuelve el material al almacen solo si la venta estaba entregada (y saca el recibido de la permuta), y saca de cada caja el cobro que habia entrado, con categoria=reverso_venta y ref_venta_id. Se niega si la cuenta por cobrar ya tiene abonos: primero hay que devolver esa plata. Motivo obligatorio. Todo o nada.';

grant execute on function public.anular_venta(uuid, text, text, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- Prueba con datos de mentira (si algo falla, el bloque entero se revierte)
-- ═══════════════════════════════════════════════════════════════════
-- Las ventas de la prueba NO se arman a mano: se crean en borrador y se pasan
-- por `confirmar_venta` y `entregar_venta` de verdad. Es la única forma de
-- probar que esta función deshace lo que esas dos hacen y no lo que uno se
-- imagina que hacen.
--
-- Hay DOS clientes a propósito. El escenario del abono deja la cuenta de su
-- cliente trabada para siempre —esa es justamente la regla— así que va contra
-- un cliente aparte para no arruinar los otros escenarios.
--
--   Renglones de referencia (los mismos de la prueba de confirmar):
--     2 × 50,00 (costo 30)                   → subtotal 100,00
--     4 × 25,00 (costo 10) menos 20 de dto.  → subtotal  80,00
--     subtotal 180,00 − descuento 10,00      → base 170,00 · IVA 16 % = 27,20
--     total 197,20
do $test$
declare
  k_pref     text := 'ZZ-TEST-ANULAR-';
  v_prod_a   uuid;
  v_prod_b   uuid;
  v_prod_c   uuid;
  v_caja     uuid;
  v_cli      uuid;
  v_cli_b    uuid;
  v_v1       uuid;   -- contado, entregada
  v_v2       uuid;   -- crédito, la que se anula
  v_v3       uuid;   -- crédito, la que tiene que quedar INTACTA
  v_v4       uuid;   -- crédito del cliente B, con abono
  v_vp       uuid;   -- permuta a crédito, entregada
  v_v        public.ventas;
  v_cuenta   uuid;
  v_cuenta_b uuid;
  v_saldo    numeric;
  v_stock    numeric;
  v_costo    numeric;
  v_monto    numeric;
  v_n        int;
  v_msg      text;
  v_estado   text;
  v_fallo    boolean;
begin
  -- ── Escenografía ─────────────────────────────────────────────────
  -- Hay otros agentes trabajando sobre esta misma base: prefijo propio, y se
  -- limpia antes por si una corrida anterior quedó a medias.
  --
  -- EL ORDEN NO ES CAPRICHOSO, y descubrirlo fue parte del trabajo. `ventas` y
  -- `cuentas_por_cobrar` se apuntan MUTUAMENTE y ninguna de esas FK tiene
  -- cascada: `ventas.cxc_id` va a la cuenta, y `cuentas_por_cobrar.ref_venta_id`,
  -- `cuentas_por_cobrar_cargos.ref_venta_id` —que llena esta misma anulación— y
  -- `movimientos_caja.ref_venta_id` vuelven a la venta. Se borre lo que se borre
  -- primero, algo lo referencia. Por eso el primer paso es cortar el lazo a
  -- mano: `ventas.cxc_id` a null. Recién después se pueden borrar las cuentas
  -- (que arrastran cargos y abonos en cascada), el libro de caja y, al final,
  -- las ventas.
  update public.ventas set cxc_id = null where codigo like k_pref || '%';
  delete from public.cuentas_por_cobrar_abonos where cuenta_id in
    (select id from public.cuentas_por_cobrar where contraparte like k_pref || '%');
  delete from public.cuentas_por_cobrar where contraparte like k_pref || '%';
  delete from public.movimientos_caja where ref_venta_id in
    (select id from public.ventas where codigo like k_pref || '%');
  delete from public.ventas where codigo like k_pref || '%';
  delete from public.cajas where nombre like k_pref || '%';
  delete from public.movimientos where producto_id in
    (select id from public.productos where sku like k_pref || '%');
  delete from public.existencias where producto_id in
    (select id from public.productos where sku like k_pref || '%');
  delete from public.productos where sku like k_pref || '%';
  delete from public.tesoreria_contrapartes where nombre like k_pref || '%';

  insert into public.productos (sku, nombre, categoria, unidad, precio_venta)
    values (k_pref || 'A', k_pref || 'Producto A', 'PRUEBAS', 'UND', 50)
    returning id into v_prod_a;
  insert into public.productos (sku, nombre, categoria, unidad, precio_venta)
    values (k_pref || 'B', k_pref || 'Producto B', 'PRUEBAS', 'UND', 25)
    returning id into v_prod_b;
  insert into public.productos (sku, nombre, categoria, unidad, precio_venta)
    values (k_pref || 'C', k_pref || 'Chatarra recibida', 'PRUEBAS', 'KG', 0)
    returning id into v_prod_c;

  insert into public.existencias (producto_id, almacen, stock, costo_promedio)
    values (v_prod_a, 'General', 100, 30), (v_prod_b, 'General', 50, 10),
           (v_prod_c, 'General', 0, 0);

  insert into public.cajas (nombre, moneda, saldo)
    values (k_pref || 'CAJA', 'USD', 0) returning id into v_caja;

  insert into public.tesoreria_contrapartes (tipo, nombre, rif)
    values ('cliente', k_pref || 'CLIENTE', 'J-000000000') returning id into v_cli;
  insert into public.tesoreria_contrapartes (tipo, nombre, rif)
    values ('cliente', k_pref || 'CLIENTE-B', 'J-111111111') returning id into v_cli_b;

  -- ═══ ESCENARIO 1 · ANULAR UNA ENTREGADA DE CONTADO ═══════════════
  -- El caso completo: entró plata y salió material. Tienen que volver los dos.
  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct, pago_legs)
    values (k_pref || '0001', 'venta', 'borrador', v_cli, 'contado', 'USD', 40, 10, 16,
            jsonb_build_array(jsonb_build_object(
              'monto', 197.20, 'cajaId', v_caja::text, 'cuenta', 'principal', 'moneda', 'USD')))
    returning id into v_v1;
  insert into public.ventas_renglones (venta_id, orden, producto_id, producto_nombre, cantidad, precio_unit, descuento)
    values (v_v1, 1, v_prod_a, k_pref || 'Producto A', 2, 50, 0),
           (v_v1, 2, v_prod_b, k_pref || 'Producto B', 4, 25, 20);

  v_v := public.confirmar_venta(v_v1, 'tester', 'Tester');
  v_v := public.entregar_venta(v_v1, 'tester', 'Tester');

  -- Punto de partida verificado: la plata entró y el material salió.
  select round(saldo, 2) into v_saldo from public.cajas where id = v_caja;
  if v_saldo <> 197.20 then
    raise exception 'E1 (arranque): la caja debia tener 197,20 antes de anular y tiene %.', v_saldo;
  end if;
  select stock into v_stock from public.existencias where producto_id = v_prod_a and almacen = 'General';
  if round(v_stock, 4) <> 98 then
    raise exception 'E1 (arranque): A debia quedar en 98 despues de entregar y quedo en %.', v_stock;
  end if;

  v_v := public.anular_venta(v_v1, 'tester', 'Tester', 'Se cayo la operacion');

  if v_v.estado <> 'anulada' then
    raise exception 'E1: la venta debia quedar anulada y quedo en "%".', v_v.estado;
  end if;
  if v_v.anulada_at is null or v_v.anulada_por <> 'Tester'
     or v_v.motivo_anulacion <> 'Se cayo la operacion' then
    raise exception 'E1: falta la firma o el motivo de la anulacion (% / % / %).',
      v_v.anulada_at, v_v.anulada_por, v_v.motivo_anulacion;
  end if;

  -- ── El material volvió ───────────────────────────────────────────
  select stock, round(costo_promedio, 4) into v_stock, v_costo
    from public.existencias where producto_id = v_prod_a and almacen = 'General';
  if round(v_stock, 4) <> 100 then
    raise exception 'E1: A tenia 100, se vendieron 2 y al anular debia volver a 100. Quedo en %.', v_stock;
  end if;
  if v_costo <> 30 then
    raise exception 'E1: A volvio al almacen por 30,00 (el valor con el que salio) y el costo promedio quedo en %.', v_costo;
  end if;
  select stock into v_stock from public.existencias where producto_id = v_prod_b and almacen = 'General';
  if round(v_stock, 4) <> 50 then
    raise exception 'E1: B tenia 50, se vendieron 4 y al anular debia volver a 50. Quedo en %.', v_stock;
  end if;
  select count(*) into v_n from public.movimientos
   where ref_tipo = 'venta_anulacion' and ref_codigo = k_pref || '0001' and tipo = 'entrada';
  if v_n <> 2 then
    raise exception 'E1: debian quedar 2 entradas de kardex de la devolucion y hay %.', v_n;
  end if;

  -- ── La plata salió de la caja ────────────────────────────────────
  select round(saldo, 2) into v_saldo from public.cajas where id = v_caja;
  if v_saldo <> 0 then
    raise exception 'E1: la caja tenia 197,20 del cobro y al anular debia volver a 0. Quedo en %.', v_saldo;
  end if;
  select count(*) into v_n from public.movimientos_caja
   where ref_venta_id = v_v1 and tipo = 'salida' and categoria = 'reverso_venta' and monto = 197.20;
  if v_n <> 1 then
    raise exception 'E1: debia quedar UNA salida de 197,20 marcada como reverso_venta y enganchada a la venta, y hay %.', v_n;
  end if;
  -- El cobro original NO se borra: la caja se corrige agregando renglones.
  select count(*) into v_n from public.movimientos_caja
   where ref_venta_id = v_v1 and tipo = 'ingreso' and categoria = 'cobro_venta';
  if v_n <> 1 then
    raise exception 'E1: el ingreso original tenia que quedar en el libro como historia y hay % filas.', v_n;
  end if;

  -- ── No se anula dos veces ────────────────────────────────────────
  v_fallo := false;
  begin
    v_v := public.anular_venta(v_v1, 'tester', 'Tester', 'De nuevo');
  exception when others then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'E1: anular dos veces la misma venta tenia que fallar y no fallo (la plata saldria dos veces).';
  end if;

  -- ── Y el motivo es obligatorio ───────────────────────────────────
  v_fallo := false;
  begin
    v_v := public.anular_venta(v_v1, 'tester', 'Tester', '   ');
  exception when others then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'E1: anular sin motivo tenia que fallar y no fallo.';
  end if;

  -- ═══ ESCENARIO 2 · CRÉDITO SIN ABONOS · LA CUENTA ES CORRIENTE ═══
  -- Dos ventas a crédito del MISMO cliente caen en la MISMA cuenta. Se anula
  -- una: la cuenta tiene que bajar solo por esa, y la otra venta tiene que
  -- quedar exactamente como estaba.
  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct)
    values (k_pref || '0002', 'venta', 'borrador', v_cli, 'credito', 'USD', 40, 10, 16)
    returning id into v_v2;
  insert into public.ventas_renglones (venta_id, orden, producto_id, producto_nombre, cantidad, precio_unit, descuento)
    values (v_v2, 1, v_prod_a, k_pref || 'Producto A', 2, 50, 0),
           (v_v2, 2, v_prod_b, k_pref || 'Producto B', 4, 25, 20);
  v_v := public.confirmar_venta(v_v2, 'tester', 'Tester');
  v_cuenta := v_v.cxc_id;

  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct)
    values (k_pref || '0003', 'venta', 'borrador', v_cli, 'credito', 'USD', 40, 10, 16)
    returning id into v_v3;
  insert into public.ventas_renglones (venta_id, orden, producto_id, producto_nombre, cantidad, precio_unit, descuento)
    values (v_v3, 1, v_prod_a, k_pref || 'Producto A', 2, 50, 0),
           (v_v3, 2, v_prod_b, k_pref || 'Producto B', 4, 25, 20);
  v_v := public.confirmar_venta(v_v3, 'tester', 'Tester');

  if v_v.cxc_id <> v_cuenta then
    raise exception 'E2 (arranque): las dos ventas del mismo cliente debian caer en la misma cuenta corriente.';
  end if;
  select round(monto, 2) into v_monto from public.cuentas_por_cobrar where id = v_cuenta;
  if v_monto <> 394.40 then
    raise exception 'E2 (arranque): la cuenta debia estar en 394,40 (197,20 x 2) y esta en %.', v_monto;
  end if;

  v_v := public.anular_venta(v_v2, 'tester', 'Tester', 'Error de carga');

  select round(monto, 2), estado into v_monto, v_estado
    from public.cuentas_por_cobrar where id = v_cuenta;
  if v_monto <> 197.20 then
    raise exception 'E2: la cuenta debia bajar de 394,40 a 197,20 y quedo en %. Si dice 0 o "saldada", la anulacion CERRO la cuenta corriente en vez de restarle: se llevo puesta la otra venta del cliente.', v_monto;
  end if;
  if v_estado <> 'abierta' then
    raise exception 'E2: al cliente todavia le queda debiendo la venta 0003, la cuenta no puede quedar "%".', v_estado;
  end if;

  -- LA VERIFICACIÓN CRÍTICA · la otra venta del mismo cliente, intacta.
  select estado, round(total, 2), round(diferencia, 2), cxc_id
    into v_estado, v_monto, v_saldo, v_cuenta_b
    from public.ventas where id = v_v3;
  if v_estado <> 'confirmada' or v_monto <> 197.20 or v_saldo <> 197.20 or v_cuenta_b <> v_cuenta then
    raise exception 'E2: anular la venta 0002 toco la venta 0003 del mismo cliente (estado % / total % / diferencia % / cuenta %).',
      v_estado, v_monto, v_saldo, v_cuenta_b;
  end if;
  v_cuenta_b := null;

  -- El rastro: un cargo negativo, enganchado a la venta que se anuló.
  select count(*) into v_n from public.cuentas_por_cobrar_cargos
   where cuenta_id = v_cuenta and monto = -197.20 and ref_venta_id = v_v2;
  if v_n <> 1 then
    raise exception 'E2: debia quedar UN cargo de -197,20 apuntando a la venta anulada y hay %.', v_n;
  end if;

  -- ── Y el stock NO se movió: la venta nunca se entregó ────────────
  select stock into v_stock from public.existencias where producto_id = v_prod_a and almacen = 'General';
  if round(v_stock, 4) <> 100 then
    raise exception 'E2: la venta estaba solo CONFIRMADA, el material nunca salio del almacen. Devolverlo lo duplica: A quedo en % y debia seguir en 100.', v_stock;
  end if;
  select stock into v_stock from public.existencias where producto_id = v_prod_b and almacen = 'General';
  if round(v_stock, 4) <> 50 then
    raise exception 'E2: B quedo en % y debia seguir en 50: no se entrego nada, no hay nada que devolver.', v_stock;
  end if;
  select count(*) into v_n from public.movimientos
   where ref_tipo = 'venta_anulacion' and ref_codigo = k_pref || '0002';
  if v_n <> 0 then
    raise exception 'E2: se generaron % movimientos de kardex al anular una venta que nunca se entrego.', v_n;
  end if;
  -- Tampoco se movió plata: a crédito no había entrado nada a la caja.
  select round(saldo, 2) into v_saldo from public.cajas where id = v_caja;
  if v_saldo <> 0 then
    raise exception 'E2: una venta a credito no cobro nada; la caja no se podia mover de 0 y quedo en %.', v_saldo;
  end if;

  -- ═══ ESCENARIO 3 · CRÉDITO CON UN ABONO · RECHAZA ════════════════
  -- Cliente aparte: este abono deja la cuenta trabada, y esa es la regla.
  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct)
    values (k_pref || '0004', 'venta', 'borrador', v_cli_b, 'credito', 'USD', 40, 10, 16)
    returning id into v_v4;
  insert into public.ventas_renglones (venta_id, orden, producto_id, producto_nombre, cantidad, precio_unit, descuento)
    values (v_v4, 1, v_prod_a, k_pref || 'Producto A', 2, 50, 0),
           (v_v4, 2, v_prod_b, k_pref || 'Producto B', 4, 25, 20);
  v_v := public.confirmar_venta(v_v4, 'tester', 'Tester');
  v_cuenta_b := v_v.cxc_id;

  -- El cliente pagó 50 a cuenta: esa plata ya está en una caja.
  insert into public.cuentas_por_cobrar_abonos (cuenta_id, monto, moneda, saldo_restante, nota, actor)
    values (v_cuenta_b, 50, 'USD', 147.20, k_pref || 'abono', 'tester');
  update public.cuentas_por_cobrar set cobrado = 50 where id = v_cuenta_b;

  v_fallo := false;
  begin
    v_v := public.anular_venta(v_v4, 'tester', 'Tester', 'Quiere devolver la mercaderia');
  exception when others then
    v_fallo := true;
    v_msg := sqlerrm;
  end;
  if not v_fallo then
    raise exception 'E3: anular una venta cuya cuenta ya tiene cobros tenia que fallar y no fallo. Quedaria un cobro sin venta que lo respalde.';
  end if;
  if v_msg not ilike '%cobros%' or v_msg not ilike '%devolver%' then
    raise exception 'E3: el mensaje tiene que decir que hay que devolver la plata cobrada. Dice: "%".', v_msg;
  end if;

  -- Y el rechazo no dejó nada tocado.
  select estado into v_estado from public.ventas where id = v_v4;
  if v_estado <> 'confirmada' then
    raise exception 'E3: la venta rechazada tenia que seguir confirmada y quedo "%".', v_estado;
  end if;
  select round(monto, 2) into v_monto from public.cuentas_por_cobrar where id = v_cuenta_b;
  if v_monto <> 197.20 then
    raise exception 'E3: la anulacion rechazada no podia tocar la cuenta, y quedo en %.', v_monto;
  end if;

  -- ═══ ESCENARIO 4 · PERMUTA ENTREGADA (el corazón del asunto) ═════
  -- Vendo 2 × 50 = 100,00 sin IVA ni descuento. El cliente paga con 10 kg de
  -- chatarra valorados en 4,00 = 40,00. Diferencia a crédito: 60,00.
  -- Al anular, la cuenta tiene que bajar 60,00. Si bajara 100,00 —el TOTAL—
  -- le estaríamos devolviendo también el material que ya le sacamos del
  -- almacén: le quedaría la cuenta 40,00 por debajo de lo que corresponde.
  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct)
    values (k_pref || 'P001', 'permuta', 'borrador', v_cli, 'credito', 'USD', 40, 0, 0)
    returning id into v_vp;
  insert into public.ventas_renglones (venta_id, orden, producto_id, producto_nombre, cantidad, precio_unit, descuento)
    values (v_vp, 1, v_prod_a, k_pref || 'Producto A', 2, 50, 0);
  insert into public.ventas_recibidos (venta_id, orden, producto_id, producto_nombre, unidad, cantidad, valor_unit)
    values (v_vp, 1, v_prod_c, k_pref || 'Chatarra recibida', 'KG', 10, 4);

  v_v := public.confirmar_venta(v_vp, 'tester', 'Tester');
  if round(v_v.total, 2) <> 100.00 or round(v_v.valor_recibido, 2) <> 40.00
     or round(v_v.diferencia, 2) <> 60.00 then
    raise exception 'E4 (arranque): se esperaba total 100,00 / recibido 40,00 / diferencia 60,00 y quedo % / % / %.',
      v_v.total, v_v.valor_recibido, v_v.diferencia;
  end if;
  if v_v.cxc_id <> v_cuenta then
    raise exception 'E4 (arranque): la permuta debia caer en la cuenta corriente que ya tenia el cliente.';
  end if;
  select round(monto, 2) into v_monto from public.cuentas_por_cobrar where id = v_cuenta;
  if v_monto <> 257.20 then
    raise exception 'E4 (arranque): la cuenta debia quedar en 257,20 (197,20 + 60,00) y esta en %.', v_monto;
  end if;

  v_v := public.entregar_venta(v_vp, 'tester', 'Tester');

  select stock into v_stock from public.existencias where producto_id = v_prod_a and almacen = 'General';
  if round(v_stock, 4) <> 98 then
    raise exception 'E4 (arranque): A debia bajar a 98 al entregar y quedo en %.', v_stock;
  end if;
  select stock, round(costo_promedio, 4) into v_stock, v_costo
    from public.existencias where producto_id = v_prod_c and almacen = 'General';
  if round(v_stock, 4) <> 10 or v_costo <> 4 then
    raise exception 'E4 (arranque): la chatarra debia entrar 10 kg a costo 4,00 y quedo % / %.', v_stock, v_costo;
  end if;

  v_v := public.anular_venta(v_vp, 'tester', 'Tester', 'El cliente se arrepintio de la permuta');

  if v_v.estado <> 'anulada' then
    raise exception 'E4: la permuta debia quedar anulada y quedo "%".', v_v.estado;
  end if;

  -- ── EL MATERIAL VENDIDO VUELVE ───────────────────────────────────
  select stock into v_stock from public.existencias where producto_id = v_prod_a and almacen = 'General';
  if round(v_stock, 4) <> 100 then
    raise exception 'E4: el material vendido debia volver al almacen (A de 98 a 100) y quedo en %.', v_stock;
  end if;

  -- ── Y EL MATERIAL RECIBIDO SALE ──────────────────────────────────
  -- Se deshace el intercambio entero: si vuelve lo que entregamos, se va lo
  -- que nos dieron a cambio.
  select stock into v_stock from public.existencias where producto_id = v_prod_c and almacen = 'General';
  if round(v_stock, 4) <> 0 then
    raise exception 'E4: la chatarra que entrego el cliente debia SALIR del inventario (de 10 a 0) y quedo en %. Si sigue en 10, el almacen se quedo con material de una permuta que no existe.', v_stock;
  end if;
  select count(*) into v_n from public.movimientos
   where ref_tipo = 'venta_anulacion' and ref_codigo = k_pref || 'P001' and tipo = 'salida';
  if v_n <> 1 then
    raise exception 'E4: debia quedar UNA salida de kardex por el material recibido y hay %.', v_n;
  end if;
  select count(*) into v_n from public.movimientos
   where ref_tipo = 'venta_anulacion' and ref_codigo = k_pref || 'P001' and tipo = 'entrada';
  if v_n <> 1 then
    raise exception 'E4: debia quedar UNA entrada de kardex por el material vendido que vuelve y hay %.', v_n;
  end if;

  -- ── SE REVERSA LA DIFERENCIA, NO EL TOTAL ────────────────────────
  select round(monto, 2) into v_monto from public.cuentas_por_cobrar where id = v_cuenta;
  if v_monto <> 197.20 then
    raise exception 'E4: la cuenta debia bajar 60,00 (la DIFERENCIA) de 257,20 a 197,20 y quedo en %. Si dice 157,20 se reverso el TOTAL (100,00): al cliente se le devolvio de mas la parte que ya habia pagado con material.', v_monto;
  end if;
  select count(*) into v_n from public.cuentas_por_cobrar_cargos
   where cuenta_id = v_cuenta and monto = -60.00 and ref_venta_id = v_vp;
  if v_n <> 1 then
    raise exception 'E4: debia quedar UN cargo de -60,00 apuntando a la permuta anulada y hay %.', v_n;
  end if;

  -- La venta 0003 del mismo cliente, otra vez intacta.
  select estado into v_estado from public.ventas where id = v_v3;
  if v_estado <> 'confirmada' then
    raise exception 'E4: anular la permuta toco la venta 0003 del mismo cliente, que quedo "%".', v_estado;
  end if;

  -- ── Limpieza ─────────────────────────────────────────────────────
  -- Mismo orden que la escenografía y por el mismo motivo: `ventas` y
  -- `cuentas_por_cobrar` se referencian mutuamente sin cascada, así que el lazo
  -- se corta a mano antes de empezar. Después: cuentas (que arrastran cargos y
  -- abonos), libro de caja, ventas —cuyo cascade se lleva renglones y recibidos,
  -- y con ellos las referencias a `movimientos`— y recién entonces el kardex y
  -- las fichas.
  update public.ventas set cxc_id = null where codigo like k_pref || '%';
  delete from public.cuentas_por_cobrar_abonos where cuenta_id in
    (select id from public.cuentas_por_cobrar where contraparte like k_pref || '%');
  delete from public.cuentas_por_cobrar where contraparte like k_pref || '%';
  delete from public.movimientos_caja where ref_venta_id in
    (select id from public.ventas where codigo like k_pref || '%');
  delete from public.ventas where codigo like k_pref || '%';
  delete from public.cajas where nombre like k_pref || '%';
  delete from public.movimientos where producto_id in (v_prod_a, v_prod_b, v_prod_c);
  delete from public.existencias where producto_id in (v_prod_a, v_prod_b, v_prod_c);
  delete from public.productos where id in (v_prod_a, v_prod_b, v_prod_c);
  delete from public.tesoreria_contrapartes where nombre like k_pref || '%';
  delete from public.auditoria_eventos where etiqueta like k_pref || '%';

  raise notice 'Pruebas de anular_venta: OK (entregada de contado, credito sin abonos, credito con abono, permuta entregada)';
end $test$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
-- Va última porque `runsql.cjs` devuelve solo el resultado de la última
-- sentencia. Esperado: una fila, `invoker`, el grant a `authenticated` en true
-- y `basura_de_prueba` en 0.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       pg_get_function_result(p.oid)             as devuelve,
       case when p.prosecdef then 'definer' else 'invoker' end as seguridad,
       has_function_privilege('authenticated', p.oid, 'execute') as puede_authenticated,
       (select count(*)::int from public.ventas    where codigo like 'ZZ-TEST-ANULAR-%')
     + (select count(*)::int from public.productos where sku    like 'ZZ-TEST-ANULAR-%')
     + (select count(*)::int from public.cuentas_por_cobrar where contraparte like 'ZZ-TEST-ANULAR-%')
       as basura_de_prueba
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'anular_venta';
