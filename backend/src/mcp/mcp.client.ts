import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class McpClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.TOOLSERVER_URL || 'http://localhost:4010';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  async invokeTool(name: string, args: any): Promise<any> {
    try {
      const response = await this.client.post(`/tools/${name}/invoke`, args);
      if (response.data.ok) {
        return response.data.result;
      }
      throw new Error(response.data.error || 'Tool invocation failed');
    } catch (error: any) {
      if (error.response) {
        // 429 에러인 경우 원본 에러 정보를 유지하여 retry 로직에서 처리할 수 있도록 함
        const status = error.response.status;
        const errorMessage = error.response.data?.error || error.message;
        const err = new Error(errorMessage);
        (err as any).response = error.response; // 원본 response 정보 보존
        (err as any).status = status;
        throw err;
      }
      throw error;
    }
  }

  async listTools(): Promise<string[]> {
    try {
      const response = await this.client.get('/tools');
      if (response.data.ok) {
        return response.data.tools || [];
      }
      return [];
    } catch (error) {
      return [];
    }
  }
}

