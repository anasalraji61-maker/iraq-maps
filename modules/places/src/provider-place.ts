import { PortTokens, providerPlaceId } from '@iraq-maps/contracts';
import type { EventBus } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { sql } from 'drizzle-orm';

/**
 * Listens for `providers.provider.verified.v1` and creates (or re-activates) a provider-linked place
 * in places.provider_place. The row is separate from osm_features to preserve ODbL isolation.
 */
export function registerProviderPlaceHandler(bus: EventBus, db: Db): () => void {
  return bus.subscribe('providers.provider.verified.v1', async (event) => {
    const { providerId } = event.payload;
    const id = providerPlaceId(providerId);
    await db.execute(sql`
      INSERT INTO places.provider_place (id, provider_id, active, updated_at)
      VALUES (${id}, ${providerId}, true, now())
      ON CONFLICT (id) DO UPDATE SET active = true, updated_at = now()
    `);
  });
}

export const ProviderPlacePortToken = PortTokens.PlacesQueryPort; // re-exported for wiring clarity
