import type { Db } from '@iraq-maps/db-kit';
import type { EventBus } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import { Module, type DynamicModule } from '@nestjs/common';

export const reviewsMigrationsDir = new URL('../migrations', import.meta.url).pathname;
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

export interface ReviewsModuleOptions {
  db: Db;
  eventBus?: EventBus;
}

class NoopEventBus implements EventBus {
  async publish() {}
  subscribe() {
    return () => {};
  }
}

@Module({})
class ReviewsModule {}

/**
 * Nest dynamic module serving reviewsContract routes.
 * @public
 */
export function reviewsModule(opts: ReviewsModuleOptions): DynamicModule {
  return {
    module: ReviewsModule,
    global: true,
    controllers: [ReviewsController],
    providers: [
      { provide: 'REVIEWS_DB', useValue: opts.db },
      { provide: PortTokens.EventBus, useValue: opts.eventBus ?? new NoopEventBus() },
      ReviewsService,
    ],
    exports: [ReviewsService],
  };
}
