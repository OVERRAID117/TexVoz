-- ============================================================================
-- Beta access — Fase 0 (esquema)
--
-- Sistema de acceso beta controlado, completamente independiente de
-- subscriptions/plans/qa_test. No se toca ninguna tabla comercial existente,
-- salvo document_history, a la que se le agregan 2 columnas nuevas (origin,
-- beta_grant_id) sin alterar ninguna fila existente (quedan origin=
-- 'subscription', beta_grant_id=NULL, que es exactamente lo que ya son hoy).
--
-- Todo lo beta es server-only: RLS habilitada + cero políticas para
-- anon/authenticated en las 4 tablas nuevas, más REVOKE explícito a nivel de
-- tabla como segunda capa. Los 4 RPC solo son ejecutables por service_role.
--
-- NO se ejecuta contra Supabase remoto en este paso — solo se crea el
-- archivo para revisión.
-- ============================================================================

-- ── beta_settings — interruptor global (singleton) ─────────────────────────

create table beta_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into beta_settings (id, enabled) values (1, true) on conflict do nothing;

-- ── beta_codes ───────────────────────────────────────────────────────────--

create table beta_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code = upper(btrim(code)))
    check (length(btrim(code)) > 0),
  enabled boolean not null default true,
  audience text not null default 'general' check (audience in ('general', 'restricted')),
  docs_limit int not null default 5 check (docs_limit > 0),
  pages_per_doc_limit int not null default 5 check (pages_per_doc_limit > 0),
  duration_days int not null default 7 check (duration_days > 0),
  max_activations_total int null check (max_activations_total is null or max_activations_total > 0),
  created_at timestamptz not null default now()
);

-- ── beta_code_allowed_users — whitelist opcional (solo aplica si audience='restricted') ──

create table beta_code_allowed_users (
  code_id uuid not null references beta_codes(id) on delete cascade,
  user_id uuid not null,
  primary key (code_id, user_id)
);

-- ── beta_grants — activaciones/rondas ───────────────────────────────────────
--
-- in_flight cuenta reservas de documento en curso (reservadas pero todavía
-- sin confirmar ni liberadas) — existe para que una ronda que llegó a
-- docs_used=docs_limit por una reserva EN CURSO (DeepSeek todavía
-- procesando) no se considere "terminada" todavía. Sin esto, dos requests
-- de generación y canje simultáneos podrían dejar al usuario con 2 rondas
-- activas a la vez: la 5ª reserva sube docs_used a 5/5 antes de que DeepSeek
-- termine, y en ese instante redeem_beta_code vería la ronda como agotada y
-- dejaría empezar una nueva.

create table beta_grants (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references beta_codes(id),
  user_id uuid not null,
  round_number int not null check (round_number > 0),
  docs_limit int not null check (docs_limit > 0),
  pages_per_doc_limit int not null check (pages_per_doc_limit > 0),
  docs_used int not null default 0 check (docs_used >= 0 and docs_used <= docs_limit),
  in_flight int not null default 0 check (in_flight >= 0 and in_flight <= docs_used),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, round_number)
);

create index idx_beta_grants_user on beta_grants(user_id, expires_at);

-- ── document_history — origen del documento (única tabla existente que se toca) ──

alter table document_history
  add column origin text not null default 'subscription'
    check (origin in ('subscription', 'beta', 'pay_per_use')),
  add column beta_grant_id uuid null references beta_grants(id),
  add constraint chk_beta_origin_consistency
    check ((origin = 'beta') = (beta_grant_id is not null));

-- ============================================================================
-- RLS + permisos — server-only para las 4 tablas nuevas
-- ============================================================================

alter table beta_settings enable row level security;
alter table beta_codes enable row level security;
alter table beta_code_allowed_users enable row level security;
alter table beta_grants enable row level security;

-- RLS habilitada + cero políticas para anon/authenticated = acceso denegado
-- por defecto. El REVOKE explícito es una segunda capa de defensa (aunque
-- alguien agregara una política permisiva por error más adelante, sin el
-- GRANT a nivel de tabla seguiría sin funcionar para esos roles).
revoke all on beta_settings, beta_codes, beta_code_allowed_users, beta_grants
  from anon, authenticated;

grant all on beta_settings, beta_codes, beta_code_allowed_users, beta_grants
  to service_role;

-- ============================================================================
-- Funciones — todas SECURITY INVOKER (no DEFINER: service_role ya bypasea
-- RLS como invocador, así que no hace falta elevar privilegios ni fijar
-- search_path manualmente).
-- ============================================================================

-- redeem_beta_code: canje de un código. Un solo advisory lock por usuario
-- serializa todos sus canjes entre sí (sin importar el código), más un lock
-- de fila sobre beta_codes para el problema distinto de códigos con tope
-- global de activaciones canjeados por usuarios distintos a la vez.
create or replace function redeem_beta_code(p_code text, p_user_id uuid)
returns beta_grants
language plpgsql
security invoker
as $$
declare
  v_normalized_code text := upper(btrim(p_code));
  v_code_row beta_codes%rowtype;
  v_beta_enabled boolean;
  v_active_count int;
  v_global_count int;
  v_round int;
  v_grant beta_grants%rowtype;
