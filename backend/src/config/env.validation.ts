/**
 * Fail-fast configuration check, wired into ConfigModule. The API refuses to start with a
 * configuration that is unsafe in production (placeholder secrets, wildcard CORS, plain-http URLs),
 * instead of discovering the problem after deployment.
 *
 * Empty strings are treated as "not set" so `.env.example` lines like `TRUST_PROXY=` are fine.
 * The values are returned unchanged: the rest of the code reads process.env directly.
 */

const PLACEHOLDER = /replace[-_ ]?with|change[-_ ]?me|changeme|example|your[-_ ]secret|<.*>/i;

const POSITIVE_NUMBERS = [
  'PORT',
  'BOOKING_REQUEST_TTL_MINUTES',
  'REFERRAL_TTL_MINUTES',
  'MAX_REFERRAL_ATTEMPTS',
  'BASE_FARE_KES',
  'PER_KM_KES',
  'MAX_QUOTE_MULTIPLIER',
  'LOCATION_RETENTION_MINUTES',
  'LOCATION_MIN_INTERVAL_MS',
  'NOTIFICATION_RETENTION_DAYS',
  'MESSAGE_RETENTION_DAYS',
  'RIDE_DETAILS_RETENTION_DAYS',
  'PAYMENT_CALLBACK_RETENTION_DAYS',
] as const;

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

function str(env: Record<string, unknown>, key: string): string | undefined {
  const v = env[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function isHttpUrl(value: string, requireHttps: boolean): boolean {
  try {
    const u = new URL(value);
    return requireHttps
      ? u.protocol === 'https:'
      : u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Returns a list of human-readable problems; empty means the configuration is acceptable. */
export function findEnvProblems(env: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const production = str(env, 'NODE_ENV') === 'production';

  if (!str(env, 'DATABASE_URL')) problems.push('DATABASE_URL is required');

  const jwt = str(env, 'JWT_SECRET');
  if (!jwt) problems.push('JWT_SECRET is required');
  else if (production && (jwt.length < 32 || PLACEHOLDER.test(jwt))) {
    problems.push(
      'JWT_SECRET must be at least 32 random characters and not a placeholder (production)',
    );
  }

  const mpesa = str(env, 'MPESA_CALLBACK_SECRET');
  if (production && (!mpesa || mpesa.length < 16 || PLACEHOLDER.test(mpesa))) {
    problems.push(
      'MPESA_CALLBACK_SECRET must be at least 16 random characters and not a placeholder (production)',
    );
  }

  const samesite = str(env, 'COOKIE_SAMESITE');
  if (samesite && !['lax', 'strict', 'none'].includes(samesite)) {
    problems.push('COOKIE_SAMESITE must be one of: lax, strict, none');
  }

  const cors = str(env, 'CORS_ORIGIN');
  if (production) {
    if (!cors) problems.push('CORS_ORIGIN is required (production)');
    else {
      for (const origin of cors.split(',').map((o) => o.trim())) {
        if (origin === '*' || !isHttpUrl(origin, false)) {
          problems.push(
            `CORS_ORIGIN contains an invalid origin: "${origin}" (no wildcards; use full URLs)`,
          );
        }
      }
    }
    const appUrl = str(env, 'APP_URL');
    if (!appUrl || !isHttpUrl(appUrl, true)) {
      problems.push('APP_URL must be an https:// URL (production)');
    }
  }

  for (const key of POSITIVE_NUMBERS) {
    const v = str(env, key);
    if (v !== undefined && !(Number.isFinite(Number(v)) && Number(v) > 0)) {
      problems.push(`${key} must be a positive number (got "${v}")`);
    }
  }

  const level = str(env, 'LOG_LEVEL');
  if (level && !LOG_LEVELS.includes(level)) {
    problems.push(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`);
  }

  return problems;
}

/** ConfigModule `validate` hook. Throws one error listing every problem. */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const problems = findEnvProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\nSee backend/.env.example.`,
    );
  }
  return env;
}
