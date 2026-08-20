-- Distingue filas legacy (creadas antes de este cambio, donde output_format
-- NULL no dice nada) de filas nuevas (donde NULL es una decisión real: "Sin
-- formato elegido"). Puramente aditiva: no toca el dominio de valores de
-- output_format, no requiere backfill, no cambia RLS.
--
-- Dos pasos separados a propósito:
-- 1) Agregar la columna con default false — así, en la misma sentencia,
--    todas las filas existentes quedan clasificadas como legacy (false),
--    sin ningún UPDATE/backfill adicional.
-- 2) Cambiar el default a true — a partir de aquí, cualquier fila futura
--    que no especifique la columna explícitamente ya nace "moderna". No
--    reabre ni reevalúa las filas ya insertadas en el paso 1: ALTER COLUMN
--    ... SET DEFAULT solo afecta a inserts posteriores. recordUsage() sigue
--    mandando output_format_known: true de forma explícita (sin depender de
--    este default), este segundo paso es una red de seguridad adicional
--    para cualquier insert futuro que no la envíe.
alter table document_history
  add column if not exists output_format_known boolean not null default false;

alter table document_history
  alter column output_format_known set default true;
