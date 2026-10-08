import type { Clock, DomainEvent, EventBus, EventHandler, EventName, IraqiPhone, OtpSender, OutboxPublisher, UserDataEraser, UserId } from '@iraq-maps/contracts';

export class FixedClock implements Clock {
  constructor(private current = new Date('2026-01-01T00:00:00.000Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
  set(date: Date): void {
    this.current = new Date(date);
  }
}

/** Captures every OTP so tests can read the code instead of receiving an SMS. */
export class FakeOtpSender implements OtpSender {
  readonly kind = 'fake' as const;
  readonly sent: { phone: IraqiPhone; code: string; locale: string }[] = [];
  async send(message: { phone: IraqiPhone; code: string; locale: string }): Promise<void> {
    this.sent.push({ ...message });
  }
  lastCodeFor(phone: string): string | undefined {
    return this.sent.findLast((m) => m.phone === phone)?.code;
  }
}

export class InMemoryEventBus implements EventBus {
  readonly published: DomainEvent[] = [];
  private handlers = new Map<string, Set<EventHandler>>();
  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    for (const h of this.handlers.get(event.name) ?? []) await h(event);
  }
  subscribe<N extends EventName>(name: N, handler: EventHandler<N>): () => void {
    const set = this.handlers.get(name) ?? new Set();
    set.add(handler as EventHandler);
    this.handlers.set(name, set);
    return () => set.delete(handler as EventHandler);
  }
}

/** Records events as the outbox would store them; `tx` is ignored. */
export class InMemoryOutbox implements OutboxPublisher {
  readonly events: DomainEvent[] = [];
  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }
}

/** Holds per-user rows in memory and records erase calls, for testing callers of UserDataEraser. */
export class InMemoryUserDataEraser implements UserDataEraser {
  readonly erased: UserId[] = [];
  readonly rows = new Map<UserId, unknown[]>();
  constructor(readonly module = 'fake') {}
  async erase(userId: UserId): Promise<void> {
    this.erased.push(userId);
    this.rows.delete(userId);
  }
}
