import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { Controller, UseGuards, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { appointmentsContract, type AuthPrincipal } from '@iraq-maps/contracts';
import { AppointmentsService, AppointmentError } from './appointments.service';

// Auth guard applied globally (IdentityAuthGuard in the API app).
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class AuthGuard {}
UseGuards(AuthGuard);

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = ctx.switchToHttp().getRequest<{ principal?: AuthPrincipal }>();
  return req.principal!.userId;
});

function problemFromError(err: unknown): {
  status: number;
  body: { type: string; title: string; status: number; code: string };
} {
  if (err instanceof AppointmentError) {
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
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @TsRestHandler(appointmentsContract.request)
  request(@CurrentUser() userId: string) {
    return tsRestHandler(appointmentsContract.request, async ({ params, body }) => {
      try {
        const appt = await this.svc.createAppointment(
          userId,
          params.providerId,
          undefined,
          body.date,
          body.time,
          body.service,
          body.notes,
        );
        return { status: 201 as const, body: appt };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(appointmentsContract.listForProvider)
  listForProvider(@CurrentUser() userId: string) {
    return tsRestHandler(appointmentsContract.listForProvider, async ({ params }) => {
      try {
        const result = await this.svc.getProviderAppointments(params.providerId, undefined, {});
        return { status: 200 as const, body: result.items };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(appointmentsContract.update)
  update(@CurrentUser() userId: string) {
    return tsRestHandler(appointmentsContract.update, async ({ params, body }) => {
      try {
        let appt;
        const providerId = params.providerId;
        const id = params.id;

        if (body.status === 'confirmed') {
          appt = await this.svc.confirmAppointment(providerId, id);
        } else if (body.status === 'completed') {
          appt = await this.svc.completeAppointment(providerId, id);
        } else if (body.status === 'cancelled') {
          appt = await this.svc.cancelAppointment(providerId, 'provider', id);
        } else {
          return {
            status: 400 as const,
            body: {
              type: 'about:blank',
              title: 'Invalid status transition',
              status: 400,
              code: 'invalid_transition',
            },
          };
        }

        return { status: 200 as const, body: appt };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }

  @TsRestHandler(appointmentsContract.myAppointments)
  myAppointments(@CurrentUser() userId: string) {
    return tsRestHandler(appointmentsContract.myAppointments, async () => {
      try {
        const result = await this.svc.getMyAppointments(userId, {});
        return { status: 200 as const, body: result.items };
      } catch (err) {
        return problemFromError(err) as never;
      }
    });
  }
}
