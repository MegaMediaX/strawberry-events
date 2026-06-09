import type { MessageProvider, SendResult } from "./types";

export interface SmsConfig {
  apiKey?: string;
  senderId?: string;
}

/**
 * Placeholder SMS provider. Wiring point for a future live integration
 * (e.g. Twilio / local aggregator). Does not send until configured + implemented.
 */
export class SmsProvider implements MessageProvider {
  readonly channel = "sms";
  constructor(private config: SmsConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.senderId);
  }

  async send(_to: string, _body: string): Promise<SendResult> {
    void _to;
    void _body;
    if (!this.isConfigured()) return { ok: false, error: "sms_not_configured" };
    return { ok: false, error: "sms_send_not_implemented" };
  }
}
