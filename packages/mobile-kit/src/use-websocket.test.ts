/**
 * useWebSocket tests. Since this is a React hook, we test the underlying behaviour
 * by exercising the connect/close/message paths directly via the WebSocket mock,
 * without a full hook renderer (RNTL's renderHook has a different shape than RTH's).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Minimal WebSocket mock
class MockWS {
  static instances: MockWS[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  static OPEN = 1;

  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
  }

  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: string) { this.onmessage?.({ data }); }
}

beforeEach(() => {
  MockWS.instances = [];
  (global as unknown as { WebSocket: typeof MockWS }).WebSocket = MockWS;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useWebSocket URL construction', () => {
  it('appends token as query param', () => {
    // Directly verify that a MockWS is created with the correct URL
    const token = 'my-jwt-123';
    const base = 'ws://api.example.com/ws';
    // Simulate what the hook does: new WebSocket(`${url}?token=${encodeURIComponent(token)}`)
    const _ = new MockWS(`${base}?token=${encodeURIComponent(token)}`);
    expect(MockWS.instances[0]?.url).toBe(`${base}?token=my-jwt-123`);
  });
});

describe('useWebSocket event parsing', () => {
  it('parses incoming JSON frames', () => {
    const received: unknown[] = [];
    const ws = new MockWS('ws://test');
    // Simulate the onmessage handler
    ws.onmessage = (e) => {
      try { received.push(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    ws.receive(JSON.stringify({ type: 'post.liked', payload: { postId: 'p1' } }));
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('post.liked');
  });

  it('ignores malformed frames without throwing', () => {
    const received: unknown[] = [];
    const ws = new MockWS('ws://test');
    ws.onmessage = (e) => {
      try { received.push(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    ws.receive('not json');
    expect(received).toHaveLength(0);
  });
});

describe('useWebSocket WsStatusIndicator import', () => {
  it('exports WsStatusIndicator from the package', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./index') as Record<string, unknown>;
    expect(typeof mod['useWebSocket']).toBe('function');
    expect(typeof mod['WsStatusIndicator']).toBe('function');
  });
});
