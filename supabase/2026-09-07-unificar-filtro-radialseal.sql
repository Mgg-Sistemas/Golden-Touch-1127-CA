-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Los dos «FILTRO DE AIRE PRIMARIO RADIALSEAL» eran uno solo
--
-- QUÉ PASABA
--   · REP-037 «…RADIALSEAL 11110022/P537576 EC240» · 1 · $93,50 · 02/09
--   · REP-044 «…RADIALSEAL P537876»                · 1 · $93,50 · 02/09
-- Los números de parte difieren en UN dígito: P537**5**76 contra P537**8**76.
-- Las dos entraron el mismo día, al mismo precio exacto, con una unidad cada
-- una. El informe del 7/9 no se animó a decidirlo desde la base —el número de
-- parte lo dice la caja, no la tabla— y lo dejó para mirar en el almacén.
-- El administrador confirmó que es el mismo filtro y que el bueno es
-- **P537576**: REP-044 quedó con un dígito mal tecleado.
--
-- SOBREVIVE REP-037
-- Es la que tiene el número de parte correcto y además la referencia completa:
-- el código del fabricante (11110022), el número Donaldson (P537576) y el
-- equipo al que va (EC240). REP-044 solo tenía el número, y mal.
--
-- ACÁ SÍ SE MUEVE MATERIAL
-- A diferencia de las otras unificaciones de hoy, estas dos fichas TIENEN
-- stock: 1 unidad cada una. La de REP-044 se traslada a REP-037, que queda
-- con 2. El traslado pasa por `registrar_movimiento_stock` —las dos patas en
-- el kardex con el mismo código de referencia—, no se escribe a mano sobre
-- las tablas de stock. Como las dos están al mismo costo ($93,50), el
-- promedio ponderado no se mueve: 2 × $93,50 = $187,00.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_vive   uuid;   -- REP-037, el bueno
  v_muere  uuid;   -- REP-044, el del dígito mal
  v_stock_muere numeric;
  v_stock_vive  numeric;
  v_costo_muere numeric;
  v_ocs    int;
  v_mov    public.movimientos;
  v_salieron numeric;
  v_entraron numeric;
begin
  select id into v_vive  from public.productos where sku = 'REP-037';
  select id into v_muere from public.productos where sku = 'REP-044';
  if v_vive is null or v_muere is null then
    raise exception 'ABORTADO: no se encontraron los dos filtros.';
  end if;

  select coalesce(sum(stock),0) into v_stock_muere from public.existencias where producto_id = v_muere;
  select coalesce(sum(stock),0) into v_stock_vive  from public.existencias where producto_id = v_vive;
  select coalesce(max(costo_promedio),0) into v_costo_muere
    from public.existencias where producto_id = v_muere;

  -- Guarda 1 · el análisis se hizo sobre 1 y 1.
  if round(v_stock_muere,2) <> 1 or round(v_stock_vive,2) <> 1 then
    raise exception 'ABORTADO: se esperaba REP-044=1 y REP-037=1, hay % y %.',
      round(v_stock_muere,2), round(v_stock_vive,2);
  end if;

  -- Guarda 2 · REP-044 no puede estar comprometida en una orden viva: al
  -- desactivarla, ese renglon quedaria apuntando a una ficha que nadie mira.
  select count(*) into v_ocs
    from public.ordenes o
   where o.items::text like '%' || v_muere::text || '%'
     and o.estado not in ('finalizada','cancelada');
  if v_ocs > 0 then
    raise exception 'ABORTADO: REP-044 aparece en % orden(es) viva(s). Hay que reapuntar esos renglones a REP-037 antes de desactivarla.', v_ocs;
  end if;

  -- ── 1 · Sale el filtro de REP-044 ────────────────────────────────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_muere,
    'tipo',        'salida',
    'delta',       -v_stock_muere,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-RADIALSEAL-2026-09-07',
    'detalle',     'La unidad pasa a REP-037. Es el mismo filtro: REP-044 tenia el numero de parte con un digito mal (P537876 en vez de P537576).'
  ));
  v_salieron := v_mov.stock_antes - v_mov.stock_despues;
  if round(v_salieron,4) <> round(v_stock_muere,4) then
    raise exception 'ABORTADO: se esperaba sacar % y salieron %.', v_stock_muere, v_salieron;
  end if;

  -- ── 2 · Entra a REP-037 con el costo que traia ───────────────────
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_vive,
    'tipo',        'entrada',
    'delta',       v_salieron,
    'precio_unitario', v_costo_muere,
    'actor',       'unificacion-productos',
    'actor_name',  'Unificación de productos (autorizada por el administrador)',
    'ref_tipo',    'unificacion_producto',
    'ref_codigo',  'UNIF-RADIALSEAL-2026-09-07',
    'detalle',     'Ingresa la unidad que estaba cargada en REP-044, que queda desactivado.'
  ));
  v_entraron := v_mov.stock_despues - v_mov.stock_antes;
  if round(v_entraron,4) <> round(v_salieron,4) then
    raise exception 'ABORTADO: salio % de REP-044 pero entro % a REP-037.', v_salieron, v_entraron;
  end if;

  -- ── 3 · El del digito mal se desactiva ───────────────────────────
  update public.productos
     set nombre = 'FILTRO DE AIRE PRIMARIO RADIALSEAL P537876 (mal tecleado · unificado en REP-037)',
         estado = 'inactivo', updated_at = now()
   where id = v_muere;

  raise notice 'OK: REP-037 queda con 2 unidades a $93,50 = $187,00.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.unidad, p.estado, p.precio,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock,
       (select round(coalesce(sum(e.stock*e.costo_promedio),0),2) from public.existencias e where e.producto_id = p.id) as valor,
       (select count(*) from public.movimientos m where m.producto_id = p.id) as movimientos
  from public.productos p
 where p.sku in ('REP-037','REP-044')
 order by p.estado;
