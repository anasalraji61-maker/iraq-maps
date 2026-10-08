import type { UserId } from '@iraq-maps/contracts';
import { eventBusConformance, otpSenderConformance, placesQueryConformance, userDataEraserConformance } from './conformance';
import { FakeOtpSender, FakePlacesQueryPort, InMemoryEventBus, InMemoryUserDataEraser } from './fakes';

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
placesQueryConformance('FakePlacesQueryPort', () => {
  const port = new FakePlacesQueryPort();
  return { port, seed: async (city, records) => port.seed(city, records) };
});
