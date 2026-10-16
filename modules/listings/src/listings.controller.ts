/**
 * ListingsController — ts-rest NestJS adapter for listingsContract.
 * Auth guard: provider routes require a bearer token verified by IdentityPort.
 */

import {
  listingsContract,
  type AuthPrincipal,
  type ProvListingId,
  type ListingCategoryId,
  PortTokens,
} from '@iraq-maps/contracts';
import type { IdentityPort } from '@iraq-maps/contracts';
import { NestRequestShapes, TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import {
  Controller,
  ForbiddenException,
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ListingsService } from './listings.service';

type Req = NestRequestShapes<typeof listingsContract>;

// ── Token for injection ───────────────────────────────────────────────────────

export const LISTINGS_SERVICE = 'LISTINGS_SERVICE' as const;

// ── Helper: extract bearer token from Authorization header ────────────────────

function extractBearer(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice(7);
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller()
export class ListingsController {
  constructor(
    @Inject(LISTINGS_SERVICE)
    private readonly svc: ListingsService,
    @Inject(PortTokens.IdentityPort)
    private readonly identity: IdentityPort,
  ) {}

  // ── Auth helper ─────────────────────────────────────────────────────────────

  private async requireProvider(headers: Record<string, string | undefined>): Promise<AuthPrincipal> {
    const token = extractBearer(headers['authorization']);
    if (!token) throw new UnauthorizedException();
    const principal = await this.identity.verifyAccessToken(token);
    if (!principal) throw new UnauthorizedException();
    if (!principal.roles.includes('provider') && !principal.roles.includes('admin')) {
      throw new ForbiddenException();
    }
    return principal;
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  @TsRestHandler(listingsContract.categories)
  async categories() {
    return tsRestHandler(listingsContract.categories, async () => {
      const items = await this.svc.getCategories();
      return {
        status: 200 as const,
        body: {
          items: items.map((cat) => ({
            id: cat.id as unknown as ListingCategoryId,
            nameAr: cat.nameAr,
            nameEn: cat.nameEn,
            icon: cat.icon,
            parentId: (cat.parentId ?? null) as unknown as ListingCategoryId | null,
            slug: cat.slug,
          })),
        },
      };
    });
  }

  @TsRestHandler(listingsContract.browse)
  async browse() {
    return tsRestHandler(listingsContract.browse, async ({ query }) => {
      const result = await this.svc.browseListings(query);
      return { status: 200 as const, body: result };
    });
  }

  @TsRestHandler(listingsContract.search)
  async search() {
    return tsRestHandler(listingsContract.search, async ({ query }) => {
      const result = await this.svc.searchListings(query);
      return { status: 200 as const, body: result };
    });
  }

  @TsRestHandler(listingsContract.featured)
  async featured() {
    return tsRestHandler(listingsContract.featured, async ({ query }) => {
      const items = await this.svc.getFeaturedListings(query.cityId);
      return { status: 200 as const, body: { items } };
    });
  }

  @TsRestHandler(listingsContract.byCategory)
  async byCategory() {
    return tsRestHandler(listingsContract.byCategory, async ({ params, query }) => {
      const cat = await this.svc.getCategoryById(params.categoryId);
      if (!cat) throw new NotFoundException();
      const result = await this.svc.getListingsByCategory(
        params.categoryId,
        query.cityId,
        query.cursor,
        query.limit,
        query.sort,
      );
      return { status: 200 as const, body: result };
    });
  }

  @TsRestHandler(listingsContract.get)
  async get() {
    return tsRestHandler(listingsContract.get, async ({ params }) => {
      const listing = await this.svc.getListing(params.id);
      if (!listing) throw new NotFoundException();
      return { status: 200 as const, body: listing };
    });
  }

  // ── Provider (authenticated) ────────────────────────────────────────────────

  @TsRestHandler(listingsContract.myListings)
  async myListings() {
    return tsRestHandler(listingsContract.myListings, async ({ query, headers }) => {
      const principal = await this.requireProvider(headers as Record<string, string | undefined>);
      const result = await this.svc.getListings(
        principal.userId as unknown as import('@iraq-maps/contracts').ProviderId,
        query.cursor,
        query.limit,
      );
      return { status: 200 as const, body: result };
    });
  }

  @TsRestHandler(listingsContract.create)
  async create() {
    return tsRestHandler(listingsContract.create, async ({ body, headers }) => {
      const principal = await this.requireProvider(headers as Record<string, string | undefined>);
      const listing = await this.svc.createListing(
        principal.userId as unknown as import('@iraq-maps/contracts').ProviderId,
        body,
      );
      return { status: 201 as const, body: listing };
    });
  }

  @TsRestHandler(listingsContract.update)
  async update() {
    return tsRestHandler(listingsContract.update, async ({ params, body, headers }) => {
      const principal = await this.requireProvider(headers as Record<string, string | undefined>);
      const listing = await this.svc.updateListing(
        principal.userId as unknown as import('@iraq-maps/contracts').ProviderId,
        params.id,
        body,
      );
      if (!listing) throw new NotFoundException();
      return { status: 200 as const, body: listing };
    });
  }

  @TsRestHandler(listingsContract.delete)
  async deleteListing() {
    return tsRestHandler(listingsContract.delete, async ({ params, headers }) => {
      const principal = await this.requireProvider(headers as Record<string, string | undefined>);
      const deleted = await this.svc.deleteListing(
        principal.userId as unknown as import('@iraq-maps/contracts').ProviderId,
        params.id,
      );
      if (!deleted) throw new NotFoundException();
      return { status: 204 as const, body: undefined };
    });
  }

  @TsRestHandler(listingsContract.toggleAvailability)
  async toggleAvailability() {
    return tsRestHandler(listingsContract.toggleAvailability, async ({ params, headers }) => {
      const principal = await this.requireProvider(headers as Record<string, string | undefined>);
      const next = await this.svc.toggleListingAvailability(
        principal.userId as unknown as import('@iraq-maps/contracts').ProviderId,
        params.id,
      );
      if (next === null) throw new NotFoundException();
      return { status: 200 as const, body: { isAvailable: next } };
    });
  }

  @TsRestHandler(listingsContract.analytics)
  async analytics() {
    return tsRestHandler(listingsContract.analytics, async ({ params, headers }) => {
      const principal = await this.requireProvider(headers as Record<string, string | undefined>);
      const data = await this.svc.getListingAnalytics(
        principal.userId as unknown as import('@iraq-maps/contracts').ProviderId,
        params.id,
      );
      if (!data) throw new NotFoundException();
      return { status: 200 as const, body: data };
    });
  }
}
