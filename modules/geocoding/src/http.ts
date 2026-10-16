/**
 * HTTP layer for modules/geocoding — NestJS controller wired to geocodingContract.
 * Thin: validates via ts-rest, delegates to GeocodingService, never does domain logic.
 */
import { Controller, Inject } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { geocodingContract } from '@iraq-maps/contracts';
import { GeocodingService } from './service';

export const GEOCODING_SERVICE = 'GEOCODING_SERVICE';

@Controller()
export class GeocodingController {
  constructor(
    @Inject(GEOCODING_SERVICE) private readonly svc: GeocodingService,
  ) {}

  @TsRestHandler(geocodingContract.geocode)
  async geocode() {
    return tsRestHandler(geocodingContract.geocode, async ({ query }) => {
      try {
        const results = await this.svc['geocoder'].geocode(query);
        return { status: 200 as const, body: { results } };
      } catch {
        return { status: 503 as const, body: { type: 'about:blank', title: 'Geocoder unavailable', status: 503, code: 'geocoder_unavailable' } };
      }
    });
  }

  @TsRestHandler(geocodingContract.geocodeStructured)
  async geocodeStructured() {
    return tsRestHandler(geocodingContract.geocodeStructured, async ({ query }) => {
      try {
        const results = await this.svc.structuredGeocode(query);
        return { status: 200 as const, body: { results } };
      } catch {
        return { status: 503 as const, body: { type: 'about:blank', title: 'Geocoder unavailable', status: 503, code: 'geocoder_unavailable' } };
      }
    });
  }

  @TsRestHandler(geocodingContract.reverseGeocode)
  async reverseGeocode() {
    return tsRestHandler(geocodingContract.reverseGeocode, async ({ query }) => {
      try {
        const result = await this.svc.reverseGeocode(query.lat, query.lng, query.locale);
        if (!result) {
          return { status: 404 as const, body: { type: 'about:blank', title: 'Location outside Iraq', status: 404, code: 'outside_iraq' } };
        }
        return { status: 200 as const, body: result };
      } catch {
        return { status: 503 as const, body: { type: 'about:blank', title: 'Geocoder unavailable', status: 503, code: 'geocoder_unavailable' } };
      }
    });
  }

  @TsRestHandler(geocodingContract.autocomplete)
  async autocomplete() {
    return tsRestHandler(geocodingContract.autocomplete, async ({ query }) => {
      try {
        const suggestions = await this.svc.autocompleteAddress(
          query.partial,
          query.governorateId,
          query.near,
          query.limit,
          query.locale,
        );
        return { status: 200 as const, body: { suggestions } };
      } catch {
        return { status: 503 as const, body: { type: 'about:blank', title: 'Geocoder unavailable', status: 503, code: 'geocoder_unavailable' } };
      }
    });
  }

  @TsRestHandler(geocodingContract.adminDivisions)
  async adminDivisions() {
    return tsRestHandler(geocodingContract.adminDivisions, async () => {
      const divisions = this.svc.getIraqAdminDivisions();
      return { status: 200 as const, body: { divisions } };
    });
  }

  @TsRestHandler(geocodingContract.boundingBox)
  async boundingBox() {
    return tsRestHandler(geocodingContract.boundingBox, async ({ query }) => {
      const result = this.svc.getBoundingBox(query.name, query.locale);
      if (!result) {
        return { status: 404 as const, body: { type: 'about:blank', title: 'Area not found', status: 404, code: 'area_not_found' } };
      }
      return { status: 200 as const, body: result };
    });
  }

  @TsRestHandler(geocodingContract.neighborhoods)
  async neighborhoods() {
    return tsRestHandler(geocodingContract.neighborhoods, async ({ query }) => {
      const city = query.city ?? (query.governorateId as string | undefined) ?? '';
      const neighborhoods = this.svc.getNeighborhoods(city, query.locale);
      return { status: 200 as const, body: { neighborhoods } };
    });
  }

  @TsRestHandler(geocodingContract.validateAddress)
  async validateAddress() {
    return tsRestHandler(geocodingContract.validateAddress, async ({ body }) => {
      const result = await this.svc.validateIraqAddress(body.address, body.locale);
      return { status: 200 as const, body: result };
    });
  }
}
