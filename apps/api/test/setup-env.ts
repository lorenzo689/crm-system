/**
 * Runs before every e2e test file. Integration tests wipe tables, so they are
 * only ever allowed to talk to a database whose name ends in `_test`.
 */
process.env.NODE_ENV = 'test';
// Forgot-password pads its answer time; tests that check the padding set it themselves.
process.env.PASSWORD_RESET_MIN_RESPONSE_MS = '0';
process.env.JWT_SECRET =
  'integration-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.WEB_ORIGIN = 'http://localhost:3000';
delete process.env.JWT_EXPIRES_IN_MINUTES;

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://bissinger:bissinger_dev@localhost:5432/bissinger_os_test';

const databaseName = new URL(testDatabaseUrl).pathname.replace('/', '');
if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run integration tests against "${databaseName}": the database name must end with "_test".`,
  );
}
process.env.DATABASE_URL = testDatabaseUrl;
