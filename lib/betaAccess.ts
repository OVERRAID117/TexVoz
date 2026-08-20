import { getSupabaseAdmin } from './supabaseAdmin'

// Equivalente de lib/planUsage.ts para acceso beta — completamente separado
// de subscriptions/plans/qa_test. Todo server-only vía getSupabaseAdmin(),
// las tablas beta_* no tienen lectura directa de cliente (RLS + REVOKE en la
// migración de Fase 0).

export type BetaGrant = {
  id: string
  roundNumber: number
  docsUsed: number
  docsLimit: number
  pagesPerDocLimit: number
  inFlight: number
  expiresAt: string
}

type BetaGrantRow = {
  id: string
  round_number: number
  docs_used: number
  docs_limit: number
  pages_per_doc_limit: number
  in_flight: number
  expires_at: string
}

function mapGrantRow(row: BetaGrantRow): BetaGrant {
  return {
    id: row.id,
    roundNumber: row.round_number,
    docsUsed: row.docs_used,
    docsLimit: row.docs_limit,
    pagesPerDocLimit: row.pages_per_doc_limit,
    inFlight: row.in_flight,
    expiresAt: row.expires_at,
  }
}

// Misma fórmula de "ronda activa" que redeem_beta_code en Supabase (Fase 0):
// vigente y con cupo, O con una reserva en curso (in_flight > 0) aunque ya
// esté en el límite de documentos o recién haya expirado.
function isGrantActive(grant: BetaGrant): boolean {
  const withinPeriodAndCapacity =
    new Date(grant.expiresAt).getTime() > Date.now() && grant.docsUsed < grant.docsLimit
  return withinPeriodAndCapacity || grant.inFlight > 0
}

export type BetaGrantEndedReason = 'exhausted' | 'expired'

export type BetaGrantStatus =
  | { status: 'none' }
  | { status: 'active'; grant: BetaGrant }
  | { status: 'ended'; grant: BetaGrant; reason: BetaGrantEndedReason }

// Lee la última ronda (por round_number) del usuario y evalúa si sigue
// activa. Basta con la última ronda: redeem_beta_code nunca deja crear una
// ronda nueva mientras la anterior siga activa, así que cualquier ronda más
// vieja que la última ya está garantizada inactiva.
export async function getBetaGrantStatus(userId: string): Promise<BetaGrantStatus> {
  const admin = getSupabaseAdmin()

  const { data, error } = await admin
    .from('beta_grants')
    .select('id, round_number, docs_used, docs_limit, pages_per_doc_limit, in_flight, expires_at')
    .eq('user_id', userId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`No se pudo consultar el acceso beta del usuario: ${error.message}`)
  }

  if (!data) return { status: 'none' }

  const grant = mapGrantRow(data as BetaGrantRow)
  if (isGrantActive(grant)) return { status: 'active', grant }

  // Agotado y expirado a la vez -> 'exhausted' tiene prioridad.
  const reason: BetaGrantEndedReason = grant.docsUsed >= grant.docsLimit ? 'exhausted' : 'expired'
  return { status: 'ended', grant, reason }
}

// Para uso de enforcement (Fase 2, ia-explain) — null si no hay ronda activa.
export async function getActiveBetaGrant(userId: string): Promise<BetaGrant | null> {
  const result = await getBetaGrantStatus(userId)
  return result.status === 'active' ? result.grant : null
}

// beta_settings ausente o ilegible -> false, nunca true (fail-closed). Esto
// gobierna únicamente si se permiten CANJES NUEVOS — nunca afecta a un grant
// ya activo (getBetaGrantStatus/getActiveBetaGrant no la consultan).
export async function isBetaRedemptionEnabled(): Promise<boolean> {
  const admin = getSupabaseAdmin()

  const { data, error } = await admin
    .from('beta_settings')
    .select('enabled')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.error('[betaAccess isBetaRedemptionEnabled ERROR]', error)
    return false
  }

  return data?.enabled === true
}

export type RedeemBetaCodeErrorReason =
  | 'invalid_code'
  | 'beta_disabled'
  | 'code_disabled'
  | 'not_allowed'
  | 'code_exhausted'
  | 'already_active'
  | 'unknown'

