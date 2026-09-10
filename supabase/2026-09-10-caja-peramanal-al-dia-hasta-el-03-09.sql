-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 10/09/2026
-- Caja Peramanal: se cargan los movimientos del 15/08 al 03/09
--
-- DE DÓNDE SALE
-- De la planilla «CAJA PERAMANAL - GOLDEN TOUCH», caja abierta el 27-06-2026,
-- exportada el 09/09/2026 13:52. El sistema tenía esa caja cargada hasta el
-- 14/08 (140 movimientos, 2.049,65 Kg cerrados, saldo $617,82) y la planilla
-- sigue hasta el 03/09.
--
-- LAS DOS FUENTES SE HABÍAN SEPARADO EN LAS DOS DIRECCIONES
--   · La planilla tiene 41 renglones del 15/08 al 03/09 que el sistema no tiene.
--   · El sistema tiene 2 renglones del 16/08 que la planilla no tiene: el
--     consumo de combustible de la semana 10/08–16/08 y su entrada
--     multimoneda. Suman cero entre sí, así que NO se tocan.
--
-- LO QUE ESTE ARCHIVO CARGA: 37 de los 41.
--
-- LOS 4 QUE NO CARGA, Y POR QUÉ
-- En el PDF esos 4 renglones no dejan ver a qué columna pertenece el número
-- (si es dinero que entró o dinero que salió), y son montos grandes o rompen
-- el patrón del resto. Un renglón de caja puesto en la columna equivocada
-- ensucia el saldo y después nadie sabe de dónde salió el error:
--   1. 20/08 · «PAGO ODC 0083 FILTRO DE ACEITE PARA PAYLOADER REF:30555188» ·
--      $23,84 · dice PAGO pero el monto figura como entrada.
--   2. 21/08 · «CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL» · $7,71 · las filas
--      de multimoneda siempre son entradas, pero acá el monto cae en gastos.
--   3. 29/08 · «PAGO DE 50% DE MANO DE OBRA MECANICO CORNELIO PARA DR9» ·
--      $3.000,00 · mismo caso que el 1, y por el monto no se adivina.
--   4. 29/08 · «CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL» · sin monto.
--
-- ADVERTENCIA SOBRE EL SALDO — HAY QUE LEERLA
-- Desde el 20/08 la planilla registra PAGOS SIN SU ENTRADA DE DINERO. Hasta
-- esa fecha cada pago venía precedido de su fila «CAJA MULTIMONEDAS MGG /
-- CAJA GT PERAMANAL»; después casi ninguna. Por eso, al cargar estos
-- movimientos, el saldo de la caja queda NEGATIVO (unos -$7.361). No es un
-- error de esta carga: es lo que dice la planilla. Faltan las transferencias
-- que financiaron esos pagos.
-- La propia planilla es incoherente consigo misma: su encabezado dice
-- «SALDO ACTUAL DE CAJA $0,00» y su último renglón dice $3.113,14.
--
-- CÓMO DESHACER ESTA CARGA SI HACE FALTA
--   delete from public.acopio_caja_movimientos
--    where actor_name = 'CARGA PLANILLA 15/08-03/09';
-- ═══════════════════════════════════════════════════════════════════

insert into public.acopio_caja_movimientos
  (caja_id, fecha, descripcion, usd_entregado, kg_cerrados, facturados,
   gastos, nominas, traslado, kg_recibidos, clasif_grupo, clasif_valor,
   orden, created_by, actor_name)
