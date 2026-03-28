export class AlertingService {
  private readonly lastSentAt = new Map<string, number>();

  constructor(
    private readonly webhookUrl: string | null,
    private readonly minIntervalMs: number,
    private readonly logger: { info: (message: unknown) => void; warn: (message: unknown) => void; error: (message: unknown) => void },
  ) {}

  async sendAlert(event: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    const now = Date.now();
    const lastSent = this.lastSentAt.get(event) ?? 0;
    if (now - lastSent < this.minIntervalMs) {
      return;
    }
    this.lastSentAt.set(event, now);

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          at: new Date(now).toISOString(),
          payload,
        }),
      });
      if (!response.ok) {
        this.logger.warn(`Alert webhook returned ${response.status} for event ${event}.`);
      }
    } catch (error) {
      this.logger.error(error);
    }
  }
}
