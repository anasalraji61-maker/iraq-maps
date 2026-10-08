import { z } from 'zod';
import { Locale, UserId } from './common';

/** Versioned domain events `<module>.<entity>.<verb>.v1`, published only through the outbox. */
const eventPayloads = {
  'identity.user.registered.v1': z.object({ userId: UserId, locale: Locale }),
  'identity.user.deleted.v1': z.object({ userId: UserId }),
} as const;

export type EventName = keyof typeof eventPayloads;
export type EventPayload<N extends EventName> = z.infer<(typeof eventPayloads)[N]>;
export type DomainEvent<N extends EventName = EventName> = {
  [K in N]: { id: string; name: K; occurredAt: string; payload: EventPayload<K> };
}[N];

const DomainEventSchema = z.object({ id: z.string().uuid(), name: z.string(), occurredAt: z.string().datetime(), payload: z.unknown() });

export function parseEvent(raw: unknown): DomainEvent {
  const env = DomainEventSchema.parse(raw);
  const schema = eventPayloads[env.name as EventName];
  if (!schema) throw new Error(`unknown event ${env.name}`);
  return { ...env, payload: schema.parse(env.payload) } as DomainEvent;
}
