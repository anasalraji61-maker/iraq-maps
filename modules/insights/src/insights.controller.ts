import { insightsContract, PortTokens, type InsightsPort, type PriceLevel } from '@iraq-maps/contracts';
import { Controller, HttpException, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { InsightsService } from './insights.service';

@Controller()
export class InsightsController {
  constructor(@Inject(PortTokens.InsightsPort) private readonly insights: InsightsPort) {}

  @TsRestHandler(insightsContract.get)
  getInsights() {
    return tsRestHandler(insightsContract.get, async ({ params }) => {
      const result = await this.insights.getInsights(params.id);
      return { status: 200, body: result };
    });
  }

  @TsRestHandler(insightsContract.report)
  submitReport() {
    return tsRestHandler(insightsContract.report, async ({ body }) => {
      const now = new Date();
      if (body.kind === 'crowded_now') {
        await this.insights.reportCrowded(body.placeId, now);
      } else if (body.kind === 'price') {
        if (!body.priceLevel) {
          throw new HttpException({ type: 'about:blank', title: 'priceLevel required for price report', status: 400, code: 'invalid_request' }, 400);
        }
        await this.insights.reportPrice(body.placeId, body.priceLevel as PriceLevel, now);
      }
      return { status: 204 as const, body: undefined };
    });
  }

  @TsRestHandler(insightsContract.summary)
  getSummary() {
    return tsRestHandler(insightsContract.summary, async () => {
      // InsightsService extends InsightsPort and also exposes getSummary()
      const svc = this.insights as unknown as InsightsService;
      const result = svc.getSummary();
      return { status: 200 as const, body: result };
    });
  }
}
