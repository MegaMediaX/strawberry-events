export interface WhishConfig {
  merchantId?: string;
  apiSecret?: string;
  callbackSecret?: string;
  environment?: "test" | "live";
}

/**
 * Placeholder Whish payment provider. Wiring point for M12/prod once credentials
 * and API docs exist — keeps the PaymentProvider abstraction ready without
 * implementing live charges.
 */
export class WhishProvider {
  readonly id = "whish";
  constructor(private config: WhishConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.merchantId && this.config.apiSecret);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: "whish_not_configured" };
    return { ok: false, error: "whish_not_implemented" };
  }
}
