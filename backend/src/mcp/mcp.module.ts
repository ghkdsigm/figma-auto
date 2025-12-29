import { Global, Module } from '@nestjs/common';
import { McpClient } from './mcp.client';
@Global()
@Module({providers:[McpClient],exports:[McpClient]})
export class McpModule {}
