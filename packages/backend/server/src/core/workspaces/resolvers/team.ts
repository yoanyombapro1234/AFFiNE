import { Logger } from '@nestjs/common';
import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { PrismaClient, WorkspaceMemberStatus } from '@prisma/client';
import { nanoid } from 'nanoid';

import {
  Cache,
  EventEmitter,
  type EventPayload,
  MemberNotFoundInSpace,
  OnEvent,
  RequestMutex,
  TooManyRequest,
  URLHelper,
  UserFriendlyError,
} from '../../../base';
import { CurrentUser } from '../../auth';
import { Permission, PermissionService } from '../../permission';
import { QuotaManagementService } from '../../quota';
import { UserService } from '../../user';
import {
  InviteLink,
  InviteResult,
  WorkspaceInviteLinkExpireTime,
  WorkspaceType,
} from '../types';
import { WorkspaceService } from './service';

/**
 * Workspace team resolver
 * Public apis rate limit: 10 req/m
 * Other rate limit: 120 req/m
 */
@Resolver(() => WorkspaceType)
export class TeamWorkspaceResolver {
  private readonly logger = new Logger(TeamWorkspaceResolver.name);

  constructor(
    private readonly cache: Cache,
    private readonly event: EventEmitter,
    private readonly url: URLHelper,
    private readonly prisma: PrismaClient,
    private readonly permissions: PermissionService,
    private readonly users: UserService,
    private readonly quota: QuotaManagementService,
    private readonly mutex: RequestMutex,
    private readonly workspaceService: WorkspaceService
  ) {}

  @ResolveField(() => Boolean, {
    name: 'team',
    description: 'if workspace is team workspace',
    complexity: 2,
  })
  team(@Parent() workspace: WorkspaceType) {
    return this.quota.isTeamWorkspace(workspace.id);
  }

