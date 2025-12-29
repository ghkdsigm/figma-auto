import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\-\s]/g, "").replace(/\s+/g, "-").replace(/\-+/g, "-");
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.project.findMany({ orderBy:{ createdAt:"desc" } }); }
  create(name: string, slug?: string) { return this.prisma.project.create({ data:{ name, slug: slugify(slug || name) } }); }
}
