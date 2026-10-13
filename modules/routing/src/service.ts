import type { RouteRequest, RouteResult, RoutingPort } from '@iraq-maps/contracts';
import type { ValhallaClient } from './valhalla';

/** RoutingPort implemented over a RoutingEngine (Valhalla or fake). */
export class RoutingService implements RoutingPort {
  constructor(private readonly engine: ValhallaClient) {}

  route(request: RouteRequest): Promise<RouteResult | null> {
    return this.engine.route(request);
  }
}
