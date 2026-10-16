/**
 * modules/geocoding — NestJS dynamic module for forward/reverse geocoding.
 *
 * Reads PHOTON_URL from env (optional; falls back to FakeGeocoderClient when absent).
 * Provides geocodingContract HTTP routes and exports GeocodingService.
 */
import { Module, type DynamicModule } from '@nestjs/common';
import { FakeGeocoderClient } from './fake-geocoder';
import { GEOCODING_SERVICE, GeocodingController } from './http';
import { PhotonClient } from './photon';
import { GeocodingService } from './service';

export { GeocodingService } from './service';
export { FakeGeocoderClient } from './fake-geocoder';
export { IRAQ_ADMIN_DIVISIONS } from './iraq-admin';
export { IRAQ_NEIGHBORHOODS } from './iraq-neighborhoods';
export { formatIraqAddress, isInIraq, photonPropsToComponents, buildLandmarkPhrase } from './address-format';

export interface GeocodingModuleOptions {
  env?: Record<string, string | undefined>;
}

@Module({})
class GeocodingModule {}

/**
 * Nest module serving geocodingContract endpoints and exporting GeocodingService.
 * PHOTON_URL — required in production; optional in dev/test (uses FakeGeocoderClient).
 */
export function geocodingModule(opts: GeocodingModuleOptions = {}): DynamicModule {
  const env = opts.env ?? process.env;

  let svc: GeocodingService;
  if (env['PHOTON_URL']) {
    svc = new GeocodingService(new PhotonClient(env['PHOTON_URL']));
  } else {
    svc = new GeocodingService(new FakeGeocoderClient());
  }

  return {
    module: GeocodingModule,
    global: true,
    controllers: [GeocodingController],
    providers: [{ provide: GEOCODING_SERVICE, useValue: svc }],
    exports: [GEOCODING_SERVICE],
  };
}
