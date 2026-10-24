import type { JsonValue } from "./pet";

export const INTEGRATION_EVENT_VERSION = 1 as const;

export interface IntegrationEvent<TPayload extends JsonValue = JsonValue> {
  version: typeof INTEGRATION_EVENT_VERSION;
  id: string;
  name: string;
  shop: string;
  occurredAt: string;
  payload: TPayload;
}
