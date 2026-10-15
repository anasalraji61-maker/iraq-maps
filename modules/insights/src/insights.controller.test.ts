/**
 * InsightsController unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlaceId } from '@iraq-maps/contracts';
import { InsightsController } from './insights.controller.js';
import type { InsightsPort } from '@iraq-maps/contracts';

type HandlerFn = (arg: unknown) => Promise<{ status: number; body: unknown }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callMethod(ctrl: any, method: string): HandlerFn {
  // Each @TsRestHandler method returns a function when called with no args;
  // that function receives the ts-rest request object.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  return ctrl[method]() as HandlerFn;
}

const PLACE_ID = 'place-test' as PlaceId;

function makeInsights(): InsightsPort {
  return {
    getInsights: vi.fn().mockResolvedValue({ crowding: null, priceLevel: null }),
    reportCrowded: vi.fn().mockResolvedValue(undefined),
    reportPrice: vi.fn().mockResolvedValue(undefined),
  } as unknown as InsightsPort;
}

describe('InsightsController', () => {
  let port: InsightsPort;
  let ctrl: InsightsController;

  beforeEach(() => {
    port = makeInsights();
    ctrl = new InsightsController(port);
  });

  it('getInsights returns 200 with insights data', async () => {
    const h = callMethod(ctrl, 'getInsights');
    const result = await h({ params: { id: PLACE_ID } });
    expect(result.status).toBe(200);
    expect(port.getInsights).toHaveBeenCalledWith(PLACE_ID);
  });

  it('submitReport returns 204 for crowded_now kind', async () => {
    const h = callMethod(ctrl, 'submitReport');
    const result = await h({ body: { kind: 'crowded_now', placeId: PLACE_ID } });
    expect(result.status).toBe(204);
    expect(port.reportCrowded).toHaveBeenCalledTimes(1);
  });

  it('submitReport returns 204 for price kind with priceLevel', async () => {
    const h = callMethod(ctrl, 'submitReport');
    const result = await h({ body: { kind: 'price', placeId: PLACE_ID, priceLevel: 'moderate' } });
    expect(result.status).toBe(204);
    expect(port.reportPrice).toHaveBeenCalledWith(PLACE_ID, 'moderate', expect.any(Date));
  });

  it('submitReport returns 400 for price kind without priceLevel', async () => {
    const h = callMethod(ctrl, 'submitReport');
    const result = await h({ body: { kind: 'price', placeId: PLACE_ID } }).catch((e: { status?: number }) => e);
    // Controller throws HttpException with status 400
    expect((result as { status?: number }).status).toBe(400);
  });
});
