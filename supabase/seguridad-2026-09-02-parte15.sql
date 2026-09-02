-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 15
-- GT-AUT-02 (segunda tanda) · Las tablas de plata y material
--
-- APLICADO el 02/09/2026. La verificación del final devolvió las 22 filas y
-- ninguna quedó con `is_operativo()`. Para revertir: volver a crear las
-- políticas viejas con `is_operativo()` sobre estas mismas 22 tablas.
--
-- POR QUÉ HAY UNA SEGUNDA TANDA
-- El hallazgo nombraba nueve tablas (inventario y órdenes) y esas ya están.
-- Al verificar el resultado aparecieron 44 más con la MISMA regla vieja:
-- `is_operativo()`, que solo pide «tener cuenta activa» y no mira el rol.
--
-- Varias de esas 44 mueven dinero o material: la caja del centro de acopio, las
-- compras y servicios directos, los tanques de combustible, las salidas
-- temporales y las transferencias entre sistemas. Hoy cualquier cuenta activa
-- —el cocinero, el de RRHH— puede escribir en ellas desde la consola del
-- navegador. Este bloque cierra ese grupo. Los catálogos y las tablas de
-- configuración quedan para una tanda posterior: pesan mucho menos.
--
-- VERIFICADO ANTES DE APLICAR
-- Se cruzó cada tabla contra quién escribió en ella de verdad. Todos los que
-- escriben conservan su permiso:
--   · caja de acopio, contratos, recepciones y tanques → Mariana (acopio) y admin
--   · compras y servicios directos                     → analistas de compras
--   · salidas temporales                               → el almacenista
--   · transferencias entre sistemas                    → tesorería y acopio
--
-- Los autores que NO pasan el filtro son etiquetas de proceso, no personas:
-- `import-excel`, `excel-sync`, `manual`, `cron-domingo`. Esos corren con la
-- sesión de quien los ejecuta, o con service_role, que no pasa por RLS.
--
-- CRITERIO DE LOS «O»
-- Donde un flujo cruza módulos a propósito, la política admite los dos. No es
-- laxitud: es que cerrar por un solo módulo rompería el flujo real.
--   · contratos de acopio los cierra Producción → acopio o produccion
--   · el mantenimiento se dispara desde Combustible → maquinaria o combustible
--   · el puente lo usan Acopio, Combustible e Inventario → los tres
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- CENTRO DE ACOPIO · caja, cuadres, recepciones de mineral, contratos
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "acopio_cajas write op" on public.acopio_cajas;
create policy "acopio_cajas write acopio" on public.acopio_cajas for all
  using (public.is_admin() or public.puede('acopio'))
  with check (public.is_admin() or public.puede('acopio'));

drop policy if exists "acopio_caja_movimientos write op" on public.acopio_caja_movimientos;
create policy "acopio_caja_mov write acopio" on public.acopio_caja_movimientos for all
  using (public.is_admin() or public.puede('acopio'))
  with check (public.is_admin() or public.puede('acopio'));

drop policy if exists "acopio_cuadres write op" on public.acopio_cuadres;
create policy "acopio_cuadres write acopio" on public.acopio_cuadres for all
  using (public.is_admin() or public.puede('acopio'))
  with check (public.is_admin() or public.puede('acopio'));

drop policy if exists "acopio_cuadre_movimientos write op" on public.acopio_cuadre_movimientos;
create policy "acopio_cuadre_mov write acopio" on public.acopio_cuadre_movimientos for all
  using (public.is_admin() or public.puede('acopio'))
  with check (public.is_admin() or public.puede('acopio'));

drop policy if exists "acopio_recepciones write op" on public.acopio_recepciones;
create policy "acopio_recepciones write acopio" on public.acopio_recepciones for all
  using (public.is_admin() or public.puede('acopio'))
  with check (public.is_admin() or public.puede('acopio'));

drop policy if exists "acopio_recepcion_lotes write op" on public.acopio_recepcion_lotes;
create policy "acopio_lotes write acopio" on public.acopio_recepcion_lotes for all
  using (public.is_admin() or public.puede('acopio'))
  with check (public.is_admin() or public.puede('acopio'));

-- Los contratos se crean en Acopio y los CIERRA Producción.
drop policy if exists "acopio_contratos write op" on public.acopio_contratos;
create policy "acopio_contratos write acopio" on public.acopio_contratos for all
  using (public.is_admin() or public.puede('acopio') or public.puede('produccion'))
  with check (public.is_admin() or public.puede('acopio') or public.puede('produccion'));


-- ───────────────────────────────────────────────────────────────────
-- COMPRAS · compras y servicios directos (salen de caja)
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "compra_directa write op" on public.compras_directas;
create policy "compra_directa write pedidos" on public.compras_directas for all
  using (public.is_admin() or public.puede('pedidos'))
  with check (public.is_admin() or public.puede('pedidos'));

drop policy if exists "servicio_directo write op" on public.servicios_directos;
create policy "servicio_directo write pedidos" on public.servicios_directos for all
  using (public.is_admin() or public.puede('pedidos'))
  with check (public.is_admin() or public.puede('pedidos'));


