-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 10/09/2026
-- Caja Peramanal: cotejo fila por fila contra el Excel y corrección
--
-- CÓMO SE HIZO
-- Con el archivo «CAJA PERAMANAL - GOLDEN TOUCH 27-06-2026.xlsx» (hoja
-- «CAJA PERAMANAL - GOLDEN TOUCH»), 187 renglones del 28/06 al 03/09. Sus
-- columnas suman exactamente el encabezado: entregado 149.998,96 · facturado
-- 16.676,10 · gastos 132.082,86 · nómina 1.240,00 · Kg 2.411,65 · saldo 0,00.
-- Se comparó renglón contra renglón con los 177 de la base emparejando por
-- fecha + montos. Resultado: 36 renglones del Excel que la base no tenía y
-- 26 de la base que el Excel no tiene.
--
-- 1) SE CARGAN 20 OMISIONES REALES
-- Pagos chicos del 05/08 al 14/08 que nunca se cargaron (peajes, lavados,
-- teléfono, salchichas, crucetas, hortaliza, repuestos, recargas de gas) más
-- los 4 renglones que la carga anterior había dejado afuera por no poder leer
-- su columna en el PDF. El Excel sí distingue la columna, así que ya no hay
-- que adivinar: el filtro del payloader ($23,84) y el 50% del mecánico
-- Cornelio ($3.000,00) van en ENTREGADO, no en gastos.
--
-- 2) SE CORRIGEN 4 RENGLONES QUE ESTABAN EN LA COLUMNA EQUIVOCADA
-- Están cargados como GASTO y en el Excel son ENTREGADO. Son $3.251,70 que
-- el sistema contaba dos veces mal: restaba en vez de sumar. Explican solos
-- $6.503,40 de la diferencia de saldo.
--
-- 3) LO QUE NO SE TOCA, Y POR QUÉ
--   · CONTRATO MINERO #59 y #60 (14/08, 73,55 Kg, $617,82). El Excel los
--     lleva como renglón de caja porque no tiene tabla de contratos. El
--     sistema SÍ la tiene: están en `acopio_contratos` como cerrados, y la
--     pantalla los suma por ese lado. Cargarlos también acá los contaría dos
--     veces. Por eso las tarjetas de Facturados y Kg ya dan exactas.
--   · Renglones que el Excel junta y la base separa (o al revés): 31/07 uno
--     de $196,80 contra siete que suman lo mismo; 18/07, 20/07, 22/07, 04/08
--     y 14/08 con repartos distintos de la misma plata. Suman igual, así que
--     no cambian ningún total. Es forma, no fondo.
--   · Consumo de combustible del 03/08–09/08 y del 10/08–16/08: la base los
--     lleva como par (gasto + entrada multimoneda, neto cero) y el Excel los
--     anota distinto. Queda como está: tocarlo requiere decidir cuál de las
--     dos formas es la buena, y eso no es una corrección de datos.
--
-- QUÉ QUEDA DESPUÉS DE ESTO
-- El saldo NO llega a cero. Lo que sobra es lo del punto 3, sobre todo el
-- combustible del 09/08, que en el Excel suma $2.226,44 de entradas y en la
-- base neto cero. La verificación del final dice en cuánto quedó.
--
-- CÓMO DESHACER
--   delete from public.acopio_caja_movimientos
--    where actor_name = 'COTEJO EXCEL 10/09';
--   -- y volver a poner en gastos los 4 renglones del punto 2.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Omisiones ───────────────────────────────────────────────────
insert into public.acopio_caja_movimientos
  (caja_id, fecha, descripcion, usd_entregado, kg_cerrados, facturados,
   gastos, nominas, traslado, kg_recibidos, clasif_grupo, clasif_valor,
   orden, created_by, actor_name)
