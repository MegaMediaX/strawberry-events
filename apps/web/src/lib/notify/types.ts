export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Common interface for outbound message channels (WhatsApp, SMS). */
export interface MessageProvider {
  readonly channel: string;
  isConfigured(): boolean;
  send(to: string, body: string): Promise<SendResult>;
}
