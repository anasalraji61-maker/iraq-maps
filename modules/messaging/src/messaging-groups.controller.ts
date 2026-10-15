import type { AuthPrincipal, UserId, GroupIdType } from '@iraq-maps/contracts';
import { messagingGroupsContract } from '@iraq-maps/contracts';
import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { MessagingGroupsService } from './messaging-groups.service';

interface AuthedRequest { principal?: AuthPrincipal }

const problem = <S extends number>(status: S, code: string) => ({
  status,
  body: { code },
});

@Controller()
export class MessagingGroupsController {
  constructor(private readonly svc: MessagingGroupsService) {}

  @TsRestHandler(messagingGroupsContract)
  handle(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;

    return tsRestHandler(messagingGroupsContract, {
      createGroup: async ({ body }) => {
        if (!userId) return problem(401, 'unauthorized') as never;
        const group = await this.svc.createGroup(
          userId,
          body.name,
          body.avatarUrl,
          body.memberIds as UserId[] | undefined,
        );
        return { status: 201, body: group };
      },

      listGroups: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized') as never;
        const result = await this.svc.listGroups(userId, query.cursor);
        return { status: 200, body: result };
      },

      sendGroupMessage: async ({ params, body }) => {
        if (!userId) return problem(403, 'forbidden') as never;
        try {
          const msg = await this.svc.sendGroupMessage(userId, params.groupId as GroupIdType, body.text);
          return { status: 201, body: msg };
        } catch (e: unknown) {
          const status = (e as { status?: number }).status;
          if (status === 403) return problem(403, 'forbidden') as never;
          return problem(404, 'not_found') as never;
        }
      },

      listGroupMessages: async ({ params, query }) => {
        if (!userId) return problem(403, 'forbidden') as never;
        try {
          const result = await this.svc.listGroupMessages(userId, params.groupId as GroupIdType, query.cursor, query.limit);
          return { status: 200, body: result };
        } catch (e: unknown) {
          const status = (e as { status?: number }).status;
          if (status === 403) return problem(403, 'forbidden') as never;
          return problem(404, 'not_found') as never;
        }
      },

      addGroupMember: async ({ params, body }) => {
        if (!userId) return problem(403, 'forbidden') as never;
        try {
          const member = await this.svc.addGroupMember(
            userId,
            params.groupId as GroupIdType,
            body.userId,
            body.role,
          );
          return { status: 201, body: member };
        } catch (e: unknown) {
          const status = (e as { status?: number }).status;
          if (status === 409) return problem(409, 'already_member') as never;
          if (status === 403) return problem(403, 'forbidden') as never;
          return problem(404, 'not_found') as never;
        }
      },
    });
  }
}
