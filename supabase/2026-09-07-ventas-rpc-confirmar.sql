-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Módulo de Ventas · `confirmar_venta`: el momento en que se mueve la plata
--
-- LA REGLA QUE ORDENA EL MÓDULO
-- Al confirmar se mueve el DINERO. Al entregar se mueve el MATERIAL.
-- Por eso acá no hay una sola línea que toque `existencias` ni que llame a
-- `registrar_movimiento_stock`: eso es trabajo de `entregar_venta`. Confirmar
-- una venta y no entregarla todavía tiene que dejar el almacén intacto.
--
-- POR QUÉ ESTO VIVE EN LA BASE Y NO EN EL NAVEGADOR
-- Confirmar son entre tres y ocho escrituras que valen todas o ninguna:
-- congelar el costo de cada renglón, recalcular el documento, mover el saldo
-- de una o varias cajas, dejar el movimiento en el libro de cada caja y —si es
-- a crédito— cargarle la deuda al cliente. Si eso se hiciera desde el
-- navegador, un corte de red en el medio dejaría una venta confirmada sin
-- cobro, o un cobro sin venta. Acá es una sola transacción de Postgres.
--
-- LO QUE SE COBRA ES LA DIFERENCIA, NO EL TOTAL
-- En una venta normal son el mismo número, porque `valor_recibido` es 0. En una
-- permuta NO: el cliente ya pagó parte con material, y solo debe
-- `total − valor_recibido`. Cobrarle el total sería cobrarle dos veces lo que
-- ya entregó en mineral. `anular_venta` reversa exactamente este mismo monto,
-- así que el criterio tiene que ser el mismo en las dos funciones.
--
-- LA GANANCIA NUNCA ES `total − costo_total`
-- El total lleva IVA, y el IVA no es ganancia: es plata del Estado que la
-- empresa está reteniendo. La cuenta buena es
--     Σ ((precio − costo) × cantidad − descuento_renglón) − descuento_documento
-- con el descuento del renglón DENTRO de la sumatoria: un descuento por línea
-- es plata que se resigna, así que baja la ganancia lo mismo que baja lo
-- facturado. Si no se restara ahí, descontar por renglón inflaría el margen.
--
-- ESTA CUENTA ESTÁ ESCRITA DOS VECES Y NO PUEDE DIVERGIR
-- La misma fórmula vive en `src/modules/ventas/ventasCalculos.ts`
-- (`calcularTotalesVenta`), que es la que ve el vendedor en la pantalla antes
-- de apretar el botón, la que arma el comprobante y la que suman los reportes.
-- Acá está replicada paso a paso, con el mismo orden de operaciones y los
-- mismos puntos de redondeo: los acumuladores del documento se suman SIN
-- redondear renglón por renglón y se redondea UNA sola vez al final, igual que
-- el `for` de TypeScript.
--
-- POR QUÉ LA CUENTA SE HACE EN `double precision` Y NO EN `numeric`
-- Esto se ve raro en una función que mueve plata, y es a propósito.
-- `numeric` es decimal exacto y JavaScript no: son dos aritméticas distintas y
-- en el medio centavo se separan. Media unidad a 2,01 da 1,005 exacto, que en
-- decimal redondea a 1,01, pero en JavaScript `Math.round(1.005 * 100) / 100`
-- da 1,00 —porque el doble más cercano a 1,005 es apenas menor—. Con `numeric`
-- la pantalla diría 1,00 y la base cobraría 1,01: un centavo de diferencia,
-- silencioso, imposible de explicar seis meses después. Haciendo la cuenta en
-- `double precision`, que es el MISMO IEEE 754 que usa el navegador, los dos
-- lados dan siempre el mismo centavo. El resultado sale de acá convertido a
-- `numeric` con dos decimales, así que lo que queda guardado es decimal exacto:
-- el punto flotante vive solo adentro de la cuenta, nunca en la columna.
-- Contrastado caso por caso contra el `.ts` real (ver el bloque de pruebas del
-- final y el detalle en el reporte de la tarea).
--
-- EL COSTO SE CONGELA ACÁ
-- `costo_unit` se copia de `existencias.costo_promedio` en este momento y no
-- se vuelve a tocar. Es lo que sostiene el módulo entero: el costo promedio de
-- una ficha se mueve cada vez que entra material nuevo a otro precio, así que
-- si la ganancia se calculara leyendo `existencias` en el momento del reporte,
-- la ganancia de una venta de marzo cambiaría sola en septiembre.
-- Si la ficha todavía no tiene costo, se congela en 0 y la pantalla avisa: un
-- producto sin costo avisa, no bloquea (spec §12).
--
-- `security invoker`: manda el RLS del usuario, igual que si la pantalla
-- escribiera directo. Mismo criterio que `crear_o_acumular_cxc`.
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- 1 · El redondeo del módulo, calcado del de la pantalla
-- ═══════════════════════════════════════════════════════════════════
-- Es la traducción literal de `round2()` de `ventasCalculos.ts`:
--     Math.round(n * 100) / 100
-- `Math.round` redondea hacia +∞ en los empates (−0,5 da −0, no −1), que es
-- justo lo que hace `floor(x + 0,5)` y NO lo que hace `round()` de Postgres,
-- que se aleja del cero. Entra y sale en `double precision` para que la cuenta
-- encadenada sea la misma que en el navegador; el `::numeric` del final deja
-- el valor en decimal exacto de dos decimales para guardarlo.
create or replace function public.ventas_round2(p double precision)
returns numeric
language sql
immutable
set search_path = public
as $fn$
  select round((floor(coalesce(p, 0) * 100 + 0.5) / 100)::numeric, 2);
