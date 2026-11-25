import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Params } from 'nestjs-pino';

const REQUEST_ID = /^[\w-]{8,64}$/;

/** Accept a well-formed upstream request id (from nginx / a load balancer), otherwise make one. */
export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}

/**
 * Structured JSON logs (one line per request) with personal data kept out on purpose:
 * no headers, cookies, bodies, query strings or client IPs are logged. Add them back only with a
 * documented reason; see docs/compliance/retention-schedule.md (application logs).
 */
export function loggerParams(): Params {
  const production = process.env.NODE_ENV === 'production';
  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL || (production ? 'info' : 'debug'),
      genReqId: requestId,
      // Health probes would drown out real traffic.
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/api/health') },
      serializers: {
        req: (req: { id: string; method: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          path: (req.url ?? '').split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      // Belt and braces in case a future serializer change re-adds headers.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'req.body.password',
        ],
        censor: '[redacted]',
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    },
  };
}
