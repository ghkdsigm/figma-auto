import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards";
import { JobsService } from "./jobs.service";
import type { Response } from "express";

@ApiTags("jobs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("projects/:projectId")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("import/figma")
  importFigma(@Param("projectId") projectId: string, @Body() body: any) {
    return this.jobs.enqueueImportFigma(projectId, body.fileKey);
  }

  @Post("import/sample")
  importSample(@Param("projectId") projectId: string) {
    return this.jobs.enqueueImportSample(projectId);
  }

  @Post("generate")
  generate(@Param("projectId") projectId: string, @Body() body: any) {
    return this.jobs.enqueueGenerate(projectId, body.target || "nuxt");
  }

  @Get("artifacts")
  listArtifacts(@Param("projectId") projectId: string) {
    return this.jobs.listArtifacts(projectId);
  }

  @Get("artifacts/:artifactId/download")
  async download(@Param("projectId") projectId: string, @Param("artifactId") artifactId: string, @Res() res: Response) {
    const p = await this.jobs.getArtifactPath(projectId, artifactId);
    res.download(p);
  }
}
