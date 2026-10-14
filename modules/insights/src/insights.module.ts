import { PortTokens, type Clock } from '@iraq-maps/contracts';
import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';

const CLOCK_TOKEN = 'INSIGHTS_CLOCK';

/** Provides the InsightsPort and the insights HTTP routes. */
@Module({
  controllers: [InsightsController],
  providers: [
    {
      provide: CLOCK_TOKEN,
      useFactory: (): Clock => ({ now: () => new Date() }),
    },
    {
      provide: PortTokens.InsightsPort,
      useFactory: (clock: Clock) => new InsightsService(clock),
      inject: [CLOCK_TOKEN],
    },
  ],
  exports: [PortTokens.InsightsPort],
})
export class InsightsModule {}

export const insightsMigrationsDir = new URL('../migrations', import.meta.url).pathname;
