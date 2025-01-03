import { Injectable } from '@nestjs/common';
import { PrismaClient, UserStripeCustomer } from '@prisma/client';
import { omit, pick } from 'lodash-es';
import Stripe from 'stripe';
import { z } from 'zod';

import {
  EventEmitter,
  InternalServerError,
  InvalidCheckoutParameters,
  Runtime,
  SubscriptionAlreadyExists,
  SubscriptionPlanNotFound,
  URLHelper,
} from '../../../base';
import {
  EarlyAccessType,
  FeatureManagementService,
} from '../../../core/features';
import {
  CouponType,
  KnownStripeInvoice,
  KnownStripePrice,
  KnownStripeSubscription,
  LookupKey,
  retriveLookupKeyFromStripeSubscription,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  SubscriptionVariant,
} from '../types';
import { CheckoutParams, Subscription, SubscriptionManager } from './common';

interface PriceStrategyStatus {
  proEarlyAccess: boolean;
  aiEarlyAccess: boolean;
  proSubscribed: boolean;
  aiSubscribed: boolean;
  onetime: boolean;
}

export const UserSubscriptionIdentity = z.object({
  plan: z.enum([SubscriptionPlan.Pro, SubscriptionPlan.AI]),
  userId: z.string(),
});

export const UserSubscriptionCheckoutArgs = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
  }),
});

@Injectable()
export class UserSubscriptionManager extends SubscriptionManager {
  constructor(
    stripe: Stripe,
    db: PrismaClient,
    private readonly runtime: Runtime,
    private readonly feature: FeatureManagementService,
    private readonly event: EventEmitter,
    private readonly url: URLHelper
  ) {
    super(stripe, db);
  }

  async filterPrices(
    prices: KnownStripePrice[],
    customer?: UserStripeCustomer
  ) {
    const strategyStatus = customer
      ? await this.strategyStatus(customer)
      : {
          proEarlyAccess: false,
          aiEarlyAccess: false,
          proSubscribed: false,
          aiSubscribed: false,
          onetime: false,
        };

    const availablePrices: KnownStripePrice[] = [];

    for (const price of prices) {
      if (await this.isPriceAvailable(price, strategyStatus)) {
        availablePrices.push(price);
      }
    }

    return availablePrices;
  }

