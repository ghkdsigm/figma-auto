import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto";

@ApiTags("projects")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}
  @Get() async list(){ return { ok: true, items: await this.projects.list() }; }
  @Post() async create(@Body() dto: CreateProjectDto){ return { ok: true, project: await this.projects.create(dto.name, dto.slug) }; }
}
