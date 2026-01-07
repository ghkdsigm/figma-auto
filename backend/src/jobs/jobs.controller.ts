import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards";
import { JobsService } from "./jobs.service";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as fs from "fs";
import * as path from "path";

@ApiTags("jobs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("projects/:projectId")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("import/figma")
  importFigma(@Param("projectId") projectId: string, @Body() body: any) {
    return this.jobs.enqueueImportFigma(projectId, body.fileKey, body.nodeIds);
  }

  @Post("import/json")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = process.env.UPLOAD_DIR || path.join(process.cwd(), ".uploads");
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const safe = `${Date.now()}-${file.originalname}`.replace(/[^a-zA-Z0-9._-]/g, "_");
          cb(null, safe);
        }
      }),
      limits: { fileSize: 20 * 1024 * 1024 }
    })
  )
  importJson(
    @Param("projectId") projectId: string,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!file?.path) throw new BadRequestException("Missing file");
    return this.jobs.enqueueImportJsonFile(projectId, file.path);
  }

  @Post("import/sample")
  importSample(@Param("projectId") projectId: string) {
    return this.jobs.enqueueImportSample(projectId);
  }

  @Post("generate")
  generate(@Param("projectId") projectId: string, @Body() body: any) {
    //const policy = (body.policy || "TOLERANT") as any;
    const policy = (body.policy || "RAW") as any;
    return this.jobs.enqueueGenerate(projectId, body.target || "nuxt", policy);
  }

  @Get("imports/latest")
  latestImport(@Param("projectId") projectId: string) {
    return this.jobs.getLatestImport(projectId);
  }

  @Get("maps/latest")
  latestMap(@Param("projectId") projectId: string, @Query("policy") policy?: string) {
    //return this.jobs.getLatestMap(projectId, (policy as any) || "TOLERANT");
    return this.jobs.getLatestMap(projectId, (policy as any) || "RAW");
  }

  // Debug helper: inspect a specific Figma node across raw -> a2ui -> ds mapping.
  // Example: GET /projects/:projectId/debug/node?nodeId=4079:44362&policy=RAW
  @Get("debug/node")
  debugNode(@Param("projectId") projectId: string, @Query("nodeId") nodeId?: string, @Query("policy") policy?: string) {
    if (!nodeId) throw new BadRequestException("nodeId is required");
    return this.jobs.debugNode(projectId, nodeId, (policy as any) || "RAW");
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

  @Get("artifacts/:artifactId/sources")
  sources(@Param("projectId") projectId: string, @Param("artifactId") artifactId: string) {
    return this.jobs.getArtifactSources(projectId, artifactId);
  }
}
