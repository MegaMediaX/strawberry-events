import type { MessageProvider, SendResult } from "./types";

export interface WhatsAppConfig {
  apiBaseUrl?: string;
  accessToken?: string;
  phoneNumberId?: string;
}

/**
 * Placeholder WhatsApp provider. Wiring point for a future live integration
 * (e.g. Meta Cloud API / BSP). Does not send until configured + implemented.
 */
export class WhatsAppProvider implements MessageProvider {
  readonly channel = "whatsapp";
  constructor(private config: WhatsAppConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiBaseUrl && this.config.accessToken && this.config.phoneNumberId);
  }

  async send(_to: string, _body: string): Promise<SendResult> {
    void _to;
    void _body;
    if (!this.isConfigured()) return { ok: false, error: "whatsapp_not_configured" };
    return { ok: false, error: "whatsapp_send_not_implemented" };
  }
}
