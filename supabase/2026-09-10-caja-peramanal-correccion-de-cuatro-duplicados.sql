-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 10/09/2026
-- Caja Peramanal: corrección de 4 renglones duplicados
--
-- CORRIGE UN ERROR MÍO DEL ARCHIVO ANTERIOR
-- En `2026-09-10-caja-peramanal-cotejo-contra-el-excel.sql` moví 4 montos de
-- la columna de gastos a la de entregado, creyendo que estaban en la columna
-- equivocada. Estaban duplicados, que es otra cosa. El resultado fue peor: en
-- vez de un gasto de más quedó una entrada de más.
--
-- QUÉ PASA DE VERDAD
-- El Excel anota dos renglones: la entrada de multimoneda por su monto y el
-- pago por el suyo. La base traía UN solo renglón de multimoneda con los dos
-- montos ya sumados, MÁS el renglón del pago por separado. Esa plata estaba
-- contada dos veces.
--   18/07 · multimoneda 672,82 = 87,82 + 585,00 (pailas de aceite)
--   20/07 · multimoneda 6.236,63 = 4.901,63 + 1.335,00 (transformador)
--   22/07 · multimoneda 300,25 = 0,25 + 300,00 (apoyo combustible PDVSA)
-- Se baja cada multimoneda a su monto real y queda igual al Excel, renglón
-- por renglón.
--
-- El cuarto es un duplicado liso: el 04/08 hay DOS renglones de $1.031,70 por
-- el mismo mercado. Se borra el que dice «CAJA MULTIMONEDAS».
-- ═══════════════════════════════════════════════════════════════════

update public.acopio_caja_movimientos set usd_entregado = 87.82, updated_at = now()
 where caja_id = '8bab6d92-1893-4ced-bdee-25899643b367'
   and fecha = '2026-07-18' and usd_entregado = 672.82
   and descripcion = 'CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL';

update public.acopio_caja_movimientos set usd_entregado = 4901.63, updated_at = now()
 where caja_id = '8bab6d92-1893-4ced-bdee-25899643b367'
   and fecha = '2026-07-20' and usd_entregado = 6236.63
   and descripcion = 'CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL';

update public.acopio_caja_movimientos set usd_entregado = 0.25, updated_at = now()
 where caja_id = '8bab6d92-1893-4ced-bdee-25899643b367'
   and fecha = '2026-07-22' and usd_entregado = 300.25
   and descripcion = 'CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL';

delete from public.acopio_caja_movimientos
 where caja_id = '8bab6d92-1893-4ced-bdee-25899643b367'
   and fecha = '2026-08-04' and usd_entregado = 1031.70
   and descripcion = 'CAJA MULTIMONEDAS MGG DESCRIPCIÓN: PAGO MERCADO GT MINA';


-- ═══════════════════════════════════════════════════════════════════
-- Verificación contra el encabezado del Excel
-- ═══════════════════════════════════════════════════════════════════
with mov as (
  select count(*) n, sum(usd_entregado) ent, sum(facturados) fac, sum(gastos) gas,
         sum(nominas) nom, sum(traslado) tra, sum(kg_cerrados) kg
    from public.acopio_caja_movimientos
   where caja_id = '8bab6d92-1893-4ced-bdee-25899643b367'
),
ctr as (
  select coalesce(sum(coalesce(kg_seco_limpio,0) * coalesce(tasa,0)),0) fac,
         coalesce(sum(coalesce(kg_seco_limpio,0)),0) kg
    from public.acopio_contratos where numero in ('Minero GT-59','Minero GT-60')
)
select mov.n                                    as movimientos,
       round(mov.ent::numeric,2)                as entregado, 149998.96 as entregado_excel,
       round(mov.gas::numeric,2)                as gastos,    132082.86 as gastos_excel,
       round((mov.fac + ctr.fac)::numeric,2)    as facturado, 16676.10  as facturado_excel,
       round((mov.kg + ctr.kg)::numeric,2)      as kg,        2411.65   as kg_excel,
       round((mov.ent - mov.fac - mov.gas - mov.nom - mov.tra - ctr.fac)::numeric,2) as saldo
  from mov, ctr;
