import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\-\s]/g, "").replace(/\s+/g, "-").replace(/\-+/g, "-");
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.project.findMany({ orderBy:{ createdAt:"desc" } }); }
  
  async create(name: string, slug?: string) {
    let baseSlug = slugify(slug || name);
    let finalSlug = baseSlug;
    let counter = 1;

    // slug가 이미 존재하는지 확인하고, 존재하면 숫자를 추가
    while (await this.prisma.project.findUnique({ where: { slug: finalSlug } })) {
      counter++;
      finalSlug = `${baseSlug}-${counter}`;
    }

    return this.prisma.project.create({ data:{ name, slug: finalSlug } });
  }
}
