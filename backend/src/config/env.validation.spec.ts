import { findEnvProblems, validateEnv } from './env.validation';

const goodProd = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/tdn',
  JWT_SECRET: 'f3a9c1d7e5b8402a9d6e1c7f0b3a58d4e2c9',
  MPESA_CALLBACK_SECRET: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  CORS_ORIGIN: 'https://app.example.org',
  APP_URL: 'https://app.example.org',
};

describe('environment validation', () => {
  it('accepts a complete production configuration', () => {
    expect(findEnvProblems(goodProd)).toEqual([]);
    expect(validateEnv(goodProd)).toBe(goodProd);
  });

  it('only needs a database and a JWT secret in development', () => {
    expect(
      findEnvProblems({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://x',
        JWT_SECRET: 'dev',
      }),
    ).toEqual([]);
  });

  it('requires DATABASE_URL and JWT_SECRET everywhere', () => {
    const problems = findEnvProblems({});
    expect(problems).toContain('DATABASE_URL is required');
    expect(problems).toContain('JWT_SECRET is required');
  });

  it('rejects the placeholder secrets from .env.example in production', () => {
    const problems = findEnvProblems({
      ...goodProd,
      JWT_SECRET: 'replace-with-a-long-random-string',
      MPESA_CALLBACK_SECRET: 'replace-with-a-shared-secret',
    });
    expect(problems.some((p) => p.startsWith('JWT_SECRET'))).toBe(true);
    expect(problems.some((p) => p.startsWith('MPESA_CALLBACK_SECRET'))).toBe(true);
  });

  it('rejects short secrets in production', () => {
    expect(
      findEnvProblems({ ...goodProd, JWT_SECRET: 'short' }).some((p) => p.startsWith('JWT_SECRET')),
    ).toBe(true);
  });

  it('rejects wildcard or malformed CORS origins in production', () => {
    expect(findEnvProblems({ ...goodProd, CORS_ORIGIN: '*' }).length).toBeGreaterThan(0);
    expect(findEnvProblems({ ...goodProd, CORS_ORIGIN: 'not a url' }).length).toBeGreaterThan(0);
    expect(findEnvProblems({ ...goodProd, CORS_ORIGIN: 'https://a.org, https://b.org' })).toEqual(
      [],
    );
  });

  it('requires an https APP_URL in production', () => {
    expect(findEnvProblems({ ...goodProd, APP_URL: 'http://app.example.org' })).toEqual([
      'APP_URL must be an https:// URL (production)',
    ]);
  });

  it('treats empty strings as unset', () => {
    expect(
      findEnvProblems({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://x',
        JWT_SECRET: 'dev',
        TRUST_PROXY: '',
        SWAGGER_ENABLED: '',
        BASE_FARE_KES: '',
      }),
    ).toEqual([]);
  });

  it('validates numeric settings, cookie mode and log level', () => {
    const problems = findEnvProblems({
      ...goodProd,
      BASE_FARE_KES: 'abc',
      MESSAGE_RETENTION_DAYS: '0',
      COOKIE_SAMESITE: 'sometimes',
      LOG_LEVEL: 'loud',
    });
    expect(problems).toHaveLength(4);
  });

  it('throws one error listing every problem', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(
      /Invalid configuration[\s\S]*DATABASE_URL[\s\S]*JWT_SECRET/,
    );
  });
});
