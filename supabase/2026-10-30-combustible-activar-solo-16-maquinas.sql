-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Combustible: Activar únicamente las 16 máquinas operativas autorizadas
-- Fecha: 2026-10-30
--
-- Desactiva (activo = false) todos los equipos del catálogo de combustible
-- excepto las 16 máquinas operativas que tienen autorización para surtir:
--   1. Articulado 1 (VOLVO A35F 483)
--   2. Articulado 2 (VOLVO A35F 484)
--   3. Paylober Volvo (CARGADOR FLONTAL VOLVO L220G / L220G)
--   4. Retroexcavadora (CAT428E)
--   5. Jumbo volvo (VOLVO EC240-40144)
--   6. Caterpillar D9R (CATERPILLAR D9R)
--   7. Jumbo komatsu (KOMATSU PC220LC 8)
--   8. Jumbo XCMG 215 (JUMBO XCMG)
--   9. Jumbo XCMG 225 (EXCAVADORA HIDRÁULICA XCMG XE225BR)
--  10. Planta perking (PLANTA ELÉCTRICA OLYMPIAN GEP550 PERKINS)
--  11. Planta Yamagro de 60 KVA (YAMAGRO 60KVA)
--  12. Generador azul jheachyn (GE JHENCHIN AZUL / GENERADOR JHENCHIN AZUL)
--  13. Compresor camión de servicio (COMPRESOR ATLAS XAS 37)
--  14. Camioneta encava EP01 (ENCAVA EP-01 / CAMIONETA ENCAVA EP-1000 A96BM3R)
--  15. Toyota chasis largo blanca (MACHITO BLANCO TOYOTA / MACHITO BLANCO)
--  16. Camión de lubricación mitsubishi (CAMIÓN DE SERVICIO FK617)
-- ═══════════════════════════════════════════════════════════════════

begin;

-- 1. Poner en activo = false todos los equipos del catálogo de combustible
update public.combustible_catalogos
   set activo = false
 where tipo = 'equipo';

-- 2. Poner en activo = true las 16 máquinas autorizadas
update public.combustible_catalogos
   set activo = true
 where tipo = 'equipo'
   and (
     -- 1. Articulado 1 (Volvo A35F 483)
     (valor ilike '%A35F%483%' or valor ilike '%Articulado 1%' or (valor ilike '%Articulado%' and valor ilike '%483%'))
     -- 2. Articulado 2 (Volvo A35F 484)
     or (valor ilike '%A35F%484%' or valor ilike '%Articulado 2%' or (valor ilike '%Articulado%' and valor ilike '%484%'))
     -- 3. Payloader Volvo (L220G)
     or (valor ilike '%L220G%' or valor ilike '%Paylober%' or (valor ilike '%Payloader%' and valor ilike '%Volvo%'))
     -- 4. Retroexcavadora (CAT 428E)
     or (valor ilike '%428E%' or valor ilike '%Retroexcavadora%')
     -- 5. Jumbo volvo (EC240)
     or (valor ilike '%EC240%' or (valor ilike '%Jumbo%' and valor ilike '%Volvo%'))
     -- 6. Caterpillar D9R
     or (valor ilike '%D9R%')
     -- 7. Jumbo komatsu (PC220)
     or (valor ilike '%PC220%' or (valor ilike '%Jumbo%' and valor ilike '%Komatsu%'))
     -- 8. Jumbo XCMG 215
     or (valor ilike '%XCMG%215%' or upper(btrim(valor)) = 'JUMBO XCMG')
     -- 9. Jumbo XCMG 225
     or (valor ilike '%XCMG%225%' or valor ilike '%XE225BR%')
     -- 10. Planta perking (Olympian GEP550 Perkins)
     or (valor ilike '%Perkin%' or valor ilike '%GEP550%' or valor ilike '%GEP 550%' or valor ilike '%Olympia%')
     -- 11. Planta Yamagro de 60 KVA
     or (valor ilike '%Yamagro%' and (valor ilike '%60%' or valor ilike '%60KVA%'))
     -- 12. Generador azul jheachyn / jhenchin
     or (valor ilike '%Jhenchin%Azul%' or valor ilike '%Jheachyn%Azul%' or upper(btrim(valor)) in ('GE JHENCHIN AZUL', 'GENERADOR JHENCHIN AZUL', 'PLANTA JHENCHIN'))
     -- 13. Compresor camión de servicio
     or (valor ilike '%Atlas%XAS%37%' or valor ilike '%XAS 37%' or valor ilike '%XAS37%' or valor ilike '%Compresor%Servicio%')
     -- 14. Camioneta encava EP01
     or (valor ilike '%EP01%' or valor ilike '%EP-01%' or (valor ilike '%Encava%' and (valor ilike '%1000%' or valor ilike '%A96BM3R%')))
     -- 15. Toyota chasis largo blanca
     or (valor ilike '%Machito%Blanco%' or valor ilike '%Chasis Largo%' or valor ilike '%Machito Blanco Toyota%')
     -- 16. Camión de lubricación mitsubishi
     or (valor ilike '%FK617%' or (valor ilike '%Servicio%' and valor ilike '%FK617%') or (valor ilike '%Lubricaci%' and valor ilike '%Mitsubishi%'))
   );

commit;

-- Verificación de los equipos que quedaron activos
select id, valor, activo, tanques_permitidos
  from public.combustible_catalogos
 where tipo = 'equipo' and activo = true
 order by valor;

