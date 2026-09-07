-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- GEN-273 se unifica en GEN-274, también DENTRO de la solicitud
--
-- QUÉ PASABA
--   · GEN-274 «UNION UNIVERSAL DE 1" CON ROSCA»            · 0 · $0
--   · GEN-273 «UNION UNIVERSAL DE 1" CON ROSCA POR UN LADO» · 0 · $0
-- Las dos creadas el 5/9 y las dos pedidas en la MISMA solicitud
-- SP-2026-0157: GEN-273 en cantidad 1 y GEN-274 en cantidad 3.
--
-- El informe del 7/9 apuntaba a que eran piezas distintas, justamente porque
-- estaban las dos en la misma solicitud. El administrador confirmó que NO: es
-- la misma pieza cargada dos veces. Sobrevive GEN-274 «en todos los sentidos»
-- —su SKU y su nombre—, y GEN-273 se desactiva.
--
-- POR QUÉ HAY QUE TOCAR LA SOLICITUD Y NO SOLO LA FICHA
-- Desactivar GEN-273 a secas dejaría su renglón vivo dentro de SP-2026-0157,
-- apuntando a un producto inactivo: se cotizaría y se compraría igual, y al
-- recibir entraría a una ficha que ya nadie mira. Por eso el renglón de
-- GEN-273 se ELIMINA y su cantidad se SUMA a la de GEN-274. Las dos están en
-- UND y las dos sin precio (la solicitud todavía no se cotizó), así que sumar
-- las cantidades no mezcla monedas ni promedia costos: 1 + 3 = 4.
--
-- LA SOLICITUD ESTÁ VIVA — cuidado tomado
-- SP-2026-0157 está en `aprobada` y hoy mismo se editó tres veces (8:17, 8:26
-- y 8:32 de la mañana). Para no pisar una edición hecha entre medio, los
-- renglones NO se escriben desde una copia leída antes: se RECALCULAN dentro
-- del mismo UPDATE a partir de lo que haya en la fila en ese instante, y las
-- cantidades se leen ahí mismo. Si alguien cambió las cantidades, se suman las
-- suyas, no las que yo vi.
--
-- El cambio queda anotado en el `historial` de la orden, que es donde la
-- pantalla muestra quién tocó qué y cuándo.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_orden   uuid;
  v_estado  text;
  v_273     uuid;
  v_274     uuid;
  v_c273    numeric;
  v_c274    numeric;
  v_u273    text;
  v_u274    text;
  v_n273    int;
  v_n274    int;
  v_otras   int;
  v_stock   numeric;
begin
  select id into v_273 from public.productos where sku = 'GEN-273';
  select id into v_274 from public.productos where sku = 'GEN-274';
  if v_273 is null or v_274 is null then
    raise exception 'ABORTADO: no se encontraron las dos fichas.';
  end if;

  -- Guarda 1 · ninguna puede tener material: unificar no debe mover stock.
  select coalesce(sum(e.stock),0) into v_stock
    from public.existencias e where e.producto_id in (v_273, v_274);
  if round(v_stock,4) <> 0 then
    raise exception 'ABORTADO: entre las dos hay % de stock. Aparecio material y hace falta un traslado por kardex.', v_stock;
  end if;

  -- Guarda 2 · GEN-273 solo puede estar en ESTA solicitud. Si aparece en otra
  -- orden viva, eliminar su renglon aca dejaria la otra apuntando a una ficha
  -- inactiva sin que nadie se entere.
  select count(*) into v_otras
    from public.ordenes o
   where o.items::text like '%' || v_273::text || '%'
     and o.codigo <> 'SP-2026-0157'
     and o.estado not in ('finalizada','cancelada');
  if v_otras > 0 then
    raise exception 'ABORTADO: GEN-273 aparece en % orden(es) viva(s) ademas de SP-2026-0157. Hay que revisarlas una por una.', v_otras;
  end if;

  select id, estado into v_orden, v_estado
    from public.ordenes where codigo = 'SP-2026-0157';
  if v_orden is null then
    raise exception 'ABORTADO: no existe SP-2026-0157.';
  end if;
  if v_estado in ('finalizada','cancelada') then
    raise exception 'ABORTADO: SP-2026-0157 esta en %, ya no se toca.', v_estado;
  end if;

  -- Se leen las cantidades y medidas AHORA, de la fila, no de una copia vieja.
  select count(*), max((it->>'cantidad')::numeric), max(it->>'unidad')
    into v_n273, v_c273, v_u273
    from public.ordenes o, jsonb_array_elements(o.items) it
   where o.id = v_orden and it->>'sku' = 'GEN-273';

  select count(*), max((it->>'cantidad')::numeric), max(it->>'unidad')
    into v_n274, v_c274, v_u274
    from public.ordenes o, jsonb_array_elements(o.items) it
   where o.id = v_orden and it->>'sku' = 'GEN-274';

  if v_n273 <> 1 or v_n274 <> 1 then
    raise exception 'ABORTADO: se esperaba UN renglon de cada una en SP-2026-0157 y hay % de GEN-273 y % de GEN-274.', v_n273, v_n274;
  end if;
  if coalesce(v_u273,'') <> coalesce(v_u274,'') then
    raise exception 'ABORTADO: los renglones estan en medidas distintas (% y %). Sumarlos seria inventar una equivalencia.', v_u273, v_u274;
  end if;

  -- El renglon de GEN-273 se elimina y su cantidad se suma a la de GEN-274.
  update public.ordenes o
     set items = (
           select jsonb_agg(
                    case when t.it->>'sku' = 'GEN-274'
                         then jsonb_set(t.it, '{cantidad}', to_jsonb(v_c273 + v_c274))
                         else t.it end
                    order by t.ord)
             from jsonb_array_elements(o.items) with ordinality t(it, ord)
            where t.it->>'sku' <> 'GEN-273'
         ),
         historial = coalesce(o.historial, '[]'::jsonb) || jsonb_build_object(
           'at', now(),
           'actor', 'unificacion-productos',
           'evento', 'orden_modificada',
           'detalle', 'Unificación de productos: el renglón de GEN-273 (' ||
                      trim(to_char(v_c273,'FM999999990.####')) || ') se sumó al de GEN-274, que queda en ' ||
                      trim(to_char(v_c273 + v_c274,'FM999999990.####')) || '. Es la misma pieza cargada dos veces.'
         ),
         updated_at = now()
   where o.id = v_orden;

  -- La ficha que sale, con el motivo escrito en el nombre.
  update public.productos
     set nombre = 'UNION UNIVERSAL DE 1" CON ROSCA POR UN LADO (unificado en GEN-274)',
         estado = 'inactivo', updated_at = now()
   where id = v_273;

  raise notice 'OK: SP-2026-0157 queda con GEN-274 en % y sin el renglon de GEN-273.', v_c273 + v_c274;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.estado,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock
  from public.productos p where p.sku in ('GEN-273','GEN-274')
 order by p.estado;

select it->>'sku' as sku, it->>'nombre' as nombre, it->>'cantidad' as cantidad, it->>'unidad' as unidad
  from public.ordenes o, jsonb_array_elements(o.items) it
 where o.codigo = 'SP-2026-0157'
   and it->>'sku' in ('GEN-273','GEN-274','GEN-265');