$fn$;

comment on function public.ventas_round2(double precision) is
  'Redondeo a 2 decimales calcado de round2() de src/modules/ventas/ventasCalculos.ts (Math.round(n*100)/100), en double precision para dar el mismo centavo que la pantalla. Devuelve numeric exacto.';

grant execute on function public.ventas_round2(double precision) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 2 · confirmar_venta
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.confirmar_venta(
  p_venta_id   uuid,
  p_actor      text default null,
  p_actor_name text default null
) returns public.ventas
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v              public.ventas;
  r              public.ventas_renglones;
  v_actor        text;
  v_quien        text;
  v_n            int;

  -- Acumuladores del documento. Se suman SIN redondear y en `double precision`,
  -- igual que el `for` de `calcularTotalesVenta`: el redondeo va una sola vez,
  -- al final.
  v_sub_bruto    double precision := 0;
  v_costo_bruto  double precision := 0;
  v_gan_bruta    double precision := 0;

  -- Del renglón que se está recorriendo. `_num` es lo que se guarda en la
  -- tabla (decimal exacto); el resto es la cuenta.
  v_costo_num    numeric;
  v_desc_ren_num numeric;
  v_cant         double precision;
  v_precio       double precision;
  v_costo        double precision;
  v_desc_ren     double precision;

  -- Del documento, ya redondeados.
  v_desc_doc     numeric;
  v_pct          numeric;
  v_subtotal     numeric;
  v_base         numeric;
  v_iva          numeric;
  v_total        numeric;
  v_costo_total  numeric;
  v_ganancia     numeric;
  v_recibido     numeric;
  v_diferencia   numeric;

  -- Cliente congelado.
  v_cli_nombre   text;
  v_cli_rif      text;

  -- Cobro.
  v_legs         jsonb;
  v_leg          jsonb;
  v_legs_suma    numeric := 0;
  v_leg_monto    numeric;
  v_leg_caja     uuid;
  v_leg_moneda   text;
  v_leg_cuenta   text;
  v_caja_nombre  text;
  v_saldo        jsonb;
  v_cxc          public.cuentas_por_cobrar;
  v_cxc_id       uuid;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor, '')), ''), 'sistema');
  v_quien := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), v_actor);

  -- ── 1 · La venta, bloqueada hasta el fin de la transacción ────────
  -- `for update` para que dos pantallas no confirmen la misma venta a la vez
  -- y le cobren dos veces al cliente.
  select * into v from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'No existe la venta %.', p_venta_id using errcode = 'P0001';
  end if;
  if v.estado <> 'borrador' then
    raise exception 'La venta % ya esta %: solo se puede confirmar un borrador.',
      v.codigo, v.estado using errcode = 'P0001';
  end if;

  -- ── 2 · Sin renglones no hay venta ────────────────────────────────
  select count(*) into v_n from public.ventas_renglones where venta_id = v.id;
  if v_n = 0 then
    raise exception 'La venta % no tiene renglones: no hay nada que confirmar.',
      v.codigo using errcode = 'P0001';
  end if;

  -- Los mismos dos clamps que hace el TS antes de empezar.
  v_desc_doc := greatest(0, public.ventas_round2(coalesce(v.descuento, 0)));
  v_pct      := greatest(0, coalesce(v.iva_pct, 0));

  -- ── 3 · Congelar el costo y recalcular cada renglón ───────────────
  for r in
    select * from public.ventas_renglones where venta_id = v.id order by orden, id
  loop
    -- El costo promedio de la ficha, hoy. Se prefiere el almacén General, que
    -- es el único que usa el sistema; el `order by` está por si mañana hay más.
    select e.costo_promedio into v_costo_num
      from public.existencias e
     where e.producto_id = r.producto_id
     order by (e.almacen = 'General') desc, e.updated_at desc nulls last
     limit 1;
    -- Sin ficha de existencias no se pisa lo que traía el borrador; con ficha,
    -- manda el costo promedio aunque sea 0 (producto sin costo: avisa, no bloquea).
    v_costo_num    := coalesce(v_costo_num, r.costo_unit, 0);
    v_desc_ren_num := greatest(0, coalesce(r.descuento, 0));

    v_cant     := coalesce(r.cantidad, 0);
    v_precio   := coalesce(r.precio_unit, 0);
    v_costo    := v_costo_num;
    v_desc_ren := v_desc_ren_num;

    v_sub_bruto   := v_sub_bruto   + v_cant * v_precio - v_desc_ren;
    v_costo_bruto := v_costo_bruto + v_cant * v_costo;
    -- El descuento del renglón va DENTRO de la sumatoria de la ganancia.
    v_gan_bruta   := v_gan_bruta   + v_cant * (v_precio - v_costo) - v_desc_ren;

    update public.ventas_renglones
       set costo_unit = v_costo_num,
           descuento  = v_desc_ren_num,
           subtotal   = public.ventas_round2(v_cant * v_precio - v_desc_ren),
           ganancia   = public.ventas_round2(v_cant * (v_precio - v_costo) - v_desc_ren)
     where id = r.id;
  end loop;

  -- ── 4 · El documento ──────────────────────────────────────────────
  -- Los `::double precision` no son decorativos: sin ellos Postgres haría la
  -- cuenta en decimal exacto y volvería a separarse de la pantalla. Cada paso
  -- tiene que ser la misma operación sobre el mismo doble que hace el TS.
  v_subtotal    := public.ventas_round2(v_sub_bruto);
  v_base        := public.ventas_round2(v_subtotal::double precision - v_desc_doc::double precision);
  v_iva         := public.ventas_round2(v_base::double precision * v_pct::double precision / 100);
  v_total       := public.ventas_round2(v_base::double precision + v_iva::double precision);
  v_costo_total := public.ventas_round2(v_costo_bruto);
  -- NUNCA `v_total - v_costo_total`: el total lleva IVA y el IVA no es ganancia.
  v_ganancia    := public.ventas_round2(v_gan_bruta - v_desc_doc::double precision);

  -- ── 5 · La permuta: lo que se cobra es la DIFERENCIA ──────────────
  -- Se recalcula el subtotal de cada recibido por el mismo motivo que el de
  -- los renglones: al confirmar se congela, no se confía en lo que dejó el
  -- borrador. En una venta normal no hay recibidos, así que `valor_recibido`
  -- queda en 0 y `diferencia` da exactamente `total`.
  update public.ventas_recibidos
     set subtotal = public.ventas_round2(coalesce(cantidad, 0) * coalesce(valor_unit, 0))
   where venta_id = v.id;

  -- Acá ya son todos valores de dos decimales exactos, así que la suma y la
  -- resta se hacen en `numeric`: no hay nada que redondear ni que emparejar.
  select coalesce(sum(coalesce(subtotal, 0)), 0) into v_recibido
    from public.ventas_recibidos where venta_id = v.id;
  v_recibido   := round(v_recibido, 2);
  v_diferencia := round(v_total - v_recibido, 2);

  -- ── 6 · Congelar el cliente ───────────────────────────────────────
  -- El comprobante que se imprima dentro de seis meses tiene que seguir
  -- diciendo lo que decía hoy, aunque después le corrijan el nombre o el RIF.
  select tc.nombre, tc.rif into v_cli_nombre, v_cli_rif
    from public.tesoreria_contrapartes tc where tc.id = v.cliente_id;
  v_cli_nombre := coalesce(nullif(btrim(coalesce(v_cli_nombre, '')), ''),
                           nullif(btrim(coalesce(v.cliente_nombre, '')), ''));
  v_cli_rif    := coalesce(nullif(btrim(coalesce(v_cli_rif, '')), ''),
                           nullif(btrim(coalesce(v.cliente_rif, '')), ''));

  -- ── 7 · Cobrar de contado: una pata, una caja ─────────────────────
  -- `v_legs` es lo que queda guardado en la venta. Si no se cobró nada (una
  -- permuta cerrada, o una venta a crédito) queda vacío A PROPÓSITO:
  -- `anular_venta` reversa las patas de caja una por una, y una pata que nunca
  -- entró no se puede sacar.
  v_legs := '[]'::jsonb;

  if v_diferencia > 0 and v.condicion = 'contado' then
    v_legs := coalesce(v.pago_legs, '[]'::jsonb);

    select coalesce(sum(coalesce((leg->>'monto')::numeric, 0)), 0) into v_legs_suma
      from jsonb_array_elements(v_legs) leg;
    v_legs_suma := round(v_legs_suma, 2);

    if abs(v_legs_suma - v_diferencia) > 0.01 then
      raise exception 'Las formas de pago de % suman % y hay que cobrar %. Ajusta el pago antes de confirmar.',
        v.codigo, v_legs_suma, v_diferencia using errcode = 'P0001';
    end if;

    for v_leg in select value from jsonb_array_elements(v_legs) loop
      v_leg_monto := round(coalesce((v_leg->>'monto')::numeric, 0), 2);
      if v_leg_monto <= 0 then
        continue;
      end if;

      -- La pantalla guarda la caja como cajaId; se acepta caja_id por si
      -- alguna pata quedó escrita con el nombre de la columna.
      v_leg_caja := coalesce(nullif(btrim(coalesce(v_leg->>'cajaId', '')), '')::uuid,
                             nullif(btrim(coalesce(v_leg->>'caja_id', '')), '')::uuid);
      if v_leg_caja is null then
        raise exception 'Una de las formas de pago de % no dice en que caja entra la plata.',
          v.codigo using errcode = 'P0001';
      end if;
      v_leg_moneda := coalesce(nullif(btrim(coalesce(v_leg->>'moneda', '')), ''), v.moneda);
      v_leg_cuenta := nullif(btrim(coalesce(v_leg->>'cuenta', '')), '');

      -- Primero el saldo (devuelve el antes y el después reales), después el
      -- renglón del libro con esos dos números. Todo en la misma transacción:
      -- si el segundo paso falla, el primero se deshace solo.
      v_saldo := public.aplicar_saldo_caja(v_leg_caja, v_leg_monto, false);
      v_caja_nombre := coalesce(v_saldo->>'nombre', 'la caja');

      begin
        -- `ref_venta_id` es el enganche duro con el documento: el motivo en
        -- texto sirve para leerlo, pero la vista `ventas_movimientos_caja` y
        -- la reversa de la anulación necesitan el id.
        insert into public.movimientos_caja (
          caja_id, tipo, monto, moneda, cuenta, tasa_bs,
          saldo_antes, saldo_despues, motivo, categoria, beneficiario,
          ref_venta_id, actor, actor_name
        ) values (
          v_leg_caja, 'ingreso', v_leg_monto, v_leg_moneda, v_leg_cuenta,
          case when v_leg_moneda = 'Bs' then null else v.tasa_bs end,
          (v_saldo->>'saldo_antes')::numeric, (v_saldo->>'saldo_despues')::numeric,
          'Cobro de venta ' || v.codigo || coalesce(' · ' || v_cli_nombre, ''),
          'cobro_venta', v_cli_nombre,
          v.id, v_actor, nullif(btrim(coalesce(p_actor_name, '')), '')
        );
      exception when others then
        -- El trigger `bloquear_movimiento_en_caja_cerrada` habla en jerga de
        -- Postgres. Al vendedor le tiene que llegar en castellano. Cualquier
        -- otro error sube tal cual: tragárselo sería peor que mostrarlo feo.
        if sqlerrm ilike '%ya fue cerrada%' or sqlerrm ilike '%caja%cerrada%' then
          raise exception 'La caja de ese periodo esta cerrada: no se puede registrar el cobro ahi (%).',
            v_caja_nombre using errcode = 'P0001';
        end if;
        raise;
      end;
    end loop;

  -- ── 8 · A crédito: la deuda va a la cuenta corriente del cliente ──
  -- `crear_o_acumular_cxc` en la MISMA transacción: si la venta se confirmara
  -- acá y la deuda se registrara desde el navegador, un corte en el medio
  -- dejaría una venta a crédito sin deuda — plata que nadie debe.
  elsif v_diferencia > 0 and v.condicion = 'credito' then
    if coalesce(btrim(coalesce(v_cli_nombre, '')), '') = '' then
      raise exception 'La venta % es a credito y no tiene cliente: no se sabe a quien cargarle la deuda.',
        v.codigo using errcode = 'P0001';
    end if;
    -- El último parámetro sella de qué venta viene el cargo. Importa porque la
    -- cuenta es CORRIENTE: acumula varias ventas del mismo cliente, y sin esto
    -- tres ventas a crédito se ven como una deuda sola, sin poder decir cuál
    -- trajo cuánto. El cargo es el único lugar donde se distinguen.
    v_cxc := public.crear_o_acumular_cxc(
      'cliente', v_cli_nombre, v_diferencia, v.moneda,
      null, null, null,
      'Venta ' || v.codigo, v_actor, nullif(btrim(coalesce(p_actor_name, '')), ''),
      v.id);
    v_cxc_id := v_cxc.id;
  end if;

  -- ── 9 · Queda confirmada. El stock no se tocó ─────────────────────
  update public.ventas
     set subtotal       = v_subtotal,
         descuento      = v_desc_doc,
         iva_pct        = v_pct,
         iva_monto      = v_iva,
         total          = v_total,
         costo_total    = v_costo_total,
         ganancia_total = v_ganancia,
         valor_recibido = v_recibido,
         diferencia     = v_diferencia,
         cliente_nombre = v_cli_nombre,
         cliente_rif    = v_cli_rif,
         pago_legs      = v_legs,
         cxc_id         = coalesce(v_cxc_id, cxc_id),
         estado         = 'confirmada',
         confirmada_at  = now(),
         confirmada_por = v_quien,
         updated_at     = now()
   where id = v.id
   returning * into v;

  return v;
