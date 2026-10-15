/**
 * Unit tests for FakeLlmClient, FakePushSender and FakeMessagingChannel (testing package).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { FakeLlmClient } from './fake-llm-client';
import { FakePushSender } from './fake-push-sender';
import { FakeMessagingChannel } from './fake-messaging-channel';

describe('FakeLlmClient', () => {
  let llm: FakeLlmClient;

  beforeEach(() => { llm = new FakeLlmClient(); });

  const BASE_CHAT = { systemPrompt: 'أنت مساعد مفيد', messages: [] as Array<{ role: 'user' | 'assistant'; content: string }> };

  it('returns the default Arabic reply', async () => {
    const result = await llm.chat({ ...BASE_CHAT, messages: [{ role: 'user', content: 'مرحبا' }] });
    expect(result.stopReason).toBe('end_turn');
    expect(result.content).toBeTruthy();
  });

  it('records each call', async () => {
    await llm.chat({ ...BASE_CHAT, messages: [{ role: 'user', content: 'سؤال' }] });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls.at(0)?.messages.at(0)?.content).toBe('سؤال');
  });

  it('returns a tool call when nextToolCall is set', async () => {
    llm.nextToolCall = { name: 'search_places', input: { query: 'مطعم' } };
    const result = await llm.chat({ ...BASE_CHAT, messages: [{ role: 'user', content: 'ابحث' }] });
    expect(result.stopReason).toBe('tool_use');
    expect(result.toolCalls?.at(0)?.name).toBe('search_places');
  });

  it('clears nextToolCall after use', async () => {
    llm.nextToolCall = { name: 'get_crowding', input: {} };
    await llm.chat(BASE_CHAT);
    const second = await llm.chat(BASE_CHAT);
    expect(second.stopReason).toBe('end_turn');
  });

  it('reset() clears calls and restores defaults', async () => {
    llm.nextReply = 'custom';
    await llm.chat(BASE_CHAT);
    llm.reset();
    expect(llm.calls).toHaveLength(0);
    expect(llm.nextReply).toBeTruthy();
    expect(llm.nextToolCall).toBeUndefined();
  });
});

describe('FakePushSender', () => {
  let sender: FakePushSender;

  beforeEach(() => { sender = new FakePushSender(); });

  it('starts with empty sent array', () => {
    expect(sender.sent).toHaveLength(0);
  });

  it('records a sent notification', async () => {
    await sender.send('token-abc', { title: 'رسالة', body: 'لديك رسالة جديدة' });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent.at(0)?.title).toBe('رسالة');
    expect(sender.sent.at(0)?.token).toBe('token-abc');
  });

  it('records optional data payload', async () => {
    await sender.send('tok', { title: 'T', body: 'B', data: { placeId: 'n1' } });
    expect(sender.sent.at(0)?.data?.placeId).toBe('n1');
  });

  it('records multiple sends', async () => {
    await sender.send('t1', { title: 'A', body: 'a' });
    await sender.send('t2', { title: 'B', body: 'b' });
    expect(sender.sent).toHaveLength(2);
  });

  it('reset() clears sent array', async () => {
    await sender.send('t', { title: 'T', body: 'B' });
    sender.reset();
    expect(sender.sent).toHaveLength(0);
  });
});

describe('FakeMessagingChannel', () => {
  let ch: FakeMessagingChannel;

  beforeEach(() => { ch = new FakeMessagingChannel(); });

  it('has channelType in_app', () => {
    expect(ch.channelType).toBe('in_app');
  });

  it('starts with empty sends array', () => {
    expect(ch.sends).toHaveLength(0);
  });

  it('records a sent message', async () => {
    await ch.send({ to: '+9647801234567', text: 'هل أنتم مفتوحون؟' });
    expect(ch.sends.at(0)?.to).toBe('+9647801234567');
    expect(ch.sends.at(0)?.text).toBe('هل أنتم مفتوحون؟');
  });

  it('returns a UUID externalId', async () => {
    const result = await ch.send({ to: 'x', text: 'y' });
    expect(result.externalId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('parseInbound returns null', async () => {
    expect(await ch.parseInbound({}, {})).toBeNull();
  });

  it('reset() clears sends', async () => {
    await ch.send({ to: 'a', text: 'b' });
    ch.reset();
    expect(ch.sends).toHaveLength(0);
  });
});
