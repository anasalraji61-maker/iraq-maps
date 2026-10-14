// M4 fake: records push notifications sent during tests.
import type { PushSender } from '@iraq-maps/contracts';

export class FakePushSender implements PushSender {
  readonly sent: Array<{ token: string; title: string; body: string; data?: Record<string, string> }> = [];

  async send(token: string, notification: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
    this.sent.push({ token, ...notification });
  }

  reset(): void {
    this.sent.length = 0;
  }
}