end $fn$;

comment on function public.confirmar_venta(uuid, text, text) is
  'Confirma una venta o permuta: congela el costo de cada renglon desde existencias.costo_promedio, recalcula el documento con la misma cuenta que ventasCalculos.ts, congela el cliente y COBRA LA DIFERENCIA (total - valor_recibido), de contado por caja o a credito en la cuenta corriente del cliente. No toca el stock: eso es entregar_venta.';

grant execute on function public.confirmar_venta(uuid, text, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 3 · Prueba con datos de mentira (si algo falla, el bloque se revierte)
-- ═══════════════════════════════════════════════════════════════════
-- Los cinco escenarios usan los MISMOS renglones a propósito, para que el
-- total sea siempre el mismo (197,20) y lo único que cambie sea qué se hace
-- con él. Así se ve de un vistazo que en la permuta se cobra 97,20 y no
-- 197,20, que es el error que esta función tiene que hacer imposible.
--
--   2 × 50,00 (costo 30)                    → subtotal 100,00 · ganancia 40,00
--   4 × 25,00 (costo 10) menos 20 de dto.   → subtotal  80,00 · ganancia 40,00
--   subtotal 180,00 − descuento 10,00       → base 170,00
--   IVA 16 % sobre la base                  → 27,20
--   total 197,20 · costo 100,00 · ganancia (40 + 40) − 10 = 70,00
do $test$
declare
  k_pref      text := 'ZZ-TEST-CONFIRM-';
  v_prod_a    uuid;
  v_prod_b    uuid;
  v_prod_c    uuid;
  v_caja      uuid;
  v_cliente   uuid;
  v_venta     uuid;
  v_v         public.ventas;
  v_saldo     numeric;
  v_stock_a   numeric;
  v_stock_b   numeric;
  v_n         int;
  v_monto     numeric;
  v_cuenta    uuid;
  v_fallo     boolean;
  v_msg       text;
begin
  -- ── Escenografía ─────────────────────────────────────────────────
  -- Por si una corrida anterior quedó a medias: hay otros agentes trabajando
  -- sobre esta misma base, así que el prefijo es propio y se limpia antes.
  -- El cobro apunta a la venta por FK y esa FK no tiene cascada, asi que el
  -- libro de caja se limpia primero.
  -- `ventas` y `cuentas_por_cobrar` se referencian mutuamente y ninguna FK
  -- tiene cascada, asi que hay que cortar el lazo a mano y en este orden.
  delete from public.movimientos_caja where ref_venta_id in
    (select id from public.ventas where codigo like k_pref || '%');
  delete from public.cuentas_por_cobrar_cargos where ref_venta_id in
    (select id from public.ventas where codigo like k_pref || '%');
  update public.ventas set cxc_id = null where codigo like k_pref || '%';
  delete from public.ventas where codigo like k_pref || '%';
  delete from public.cuentas_por_cobrar where contraparte like k_pref || '%';
  delete from public.cajas where nombre like k_pref || '%';
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
    values (k_pref || 'C', k_pref || 'Producto C', 'PRUEBAS', 'KG', 0)
    returning id into v_prod_c;

  insert into public.existencias (producto_id, almacen, stock, costo_promedio)
    values (v_prod_a, 'General', 100, 30), (v_prod_b, 'General', 50, 10),
           (v_prod_c, 'General', 0, 0);

  insert into public.cajas (nombre, moneda, saldo)
    values (k_pref || 'CAJA', 'USD', 0) returning id into v_caja;

  insert into public.tesoreria_contrapartes (tipo, nombre, rif)
    values ('cliente', k_pref || 'CLIENTE', 'J-000000000')
    returning id into v_cliente;

  -- ═══ ESCENARIO 1 · CONTADO ═══════════════════════════════════════
  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct, pago_legs)
    values (k_pref || '0001', 'venta', 'borrador', v_cliente, 'contado', 'USD',
            40, 10, 16,
            jsonb_build_array(jsonb_build_object(
              'monto', 197.20, 'cajaId', v_caja::text, 'cuenta', 'principal', 'moneda', 'USD')))
    returning id into v_venta;
  insert into public.ventas_renglones (venta_id, orden, producto_id, cantidad, precio_unit, descuento)
    values (v_venta, 1, v_prod_a, 2, 50, 0), (v_venta, 2, v_prod_b, 4, 25, 20);

  v_v := public.confirmar_venta(v_venta, 'tester', 'Tester');

  if v_v.estado <> 'confirmada' then
    raise exception 'CONTADO: la venta debia quedar confirmada y quedo en "%".', v_v.estado;
  end if;
  if round(v_v.subtotal, 2) <> 180.00 then
    raise exception 'CONTADO: el subtotal debia ser 180,00 y es %.', v_v.subtotal;
  end if;
  if round(v_v.iva_monto, 2) <> 27.20 then
    raise exception 'CONTADO: el IVA se calcula sobre la BASE (170,00): debia ser 27,20 y es %.', v_v.iva_monto;
  end if;
  if round(v_v.total, 2) <> 197.20 then
    raise exception 'CONTADO: el total debia ser 197,20 y es %.', v_v.total;
  end if;
  if round(v_v.costo_total, 2) <> 100.00 then
    raise exception 'CONTADO: el costo congelado debia ser 100,00 y es %.', v_v.costo_total;
  end if;
  if round(v_v.ganancia_total, 2) <> 70.00 then
    raise exception 'CONTADO: la ganancia debia ser 70,00 y es %. (total - costo daria 97,20: el IVA NO es ganancia.)', v_v.ganancia_total;
  end if;
  if round(v_v.ganancia_total, 2) = round(v_v.total - v_v.costo_total, 2) then
    raise exception 'CONTADO: la ganancia quedo igual a total - costo, o sea que se le colo el IVA adentro.';
  end if;
  if round(v_v.valor_recibido, 2) <> 0 or round(v_v.diferencia, 2) <> 197.20 then
    raise exception 'CONTADO: en una venta normal la diferencia ES el total. Quedo recibido % / diferencia %.',
      v_v.valor_recibido, v_v.diferencia;
  end if;
  if v_v.cliente_nombre is distinct from (k_pref || 'CLIENTE')
     or v_v.cliente_rif is distinct from 'J-000000000' then
    raise exception 'CONTADO: el cliente no quedo congelado en el documento (% / %).',
      v_v.cliente_nombre, v_v.cliente_rif;
  end if;
  if v_v.confirmada_at is null or v_v.confirmada_por <> 'Tester' then
    raise exception 'CONTADO: falta la firma de quien confirmo (% / %).', v_v.confirmada_at, v_v.confirmada_por;
  end if;

  -- El costo congelado y la cuenta de cada renglón.
  select round(costo_unit, 2) into v_monto from public.ventas_renglones
   where venta_id = v_venta and producto_id = v_prod_a;
  if v_monto <> 30.00 then
    raise exception 'CONTADO: el renglon A debia congelar costo 30,00 desde existencias y congelo %.', v_monto;
  end if;
  select round(ganancia, 2) into v_monto from public.ventas_renglones
   where venta_id = v_venta and producto_id = v_prod_b;
  if v_monto <> 40.00 then
    raise exception 'CONTADO: el renglon B con 20 de descuento debia dar ganancia 40,00 y dio %. (Sin restar el descuento daria 60,00: el descuento de linea baja la ganancia.)', v_monto;
  end if;

  -- La plata entró a la caja.
  select round(saldo, 2) into v_saldo from public.cajas where id = v_caja;
  if v_saldo <> 197.20 then
    raise exception 'CONTADO: la caja debia quedar en 197,20 y quedo en %.', v_saldo;
  end if;
  select count(*) into v_n from public.movimientos_caja
   where caja_id = v_caja and tipo = 'ingreso' and monto = 197.20;
  if v_n <> 1 then
    raise exception 'CONTADO: debia quedar UN ingreso de 197,20 en el libro de la caja y hay %.', v_n;
  end if;
  -- El movimiento tiene que quedar enganchado al documento, no solo nombrarlo
  -- en el texto: de eso vive la vista `ventas_movimientos_caja`.
  select count(*) into v_n from public.movimientos_caja where ref_venta_id = v_venta;
  if v_n <> 1 then
    raise exception 'CONTADO: el ingreso debia quedar apuntando a la venta por ref_venta_id y hay % asi.', v_n;
  end if;
  select count(*) into v_n from public.ventas_movimientos_caja where venta_id = v_venta;
  if v_n <> 1 then
    raise exception 'CONTADO: la vista ventas_movimientos_caja debia mostrar el cobro y muestra % filas.', v_n;
  end if;

  -- ── Y EL ALMACÉN NO SE MOVIÓ ─────────────────────────────────────
  -- La verificación que da sentido a la regla del módulo: al confirmar se
  -- mueve el dinero, el material recién se mueve al entregar.
  select stock into v_stock_a from public.existencias where producto_id = v_prod_a and almacen = 'General';
  select stock into v_stock_b from public.existencias where producto_id = v_prod_b and almacen = 'General';
  if round(v_stock_a, 4) <> 100 or round(v_stock_b, 4) <> 50 then
    raise exception 'CONTADO: confirmar NO puede tocar el stock. Quedo A=% (debia 100) y B=% (debia 50).',
      v_stock_a, v_stock_b;
  end if;
  select count(*) into v_n from public.ventas_renglones where venta_id = v_venta and mov_id is not null;
  if v_n <> 0 then
    raise exception 'CONTADO: ningun renglon puede tener mov_id de kardex al confirmar, y hay % con movimiento.', v_n;
  end if;

  -- ═══ ESCENARIO 2 · CRÉDITO ═══════════════════════════════════════
  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct)
    values (k_pref || '0002', 'venta', 'borrador', v_cliente, 'credito', 'USD', 40, 10, 16)
    returning id into v_venta;
  insert into public.ventas_renglones (venta_id, orden, producto_id, cantidad, precio_unit, descuento)
    values (v_venta, 1, v_prod_a, 2, 50, 0), (v_venta, 2, v_prod_b, 4, 25, 20);

  v_v := public.confirmar_venta(v_venta, 'tester', 'Tester');

  if v_v.estado <> 'confirmada' or round(v_v.total, 2) <> 197.20 then
    raise exception 'CREDITO: la venta debia confirmar por 197,20 y quedo % / %.', v_v.estado, v_v.total;
  end if;
  if v_v.cxc_id is null then
    raise exception 'CREDITO: no quedo guardado el cxc_id de la cuenta del cliente.';
  end if;
  v_cuenta := v_v.cxc_id;

  select round(monto, 2), estado into v_monto, v_msg
    from public.cuentas_por_cobrar where id = v_cuenta;
  if v_monto <> 197.20 then
    raise exception 'CREDITO: la cuenta del cliente debia subir a 197,20 y esta en %.', v_monto;
  end if;
  if v_msg <> 'abierta' then
    raise exception 'CREDITO: la cuenta del cliente debia quedar abierta y esta "%".', v_msg;
  end if;
  select count(*) into v_n from public.cuentas_por_cobrar_cargos where cuenta_id = v_cuenta;
  if v_n <> 1 then
    raise exception 'CREDITO: debia quedar UN cargo con el rastro de la venta y hay %.', v_n;
  end if;
  -- A crédito no entra plata a ninguna caja.
  select round(saldo, 2) into v_saldo from public.cajas where id = v_caja;
  if v_saldo <> 197.20 then
    raise exception 'CREDITO: una venta a credito no cobra nada, la caja no se podia mover de 197,20 y esta en %.', v_saldo;
  end if;
  if v_v.pago_legs <> '[]'::jsonb then
    raise exception 'CREDITO: no se cobro nada, las formas de pago tenian que quedar vacias y quedaron %.', v_v.pago_legs;
  end if;

  -- ═══ ESCENARIO 3 · PATAS QUE NO SUMAN ════════════════════════════
  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct, pago_legs)
    values (k_pref || '0003', 'venta', 'borrador', v_cliente, 'contado', 'USD',
            40, 10, 16,
            jsonb_build_array(jsonb_build_object(
              'monto', 100, 'cajaId', v_caja::text, 'cuenta', 'principal', 'moneda', 'USD')))
    returning id into v_venta;
  insert into public.ventas_renglones (venta_id, orden, producto_id, cantidad, precio_unit, descuento)
    values (v_venta, 1, v_prod_a, 2, 50, 0), (v_venta, 2, v_prod_b, 4, 25, 20);

  v_fallo := false;
  begin
    v_v := public.confirmar_venta(v_venta, 'tester', 'Tester');
  exception when others then
    v_fallo := true;
    v_msg := sqlerrm;
  end;
  if not v_fallo then
    raise exception 'PATAS: cobrar 100 cuando hay que cobrar 197,20 tenia que fallar y no fallo.';
  end if;
  if v_msg not ilike '%197.20%' then
    raise exception 'PATAS: el mensaje tiene que decir cuanto falta cobrar, y dice "%".', v_msg;
  end if;

  select estado into v_msg from public.ventas where id = v_venta;
  if v_msg <> 'borrador' then
    raise exception 'PATAS: la venta rechazada tenia que quedarse en borrador y quedo "%".', v_msg;
  end if;
  select round(saldo, 2) into v_saldo from public.cajas where id = v_caja;
  if v_saldo <> 197.20 then
    raise exception 'PATAS: el intento fallido no podia dejar plata en la caja. Quedo en %.', v_saldo;
  end if;

  -- ═══ ESCENARIO 4 · PERMUTA A CRÉDITO ═════════════════════════════
  -- El corazón del módulo: el mismo total de 197,20, pero el cliente ya pagó
  -- 100,00 con material. Solo se le puede cargar 97,20. Cargarle 197,20 seria
  -- cobrarle dos veces el mineral que entregó.
  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct)
    values (k_pref || 'P001', 'permuta', 'borrador', v_cliente, 'credito', 'USD', 40, 10, 16)
    returning id into v_venta;
  insert into public.ventas_renglones (venta_id, orden, producto_id, cantidad, precio_unit, descuento)
    values (v_venta, 1, v_prod_a, 2, 50, 0), (v_venta, 2, v_prod_b, 4, 25, 20);
  insert into public.ventas_recibidos (venta_id, orden, producto_id, cantidad, valor_unit)
    values (v_venta, 1, v_prod_c, 10, 10);

  v_v := public.confirmar_venta(v_venta, 'tester', 'Tester');

  if round(v_v.total, 2) <> 197.20 then
    raise exception 'PERMUTA: el total debia seguir siendo 197,20 y es %.', v_v.total;
  end if;
  if round(v_v.valor_recibido, 2) <> 100.00 then
    raise exception 'PERMUTA: el material recibido valia 100,00 y quedo en %.', v_v.valor_recibido;
  end if;
  if round(v_v.diferencia, 2) <> 97.20 then
    raise exception 'PERMUTA: la diferencia debia ser 97,20 (197,20 - 100,00) y es %.', v_v.diferencia;
  end if;
  if v_v.cxc_id <> v_cuenta then
    raise exception 'PERMUTA: la cuenta por cobrar es CORRIENTE por cliente: debia caer en la misma cuenta y abrio otra.';
  end if;
  select round(monto, 2) into v_monto from public.cuentas_por_cobrar where id = v_cuenta;
  if v_monto <> 294.40 then
    raise exception 'PERMUTA: la cuenta debia quedar en 294,40 (197,20 + 97,20) y quedo en %. Si dice 394,40 se le cobro el TOTAL en vez de la DIFERENCIA: se le cobro dos veces el material.', v_monto;
  end if;
  -- El material recibido tampoco entra al almacén al confirmar.
  select stock into v_stock_a from public.existencias where producto_id = v_prod_c and almacen = 'General';
  if round(v_stock_a, 4) <> 0 then
    raise exception 'PERMUTA: el material recibido entra al kardex al ENTREGAR, no al confirmar. El stock quedo en %.', v_stock_a;
  end if;

  -- ═══ ESCENARIO 5 · PERMUTA CERRADA (diferencia 0) ════════════════
  -- No hay plata de por medio: no se cobra, no se endeuda, y las formas de
  -- pago quedan vacías para que la anulación no reverse un cobro que no pasó.
  insert into public.ventas (codigo, tipo, estado, cliente_id, condicion, moneda,
                             tasa_bs, descuento, iva_pct, pago_legs)
    values (k_pref || 'P002', 'permuta', 'borrador', v_cliente, 'contado', 'USD',
            40, 10, 16,
            jsonb_build_array(jsonb_build_object(
              'monto', 197.20, 'cajaId', v_caja::text, 'cuenta', 'principal', 'moneda', 'USD')))
    returning id into v_venta;
  insert into public.ventas_renglones (venta_id, orden, producto_id, cantidad, precio_unit, descuento)
    values (v_venta, 1, v_prod_a, 2, 50, 0), (v_venta, 2, v_prod_b, 4, 25, 20);
  insert into public.ventas_recibidos (venta_id, orden, producto_id, cantidad, valor_unit)
    values (v_venta, 1, v_prod_c, 10, 19.72);

  v_v := public.confirmar_venta(v_venta, 'tester', 'Tester');

  if round(v_v.diferencia, 2) <> 0 then
    raise exception 'CERRADA: la permuta quedaba pareja, la diferencia debia ser 0 y es %.', v_v.diferencia;
  end if;
  if v_v.pago_legs <> '[]'::jsonb then
    raise exception 'CERRADA: no se cobro nada, las formas de pago tenian que quedar vacias y quedaron %.', v_v.pago_legs;
  end if;
  select round(saldo, 2) into v_saldo from public.cajas where id = v_caja;
  if v_saldo <> 197.20 then
    raise exception 'CERRADA: no entraba plata a la caja y quedo en %.', v_saldo;
  end if;
  select round(monto, 2) into v_monto from public.cuentas_por_cobrar where id = v_cuenta;
  if v_monto <> 294.40 then
    raise exception 'CERRADA: no se endeudaba a nadie y la cuenta del cliente quedo en %.', v_monto;
  end if;

  -- ═══ Extra · no se confirma dos veces ════════════════════════════
  v_fallo := false;
  begin
    v_v := public.confirmar_venta(v_venta, 'tester', 'Tester');
  exception when others then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'REPETIR: confirmar dos veces la misma venta tenia que fallar y no fallo.';
  end if;

  -- ── Limpieza ─────────────────────────────────────────────────────
  -- El cobro apunta a la venta por FK y esa FK no tiene cascada, asi que el
  -- libro de caja se limpia primero.
  -- `ventas` y `cuentas_por_cobrar` se referencian mutuamente y ninguna FK
  -- tiene cascada, asi que hay que cortar el lazo a mano y en este orden.
  delete from public.movimientos_caja where ref_venta_id in
    (select id from public.ventas where codigo like k_pref || '%');
  delete from public.cuentas_por_cobrar_cargos where ref_venta_id in
    (select id from public.ventas where codigo like k_pref || '%');
  update public.ventas set cxc_id = null where codigo like k_pref || '%';
  delete from public.ventas where codigo like k_pref || '%';
  delete from public.cuentas_por_cobrar where contraparte like k_pref || '%';
  delete from public.cajas where nombre like k_pref || '%';
  delete from public.existencias where producto_id in
    (select id from public.productos where sku like k_pref || '%');
  delete from public.productos where sku like k_pref || '%';
  delete from public.tesoreria_contrapartes where nombre like k_pref || '%';

  raise notice 'Pruebas de confirmar_venta: OK (contado, credito, patas que no suman, permuta a credito, permuta cerrada)';
