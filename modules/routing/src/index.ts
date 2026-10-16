import { defineModuleConfig } from '@iraq-maps/config';
import { PortTokens } from '@iraq-maps/contracts';
import { Module, type DynamicModule } from '@nestjs/common';
import { z } from 'zod';
import { ROUTING_SERVICE, RoutingController } from './http';
import { RoutingService } from './service';
import { ExtendedRoutingService, TripPlannerService } from './trip-planner.service';
import { ValhallaClient } from './valhalla';

export type {
  TripPlan,
  TripStop,
  TripStopInput,
  TripSegment,
  TripStats,
  PlanTripInput,
  AlternativeRoute,
  ElevationProfile,
  ElevationPoint,
} from './trip-planner.service';
export { TripPlannerService, ExtendedRoutingService };

export interface RoutingModuleOptions {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
}

@Module({})
class RoutingModule {}

/** Nest module serving routesContract and providing PortTokens.RoutingPort.
 * Reads VALHALLA_URL from env (required). */
export function routingModule(opts: RoutingModuleOptions = {}): DynamicModule {
  const config = defineModuleConfig(
    'routing',
    { VALHALLA_URL: z.string().url() },
    { env: opts.env },
  );

  const engine = new ValhallaClient(config.VALHALLA_URL);
  const service = new RoutingService(engine);

  return {
    module: RoutingModule,
    global: true,
    controllers: [RoutingController],
    providers: [
      { provide: ROUTING_SERVICE, useValue: service },
      { provide: PortTokens.RoutingPort, useValue: service },
    ],
    exports: [PortTokens.RoutingPort],
  };
}
