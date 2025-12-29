import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async ensureBootstrapAdmin() {
    const email = process.env.ADMIN_EMAIL || "admin@company.local";
    const password = process.env.ADMIN_PASSWORD || "admin1234!";
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return;
    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.user.create({ data: { email, password: hashed, role: "ADMIN" } });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException("Invalid credentials");
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
    return { ok: true, accessToken };
  }
}
