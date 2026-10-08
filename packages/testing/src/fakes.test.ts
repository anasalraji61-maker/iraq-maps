import type { UserId } from '@iraq-maps/contracts';
import { eventBusConformance, otpSenderConformance, userDataEraserConformance } from './conformance';
import { FakeOtpSender, InMemoryEventBus, InMemoryUserDataEraser } from './fakes';

otpSenderConformance('FakeOtpSender', () => new FakeOtpSender());
eventBusConformance('InMemoryEventBus', () => new InMemoryEventBus());
userDataEraserConformance('InMemoryUserDataEraser', () => {
  const eraser = new InMemoryUserDataEraser('fake');
  return {
    eraser,
    seed: async (id: UserId) => void eraser.rows.set(id, [{}]),
    hasData: async (id: UserId) => eraser.rows.has(id),
  };
});
