import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { Controller, UseGuards, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { paymentsContract, type AuthPrincipal } from '@iraq-maps/contracts';
import { PaymentsService, PaymentError } from './payments.service';

// Auth guard is applied globally via APP_GUARD (IdentityAuthGuard) in the API app.
// This stub satisfies @UseGuards at the controller level.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class AuthGuard {}
UseGuards(AuthGuard); // suppress unused import warning

/** Extract the authenticated user's ID from the request principal set by IdentityAuthGuard. */
const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = ctx.switchToHttp().getRequest<{ principal?: AuthPrincipal }>();
  return req.principal!.userId;
});

function problemFromError(err: unknown): { status: number; body: { type: string; title: string; status: number; code: string } } {
  if (err instanceof PaymentError) {
    return {
      status: err.httpStatus,
      body: {
        type: 'about:blank',
        title: err.message,
        status: err.httpStatus,
        code: err.code,
      },
    };
  }
  return {
    status: 500,
    body: {
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      code: 'internal_error',
    },
  };
}

@Controller()
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @TsRestHandler(paymentsContract.getWallet)
  getWallet(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.getWallet, async () => {
      try {
        const wallet = await this.svc.getWalletBalance(userId);
        return { status: 200 as const, body: wallet };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.getTransactions)
  getTransactions(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.getTransactions, async ({ query }) => {
      try {
        const result = await this.svc.getTransactionHistory(userId, query);
        return { status: 200 as const, body: result };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.topUpWallet)
  topUpWallet(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.topUpWallet, async ({ body }) => {
      try {
        const wallet = await this.svc.addToWallet(userId, body);
        return { status: 200 as const, body: wallet };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.listPaymentMethods)
  listPaymentMethods(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.listPaymentMethods, async () => {
      const methods = await this.svc.listPaymentMethods(userId);
      return { status: 200 as const, body: methods };
    });
  }

  @TsRestHandler(paymentsContract.addCard)
  addCard(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.addCard, async ({ body }) => {
      try {
        const method = await this.svc.addCard(userId, body);
        return { status: 201 as const, body: method };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.removePaymentMethod)
  removePaymentMethod(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.removePaymentMethod, async ({ params }) => {
      try {
        await this.svc.removePaymentMethod(userId, params.methodId);
        return { status: 204 as const, body: undefined };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.setDefaultMethod)
  setDefaultMethod(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.setDefaultMethod, async ({ params }) => {
      try {
        const method = await this.svc.setDefaultPaymentMethod(userId, params.methodId);
        return { status: 200 as const, body: method };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.createPaymentIntent)
  createPaymentIntent(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.createPaymentIntent, async ({ body }) => {
      try {
        const intent = await this.svc.createPaymentIntent(userId, body);
        return { status: 201 as const, body: intent };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.getPaymentIntent)
  getPaymentIntent(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.getPaymentIntent, async ({ params }) => {
      try {
        const intent = await this.svc.getPaymentIntent(userId, params.intentId);
        return { status: 200 as const, body: intent };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.confirmPayment)
  confirmPayment(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.confirmPayment, async ({ params, body }) => {
      try {
        const intent = await this.svc.confirmPayment(userId, params.intentId, body);
        return { status: 200 as const, body: intent };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.cancelPaymentIntent)
  cancelPaymentIntent(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.cancelPaymentIntent, async ({ params }) => {
      try {
        const intent = await this.svc.cancelPaymentIntent(userId, params.intentId);
        return { status: 200 as const, body: intent };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.refundPayment)
  refundPayment(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.refundPayment, async ({ params, body }) => {
      try {
        const intent = await this.svc.refundPayment(userId, params.intentId, body);
        return { status: 200 as const, body: intent };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(paymentsContract.listPaymentIntents)
  listPaymentIntents(@CurrentUser() userId: string) {
    return tsRestHandler(paymentsContract.listPaymentIntents, async ({ query }) => {
      try {
        const result = await this.svc.listPaymentIntents(userId, query);
        return { status: 200 as const, body: result };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }
}
