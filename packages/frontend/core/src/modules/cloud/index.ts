export type { Invoice } from './entities/invoices';
export { Server } from './entities/server';
export type { AuthAccountInfo } from './entities/session';
export {
  BackendError,
  isBackendError,
  isNetworkError,
  NetworkError,
} from './error';
export { AccountChanged } from './events/account-changed';
export { AccountLoggedIn } from './events/account-logged-in';
export { AccountLoggedOut } from './events/account-logged-out';
export { ServerInitialized } from './events/server-initialized';
export { RawFetchProvider } from './provider/fetch';
export { ValidatorProvider } from './provider/validator';
export { WebSocketAuthProvider } from './provider/websocket-auth';
export { AuthService } from './services/auth';
export { CaptchaService } from './services/captcha';
export { DefaultServerService } from './services/default-server';
export { EventSourceService } from './services/eventsource';
export { FetchService } from './services/fetch';
export { GraphQLService } from './services/graphql';
export { InvoicesService } from './services/invoices';
export { ServerService } from './services/server';
export { ServersService } from './services/servers';
export { SubscriptionService } from './services/subscription';
export { UserCopilotQuotaService } from './services/user-copilot-quota';
export { UserFeatureService } from './services/user-feature';
export { UserQuotaService } from './services/user-quota';
export { WebSocketService } from './services/websocket';
export { WorkspaceInvoicesService } from './services/workspace-invoices';
export { WorkspaceServerService } from './services/workspace-server';
export { WorkspaceSubscriptionService } from './services/workspace-subscription';
export type { ServerConfig } from './types';

import { type Framework } from '@toeverything/infra';

import { DocScope, DocService } from '../doc';
import { GlobalCache, GlobalState, GlobalStateService } from '../storage';
import { UrlService } from '../url';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { CloudDocMeta } from './entities/cloud-doc-meta';
import { Invoices } from './entities/invoices';
import { Server } from './entities/server';
import { AuthSession } from './entities/session';
import { Subscription } from './entities/subscription';
import { SubscriptionPrices } from './entities/subscription-prices';
import { UserCopilotQuota } from './entities/user-copilot-quota';
import { UserFeature } from './entities/user-feature';
import { UserQuota } from './entities/user-quota';
import { WorkspaceInvoices } from './entities/workspace-invoices';
import { WorkspaceSubscription } from './entities/workspace-subscription';
import { DefaultRawFetchProvider, RawFetchProvider } from './provider/fetch';
import { ValidatorProvider } from './provider/validator';
import { WebSocketAuthProvider } from './provider/websocket-auth';
import { ServerScope } from './scopes/server';
import { AuthService } from './services/auth';
import { CaptchaService } from './services/captcha';
import { CloudDocMetaService } from './services/cloud-doc-meta';
import { DefaultServerService } from './services/default-server';
import { EventSourceService } from './services/eventsource';
import { FetchService } from './services/fetch';
import { GraphQLService } from './services/graphql';
import { InvoicesService } from './services/invoices';
import { ServerService } from './services/server';
import { ServersService } from './services/servers';
import { SubscriptionService } from './services/subscription';
import { UserCopilotQuotaService } from './services/user-copilot-quota';
import { UserFeatureService } from './services/user-feature';
import { UserQuotaService } from './services/user-quota';
import { WebSocketService } from './services/websocket';
import { WorkspaceInvoicesService } from './services/workspace-invoices';
import { WorkspaceServerService } from './services/workspace-server';
import { WorkspaceSubscriptionService } from './services/workspace-subscription';
import { AuthStore } from './stores/auth';
import { CloudDocMetaStore } from './stores/cloud-doc-meta';
import { InvoicesStore } from './stores/invoices';
import { ServerConfigStore } from './stores/server-config';
import { ServerListStore } from './stores/server-list';
import { SubscriptionStore } from './stores/subscription';
import { UserCopilotQuotaStore } from './stores/user-copilot-quota';
import { UserFeatureStore } from './stores/user-feature';
import { UserQuotaStore } from './stores/user-quota';

export function configureCloudModule(framework: Framework) {
  framework
    .impl(RawFetchProvider, DefaultRawFetchProvider)
    .service(ServersService, [ServerListStore, ServerConfigStore])
    .service(DefaultServerService, [ServersService])
    .store(ServerListStore, [GlobalStateService])
    .store(ServerConfigStore, [RawFetchProvider])
    .entity(Server, [ServerListStore])
    .scope(ServerScope)
    .service(ServerService, [ServerScope])
    .service(FetchService, [RawFetchProvider, ServerService])
    .service(EventSourceService, [ServerService])
    .service(GraphQLService, [FetchService])
    .service(
      WebSocketService,
      f =>
        new WebSocketService(
          f.get(ServerService),
          f.get(AuthService),
          f.getOptional(WebSocketAuthProvider)
        )
    )
    .service(CaptchaService, f => {
      return new CaptchaService(
        f.get(ServerService),
        f.get(FetchService),
        f.getOptional(ValidatorProvider)
      );
    })
    .service(AuthService, [FetchService, AuthStore, UrlService])
    .store(AuthStore, [
      FetchService,
      GraphQLService,
      GlobalState,
      ServerService,
    ])
    .entity(AuthSession, [AuthStore])
    .service(SubscriptionService, [SubscriptionStore])
    .store(SubscriptionStore, [
      GraphQLService,
      GlobalCache,
      UrlService,
      ServerService,
    ])
    .entity(Subscription, [AuthService, ServerService, SubscriptionStore])
    .entity(SubscriptionPrices, [ServerService, SubscriptionStore])
    .service(UserQuotaService)
    .store(UserQuotaStore, [GraphQLService])
    .entity(UserQuota, [AuthService, UserQuotaStore])
    .service(UserCopilotQuotaService)
    .store(UserCopilotQuotaStore, [GraphQLService])
    .entity(UserCopilotQuota, [
      AuthService,
      UserCopilotQuotaStore,
      ServerService,
    ])
    .service(UserFeatureService)
    .entity(UserFeature, [AuthService, UserFeatureStore])
    .store(UserFeatureStore, [GraphQLService])
    .service(InvoicesService)
    .store(InvoicesStore, [GraphQLService])
    .entity(Invoices, [InvoicesStore]);

  framework
    .scope(WorkspaceScope)
    .service(WorkspaceServerService)
    .scope(DocScope)
    .service(CloudDocMetaService)
    .entity(CloudDocMeta, [CloudDocMetaStore, DocService, GlobalCache])
    .store(CloudDocMetaStore, [WorkspaceServerService]);
  framework
    .scope(WorkspaceScope)
    .service(WorkspaceSubscriptionService, [WorkspaceServerService])
    .entity(WorkspaceSubscription, [WorkspaceService, WorkspaceServerService])
    .service(WorkspaceInvoicesService)
    .entity(WorkspaceInvoices, [WorkspaceService, WorkspaceServerService]);
}
