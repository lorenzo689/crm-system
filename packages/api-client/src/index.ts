import type { ApiResponse, HealthcheckDto } from "@bissinger-os/api-contracts";

export type ApiClientOptions = {
  baseUrl: string;
};

export function createApiClient({ baseUrl }: ApiClientOptions) {
  return {
    async getHealthcheck(): Promise<ApiResponse<HealthcheckDto>> {
      const response = await fetch(`${baseUrl}/health`);

      if (!response.ok) {
        throw new Error(`Healthcheck request failed with ${response.status}`);
      }

      return (await response.json()) as ApiResponse<HealthcheckDto>;
    },
  };
}