-- ───────────────────────────────────────────────────────────────────
-- COMBUSTIBLE · tanques, movimientos, solicitudes, medición
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "combustible_tanques write op" on public.combustible_tanques;
create policy "comb_tanques write comb" on public.combustible_tanques for all
  using (public.is_admin() or public.puede('combustible'))
  with check (public.is_admin() or public.puede('combustible'));

drop policy if exists "combustible_tanque_movimientos write op" on public.combustible_tanque_movimientos;
create policy "comb_tanque_mov write comb" on public.combustible_tanque_movimientos for all
  using (public.is_admin() or public.puede('combustible'))
  with check (public.is_admin() or public.puede('combustible'));

drop policy if exists "comb_mov_write" on public.combustible_movimientos;
create policy "comb_mov write comb" on public.combustible_movimientos for all
  using (public.is_admin() or public.puede('combustible'))
  with check (public.is_admin() or public.puede('combustible'));

drop policy if exists "comb_sol_write" on public.combustible_solicitudes;
create policy "comb_sol write comb" on public.combustible_solicitudes for all
  using (public.is_admin() or public.puede('combustible'))
  with check (public.is_admin() or public.puede('combustible'));

drop policy if exists "combustible_conciliaciones write op" on public.combustible_conciliaciones;
create policy "comb_concil write comb" on public.combustible_conciliaciones for all
  using (public.is_admin() or public.puede('combustible'))
  with check (public.is_admin() or public.puede('combustible'));

drop policy if exists "combustible_cubicaciones write op" on public.combustible_cubicaciones;
create policy "comb_cubic write comb" on public.combustible_cubicaciones for all
  using (public.is_admin() or public.puede('combustible'))
  with check (public.is_admin() or public.puede('combustible'));

drop policy if exists "combustible_medidores write op" on public.combustible_medidores;
create policy "comb_medidores write comb" on public.combustible_medidores for all
  using (public.is_admin() or public.puede('combustible'))
  with check (public.is_admin() or public.puede('combustible'));


-- ───────────────────────────────────────────────────────────────────
-- MATERIAL · salidas temporales y materiales de producción
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "saltemp write operativo" on public.salidas_temporales;
create policy "saltemp write salidas" on public.salidas_temporales for all
  using (public.is_admin() or public.puede('salidas'))
  with check (public.is_admin() or public.puede('salidas'));

drop policy if exists "produccion_materiales write operativo" on public.produccion_materiales;
create policy "prod_materiales write prod" on public.produccion_materiales for all
  using (public.is_admin() or public.puede('produccion'))
  with check (public.is_admin() or public.puede('produccion'));


-- ───────────────────────────────────────────────────────────────────
-- MANTENIMIENTO · se dispara desde Maquinaria y desde Combustible
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "maq_mant write op" on public.maquinaria_mantenimientos;
create policy "maq_mant write maq" on public.maquinaria_mantenimientos for all
  using (public.is_admin() or public.puede('maquinaria') or public.puede('combustible'))
  with check (public.is_admin() or public.puede('maquinaria') or public.puede('combustible'));


-- ───────────────────────────────────────────────────────────────────
-- PUENTE ENTRE SISTEMAS · lo alimentan Acopio, Combustible e Inventario
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "transferencias_inter write op" on public.transferencias_inter;
create policy "transf_inter write" on public.transferencias_inter for all
  using (public.is_admin() or public.puede('acopio') or public.puede('combustible') or public.puede('tesoreria'))
  with check (public.is_admin() or public.puede('acopio') or public.puede('combustible') or public.puede('tesoreria'));

drop policy if exists "transferencias_casiterita_inter write op" on public.transferencias_casiterita_inter;
create policy "transf_casiterita write" on public.transferencias_casiterita_inter for all
  using (public.is_admin() or public.puede('acopio') or public.puede('inventario') or public.puede('produccion'))
  with check (public.is_admin() or public.puede('acopio') or public.puede('inventario') or public.puede('produccion'));

drop policy if exists "transferencias_combustible_inter write op" on public.transferencias_combustible_inter;
create policy "transf_comb write" on public.transferencias_combustible_inter for all
  using (public.is_admin() or public.puede('combustible') or public.puede('acopio'))
  with check (public.is_admin() or public.puede('combustible') or public.puede('acopio'));


-- ═══════════════════════════════════════════════════════════════════
-- Verificación: ninguna de estas debe seguir diciendo is_operativo()
-- ═══════════════════════════════════════════════════════════════════
select tablename, policyname, coalesce(qual, with_check) as regla
from pg_policies
where schemaname = 'public'
  and cmd = 'ALL'
  and tablename in (
    'acopio_cajas','acopio_caja_movimientos','acopio_cuadres','acopio_cuadre_movimientos',
    'acopio_recepciones','acopio_recepcion_lotes','acopio_contratos',
    'compras_directas','servicios_directos',
    'combustible_tanques','combustible_tanque_movimientos','combustible_movimientos',
    'combustible_solicitudes','combustible_conciliaciones','combustible_cubicaciones',
    'combustible_medidores','salidas_temporales','produccion_materiales',
    'maquinaria_mantenimientos','transferencias_inter','transferencias_casiterita_inter',
    'transferencias_combustible_inter')
order by tablename;
