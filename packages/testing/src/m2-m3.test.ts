import { FakeMediaPort, FakeObjectStorage, mediaPortConformance, objectStorageConformance } from './media';
import { FakePhoneVerification, FakeProviderDirectory, FakeProviderProfile, FakeProviderStore, phoneVerificationConformance, providerPortsConformance } from './providers';
import { FakeRoutingPort, routingConformance } from './routing';

routingConformance('FakeRoutingPort', () => ({ port: new FakeRoutingPort(), from: [44.36, 33.31], to: [44.42, 33.3], unroutable: [[44.36, 33.31], [44.01, 36.19]] }));

objectStorageConformance('FakeObjectStorage', () => new FakeObjectStorage());

mediaPortConformance('FakeMediaPort', () => {
  const port = new FakeMediaPort();
  return { port, seed: async (asset) => port.seed(asset) };
});

providerPortsConformance('FakeProviderProfile + FakeProviderDirectory', () => {
  const store = new FakeProviderStore();
  return { profile: new FakeProviderProfile(store), directory: new FakeProviderDirectory(store), seed: async (input) => store.seed(input) };
});

phoneVerificationConformance('FakePhoneVerification', () => {
  const port = new FakePhoneVerification();
  return { port, codeFor: (phone) => port.codeFor(phone) };
});
