-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Inspección de nombres parecidos en Inventario · fichas duplicadas
--
-- QUÉ SE REVISÓ
-- Los 472 productos activos, cruzados todos contra todos por semejanza de
-- nombre (trigramas, sin acentos) y por contención (un nombre dentro del
-- otro). Salieron 88 pares. La mayoría NO son duplicados: son piezas
-- distintas que se parecen al escribirse (filtros con número de parte
-- distinto, codos de 2"/3"/4", bombonas de 18 y de 43, bocinas D y T,
-- tornillos de 2" y 2½"), o coincidencias de letras sin relación
-- (POLLO/REPOLLO, CARNE/CARNETS, TOMATE/SARDINAS EN TOMATE).
--
-- QUÉ SE DEPURA ACÁ — y solo esto
-- Fichas que son LO MISMO que otra y además están VACÍAS: stock 0, cero
-- movimientos en el kardex, ninguna compra directa, ninguna solicitud de
-- salida, ninguna producción y ninguna OC abierta. Al no tener nada que
-- trasladar, unificarlas es simplemente desactivar la de más: no se mueve
-- material, no se toca ningún costo y no se pierde ningún historial.
-- Se DESACTIVAN, no se borran, y el nombre queda marcado con el SKU que
-- las reemplaza. Volver atrás es reactivarlas desde la ficha.
--
-- LO QUE NO SE TOCA
-- · GEN-227 LENTE DE SEGURIDAD y EQU-001 «LENTES DE SEGURIDA» son el mismo
--   EPP con un tipeo, y ninguna tiene stock; pero EQU-001 tiene 2 movimientos
--   y GEN-227 tiene DOS OC ABIERTAS. Cuál queda es una decisión, no algo que
--   pueda resolver una guarda automática: se deja para revisión.
-- · Los pares que SÍ son el mismo producto pero tienen material cargado
--   (esponjas, vinagre, pulmón de freno) quedan fuera: mover stock entre
--   fichas es irreversible y va aparte, con su propio análisis, como se
--   hizo con PLÁTANO y con ACEITE VATEL SOYA.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  r record;
  v_tocados int := 0;
  -- sku_muere → sku_vive; el motivo va al nombre para que se entienda.
  v_pares constant text[][] := array[
    ['GEN-193','GEN-189'],   -- KIT DE SELLOS DE TUBERIAS = KIT SELLOS DE TUBERÍAS
    ['GEN-194','GEN-190'],   -- HIDROFLUCH PARA LIMPIEZA = HIDROFLUCH PARA LA LIMPIEZA
    ['GEN-195','GEN-191'],   -- BOMBONA DE GAS R134A = BOMBONA GAS R134A
    ['GEN-072','GEN-076'],   -- HONOR X6C 256GB → la ficha con la compra real
    ['GEN-073','GEN-076'],   -- HONOR  X6C      → la ficha con la compra real
    ['INS-073','MAT-024'],   -- ADAPTADORES MACHOS 1/2 = ADAPTADORES MACHOS DE 1/2 AF
    ['GEN-188', null],       -- «ACEITE» genérico: hay 20 aceites con nombre propio
    ['GEN-029', null],       -- «SILICON» genérico: hay 3 silicones con nombre propio
    ['GEN-099', null]        -- «BUSHING» genérico: hay 3 bushings con número de parte
  ];
  v_par text[];
  v_id uuid;
  v_stock numeric;
  v_movs int;
  v_ocs int;
begin
  foreach v_par slice 1 in array v_pares loop
    select id into v_id from public.productos where sku = v_par[1] and estado = 'activo';
    if v_id is null then
      raise notice 'SALTADO %: ya no está activa.', v_par[1];
      continue;
    end if;

    -- Guardas: si tiene material, historial o una OC viva, NO se toca.
    select coalesce(sum(stock),0) into v_stock from public.existencias where producto_id = v_id;
    select count(*) into v_movs from public.movimientos where producto_id = v_id;
    select count(*) into v_ocs from public.ordenes o
      where o.items::text like '%' || v_id::text || '%'
        and o.estado not in ('finalizada','cancelada');

    if round(v_stock,4) <> 0 or v_movs > 0 or v_ocs > 0 then
      raise exception 'ABORTADO en %: stock=%, movimientos=%, OC abiertas=%. Esta ficha NO está vacía y necesita un traslado con análisis propio.',
        v_par[1], v_stock, v_movs, v_ocs;
    end if;

    update public.productos
       set nombre = nombre || case
             when v_par[2] is null then ' (ficha genérica retirada)'
             else ' (unificado en ' || v_par[2] || ')' end,
           estado = 'inactivo',
           updated_at = now()
     where id = v_id;
    v_tocados := v_tocados + 1;
  end loop;

  raise notice 'OK: % fichas duplicadas desactivadas.', v_tocados;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select sku, nombre, categoria, estado
  from public.productos
 where sku in ('GEN-193','GEN-194','GEN-195','GEN-072','GEN-073','INS-073',
               'EQU-001','GEN-188','GEN-029','GEN-099',
               'GEN-189','GEN-190','GEN-191','GEN-076','MAT-024','GEN-227')
 order by estado, sku;