  @Mutation(() => [InviteResult])
  async inviteBatch(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'emails', type: () => [String] }) emails: string[],
    @Args('sendInviteMail', { nullable: true }) sendInviteMail: boolean
  ) {
    await this.permissions.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Admin
    );

    if (emails.length > 512) {
      return new TooManyRequest();
    }

    // lock to prevent concurrent invite
    const lockFlag = `invite:${workspaceId}`;
    await using lock = await this.mutex.acquire(lockFlag);
    if (!lock) {
      return new TooManyRequest();
    }

    const quota = await this.quota.getWorkspaceUsage(workspaceId);

    const results = [];
    for (const [idx, email] of emails.entries()) {
      const ret: InviteResult = { email, sentSuccess: false, inviteId: null };
      try {
        let target = await this.users.findUserByEmail(email);
        if (target) {
          const originRecord =
            await this.prisma.workspaceUserPermission.findFirst({
              where: {
                workspaceId,
                userId: target.id,
              },
            });
          // only invite if the user is not already in the workspace
          if (originRecord) continue;
        } else {
          target = await this.users.createUser({
            email,
            registered: false,
          });
        }
        const needMoreSeat = quota.memberCount + idx + 1 > quota.memberLimit;

        ret.inviteId = await this.permissions.grant(
          workspaceId,
          target.id,
          Permission.Write,
          needMoreSeat
            ? WorkspaceMemberStatus.NeedMoreSeat
            : WorkspaceMemberStatus.Pending
        );
        // NOTE: we always send email even seat not enough
        // because at this moment we cannot know whether the seat increase charge was successful
        // after user click the invite link, we can check again and reject if charge failed
        if (sendInviteMail) {
          try {
            await this.workspaceService.sendInviteMail(ret.inviteId);
            ret.sentSuccess = true;
          } catch (e) {
            this.logger.warn(
              `failed to send ${workspaceId} invite email to ${email}: ${e}`
            );
          }
        }
      } catch (e) {
        this.logger.error('failed to invite user', e);
      }
      results.push(ret);
    }

    const memberCount = quota.memberCount + results.length;
    if (memberCount > quota.memberLimit) {
      this.event.emit('workspace.members.updated', {
        workspaceId,
        count: memberCount,
      });
    }

    return results;
  }

  @ResolveField(() => InviteLink, {
    description: 'invite link for workspace',
    nullable: true,
  })
  async inviteLink(
    @Parent() workspace: WorkspaceType,
    @CurrentUser() user: CurrentUser
  ) {
    await this.permissions.checkWorkspace(
      workspace.id,
      user.id,
      Permission.Admin
    );

    const cacheId = `workspace:inviteLink:${workspace.id}`;
    const id = await this.cache.get<{ inviteId: string }>(cacheId);
    if (id) {
      const expireTime = await this.cache.ttl(cacheId);
      if (Number.isSafeInteger(expireTime)) {
        return {
          link: this.url.link(`/invite/${id.inviteId}`),
          expireTime: new Date(Date.now() + expireTime),
        };
      }
    }
    return null;
  }

  @Mutation(() => InviteLink)
  async createInviteLink(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('expireTime', { type: () => WorkspaceInviteLinkExpireTime })
    expireTime: WorkspaceInviteLinkExpireTime
  ): Promise<InviteLink> {
    await this.permissions.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Admin
    );
    const cacheWorkspaceId = `workspace:inviteLink:${workspaceId}`;
    const invite = await this.cache.get<{ inviteId: string }>(cacheWorkspaceId);
    if (typeof invite?.inviteId === 'string') {
      const expireTime = await this.cache.ttl(cacheWorkspaceId);
      if (Number.isSafeInteger(expireTime)) {
        return {
          link: this.url.link(`/invite/${invite.inviteId}`),
          expireTime: new Date(Date.now() + expireTime),
        };
      }
    }

    const inviteId = nanoid();
    const cacheInviteId = `workspace:inviteLinkId:${inviteId}`;
    await this.cache.set(cacheWorkspaceId, { inviteId }, { ttl: expireTime });
    await this.cache.set(
      cacheInviteId,
      { workspaceId, inviterUserId: user.id },
      { ttl: expireTime }
    );
    return {
      link: this.url.link(`/invite/${inviteId}`),
      expireTime: new Date(Date.now() + expireTime),
    };
  }

  @Mutation(() => Boolean)
  async revokeInviteLink(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.permissions.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Admin
    );
    const cacheId = `workspace:inviteLink:${workspaceId}`;
    return await this.cache.delete(cacheId);
  }

  @Mutation(() => String)
  async approveMember(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string
  ) {
    await this.permissions.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Admin
    );

    try {
      // lock to prevent concurrent invite and grant
      const lockFlag = `invite:${workspaceId}`;
      await using lock = await this.mutex.acquire(lockFlag);
      if (!lock) {
        return new TooManyRequest();
      }

      const status = await this.permissions.getWorkspaceMemberStatus(
        workspaceId,
        userId
      );
      if (status) {
        if (status === WorkspaceMemberStatus.UnderReview) {
          const result = await this.permissions.grant(
            workspaceId,
            userId,
            Permission.Write,
            WorkspaceMemberStatus.Accepted
          );

          if (result) {
            this.event.emit('workspace.members.requestApproved', {
              inviteId: result,
            });
          }
          return result;
        }
        return new TooManyRequest();
      } else {
        return new MemberNotFoundInSpace({ spaceId: workspaceId });
      }
    } catch (e) {
      this.logger.error('failed to invite user', e);
      return new TooManyRequest();
    }
  }

  @Mutation(() => String)
  async grantMember(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('userId') userId: string,
    @Args('permission', { type: () => Permission }) permission: Permission
  ) {
    await this.permissions.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Owner
    );

    try {
      // lock to prevent concurrent invite and grant
      const lockFlag = `invite:${workspaceId}`;
      await using lock = await this.mutex.acquire(lockFlag);
      if (!lock) {
        return new TooManyRequest();
      }

      const isMember = await this.permissions.isWorkspaceMember(
        workspaceId,
        userId
      );
      if (isMember) {
        const result = await this.permissions.grant(
          workspaceId,
          userId,
          permission
        );

        if (result) {
          this.event.emit('workspace.members.roleChanged', {
            userId,
            workspaceId,
            permission,
          });
          if (permission === Permission.Owner) {
            this.event.emit('workspace.members.ownerTransferred', {
              email: user.email,
              workspaceId,
            });
          }
        }

        return result;
      } else {
        return new MemberNotFoundInSpace({ spaceId: workspaceId });
      }
    } catch (e) {
      this.logger.error('failed to invite user', e);
      // pass through user friendly error
      if (e instanceof UserFriendlyError) {
        return e;
      }
      return new TooManyRequest();
    }
  }

  @OnEvent('workspace.members.reviewRequested')
  async onReviewRequested({
    inviteId,
  }: EventPayload<'workspace.members.reviewRequested'>) {
    // send review request mail to owner and admin
    await this.workspaceService.sendReviewRequestedMail(inviteId);
  }

  @OnEvent('workspace.members.requestDeclined')
  async onDeclineRequest({
    userId,
    workspaceId,
  }: EventPayload<'workspace.members.requestDeclined'>) {
    const user = await this.users.findUserById(userId);
    const workspace = await this.workspaceService.getWorkspaceInfo(workspaceId);
    // send decline mail
    await this.workspaceService.sendReviewDeclinedEmail(
      user?.email,
      workspace.name
    );
  }

  @OnEvent('workspace.members.requestApproved')
  async onApproveRequest({
    inviteId,
  }: EventPayload<'workspace.members.requestApproved'>) {
    // send approve mail
    await this.workspaceService.sendReviewApproveEmail(inviteId);
  }

  @OnEvent('workspace.members.roleChanged')
  async onRoleChanged({
    userId,
    workspaceId,
    permission,
  }: EventPayload<'workspace.members.roleChanged'>) {
    // send role changed mail
    await this.workspaceService.sendRoleChangedEmail(userId, {
      id: workspaceId,
      role: permission,
    });
  }

  @OnEvent('workspace.members.ownerTransferred')
  async onOwnerTransferred({
    email,
    workspaceId,
  }: EventPayload<'workspace.members.ownerTransferred'>) {
    // send role changed mail
    await this.workspaceService.sendOwnerTransferred(email, {
      id: workspaceId,
    });
  }
}
