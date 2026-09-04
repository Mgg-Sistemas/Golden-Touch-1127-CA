-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Se desactivan 25 productos gemelos que estaban vacíos
--
-- QUÉ PASABA
-- El catálogo de repuestos entró DOS VECES: una vez con la unidad `CAJA`
-- (una con `BOLSA`) y otra con `UND`. Quedaron 25 pares con el mismo nombre
-- exacto, que en los buscadores del inventario se ven como duplicados y
-- obligan a adivinar cuál elegir.
--
-- POR QUÉ SE PUEDEN SACAR SIN RIESGO — verificado antes de aplicar
--   · stock 0 en los 25
--   · 0 movimientos de kardex en los 25
--   · 0 órdenes que los nombren (se buscó el SKU dentro del jsonb de items)
-- Son cascarones: nunca se compró ni se movió ninguno.
--
-- POR QUÉ DESACTIVAR Y NO BORRAR
-- Decisión del administrador. Desactivar los saca de los buscadores y las
-- listas igual que borrarlos, pero deja la fila: si mañana aparece que uno
-- hacía falta, se reactiva con un clic. Borrar no tiene vuelta atrás y no
-- ganaba nada a cambio.
--
-- EL GEMELO QUE SÍ SE USA NO SE TOCA
-- De cada par sobrevive el de unidad `UND`, que es el que la gente venía
-- usando. Caso especial: «CROCHE Y RODAMIENTO COMPRESOR RETRO EXCAVADORA
-- 428E» tiene GEN-148 (BOLSA, vacío → se desactiva) y GEN-150 (UND, con 1
-- unidad y 1 movimiento → queda activo).
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_gemelos text[] := array[
    'GEN-095','GEN-096','GEN-097','GEN-098','GEN-100','GEN-101','GEN-102','GEN-103',
    'GEN-104','GEN-105','GEN-107','GEN-108','GEN-109','GEN-110','GEN-111','GEN-112',
    'GEN-113','GEN-114','GEN-115','GEN-116','GEN-117','GEN-118','GEN-119','GEN-120',
    'GEN-148'
  ];
  v_con_stock int;
  v_con_movs  int;
  v_tocados   int;
begin
  -- Guarda 1: ninguno puede tener existencias.
  select count(*) into v_con_stock
    from public.existencias e
    join public.productos p on p.id = e.producto_id
   where p.sku = any(v_gemelos) and coalesce(e.stock, 0) <> 0;
  if v_con_stock > 0 then
    raise exception 'ABORTADO: % gemelos tienen stock. No se desactiva nada.', v_con_stock;
  end if;

  -- Guarda 2: ninguno puede tener historial de kardex.
  select count(*) into v_con_movs
    from public.movimientos m
    join public.productos p on p.id = m.producto_id
   where p.sku = any(v_gemelos);
  if v_con_movs > 0 then
    raise exception 'ABORTADO: hay % movimientos sobre los gemelos. No se desactiva nada.', v_con_movs;
  end if;

  update public.productos
     set estado = 'inactivo',
         updated_at = now()
   where sku = any(v_gemelos)
     and estado <> 'inactivo';
  get diagnostics v_tocados = row_count;

  -- Guarda 3: tienen que ser exactamente 25. Si no, algo cambió desde el
  -- análisis y es mejor no dejar el catálogo a medias.
  if v_tocados <> 25 then
    raise exception 'ABORTADO: se esperaban 25 y se desactivaron %. Se revierte.', v_tocados;
  end if;

  raise notice 'OK: 25 gemelos vacíos desactivados.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
with g as (
  select public.sin_acentos(nombre) as clave
    from public.productos
   where estado = 'activo'
   group by 1 having count(*) > 1
)
select
  (select count(*) from public.productos where estado = 'inactivo'
     and sku in ('GEN-095','GEN-096','GEN-097','GEN-098','GEN-100','GEN-101','GEN-102',
                 'GEN-103','GEN-104','GEN-105','GEN-107','GEN-108','GEN-109','GEN-110',
                 'GEN-111','GEN-112','GEN-113','GEN-114','GEN-115','GEN-116','GEN-117',
                 'GEN-118','GEN-119','GEN-120','GEN-148'))                as desactivados,
  (select count(*) from g)                                                 as grupos_repetidos_que_quedan,
  (select count(*) from public.productos where estado = 'activo')          as productos_activos;
