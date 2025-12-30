import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
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
    const policy = (body.policy || "TOLERANT") as any;
    return this.jobs.enqueueGenerate(projectId, body.target || "nuxt", policy);
  }

  @Get("imports/latest")
  latestImport(@Param("projectId") projectId: string) {
    return this.jobs.getLatestImport(projectId);
  }

  @Get("maps/latest")
  latestMap(@Param("projectId") projectId: string, @Query("policy") policy?: string) {
    return this.jobs.getLatestMap(projectId, (policy as any) || "TOLERANT");
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
