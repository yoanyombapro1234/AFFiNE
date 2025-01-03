import './config';

import { ServerFeature } from '../../core/config';
import { FeatureModule } from '../../core/features';
import { PermissionModule } from '../../core/permission';
import { QuotaModule } from '../../core/quota';
import { UserModule } from '../../core/user';
import { Plugin } from '../registry';
import { StripeWebhookController } from './controller';
import { SubscriptionCronJobs } from './cron';
import {
  UserSubscriptionManager,
  WorkspaceSubscriptionManager,
} from './manager';
import { TeamQuotaOverride } from './quota';
import {
  SubscriptionResolver,
  UserSubscriptionResolver,
  WorkspaceSubscriptionResolver,
} from './resolver';
import { SubscriptionService } from './service';
import { StripeProvider } from './stripe';
import { StripeWebhook } from './webhook';

@Plugin({
  name: 'payment',
  imports: [FeatureModule, QuotaModule, UserModule, PermissionModule],
  providers: [
    StripeProvider,
    SubscriptionService,
    SubscriptionResolver,
    UserSubscriptionResolver,
    StripeWebhook,
    UserSubscriptionManager,
    WorkspaceSubscriptionManager,
    SubscriptionCronJobs,
    WorkspaceSubscriptionResolver,
    TeamQuotaOverride,
  ],
  controllers: [StripeWebhookController],
  requires: [
    'plugins.payment.stripe.keys.APIKey',
    'plugins.payment.stripe.keys.webhookKey',
  ],
  contributesTo: ServerFeature.Payment,
  if: config => config.flavor.graphql,
})
export class PaymentModule {}
