import { Module } from "@nestjs/common";
import { DsMappingService } from "./ds-mapping.service";

@Module({
  providers: [DsMappingService],
  exports: [DsMappingService]
})
export class DsMappingModule {}
