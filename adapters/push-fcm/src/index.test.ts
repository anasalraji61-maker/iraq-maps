import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FcmPushSender } from './index';

const fakeServiceAccount = {
  project_id: 'test-project',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  // A minimal valid RSA private key for testing (not a real key)
  private_key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7o4qne60TB3wo
pCIJkMSBSVAME00000000000000000000000000000000000000000000000000
-----END PRIVATE KEY-----`,
};

describe('FcmPushSender', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends correct Authorization header and message structure', async () => {
    // Mock token exchange
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-access-token' }),
    });
    // Mock FCM send
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'projects/test-project/messages/abc123' }),
    });

    // We skip actual RSA signing by mocking crypto.subtle
    const signMock = vi.fn().mockResolvedValue(new Uint8Array(32).buffer);
    const importKeyMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('crypto', {
      subtle: { importKey: importKeyMock, sign: signMock },
    });

    const sender = new FcmPushSender(fakeServiceAccount);
    await sender.send('device-token-123', { title: 'إشعار', body: 'رسالة جديدة', data: { type: 'inquiry' } });

    // Find the FCM send call (second fetch call)
    const fcmCall = fetchMock.mock.calls[1]!;
    expect(fcmCall[0]).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send');
    const headers = fcmCall[1].headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Bearer test-access-token$/);
    const body = JSON.parse(fcmCall[1].body as string) as { message: { token: string; notification: { title: string; body: string }; data: Record<string, string> } };
    expect(body.message.token).toBe('device-token-123');
    expect(body.message.notification.title).toBe('إشعار');
    expect(body.message.notification.body).toBe('رسالة جديدة');
    expect(body.message.data).toEqual({ type: 'inquiry' });
  });

  it('throws when FCM returns non-ok status', async () => {
    const signMock = vi.fn().mockResolvedValue(new Uint8Array(32).buffer);
    const importKeyMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('crypto', { subtle: { importKey: importKeyMock, sign: signMock } });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token' }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'INVALID_ARGUMENT',
    });

    const sender = new FcmPushSender(fakeServiceAccount);
    await expect(sender.send('bad-token', { title: 'x', body: 'y' })).rejects.toThrow('FCM send failed (400)');
  });
});