end $test$;


-- ═══════════════════════════════════════════════════════════════════
-- 4 · El redondeo, calcado del de la pantalla
-- ═══════════════════════════════════════════════════════════════════
-- Estos cuatro valores son los que separan a `numeric` de JavaScript. Si
-- alguien "arregla" `ventas_round2` para que use `round(x, 2)` de Postgres,
-- este bloque se lo dice acá y no seis meses después con un centavo perdido.
do $round$
begin
  -- Medio centavo hacia arriba: el doble mas cercano a 1,005 es MENOR, asi que
  -- Math.round da 1,00. `round(1.005, 2)` de Postgres daria 1,01.
  if public.ventas_round2(0.5 * 2.01) <> 1.00 then
    raise exception 'REDONDEO: 0,5 x 2,01 debia dar 1,00 como en la pantalla y dio %.',
      public.ventas_round2(0.5 * 2.01);
  end if;
  -- Empate exacto en un valor representable: Math.round redondea hacia +inf.
  if public.ventas_round2(2.345) <> 2.35 then
    raise exception 'REDONDEO: 2,345 debia dar 2,35 y dio %.', public.ventas_round2(2.345);
  end if;
  -- Y hacia +inf tambien cuando es negativo: -0,125 da -0,12, no -0,13.
  if public.ventas_round2(-0.125) <> -0.12 then
    raise exception 'REDONDEO: -0,125 debia dar -0,12 (Math.round va hacia +inf) y dio %.',
      public.ventas_round2(-0.125);
  end if;
  if public.ventas_round2(null) <> 0 then
    raise exception 'REDONDEO: null debia dar 0 y dio %.', public.ventas_round2(null);
  end if;
  raise notice 'Pruebas de ventas_round2: OK';
end $round$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.proname,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       pg_get_function_result(p.oid)             as devuelve,
       p.prosecdef                               as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('confirmar_venta', 'ventas_round2')
 order by p.proname;
