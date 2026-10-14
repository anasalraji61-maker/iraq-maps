import { readFile } from 'node:fs/promises';
import type { PushSender } from '@iraq-maps/contracts';

interface ServiceAccountJson {
  project_id: string;
  client_email: string;
  private_key: string;
}

/**
 * FCM HTTP v1 push sender.
 * Requires FCM_SERVICE_ACCOUNT_JSON_PATH to point to the service account JSON file.
 */
export class FcmPushSender implements PushSender {
  private readonly projectId: string;
  private readonly clientEmail: string;
  private readonly privateKey: string;

  constructor(serviceAccount: ServiceAccountJson) {
    this.projectId = serviceAccount.project_id;
    this.clientEmail = serviceAccount.client_email;
    this.privateKey = serviceAccount.private_key;
  }

  static async fromEnv(env: Record<string, string | undefined> = process.env): Promise<FcmPushSender> {
    const path = env['FCM_SERVICE_ACCOUNT_JSON_PATH'];
    if (!path) throw new Error('FCM_SERVICE_ACCOUNT_JSON_PATH env var is required for FCM push');
    const raw = await readFile(path, 'utf-8');
    const sa = JSON.parse(raw) as ServiceAccountJson;
    return new FcmPushSender(sa);
  }

  private async getAccessToken(): Promise<string> {
    // Build a signed JWT for Google OAuth2
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const claim = btoa(
      JSON.stringify({
        iss: this.clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    )
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const unsigned = `${header}.${claim}`;
    const key = await crypto.subtle.importKey(
      'pkcs8',
      this.pemToArrayBuffer(this.privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const jwt = `${unsigned}.${sigB64}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const b64 = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  async send(token: string, notification: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
    const accessToken = await this.getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;
    const message: Record<string, unknown> = {
      token,
      notification: { title: notification.title, body: notification.body },
    };
    if (notification.data) message['data'] = notification.data;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`FCM send failed (${res.status}): ${text}`);
    }
  }
}