begin
  -- Serializa TODOS los canjes de este usuario entre sí, sin importar el
  -- código (un lock de fila sobre beta_codes no alcanza para esto: dos
  -- códigos distintos son dos filas distintas, sin punto de contención).
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select * into v_code_row from beta_codes where code = v_normalized_code for update;
  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  -- beta_settings ausente -> tratado como deshabilitado, nunca como
  -- habilitado (fail-closed explícito, no un `if v_beta_enabled then` implícito).
  select enabled into v_beta_enabled from beta_settings where id = 1;
  if v_beta_enabled is null or v_beta_enabled = false then
    raise exception 'beta_disabled' using errcode = 'P0001';
  end if;

  if not v_code_row.enabled then
    raise exception 'code_disabled' using errcode = 'P0001';
  end if;

  if v_code_row.audience = 'restricted' and not exists (
    select 1 from beta_code_allowed_users
    where code_id = v_code_row.id and user_id = p_user_id
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if v_code_row.max_activations_total is not null then
    select count(*) into v_global_count from beta_grants where code_id = v_code_row.id;
    if v_global_count >= v_code_row.max_activations_total then
      raise exception 'code_exhausted' using errcode = 'P0001';
    end if;
  end if;

  -- Una sola ronda beta activa por usuario, sin importar el código. Una
  -- ronda con docs_used=docs_limit pero in_flight>0 TODAVÍA se considera
  -- activa: hay una reserva en curso (DeepSeek procesando) que podría
  -- liberarse si falla, y mientras eso no se resuelva no se puede dar por
  -- terminada la ronda.
  select count(*) into v_active_count
  from beta_grants
  where user_id = p_user_id
    and (
      (expires_at > now() and docs_used < docs_limit)
      or in_flight > 0
    );

  if v_active_count > 0 then
    raise exception 'already_active' using errcode = 'P0001';
  end if;

  -- round_number GLOBAL por usuario (Beta #1, #2, #3... sin importar qué
  -- código se usó en cada ronda). MAX(round_number)+1 en vez de COUNT(*)+1
  -- para que si alguna ronda vieja se borra, la numeración no reutilice un
  -- número ya usado. El advisory lock de arriba ya serializa este cálculo.
  select coalesce(max(round_number), 0) + 1 into v_round
  from beta_grants where user_id = p_user_id;

  insert into beta_grants (
    code_id, user_id, round_number, docs_limit, pages_per_doc_limit, docs_used, in_flight, expires_at
  ) values (
    v_code_row.id, p_user_id, v_round, v_code_row.docs_limit, v_code_row.pages_per_doc_limit,
    0, 0, now() + make_interval(days => v_code_row.duration_days)
  )
  returning * into v_grant;

  return v_grant;
end;
$$;

-- reserve_beta_doc_slot: reserva atómica de 1 documento antes de llamar a
-- DeepSeek. Sube docs_used Y in_flight en el mismo UPDATE — el chequeo
-- (cupo + expiración) y ambos incrementos ocurren en un solo statement,
-- serializado a nivel de fila por Postgres sin lock explícito adicional.
create or replace function reserve_beta_doc_slot(p_grant_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_updated boolean;
begin
  update beta_grants
  set docs_used = docs_used + 1,
      in_flight = in_flight + 1
  where id = p_grant_id
    and user_id = p_user_id        -- defensa en profundidad: no reserva un grant ajeno
    and docs_used < docs_limit
    and expires_at > now()
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

-- complete_beta_doc_slot: confirma una reserva tras una generación +
-- recordUsage EXITOSA. Solo baja in_flight — docs_used ya reflejaba el
-- documento desde la reserva y se queda igual (el documento sí se generó).
create or replace function complete_beta_doc_slot(p_grant_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update beta_grants
  set in_flight = in_flight - 1
  where id = p_grant_id
    and user_id = p_user_id
    and in_flight > 0;
end;
$$;

-- release_beta_doc_slot: libera una reserva cuando la generación falla
-- después de reservar (DeepSeek o recordUsage) — baja docs_used Y
-- in_flight, así la reserva nunca se vuelve consumo permanente si no hubo
-- generación exitosa, y la ronda vuelve a contar como no agotada.
create or replace function release_beta_doc_slot(p_grant_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update beta_grants
  set docs_used = greatest(0, docs_used - 1),
      in_flight = in_flight - 1
  where id = p_grant_id
    and user_id = p_user_id
    and in_flight > 0;
end;
$$;

-- Permisos EXECUTE — solo service_role. Un cliente autenticado con su propio
-- token (anon key) no puede invocar ninguno de estos RPC, ni con su propio
-- user_id ni con uno ajeno.
revoke all on function redeem_beta_code(text, uuid) from public;
grant execute on function redeem_beta_code(text, uuid) to service_role;

revoke all on function reserve_beta_doc_slot(uuid, uuid) from public;
grant execute on function reserve_beta_doc_slot(uuid, uuid) to service_role;

revoke all on function complete_beta_doc_slot(uuid, uuid) from public;
grant execute on function complete_beta_doc_slot(uuid, uuid) to service_role;

revoke all on function release_beta_doc_slot(uuid, uuid) from public;
grant execute on function release_beta_doc_slot(uuid, uuid) to service_role;
