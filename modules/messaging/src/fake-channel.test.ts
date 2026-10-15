/**
 * Unit tests for FakeMessagingChannel: in-memory ChannelAdapter for tests and dev.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { FakeMessagingChannel } from './fake-channel';

describe('FakeMessagingChannel', () => {
  let channel: FakeMessagingChannel;

  beforeEach(() => {
    channel = new FakeMessagingChannel();
  });

  it('has channelType in_app', () => {
    expect(channel.channelType).toBe('in_app');
  });

  it('starts with an empty sent array', () => {
    expect(channel.sent).toHaveLength(0);
  });

  it('records sent messages', async () => {
    await channel.send({ to: '+9647801234567', text: 'مرحبا' });
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent.at(0)?.to).toBe('+9647801234567');
    expect(channel.sent.at(0)?.text).toBe('مرحبا');
  });

  it('returns a fake externalId', async () => {
    const result = await channel.send({ to: '+9647801234567', text: 'test' });
    expect(result.externalId).toMatch(/^fake-\d+$/);
  });

  it('records multiple sends in order', async () => {
    await channel.send({ to: 'a', text: 'first' });
    await channel.send({ to: 'b', text: 'second' });
    expect(channel.sent.at(0)?.text).toBe('first');
    expect(channel.sent.at(1)?.text).toBe('second');
  });

  it('parseInbound always returns null', async () => {
    const result = await channel.parseInbound({ entry: [] }, {});
    expect(result).toBeNull();
  });

  it('parseInbound returns null regardless of input', async () => {
    const result = await channel.parseInbound('rawString', { 'x-hub-signature': 'abc' });
    expect(result).toBeNull();
  });
});