values
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-07-21','CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL',0,0,0,4.04,0,0,0,'movimientos_caja','2. CAJA MULTIMONEDAS MGG / CAJA PERAMANAL ',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-05','PAGO PEAJE IDA Y VUELTA D3 MINA GT PARA RETROEXCAVADORA A HPC DESTINO GT',0,0,0,7.74,0,0,0,'gastos_caja','VIÁTICOS: HOSPEDAJE - COMIDA - GASTOS VARIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-06','PEAJE EDINSON GT',0,0,0,0.25,0,0,0,'gastos_caja','VIÁTICOS: HOSPEDAJE - COMIDA - GASTOS VARIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-07','PAGO DE TELEFONO PARA CAMION DE SERVICIO GT',0,0,0,189.11,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-08','PAGO PEAJE EDINSON GT',0,0,0,0.59,0,0,0,'gastos_caja','VIÁTICOS: HOSPEDAJE - COMIDA - GASTOS VARIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-10','PAGO LAVADO EP-1000 UNO REF: 29666144',0,0,0,44.43,0,0,0,'gastos_caja','VEHICULO: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-10','PEAJE EDINSON GT REF: 006964746457',0,0,0,0.59,0,0,0,'gastos_caja','VIÁTICOS: HOSPEDAJE - COMIDA - GASTOS VARIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-11','PAGO DE 2 PEAJES MINA GT SOPA GANDOLA REF: 006970594549',0,0,0,9.95,0,0,0,'gastos_caja','VIÁTICOS: HOSPEDAJE - COMIDA - GASTOS VARIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-11','PAGO PEAJE EDINSON GT Y CAMION DE SERVICIO REF: 006970605597',0,0,0,2.75,0,0,0,'gastos_caja','VIÁTICOS: HOSPEDAJE - COMIDA - GASTOS VARIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-11','PAGO DE 0067 ODC SALCHICHAS GT REF: 29863223',0,0,0,40.41,0,0,0,'gastos_caja','COMIDA - MERCADO - REFRIGERIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-11','PAGO DE 2 CRUCETAS PARA EP-1000 UNO SOLICITADO POR SR EDINSON REF: 29886463',0,0,0,123.48,0,0,0,'gastos_caja','VEHICULO: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-12','PAGO DE ODC 0066 A CREDITO POLLOS GT QUE LLEGARON EL DIA 31-07-2026 REF: 29953960',279.49,0,0,0,0,0,0,'movimientos_caja','2. CAJA MULTIMONEDAS MGG / CAJA PERAMANAL ',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-12','PAGO DE HORTALIZA GT',0,0,0,146.33,0,0,0,'gastos_caja','COMIDA - MERCADO - REFRIGERIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-13','PAGO DE REPUESTO RETROEXCAVADORA GT REF: 30132066',0,0,0,87.79,0,0,0,'gastos_caja','MAQUINARIA PESADA: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-13','PAGO 2 RECARGAS DE GAS GT REF: 30133826',0,0,0,41.69,0,0,0,'gastos_caja','RECARGA DE BOMBONAS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-13','PAGO DE PAPEL AHUMADO DE RETROEXCAVADORA GT REF: 30134638',48.21,0,0,0,0,0,0,'movimientos_caja','2. CAJA MULTIMONEDAS MGG / CAJA PERAMANAL ',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-14','PAGO ODC 0073 MANGUERA Y UNION GT AUTORIZADO POR SRA LEYDIS R REF: 30180165',0,0,0,104.60,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-20','PAGO ODC 0083 FILTRO DE ACEITE PARA PAYLOADER REF: 30555188 · MONTO: 21.832,78',23.84,0,0,0,0,0,0,'movimientos_caja','2. CAJA MULTIMONEDAS MGG / CAJA PERAMANAL ',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-21','CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL',0,0,0,7.71,0,0,0,'movimientos_caja','2. CAJA MULTIMONEDAS MGG / CAJA PERAMANAL ',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-29','PAGO DE 50% DE MANO DE OBRA MECANICO CORNELIO PARA DR9 AUTORIZADO POR SRA LEYDIS · MONTO: 3000$',3000.00,0,0,0,0,0,0,'movimientos_caja','2. CAJA MULTIMONEDAS MGG / CAJA PERAMANAL ',0,'mineralgroupguayanaca@gmail.com','COTEJO EXCEL 10/09');


-- ── 2) Cuatro renglones que estaban en la columna equivocada ───────
--     Cargados como GASTO; en el Excel son ENTREGADO.
update public.acopio_caja_movimientos
   set usd_entregado = gastos, gastos = 0, updated_at = now()
 where caja_id = '8bab6d92-1893-4ced-bdee-25899643b367'
   and gastos > 0
   and (   (fecha = '2026-07-18' and descripcion = 'PAGO DE 3 PAILAS DE ACEITE 15W40 PARA PLANTA YAMAGRO GT'         and gastos = 585.00)
        or (fecha = '2026-07-20' and descripcion = 'ADELANTO POR TRANSFORMADOR EN SECO Y GENERADOR TRIFASICO'        and gastos = 1335.00)
        or (fecha = '2026-07-22' and descripcion = 'PAGO POR APOYO GT COMBUSTIBLE DEL 16-07-2026 PDVSA'              and gastos = 300.00)
        or (fecha = '2026-08-04' and descripcion = 'PAGO MERCADO GT MINA PERAMANAL'                                  and gastos = 1031.70));


-- ═══════════════════════════════════════════════════════════════════
-- Verificación: las cifras de las tarjetas contra las del Excel.
-- (Facturados y Kg incluyen los contratos #59 y #60, que la pantalla
--  suma desde `acopio_contratos` y no desde el libro de caja.)
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
select mov.n                                                   as movimientos,
       round(mov.ent::numeric,2)                               as entregado_sistema,
       149998.96                                               as entregado_excel,
       round(mov.gas::numeric,2)                               as gastos_sistema,
       132082.86                                               as gastos_excel,
       round((mov.fac + ctr.fac)::numeric,2)                    as facturado_sistema,
       round((mov.kg + ctr.kg)::numeric,2)                      as kg_sistema,
       round((mov.ent - mov.fac - mov.gas - mov.nom - mov.tra - ctr.fac)::numeric,2) as saldo_sistema,
       0.00                                                    as saldo_excel
  from mov, ctr;
