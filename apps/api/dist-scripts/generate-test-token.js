"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const jwt_1 = require("@nestjs/jwt");
const jwtService = new jwt_1.JwtService({
    secret: process.env.JWT_SECRET ?? 'dev-secret-nur-lokal-aendern-vor-prod',
});
const userId = process.argv[2];
const email = process.argv[3];
if (!userId || !email) {
    console.error('Usage: ts-node generate-test-token.ts <UserId> <Email>');
    process.exit(1);
}
const token = jwtService.sign({ sub: userId, email });
console.log(token);
