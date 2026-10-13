import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3ObjectStorage } from './index.js';

// Mock the S3 client and presigner
vi.mock('@aws-sdk/client-s3', async (importActual) => {
  const actual = await importActual<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({}),
    })),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/bucket/key?sig=abc'),
}));

describe('S3ObjectStorage', () => {
  let client: { send: ReturnType<typeof vi.fn> };
  let storage: S3ObjectStorage;

  beforeEach(() => {
    client = { send: vi.fn().mockResolvedValue({}) };
    storage = new S3ObjectStorage({ bucket: 'test-bucket', region: 'us-east-1' }, client as unknown as S3Client);
  });

  it('putSignedUrl returns a string URL', async () => {
    const result = await storage.signUpload('test-key.jpg', {
      contentType: 'image/jpeg',
      maxBytes: 1024,
      expiresInS: 900,
    });
    expect(typeof result.url).toBe('string');
    expect(result.url).toMatch(/^https?:\/\//);
    expect(result.headers['content-type']).toBe('image/jpeg');
  });

  it('delete calls DeleteObjectCommand with the correct key', async () => {
    await storage.delete('some-key.webp');
    expect(client.send).toHaveBeenCalledTimes(1);
    const [call] = client.send.mock.calls;
    expect(call?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });
});
