import { Body, Controller, Get, Post, UseGuards, HttpException, HttpStatus } from "@nestjs/common";
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
  @Post() async create(@Body() dto: CreateProjectDto){
    try {
      return { ok: true, project: await this.projects.create(dto.name, dto.slug) };
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new HttpException('Project with this slug already exists', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }
}