values
  -- ── 15/08 ──────────────────────────────────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-15','PAGO REPARACION DE GAS Y COMPRESOR RETROEXCAVADORA GT REF: 30249825',
    0,0,0, 62.01,0,0,0,'gastos_caja','MAQUINARIA PESADA: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-15','PEAJE EDINSON GT REF: 007018000159',
    0,0,0, 0.29,0,0,0,'gastos_caja','VIÁTICOS: HOSPEDAJE - COMIDA - GASTOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 16/08 ──────────────────────────────────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-16','PAGO LAVADO DE EP-1000 UNO SOLICITADO POR SR EDINSON REF: 30326542',
    0,0,0, 44.89,0,0,0,'gastos_caja','VEHICULO: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 20/08 · contratos mineros (Kg × $8,40) ─────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-20','CONTRATO MINERO GT - #61',
    0, 46.90, 393.96, 0,0,0,0,'contratos','3. PRODUCCION MINERO GT',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-20','CONTRATO MINERO GT - #62',
    0, 75.80, 636.72, 0,0,0,0,'contratos','3. PRODUCCION MINERO GT',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-20','CONTRATO MINERO GT - #63',
    0, 11.10, 93.24, 0,0,0,0,'contratos','3. PRODUCCION MINERO GT',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-20','CONTRATO MINERO GT - #64',
    0, 49.60, 416.64, 0,0,0,0,'contratos','3. PRODUCCION MINERO GT',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 20/08 · pagos ──────────────────────────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-20','PAGO DE 1 PUNTAS DE MARTILLO VELIZ LA GUAIRA',
    0,0,0, 1400.00,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-20','PAGO DE 1 PUNTAS DE MARTILLO GOLDEN TOUCH SR EDINSON',
    950.00,0,0, 950.00,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-20','COMPRA 80 LTS GASOLINA A 1$ POR LITRO TOTAL 80$ PARA CONSUMO DE MOTOSIERRAS PARA MADERA PARA GOLDEN TOUCH',
    0,0,0, 80.00,0,0,0,'gastos_caja','GASOLINA',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-20','PAGO DE IVA DE FILTRO EN GENISA GR SOLICITADO POR JAVIER REF: 30565505 · MONTO: 3.493,63 MERCANTIL',
    0,0,0, 3.81,0,0,0,'gastos_caja','MAQUINARIA PESADA: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 21/08 ──────────────────────────────────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-21','PAGO MERCADO GOLDEN TOUCH AUTORIZADO POR SRA. LEYDIS REF: 30640945 · MONTO: 998.264,44 BANCO VENEZUELA',
    1090.03,0,0, 1090.03,0,0,0,'gastos_caja','COMIDA - MERCADO - REFRIGERIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 24/08 ──────────────────────────────────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-24','PAGO DE ODC 0072 GT EPP PARA EL PERSONAL PRODUCCION MINA GT AUTORIZADO POR LEYDIS REF: 64728461 · MONTO: 502.777,10 BANCO VENEZUELA',
    541.13,0,0, 541.13,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 25/08 y 28/08 · el mismo servicio pagado en dos mitades ────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-25','PAGO 50% · SERVICIO DE REFRIGERACION Y SISTEMA ELECTRICO RETROEXCAVADORA MINA GT (COMPRESOR, ACEITE, SELLOS, HIDROFLUSH, GAS R134A, SILICA, SWITCHE) · TOTAL DEL SERVICIO 820$ · SOLICITADO POR SR EDINSON, AUTORIZADO POR SR CHELI · REF: 5577 · MONTO: 330.714,38 BDT',
    0,0,0, 356.47,0,0,0,'gastos_caja','MAQUINARIA PESADA: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-28','PAGO 50% RESTANTE · SERVICIO DE REFRIGERACION Y SISTEMA ELECTRICO RETROEXCAVADORA MINA GT · TOTAL DEL SERVICIO 820$ · REF: 5577 · MONTO: 330.714,38 BDT',
    0,0,0, 348.28,0,0,0,'gastos_caja','MAQUINARIA PESADA: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 26/08 ──────────────────────────────────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-26','PAGO CARNET PERSONAL MINA GT AUTORIZADO POR LEYDIS REF: 5959',
    0,0,0, 25.05,0,0,0,'gastos_caja','CENTRO DE ACOPIO: REPARACIONES - DOCUMENTACIÓN',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-26','PAGO ODC SALCHICHAS GT REF: 1142 · MONTO: 33.269,43',
    0,0,0, 35.13,0,0,0,'gastos_caja','COMIDA - MERCADO - REFRIGERIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-26','PAGO ODC 0087 POLLOS GT REF: 8993 · MONTO: 318.954,58',
    0,0,0, 336.77,0,0,0,'gastos_caja','COMIDA - MERCADO - REFRIGERIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-26','PAGO FILTRO PARA JUMBO 0445 GT REF: 9329 · MONTO: 168.804,90',
    0,0,0, 178.24,0,0,0,'gastos_caja','MAQUINARIA PESADA: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-26','PAGO GRADUACION DE FRENOS P-1000-1 REF: 7130 · MONTO: 7.899,63',
    0,0,0, 8.34,0,0,0,'gastos_caja','VEHICULO: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 27/08 ──────────────────────────────────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-27','PAGO ODC 0081 GT DISANTA HERRAMIENTAS Y TERMICO REF: 6462 · MONTO: 63.209,78',
    0,0,0, 66.74,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-27','PAGO HERRAMIENTAS SOLICITADAS POR EL SR EDINSON REF: 6573 · MONTO: 69.289,49',
    0,0,0, 73.16,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-27','PAGO ODC 0084 MINA GT AUTORIZADO POR SRA LEYDIS REF: 3586 · MONTO: 139.205,98',
    0,0,0, 146.98,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-27','PAGO ODC 0059 MINA GT AUTORIZADO POR SRA LEYDIS REF: 4547 · MONTO: 229.377,55',
    0,0,0, 242.19,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 29/08 ──────────────────────────────────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-29','PAGO ODC 0096 MINA GT AUTORIZADO POR SRA LEYDIS · BOMBA DE ACHIQUE · MONTO: 620,00$',
    0,0,0, 620.00,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-29','PAGO DE SACOS MINEROS AUTORIZADO POR SRA LEYDIS · MONTO: 370,00$',
    0,0,0, 370.00,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-29','PAGO APOYO COMBUSTIBLE JHENCHIN · MONTO: 250$',
    0,0,0, 250.00,0,0,0,'gastos_caja','APOYOS - DONACIONES - COLABORACIONES',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-29','PAGO ODC 0095 MINA GT AUTORIZADO POR SRA LEYDIS REF: 5885 · MONTO: 242.401,99 BDT',
    0,0,0, 260.13,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-29','PAGO DIFERENCIA 0069 INVERSIONES 258 AUTORIZADO POR SRA LEYDIS REF: 6279 · MONTO: 40.666,12 BDT',
    0,0,0, 43.64,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-29','PAGO AUTORIZADO POR JOSE GREGORIO · REPARACION FALLA VIBRACION DELANTERA DE EP-1000-1, SOPORTE DE TRANSMISION, AJUSTE DE CRUCETAS, REVISION DE FLUIDOS, 2 ACEITES SKY TRANSMISION · TOTAL 194$ · REF: 6279 · MONTO: 154.690,74 BDT',
    0,0,0, 160.00,0,0,0,'gastos_caja','VEHICULO: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-29','PAGO ODC 0095 MINA GT AUTORIZADO POR SRA LEYDIS REF: 5885 · MONTO: 242.401,99 BDT (segundo pago del mismo día)',
    0,0,0, 162.89,0,0,0,'gastos_caja','MATERIALES - INSUMOS VARIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 31/08 ──────────────────────────────────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-31','ABONO EQUIPOS COMPRADOS EN BRASIL · MONTO: $100.000,00',
    100000.00,0,0, 100000.00,0,0,0,'gastos_caja',null,0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-31','PAGO REPARACION DE RETROEXCAVADORA 428E MINA GT REF: 31209853 · MONTO: 223.264,99 BS BDT',
    0,0,0, 238.33,0,0,0,'gastos_caja','MAQUINARIA PESADA: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-08-31','PAGO LAVADO EP-1000-1 REF: 31229537 · MONTO: 39.869,25 MERCANTIL',
    0,0,0, 42.56,0,0,0,'gastos_caja','VEHICULO: REPUESTOS - REPARACIONES - SERVICIOS',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  -- ── 02/09 y 03/09 · contratos mineros ──────────────────────────────
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-09-02','CONTRATO MINERO GT - #65',
    0, 16.70, 140.28, 0,0,0,0,'contratos','3. PRODUCCION MINERO GT',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-09-02','CONTRATO MINERO GT - #66',
    0, 29.90, 251.16, 0,0,0,0,'contratos','3. PRODUCCION MINERO GT',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09'),
  ('8bab6d92-1893-4ced-bdee-25899643b367','2026-09-03','CONTRATO MINERO GT - #67',
    0, 58.45, 490.98, 0,0,0,0,'contratos','3. PRODUCCION MINERO GT',0,'mineralgroupguayanaca@gmail.com','CARGA PLANILLA 15/08-03/09');


-- ═══════════════════════════════════════════════════════════════════
-- Verificación: cuántos entraron, hasta qué fecha llega la caja,
-- cuántos Kg quedan y en cuánto queda el saldo.
-- ═══════════════════════════════════════════════════════════════════
select count(*)                                           as movimientos,
       count(*) filter (where actor_name = 'CARGA PLANILLA 15/08-03/09') as cargados_hoy,
       max(fecha)::text                                   as ultimo_movimiento,
       round(sum(kg_cerrados)::numeric, 2)                as kg_cerrados,
       round(sum(usd_entregado)::numeric, 2)              as entregado,
       round(sum(facturados)::numeric, 2)                 as facturados,
       round(sum(gastos)::numeric, 2)                     as gastos,
       round(sum(usd_entregado - facturados - gastos - nominas - traslado)::numeric, 2) as saldo
  from public.acopio_caja_movimientos
 where caja_id = '8bab6d92-1893-4ced-bdee-25899643b367';
