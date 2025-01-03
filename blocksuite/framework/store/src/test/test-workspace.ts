import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import type { BlockSuiteFlags } from '@blocksuite/global/types';
import { NoopLogger, Slot } from '@blocksuite/global/utils';
import {
  AwarenessEngine,
  type AwarenessSource,
  BlobEngine,
  type BlobSource,
  DocEngine,
  type DocSource,
  MemoryBlobSource,
  NoopDocSource,
} from '@blocksuite/sync';
import clonedeep from 'lodash.clonedeep';
import merge from 'lodash.merge';
import { Awareness } from 'y-protocols/awareness.js';

import type { Schema } from '../schema/index.js';
import {
  BlockCollection,
  type CreateDocOptions,
  type Doc,
  DocCollectionMeta,
  type GetDocOptions,
  type Workspace,
} from '../store/index.js';
import { type IdGenerator, nanoid } from '../utils/id-generator.js';
import {
  AwarenessStore,
  BlockSuiteDoc,
  type RawAwarenessState,
} from '../yjs/index.js';

export type DocCollectionOptions = {
  schema: Schema;
  id?: string;
  idGenerator?: IdGenerator;
  defaultFlags?: Partial<BlockSuiteFlags>;
  docSources?: {
    main: DocSource;
    shadows?: DocSource[];
  };
  blobSources?: {
    main: BlobSource;
    shadows?: BlobSource[];
  };
  awarenessSources?: AwarenessSource[];
};

const FLAGS_PRESET = {
  enable_synced_doc_block: false,
  enable_pie_menu: false,
  enable_database_number_formatting: false,
  enable_database_attachment_note: false,
  enable_database_full_width: false,
  enable_block_query: false,
  enable_lasso_tool: false,
  enable_edgeless_text: true,
  enable_ai_onboarding: false,
  enable_ai_chat_block: false,
  enable_color_picker: false,
  enable_mind_map_import: false,
  enable_advanced_block_visibility: false,
  enable_shape_shadow_blur: false,
  enable_mobile_keyboard_toolbar: false,
  enable_mobile_linked_doc_menu: false,
  readonly: {},
} satisfies BlockSuiteFlags;

/**
 * Test only
 * Do not use this in production
 */
export class TestWorkspace implements Workspace {
  protected readonly _schema: Schema;

  readonly awarenessStore: AwarenessStore;

  readonly awarenessSync: AwarenessEngine;

  readonly blobSync: BlobEngine;

  readonly blockCollections = new Map<string, BlockCollection>();

  readonly doc: BlockSuiteDoc;

  readonly docSync: DocEngine;

  readonly id: string;

  readonly idGenerator: IdGenerator;

  meta: DocCollectionMeta;

  slots = {
    docListUpdated: new Slot(),
    docRemoved: new Slot<string>(),
    docCreated: new Slot<string>(),
  };

  get docs() {
    return this.blockCollections;
  }

  get schema() {
    return this._schema;
  }

  constructor({
    id,
    schema,
    idGenerator,
    defaultFlags,
    awarenessSources = [],
    docSources = {
      main: new NoopDocSource(),
    },
    blobSources = {
      main: new MemoryBlobSource(),
    },
  }: DocCollectionOptions) {
    this._schema = schema;

    this.id = id || '';
    this.doc = new BlockSuiteDoc({ guid: id });
    this.awarenessStore = new AwarenessStore(
      new Awareness<RawAwarenessState>(this.doc),
      merge(clonedeep(FLAGS_PRESET), defaultFlags)
    );

    const logger = new NoopLogger();

    this.awarenessSync = new AwarenessEngine(
      this.awarenessStore.awareness,
      awarenessSources
    );
    this.docSync = new DocEngine(
      this.doc,
      docSources.main,
      docSources.shadows ?? [],
      logger
    );
    this.blobSync = new BlobEngine(
      blobSources.main,
      blobSources.shadows ?? [],
      logger
    );

    this.idGenerator = idGenerator ?? nanoid;

    this.meta = new DocCollectionMeta(this.doc);
    this._bindDocMetaEvents();
  }

  private _bindDocMetaEvents() {
    this.meta.docMetaAdded.on(docId => {
      const doc = new BlockCollection({
        id: docId,
        collection: this,
        doc: this.doc,
        awarenessStore: this.awarenessStore,
        idGenerator: this.idGenerator,
      });
      this.blockCollections.set(doc.id, doc);
    });

    this.meta.docMetaUpdated.on(() => this.slots.docListUpdated.emit());

    this.meta.docMetaRemoved.on(id => {
      const space = this.getBlockCollection(id);
      if (!space) return;
      this.blockCollections.delete(id);
      space.remove();
      this.slots.docRemoved.emit(id);
    });
  }

  private _hasDoc(docId: string) {
    return this.docs.has(docId);
  }

  /**
   * Verify that all data has been successfully saved to the primary storage.
   * Return true if the data transfer is complete and it is secure to terminate the synchronization operation.
   */
  canGracefulStop() {
    this.docSync.canGracefulStop();
  }

  /**
   * By default, only an empty doc will be created.
   * If the `init` parameter is passed, a `surface`, `note`, and `paragraph` block
   * will be created in the doc simultaneously.
   */
  createDoc(options: CreateDocOptions = {}) {
    const { id: docId = this.idGenerator(), query, readonly } = options;
    if (this._hasDoc(docId)) {
      throw new BlockSuiteError(
        ErrorCode.DocCollectionError,
        'doc already exists'
      );
    }

    this.meta.addDocMeta({
      id: docId,
      title: '',
      createDate: Date.now(),
      tags: [],
    });
    this.slots.docCreated.emit(docId);
    return this.getDoc(docId, { query, readonly }) as Doc;
  }

  dispose() {
    this.awarenessStore.destroy();
  }

  /**
   * Terminate the data sync process forcefully, which may cause data loss.
   * It is advised to invoke `canGracefulStop` before calling this method.
   */
  forceStop() {
    this.docSync.forceStop();
    this.blobSync.stop();
    this.awarenessSync.disconnect();
  }

  getBlockCollection(docId: string): BlockCollection | null {
    const space = this.docs.get(docId) as BlockCollection | undefined;
    return space ?? null;
  }

  getDoc(docId: string, options?: GetDocOptions): Doc | null {
    const collection = this.getBlockCollection(docId);
    return collection?.getDoc(options) ?? null;
  }

  removeDoc(docId: string) {
    const docMeta = this.meta.getDocMeta(docId);
    if (!docMeta) {
      throw new BlockSuiteError(
        ErrorCode.DocCollectionError,
        `doc meta not found: ${docId}`
      );
    }

    const blockCollection = this.getBlockCollection(docId);
    if (!blockCollection) return;

    blockCollection.dispose();
    this.meta.removeDocMeta(docId);
    this.blockCollections.delete(docId);
  }

  /**
   * Start the data sync process
   */
  start() {
    this.docSync.start();
    this.blobSync.start();
    this.awarenessSync.connect();
  }

  /**
   * Wait for all data has been successfully saved to the primary storage.
   */
  waitForGracefulStop(abort?: AbortSignal) {
    return this.docSync.waitForGracefulStop(abort);
  }

  waitForSynced() {
    return this.docSync.waitForSynced();
  }
}
