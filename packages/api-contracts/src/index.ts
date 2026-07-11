export type ApiResponse<TData> = {
  data: TData;
  timestamp: string;
};

export type HealthcheckDto = {
  status: "ok";
  service: "api";
};
