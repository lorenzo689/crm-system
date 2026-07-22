import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BISSINGER_ORG_SLUG = 'bissinger-lights';
const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('E-Mail wird bereits verwendet');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { slug: BISSINGER_ORG_SLUG },
    });
    if (!organization) {
      throw new Error(
        `Organisation "${BISSINGER_ORG_SLUG}" existiert nicht. Bitte zuerst anlegen.`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        passwordHash,
        organizationRoles: {
          create: {
            organizationId: organization.id,
            role: 'MEMBER',
          },
        },
      },
    });

    return this.buildAuthResponse(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('E-Mail oder Passwort falsch');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('E-Mail oder Passwort falsch');
    }

    return this.buildAuthResponse(user.id, user.email);
  }

  private buildAuthResponse(userId: string, email: string) {
    const accessToken = this.jwtService.sign({ sub: userId, email });
    return { accessToken };
  }
}
