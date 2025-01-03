import type { Attributes } from '@opentelemetry/api';

import { type KnownMetricScopes, metrics } from './metrics';

/**
 * Decorator for measuring the call time, record call count and if is throw of a function call
 * @param scope metric scope
 * @param name metric event name
 * @param attrs attributes
 * @returns
 */
export const CallMetric = (
  scope: KnownMetricScopes,
  name: string,
  record?: { timer?: boolean; count?: boolean; error?: boolean },
  attrs?: Attributes
): MethodDecorator => {
  // @ts-expect-error allow
  return (
    _target,
    _key,
    desc: TypedPropertyDescriptor<(...args: any[]) => any>
  ) => {
    const originalMethod = desc.value;
    if (!originalMethod) {
      return desc;
    }

    const timer = metrics[scope].histogram('function_timer', {
      description: 'function call time costs',
      unit: 'ms',
    });
    const count = metrics[scope].counter('function_calls', {
      description: 'function call counter',
    });

    desc.value = async function (...args: any[]) {
      const start = Date.now();
      let error = false;

      const end = () => {
        timer?.record(Date.now() - start, { ...attrs, name, error });
      };

      try {
        if (!record || !!record.count) {
          count.add(1, attrs);
        }
        return await originalMethod.apply(this, args);
      } catch (err) {
        if (!record || !!record.error) {
          error = true;
        }
        throw err;
      } finally {
        count.add(1, { ...attrs, name, error });
        if (!record || !!record.timer) {
          end();
        }
      }
    };

    return desc;
  };
};
