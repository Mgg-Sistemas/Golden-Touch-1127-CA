-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 10/09/2026
-- Caja Peramanal: se adopta el criterio del Excel · cierre en 0,00
--
-- POR QUÉ
-- Después del cotejo renglón por renglón quedaban CUATRO fechas con
-- diferencia contra «CAJA PERAMANAL - GOLDEN TOUCH 27-06-2026.xlsx»
-- (hoja «CAJA PERAMANAL - GOLDEN TOUCH», 187 renglones). El usuario
-- pidió expresamente dejar la caja fiel al Excel «por esta vez».
--
-- Encabezado del Excel, que es a lo que hay que llegar:
--   entregado 149.998,9579 · facturado 16.676,10 · gastos 132.082,8584
--   nóminas 1.240,00 · traslado 0 · kg 2.411,65
--   precio $/kg 62,19764825 · saldo -0,0005  (o sea, cero)
--
-- LAS TRES COSAS QUE SE TOCAN
--
-- 1) 09/07 · los 39,34 de la reposición del mercado provisional.
--    La base los tiene como ENTRADA en el renglón de multimonedas y
--    como GASTO en el renglón del pago. El Excel los tiene al revés:
--    el gasto va en el renglón de multimonedas y el del pago va en 0.
--    Neto: la base tiene 39,34 de entrada que el Excel no reconoce.
--
-- 2) 09/08 · el consumo de combustible de la semana 03/08–09/08.
--    El sistema lo asienta como el sistema asienta todas las semanas:
--    un GASTO por el consumo y una ENTRADA de multimoneda que lo
--    compensa. El Excel, esa semana y sólo esa, pone las DOS en la
--    columna de entrada.
--
--    ESTO ES UN DESLIZ DEL EXCEL, NO DEL SISTEMA. En ese mismo archivo
--    todas las demás semanas (28/06, 05/07, 12/07, 14/07, 19/07, 26/07,
--    03/08) van con entrada + gasto. Si esa semana se llevara como las
--    otras, el Excel cerraría en -2.226,44 y no en cero. Se copia
--    porque así se pidió; queda escrito acá para que se sepa.
--
--    De paso los montos bajan de 1.113,26 a 1.113,22, que es lo que
--    dice el Excel (1615 L × 0,6893 $/L = 1.113,2195).
--
-- 3) 16/08 · la semana 10/08–16/08 de combustible.
--    Existe en la base y no existe en el Excel: el Excel todavía no la
--    cargó. Sus dos renglones (gasto 1.366,14 + entrada 1.366,14) se
--    borran. No mueven el saldo, pero sí las tarjetas de Entregado y
--    de Gastos, que es lo que se está cuadrando.
--
-- OJO CON ESTO
-- Los renglones de combustible los genera `postear_consumo_combustible_semana`,
-- que borra y reescribe por `ref_combustible_periodo`. Si alguien pulsa
-- «Generar consumo de la semana» sobre 03/08–09/08 o sobre 10/08–16/08,
-- el sistema los vuelve a poner a su manera y esta corrección se pierde.
--
-- Los contratos #59 y #60 (66,15 + 7,40 kg × 8,40 = 617,82) siguen sin
-- renglón de caja: viven en `acopio_contratos` y la tarjeta ya los suma
-- desde ahí. Por eso Facturado y Kg ya daban exactos y no se tocan.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) 09/07 · los 39,34 pasan de entrada a gasto ──────────────────
update public.acopio_caja_movimientos
   set usd_entregado = 0, gastos = 39.34, updated_at = now()
 where id = '32f849c3-64a6-4aa7-8762-c4f0a82baca4'
   and usd_entregado = 39.34;

update public.acopio_caja_movimientos
   set gastos = 0, updated_at = now()
 where id = '150b0b3c-4c06-4fa8-b2a1-45c143de51e8'
   and gastos = 39.34;

-- ── 2) 09/08 · el consumo deja de ser gasto y pasa a entrada ───────
update public.acopio_caja_movimientos
   set gastos = 0, usd_entregado = 1113.22, updated_at = now()
 where id = 'e08274b9-8260-4678-bb14-aabc3805ff9f'
   and gastos = 1113.26;

update public.acopio_caja_movimientos
   set usd_entregado = 1113.22, updated_at = now()
 where id = 'b73cd853-1e6c-4c2e-be40-d20cb031d433'
   and usd_entregado = 1113.26;

-- ── 3) 16/08 · la semana que el Excel no tiene ─────────────────────
delete from public.acopio_caja_movimientos
 where id in ('58ca0b3d-99f7-4316-b0c8-ba410f81621d',
              '5efe3b4c-543d-4893-bfa1-53772d573711');


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
),
t as (
  select mov.n,
         round(mov.ent::numeric,2)                 ent,
         round((mov.fac + ctr.fac)::numeric,2)     fac,
         round(mov.gas::numeric,2)                 gas,
         round(mov.nom::numeric,2)                 nom,
         round((mov.kg + ctr.kg)::numeric,2)       kg
    from mov, ctr
)
select n                                            as movimientos,
       ent, 149998.96 as ent_excel,
       fac, 16676.10  as fac_excel,
       gas, 132082.86 as gas_excel,
       nom, 1240.00   as nom_excel,
       kg,  2411.65   as kg_excel,
       round((ent - fac - gas - nom)::numeric, 2)   as saldo,
       round(((fac + gas + nom) / nullif(kg,0))::numeric, 4) as tasa,
       62.1976 as tasa_excel
  from t;
