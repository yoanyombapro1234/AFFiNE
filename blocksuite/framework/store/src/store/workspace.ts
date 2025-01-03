import type { Slot } from '@blocksuite/global/utils';
import type { BlobEngine, DocEngine } from '@blocksuite/sync';

import type { Schema } from '../schema/schema.js';
import type { IdGenerator } from '../utils/id-generator.js';
import type { AwarenessStore } from '../yjs/awareness.js';
import type { BlockSuiteDoc } from '../yjs/doc.js';
import type { Doc } from './doc/doc.js';
import type { BlockCollection } from './doc/index.js';
import type { Query } from './doc/query.js';

export type Tag = {
  id: string;
  value: string;
  color: string;
};
export type DocsPropertiesMeta = {
  tags?: {
    options: Tag[];
  };
};
export interface DocMeta {
  id: string;
  title: string;
  tags: string[];
  createDate: number;
  updatedDate?: number;
  favorite?: boolean;
}

export type GetDocOptions = {
  query?: Query;
  readonly?: boolean;
};
export type CreateDocOptions = GetDocOptions & {
  id?: string;
};

export interface WorkspaceMeta {
  get docMetas(): DocMeta[];

  getDocMeta(id: string): DocMeta | undefined;
  setDocMeta(id: string, props: Partial<DocMeta>): void;
  removeDocMeta(id: string): void;

  get properties(): DocsPropertiesMeta;
  setProperties(meta: DocsPropertiesMeta): void;

  get avatar(): string | undefined;
  setAvatar(avatar: string): void;

  get name(): string | undefined;
  setName(name: string): void;

  commonFieldsUpdated: Slot;

  hasVersion: boolean;
  writeVersion(workspace: Workspace): void;
  get docs(): unknown[] | undefined;
  initialize(): void;
}

export interface Workspace {
  readonly id: string;
  readonly meta: WorkspaceMeta;
  readonly idGenerator: IdGenerator;
  readonly docSync: DocEngine;
  readonly blobSync: BlobEngine;
  readonly awarenessStore: AwarenessStore;

  get schema(): Schema;
  get doc(): BlockSuiteDoc;
  get docs(): Map<string, BlockCollection>;

  slots: {
    docListUpdated: Slot;
    docCreated: Slot<string>;
    docRemoved: Slot<string>;
  };

  createDoc(options?: CreateDocOptions): Doc;
  getDoc(docId: string, options?: GetDocOptions): Doc | null;
  removeDoc(docId: string): void;

  dispose(): void;
}

export interface StackItem {
  meta: Map<'selection-state', unknown>;
}
