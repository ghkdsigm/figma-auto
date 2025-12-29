import { Module } from '@nestjs/common';
import { McpModule } from '../mcp/mcp.module';
import { FigmaService } from './figma.service';
@Module({imports:[McpModule],providers:[FigmaService],exports:[FigmaService]})
export class FigmaModule {}
