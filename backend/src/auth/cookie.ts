/** Session cookie settings, shared by login/registration (set) and logout/erasure (clear). */
export function cookieOptions() {
  const sameSite = (process.env.COOKIE_SAMESITE ?? 'lax') as 'lax' | 'strict' | 'none';
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

/** Options for clearing the cookie (clearCookie must not receive maxAge). */
export function clearCookieOptions() {
  const { maxAge: _maxAge, ...opts } = cookieOptions();
  return opts;
}
