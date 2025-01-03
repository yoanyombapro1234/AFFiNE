import { Scope } from '@toeverything/infra';

import type { WorkspaceOpenOptions } from '../open-options';
import type { WorkspaceEngineProvider } from '../providers/flavour';

export class WorkspaceScope extends Scope<{
  openOptions: WorkspaceOpenOptions;
  engineProvider: WorkspaceEngineProvider;
}> {}
