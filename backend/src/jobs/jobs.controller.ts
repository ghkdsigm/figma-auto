import { Body, Controller, Get, Header, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards";
import { JobsService } from "./jobs.service";

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

  @Get("jobs/:jobId")
  @Header("Cache-Control", "no-store")
  getJob(@Param("projectId") projectId: string, @Param("jobId") jobId: string) {
    return this.jobs.getJob(projectId, jobId);
  }

  @Get("artifacts")
  @Header("Cache-Control", "no-store")
  listArtifacts(@Param("projectId") projectId: string) {
    return this.jobs.listArtifacts(projectId);
  }

  @Get("artifacts/:artifactId/download")
  @Header("Cache-Control", "no-store")
  async download(
    @Param("projectId") projectId: string,
    @Param("artifactId") artifactId: string,
    @Res() res: Response,
  ) {
    const p = await this.jobs.getArtifactPath(projectId, artifactId);
    res.download(p);
  }
}
