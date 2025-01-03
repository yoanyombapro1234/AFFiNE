import { z } from 'zod';

import type { Doc } from '../store/doc/doc.js';
import type { DocMeta, DocsPropertiesMeta } from '../store/workspace.js';

export type BlockSnapshot = {
  type: 'block';
  id: string;
  flavour: string;
  version?: number;
  props: Record<string, unknown>;
  children: BlockSnapshot[];
};

export const BlockSnapshotSchema: z.ZodType<BlockSnapshot> = z.object({
  type: z.literal('block'),
  id: z.string(),
  flavour: z.string(),
  version: z.number().optional(),
  props: z.record(z.unknown()),
  children: z.lazy(() => BlockSnapshotSchema.array()),
});

export type SliceSnapshot = {
  type: 'slice';
  content: BlockSnapshot[];
  workspaceId: string;
  pageId: string;
};

export const SliceSnapshotSchema: z.ZodType<SliceSnapshot> = z.object({
  type: z.literal('slice'),
  content: BlockSnapshotSchema.array(),
  workspaceId: z.string(),
  pageId: z.string(),
});

export type CollectionInfoSnapshot = {
  id: string;
  type: 'info';
  properties: DocsPropertiesMeta;
};

export const CollectionInfoSnapshotSchema: z.ZodType<CollectionInfoSnapshot> =
  z.object({
    id: z.string(),
    type: z.literal('info'),
    properties: z.record(z.any()),
  });

export type DocSnapshot = {
  type: 'page';
  meta: DocMeta;
  blocks: BlockSnapshot;
};

const DocMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  createDate: z.number(),
  tags: z.array(z.string()),
});

export const DocSnapshotSchema: z.ZodType<DocSnapshot> = z.object({
  type: z.literal('page'),
  meta: DocMetaSchema,
  blocks: BlockSnapshotSchema,
});

export interface BlobCRUD {
  get: (key: string) => Promise<Blob | null> | Blob | null;
  set: (key: string, value: Blob) => Promise<string> | string;
  delete: (key: string) => Promise<void> | void;
  list: () => Promise<string[]> | string[];
}

export interface DocCRUD {
  create: (id: string) => Doc;
  get: (id: string) => Doc | null;
  delete: (id: string) => void;
}
