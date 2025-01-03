import type { Slot } from '@blocksuite/global/utils';

import type { Doc } from '../store/index.js';
import type { AssetsManager } from './assets.js';
import type { DraftModel } from './draft.js';
import type { Slice } from './slice.js';
import type {
  BlockSnapshot,
  CollectionInfoSnapshot,
  DocCRUD,
  DocSnapshot,
  SliceSnapshot,
} from './type.js';

export type BeforeImportPayload =
  | {
      snapshot: BlockSnapshot;
      type: 'block';
      parent?: string;
      index?: number;
    }
  | {
      snapshot: SliceSnapshot;
      type: 'slice';
    }
  | {
      snapshot: DocSnapshot;
      type: 'page';
    }
  | {
      snapshot: CollectionInfoSnapshot;
      type: 'info';
    };

export type BeforeExportPayload =
  | {
      model: DraftModel;
      type: 'block';
    }
  | {
      page: Doc;
      type: 'page';
    }
  | {
      slice: Slice;
      type: 'slice';
    }
  | {
      type: 'info';
    };

export type FinalPayload =
  | {
      snapshot: BlockSnapshot;
      type: 'block';
      model: DraftModel;
      parent?: string;
      index?: number;
    }
  | {
      snapshot: DocSnapshot;
      type: 'page';
      page: Doc;
    }
  | {
      snapshot: SliceSnapshot;
      type: 'slice';
      slice: Slice;
    }
  | {
      snapshot: CollectionInfoSnapshot;
      type: 'info';
    };

export type JobSlots = {
  beforeImport: Slot<BeforeImportPayload>;
  afterImport: Slot<FinalPayload>;
  beforeExport: Slot<BeforeExportPayload>;
  afterExport: Slot<FinalPayload>;
};

type JobMiddlewareOptions = {
  assetsManager: AssetsManager;
  slots: JobSlots;
  docCRUD: DocCRUD;
  adapterConfigs: Map<string, string>;
};

export type JobMiddleware = (options: JobMiddlewareOptions) => void;
