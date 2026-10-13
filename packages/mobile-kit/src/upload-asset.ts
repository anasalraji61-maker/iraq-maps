// M3 stub: uploads a local file URI to the media API.
// builder-provider-app owns the real implementation.
import type { ApiClient } from '@iraq-maps/api-client';
import type { AssetId, MediaPurpose } from '@iraq-maps/contracts';

/** @public frozen stub (M3) */
export async function uploadAsset(
  api: ApiClient,
  apiBaseUrl: string,
  { uri, purpose }: { uri: string; purpose: MediaPurpose },
): Promise<AssetId> {
  // Determine mime type from extension; default to jpeg.
  const ext = uri.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? ('image/png' as const) : ext === 'webp' ? ('image/webp' as const) : ('image/jpeg' as const);

  // Fetch the file and get its size.
  const response = await fetch(uri);
  const blob = await response.blob();
  const size = blob.size;

  // Step 1: request an upload ticket.
  const ticketRes = await api.media.createUpload({ body: { purpose, mime, size } });
  if (ticketRes.status !== 201) throw new Error(`upload ticket failed: ${ticketRes.status}`);
  const { assetId, uploadUrl } = ticketRes.body;

  // Step 2: PUT the blob to the signed URL.
  const absolute = (u: string) => (u.startsWith('/') ? apiBaseUrl.replace(/\/+$/, '') + u : u);
  const putRes = await fetch(absolute(uploadUrl), { method: 'PUT', body: blob, headers: { 'Content-Type': mime } });
  if (!putRes.ok) throw new Error(`PUT upload failed: ${putRes.status}`);

  // Step 3: confirm the upload.
  const confirmRes = await api.media.completeUpload({ params: { assetId } });
  if (confirmRes.status !== 202) throw new Error(`confirm failed: ${confirmRes.status}`);

  return assetId;
}