const KNOWN_REDEEM_ERRORS: readonly string[] = [
  'invalid_code',
  'beta_disabled',
  'code_disabled',
  'not_allowed',
  'code_exhausted',
  'already_active',
]

export type RedeemBetaCodeResult =
  | { ok: true; grant: BetaGrant }
  | { ok: false; reason: RedeemBetaCodeErrorReason }

// Llama al RPC redeem_beta_code (Fase 0) — user_id SIEMPRE lo pasa el
// llamador a partir de checkAuth(req), nunca debe venir del cuerpo de la
// request. Todas las validaciones reales (código, beta_settings, audience,
// tope global, ronda activa, round_number) viven dentro del RPC — esta
// función solo invoca y traduce el resultado/error a algo tipado.
export async function redeemBetaCode(userId: string, code: string): Promise<RedeemBetaCodeResult> {
  const admin = getSupabaseAdmin()

  const { data, error } = await admin.rpc('redeem_beta_code', {
    p_code: code,
    p_user_id: userId,
  })

  if (error) {
    const reason = KNOWN_REDEEM_ERRORS.includes(error.message)
      ? (error.message as RedeemBetaCodeErrorReason)
      : 'unknown'
    if (reason === 'unknown') {
      console.error('[betaAccess redeemBetaCode UNKNOWN RPC ERROR]', error)
    }
    return { ok: false, reason }
  }

  if (!data) {
    console.error('[betaAccess redeemBetaCode EMPTY RESPONSE]')
    return { ok: false, reason: 'unknown' }
  }

  // redeem_beta_code no es SETOF (retorna una sola fila beta_grants) — con
  // algunas versiones/clientes PostgREST puede envolverla en un array de 1;
  // se desenvuelve defensivamente por si acaso.
  const row = Array.isArray(data) ? data[0] : data
  return { ok: true, grant: mapGrantRow(row as BetaGrantRow) }
}

// Las 3 funciones de abajo son envoltorios delgados sobre los RPC de reserva
// atómica de Fase 0 (reserve_beta_doc_slot/complete_beta_doc_slot/
// release_beta_doc_slot) — mismo patrón que redeemBetaCode. userId siempre
// lo pasa el llamador (ia-explain ya lo obtuvo de checkAuth), nunca se
// resuelve aquí.

// true si la reserva se confirmó (docs_used e in_flight ya subieron en la
// misma operación atómica); false si el grant ya estaba en su límite o
// expiró justo en ese instante. No lanza para el caso "sin cupo" — solo
// lanza si la llamada al RPC en sí falla (red/DB), que el llamador debe
// tratar como "no se pudo reservar", nunca como una reserva confirmada.
export async function reserveBetaDocSlot(grantId: string, userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin()

  const { data, error } = await admin.rpc('reserve_beta_doc_slot', {
    p_grant_id: grantId,
    p_user_id: userId,
  })

  if (error) {
    throw new Error(`No se pudo reservar el documento beta: ${error.message}`)
  }

  return data === true
}

// Confirma una reserva tras una generación + recordUsage exitosos — solo
// baja in_flight, docs_used ya reflejaba el documento desde la reserva.
export async function completeBetaDocSlot(grantId: string, userId: string): Promise<void> {
  const admin = getSupabaseAdmin()

  const { error } = await admin.rpc('complete_beta_doc_slot', {
    p_grant_id: grantId,
    p_user_id: userId,
  })

  if (error) {
    throw new Error(`No se pudo confirmar la reserva beta: ${error.message}`)
  }
}

// Libera una reserva cuando la generación falla ANTES de que recordUsage
// tenga éxito — baja docs_used e in_flight juntos, para que la reserva
// nunca se vuelva consumo permanente sin un documento real detrás.
export async function releaseBetaDocSlot(grantId: string, userId: string): Promise<void> {
  const admin = getSupabaseAdmin()

  const { error } = await admin.rpc('release_beta_doc_slot', {
    p_grant_id: grantId,
    p_user_id: userId,
  })

  if (error) {
    throw new Error(`No se pudo liberar la reserva beta: ${error.message}`)
  }
}
