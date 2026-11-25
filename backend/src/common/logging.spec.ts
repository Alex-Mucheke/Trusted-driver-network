import type { IncomingMessage, ServerResponse } from 'http';
import { loggerParams, requestId } from './logging';

function reqRes(headers: Record<string, string> = {}) {
  const res = { setHeader: jest.fn() } as unknown as ServerResponse;
  return { req: { headers } as unknown as IncomingMessage, res };
}

describe('logging', () => {
  describe('requestId', () => {
    it('reuses a well-formed upstream id and echoes it back', () => {
      const { req, res } = reqRes({ 'x-request-id': 'abc12345-def' });
      expect(requestId(req, res)).toBe('abc12345-def');
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc12345-def');
    });

    it.each(['short', 'has spaces in it!!', 'x'.repeat(100), '<script>alert(1)</script>'])(
      'replaces a malformed upstream id (%s) so log injection is impossible',
      (bad) => {
        const { req, res } = reqRes({ 'x-request-id': bad });
        const id = requestId(req, res);
        expect(id).not.toBe(bad);
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
      },
    );

    it('makes an id when none was sent', () => {
      const { req, res } = reqRes();
      expect(requestId(req, res)).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('loggerParams', () => {
    const http: any = loggerParams().pinoHttp;

    it('logs method and path only: no headers, cookies or query strings', () => {
      const logged = http.serializers.req({
        id: 'r1',
        method: 'GET',
        url: '/api/bookings?token=secret&phone=0712',
        headers: { cookie: 'tdn_session=abc', authorization: 'Bearer x' },
        remoteAddress: '10.0.0.1',
      });
      expect(logged).toEqual({ id: 'r1', method: 'GET', path: '/api/bookings' });
      expect(JSON.stringify(logged)).not.toMatch(/secret|tdn_session|10\.0\.0\.1|Bearer/);
    });

    it('logs only the status code of a response', () => {
      expect(http.serializers.res({ statusCode: 200, headers: { 'set-cookie': 'x' } })).toEqual({
        statusCode: 200,
      });
    });

    it('does not log health probes', () => {
      expect(http.autoLogging.ignore({ url: '/api/health/ready' })).toBe(true);
      expect(http.autoLogging.ignore({ url: '/api/bookings' })).toBe(false);
    });

    it('escalates the level with the response status', () => {
      expect(http.customLogLevel({}, { statusCode: 200 })).toBe('info');
      expect(http.customLogLevel({}, { statusCode: 404 })).toBe('warn');
      expect(http.customLogLevel({}, { statusCode: 500 })).toBe('error');
      expect(http.customLogLevel({}, { statusCode: 200 }, new Error('x'))).toBe('error');
    });

    it('redacts credentials if headers ever get logged', () => {
      expect(http.redact.paths).toEqual(
        expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie']),
      );
    });
  });
});
