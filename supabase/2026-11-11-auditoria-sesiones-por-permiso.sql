-- 11/11/2026 · Auditoría por permiso: la lectura de sesiones_usuario (tiempo de
-- conexión que muestra el módulo Auditoría) también la da el permiso «Auditoría»
-- de la matriz, igual que auditoria_eventos (puede_leer('auditoria')).
-- Se mantiene: staff, admin y cada usuario su propia sesión.
alter policy sesiones_select on public.sesiones_usuario
  using (
    (select is_staff())
    or (select is_admin())
    or (select puede_leer('auditoria'))
    or ((select auth.uid()) = user_id)
  );