  async checkout(
    lookupKey: LookupKey,
    params: z.infer<typeof CheckoutParams>,
    { user }: z.infer<typeof UserSubscriptionCheckoutArgs>
  ) {
    if (
      lookupKey.plan !== SubscriptionPlan.Pro &&
      lookupKey.plan !== SubscriptionPlan.AI
    ) {
      throw new InvalidCheckoutParameters();
    }

    const subscription = await this.getSubscription({
      plan: lookupKey.plan,
      userId: user.id,
    });

    if (
      subscription &&
      // do not allow to re-subscribe unless
      !(
        /* current subscription is a onetime subscription and so as the one that's checking out */
        (
          (subscription.variant === SubscriptionVariant.Onetime &&
            lookupKey.variant === SubscriptionVariant.Onetime) ||
          /* current subscription is normal subscription and is checking-out a lifetime subscription */
          (subscription.recurring !== SubscriptionRecurring.Lifetime &&
            subscription.variant !== SubscriptionVariant.Onetime &&
            lookupKey.recurring === SubscriptionRecurring.Lifetime)
        )
      )
    ) {
      throw new SubscriptionAlreadyExists({ plan: lookupKey.plan });
    }

    const customer = await this.getOrCreateCustomer(user.id);
    const strategy = await this.strategyStatus(customer);
    const price = await this.autoPrice(lookupKey, strategy);

    if (
      !price ||
      !(await this.isPriceAvailable(price, { ...strategy, onetime: true }))
    ) {
      throw new SubscriptionPlanNotFound({
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }

    const discounts = await (async () => {
      const coupon = await this.getBuildInCoupon(customer, price);
      if (coupon) {
        return { discounts: [{ coupon }] };
      } else if (params.coupon) {
        const couponId = await this.getCouponFromPromotionCode(
          params.coupon,
          customer
        );
        if (couponId) {
          return { discounts: [{ coupon: couponId }] };
        }
      }

      return { allow_promotion_codes: true };
    })();

    const trials = (() => {
      if (lookupKey.plan === SubscriptionPlan.AI && !strategy.aiSubscribed) {
        return {
          trial_period_days: 7,
        } as Stripe.Checkout.SessionCreateParams.SubscriptionData;
      }
      return undefined;
    })();

    // mode: 'subscription' or 'payment' for lifetime and onetime payment
    const mode =
      lookupKey.recurring === SubscriptionRecurring.Lifetime ||
      lookupKey.variant === SubscriptionVariant.Onetime
        ? {
            mode: 'payment' as const,
            invoice_creation: {
              enabled: true,
            },
          }
        : {
            mode: 'subscription' as const,
            subscription_data: {
              ...trials,
            },
          };

    return this.stripe.checkout.sessions.create({
      customer: customer.stripeCustomerId,
      line_items: [
        {
          price: price.price.id,
          quantity: 1,
        },
      ],
      ...mode,
      ...discounts,
      success_url: this.url.link(params.successCallbackLink),
    });
  }

  async getSubscription(args: z.infer<typeof UserSubscriptionIdentity>) {
    return this.db.subscription.findFirst({
      where: {
        targetId: args.userId,
        plan: args.plan,
        status: {
          in: [SubscriptionStatus.Active, SubscriptionStatus.Trialing],
        },
      },
    });
  }

  async saveStripeSubscription(subscription: KnownStripeSubscription) {
    const { userId, lookupKey, stripeSubscription } = subscription;
    // update features first, features modify are idempotent
    // so there is no need to skip if a subscription already exists.
    // TODO(@forehalo):
    //   we should move the subscription feature updating logic back to payment module,
    //   because quota or feature module themself should not be aware of what payment or subscription is.
    this.event.emit('user.subscription.activated', {
      userId,
      plan: lookupKey.plan,
      recurring: lookupKey.recurring,
    });

    const subscriptionData = this.transformSubscription(subscription);

    // @deprecated backward compatibility
    await this.db.deprecatedUserSubscription.upsert({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
      update: pick(subscriptionData, [
        'status',
        'stripeScheduleId',
        'nextBillAt',
        'canceledAt',
      ]),
      create: {
        userId,
        ...subscriptionData,
      },
    });

    return this.db.subscription.upsert({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
      update: pick(subscriptionData, [
        'status',
        'stripeScheduleId',
        'nextBillAt',
        'canceledAt',
      ]),
      create: {
        targetId: userId,
        ...subscriptionData,
      },
    });
  }

  async deleteStripeSubscription({
    userId,
    lookupKey,
    stripeSubscription,
  }: KnownStripeSubscription) {
    const deleted = await this.db.subscription.deleteMany({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
    });

    // @deprecated backward compatibility
    await this.db.deprecatedUserSubscription.deleteMany({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
    });

    if (deleted.count > 0) {
      this.event.emit('user.subscription.canceled', {
        userId,
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }
  }

  async cancelSubscription(subscription: Subscription) {
    // @deprecated backward compatibility
    await this.db.deprecatedUserSubscription.updateMany({
      where: {
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: {
        canceledAt: new Date(),
        nextBillAt: null,
      },
    });

    return this.db.subscription.update({
      where: {
        // @ts-expect-error checked outside
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: {
        canceledAt: new Date(),
        nextBillAt: null,
      },
    });
  }

  async resumeSubscription(subscription: Subscription) {
    // @deprecated backward compatibility
    await this.db.deprecatedUserSubscription.updateMany({
      where: {
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: {
        canceledAt: null,
        nextBillAt: subscription.end,
      },
    });

    return this.db.subscription.update({
      where: {
        // @ts-expect-error checked outside
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: {
        canceledAt: null,
        nextBillAt: subscription.end,
      },
    });
  }

  async updateSubscriptionRecurring(
    subscription: Subscription,
    recurring: SubscriptionRecurring
  ) {
    // @deprecated backward compatibility
    await this.db.deprecatedUserSubscription.updateMany({
      where: {
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: { recurring },
    });

    return this.db.subscription.update({
      where: {
        // @ts-expect-error checked outside
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: { recurring },
    });
  }

  private async getBuildInCoupon(
    customer: UserStripeCustomer,
    price: KnownStripePrice
  ) {
    const strategyStatus = await this.strategyStatus(customer);

    // onetime price is allowed for checkout
    strategyStatus.onetime = true;

    if (!(await this.isPriceAvailable(price, strategyStatus))) {
      return null;
    }

    let coupon: CouponType | undefined;

    if (price.lookupKey.variant === SubscriptionVariant.EA) {
      if (price.lookupKey.plan === SubscriptionPlan.Pro) {
        coupon = CouponType.ProEarlyAccessOneYearFree;
      } else if (price.lookupKey.plan === SubscriptionPlan.AI) {
        coupon = CouponType.AIEarlyAccessOneYearFree;
      }
    } else if (price.lookupKey.plan === SubscriptionPlan.AI) {
      const { proEarlyAccess, aiSubscribed } = strategyStatus;
      if (proEarlyAccess && !aiSubscribed) {
        coupon = CouponType.ProEarlyAccessAIOneYearFree;
      }
    }

    return coupon;
  }

  async saveInvoice(knownInvoice: KnownStripeInvoice) {
    const { userId, lookupKey, stripeInvoice } = knownInvoice;

    const invoiceData = await this.transformInvoice(knownInvoice);

    // @deprecated backward compatibility
    await this.db.deprecatedUserInvoice.upsert({
      where: {
        stripeInvoiceId: stripeInvoice.id,
      },
      update: omit(invoiceData, 'stripeInvoiceId'),
      create: {
        userId,
        ...invoiceData,
      },
    });

    const invoice = this.db.invoice.upsert({
      where: {
        stripeInvoiceId: stripeInvoice.id,
      },
      update: omit(invoiceData, 'stripeInvoiceId'),
      create: {
        targetId: userId,
        ...invoiceData,
      },
    });

    // onetime and lifetime subscription is a special "subscription" that doesn't get involved with stripe subscription system
    // we track the deals by invoice only.
    if (stripeInvoice.status === 'paid') {
      if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
        await this.saveLifetimeSubscription(knownInvoice);
      } else if (lookupKey.variant === SubscriptionVariant.Onetime) {
        await this.saveOnetimePaymentSubscription(knownInvoice);
      }
    }

    return invoice;
  }

  async saveLifetimeSubscription(
    knownInvoice: KnownStripeInvoice
  ): Promise<Subscription> {
    // cancel previous non-lifetime subscription
    const prevSubscription = await this.db.subscription.findUnique({
      where: {
        targetId_plan: {
          targetId: knownInvoice.userId,
          plan: SubscriptionPlan.Pro,
        },
      },
    });

    let subscription: Subscription;
    if (prevSubscription) {
      if (prevSubscription.stripeSubscriptionId) {
        subscription = await this.db.subscription.update({
          where: {
            id: prevSubscription.id,
          },
          data: {
            stripeScheduleId: null,
            stripeSubscriptionId: null,
            plan: knownInvoice.lookupKey.plan,
            recurring: SubscriptionRecurring.Lifetime,
            start: new Date(),
            end: null,
            status: SubscriptionStatus.Active,
            nextBillAt: null,
          },
        });

        await this.stripe.subscriptions.cancel(
          prevSubscription.stripeSubscriptionId,
          {
            prorate: true,
          }
        );
      } else {
        subscription = prevSubscription;
      }
    } else {
      subscription = await this.db.subscription.create({
        data: {
          targetId: knownInvoice.userId,
          stripeSubscriptionId: null,
          plan: knownInvoice.lookupKey.plan,
          recurring: SubscriptionRecurring.Lifetime,
          start: new Date(),
          end: null,
          status: SubscriptionStatus.Active,
          nextBillAt: null,
        },
      });
    }

    this.event.emit('user.subscription.activated', {
      userId: knownInvoice.userId,
      plan: knownInvoice.lookupKey.plan,
      recurring: SubscriptionRecurring.Lifetime,
    });

    return subscription;
  }

  async saveOnetimePaymentSubscription(
    knownInvoice: KnownStripeInvoice
  ): Promise<Subscription> {
    // TODO(@forehalo): identify whether the invoice has already been redeemed.
    const { userId, lookupKey } = knownInvoice;
    const existingSubscription = await this.db.subscription.findUnique({
      where: {
        targetId_plan: {
          targetId: userId,
          plan: lookupKey.plan,
        },
      },
    });

    // TODO(@forehalo): time helper
    const subscriptionTime =
      (lookupKey.recurring === SubscriptionRecurring.Monthly ? 30 : 365) *
      24 *
      60 *
      60 *
      1000;

    let subscription: Subscription;

    // extends the subscription time if exists
    if (existingSubscription) {
      if (!existingSubscription.end) {
        throw new InternalServerError(
          'Unexpected onetime subscription with no end date'
        );
      }

      const period =
        // expired, reset the period
        existingSubscription.end <= new Date()
          ? {
              start: new Date(),
              end: new Date(Date.now() + subscriptionTime),
            }
          : {
              end: new Date(
                existingSubscription.end.getTime() + subscriptionTime
              ),
            };

      subscription = await this.db.subscription.update({
        where: {
          id: existingSubscription.id,
        },
        data: period,
      });
    } else {
      subscription = await this.db.subscription.create({
        data: {
          targetId: userId,
          stripeSubscriptionId: null,
          ...lookupKey,
          start: new Date(),
          end: new Date(Date.now() + subscriptionTime),
          status: SubscriptionStatus.Active,
          nextBillAt: null,
        },
      });
    }

    this.event.emit('user.subscription.activated', {
      userId,
      plan: lookupKey.plan,
      recurring: lookupKey.recurring,
    });

    return subscription;
  }

  private async autoPrice(lookupKey: LookupKey, strategy: PriceStrategyStatus) {
    // auto select ea variant when available if not specified
    let variant: SubscriptionVariant | null = lookupKey.variant;

    if (!variant) {
      // make the if conditions separated, more readable
      // pro early access
      if (
        lookupKey.plan === SubscriptionPlan.Pro &&
        lookupKey.recurring === SubscriptionRecurring.Yearly &&
        strategy.proEarlyAccess &&
        !strategy.proSubscribed
      ) {
        variant = SubscriptionVariant.EA;
      }

      // ai early access
      if (
        lookupKey.plan === SubscriptionPlan.AI &&
        lookupKey.recurring === SubscriptionRecurring.Yearly &&
        strategy.aiEarlyAccess &&
        !strategy.aiSubscribed
      ) {
        variant = SubscriptionVariant.EA;
      }
    }

    return this.getPrice({
      plan: lookupKey.plan,
      recurring: lookupKey.recurring,
      variant,
    });
  }

  private async isPriceAvailable(
    price: KnownStripePrice,
    strategy: PriceStrategyStatus
  ) {
    if (price.lookupKey.plan === SubscriptionPlan.Pro) {
      return this.isProPriceAvailable(price, strategy);
    }

    if (price.lookupKey.plan === SubscriptionPlan.AI) {
      return this.isAIPriceAvailable(price, strategy);
    }

    return false;
  }

  private async isProPriceAvailable(
    { lookupKey }: KnownStripePrice,
    { proEarlyAccess, proSubscribed, onetime }: PriceStrategyStatus
  ) {
    if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
      return this.runtime.fetch('plugins.payment/showLifetimePrice');
    }

    if (lookupKey.variant === SubscriptionVariant.Onetime) {
      return onetime;
    }

    // no special price for monthly plan
    if (lookupKey.recurring === SubscriptionRecurring.Monthly) {
      return true;
    }

    // show EA price instead of normal price if early access is available
    return proEarlyAccess && !proSubscribed
      ? lookupKey.variant === SubscriptionVariant.EA
      : lookupKey.variant !== SubscriptionVariant.EA;
  }

  private async isAIPriceAvailable(
    { lookupKey }: KnownStripePrice,
    { aiEarlyAccess, aiSubscribed, onetime }: PriceStrategyStatus
  ) {
    // no lifetime price for AI
    if (lookupKey.recurring === SubscriptionRecurring.Lifetime) {
      return false;
    }

    // never show onetime prices
    if (lookupKey.variant === SubscriptionVariant.Onetime) {
      return onetime;
    }

    // show EA price instead of normal price if early access is available
    return aiEarlyAccess && !aiSubscribed
      ? lookupKey.variant === SubscriptionVariant.EA
      : lookupKey.variant !== SubscriptionVariant.EA;
  }

  private async strategyStatus(
    customer: UserStripeCustomer
  ): Promise<PriceStrategyStatus> {
    const proEarlyAccess = await this.feature.isEarlyAccessUser(
      customer.userId,
      EarlyAccessType.App
    );

    const aiEarlyAccess = await this.feature.isEarlyAccessUser(
      customer.userId,
      EarlyAccessType.AI
    );

    // fast pass if the user is not early access for any plan
    if (!proEarlyAccess && !aiEarlyAccess) {
      return {
        proEarlyAccess,
        aiEarlyAccess,
        proSubscribed: false,
        aiSubscribed: false,
        onetime: false,
      };
    }

    let proSubscribed = false;
    let aiSubscribed = false;

    const subscriptions = await this.stripe.subscriptions.list({
      customer: customer.stripeCustomerId,
      status: 'all',
    });

    // if the early access user had early access subscription in the past, but it got canceled or past due,
    // the user will lose the early access privilege
    for (const sub of subscriptions.data) {
      const lookupKey = retriveLookupKeyFromStripeSubscription(sub);
      if (!lookupKey) {
        continue;
      }

      if (sub.status === 'past_due' || sub.status === 'canceled') {
        if (lookupKey.plan === SubscriptionPlan.Pro) {
          proSubscribed = true;
        }

        if (lookupKey.plan === SubscriptionPlan.AI) {
          aiSubscribed = true;
        }
      }
    }

    return {
      proEarlyAccess,
      aiEarlyAccess,
      proSubscribed,
      aiSubscribed,
      onetime: false,
    };
  }
}
