/** Integration tests: need a migrated PostgreSQL (DATABASE_URL) and a generated Prisma client. */
module.exports = {
  rootDir: '.',
  testRegex: 'test/integration/.*\\.int-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  testTimeout: 30000,
};
