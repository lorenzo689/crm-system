import 'dotenv/config';
import { JwtService } from '@nestjs/jwt';
import { JWT_ALGORITHM } from '../src/modules/auth/auth-config';

// Local development helper. The token only works while the user's current
// tokenVersion (default 0) matches the third argument. Without a configured
// JWT_SECRET the API uses a random per-process secret, so no token can match.
if (!process.env.JWT_SECRET) {
  console.error('Set JWT_SECRET (the same value the API uses) first.');
  process.exit(1);
}
const jwtService = new JwtService({
  secret: process.env.JWT_SECRET,
  signOptions: { algorithm: JWT_ALGORITHM, expiresIn: 3600 },
});

const userId = process.argv[2];
const email = process.argv[3];
const tokenVersion = Number(process.argv[4] ?? 0);

if (!userId || !email) {
  console.error(
    'Usage: ts-node generate-test-token.ts <UserId> <Email> [tokenVersion]',
  );
  process.exit(1);
}

console.log(jwtService.sign({ sub: userId, email, tv: tokenVersion }));
