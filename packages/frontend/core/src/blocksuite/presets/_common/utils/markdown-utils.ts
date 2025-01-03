import { WorkspaceImpl } from '@affine/core/modules/workspace/impl/workspace';
import type {
  EditorHost,
  TextRangePoint,
  TextSelection,
} from '@blocksuite/affine/block-std';
import {
  defaultImageProxyMiddleware,
  embedSyncedDocMiddleware,
  MarkdownAdapter,
  MixTextAdapter,
  pasteMiddleware,
  PlainTextAdapter,
  titleMiddleware,
} from '@blocksuite/affine/blocks';
import type { ServiceProvider } from '@blocksuite/affine/global/di';
import { assertExists } from '@blocksuite/affine/global/utils';
import type {
  BlockModel,
  BlockSnapshot,
  Doc,
  DraftModel,
  JobMiddleware,
  Schema,
  Slice,
  SliceSnapshot,
} from '@blocksuite/affine/store';
import { Job } from '@blocksuite/affine/store';

const updateSnapshotText = (
  point: TextRangePoint,
  snapshot: BlockSnapshot,
  model: DraftModel
) => {
  const { index, length } = point;
  if (!snapshot.props.text || length === 0) {
    return;
  }
  (snapshot.props.text as Record<string, unknown>).delta =
    model.text?.sliceToDelta(index, length + index);
};

function processSnapshot(
  snapshot: BlockSnapshot,
  text: TextSelection,
  host: EditorHost
) {
  const model = host.doc.getBlockById(snapshot.id);
  assertExists(model);

  const modelId = model.id;
  if (text.from.blockId === modelId) {
    updateSnapshotText(text.from, snapshot, model);
  }
  if (text.to && text.to.blockId === modelId) {
    updateSnapshotText(text.to, snapshot, model);
  }

  // If the snapshot has children, handle them recursively
  snapshot.children.forEach(childSnapshot =>
    processSnapshot(childSnapshot, text, host)
  );
}

/**
 * Processes the text in the given snapshot if there is a text selection.
 * Only the selected portion of the snapshot will be processed.
 */
function processTextInSnapshot(snapshot: SliceSnapshot, host: EditorHost) {
  const { content } = snapshot;
  const text = host.selection.find('text');
  if (!content.length || !text) return;

  content.forEach(snapshot => processSnapshot(snapshot, text, host));
}

export async function getContentFromSlice(
  host: EditorHost,
  slice: Slice,
  type: 'markdown' | 'plain-text' = 'markdown'
) {
  const job = new Job({
    schema: host.std.doc.collection.schema,
    blobCRUD: host.std.doc.collection.blobSync,
    docCRUD: {
      create: (id: string) => host.std.doc.collection.createDoc({ id }),
      get: (id: string) => host.std.doc.collection.getDoc(id),
      delete: (id: string) => host.std.doc.collection.removeDoc(id),
    },
    middlewares: [
      titleMiddleware(host.std.doc.collection.meta.docMetas),
      embedSyncedDocMiddleware('content'),
    ],
  });
  const snapshot = job.sliceToSnapshot(slice);
  if (!snapshot) {
    return '';
  }
  processTextInSnapshot(snapshot, host);
  const adapter =
    type === 'markdown'
      ? new MarkdownAdapter(job, host.std.provider)
      : new PlainTextAdapter(job, host.std.provider);
  const content = await adapter.fromSliceSnapshot({
    snapshot,
    assets: job.assetsManager,
  });
  return content.file;
}

export async function getPlainTextFromSlice(host: EditorHost, slice: Slice) {
  const job = new Job({
    schema: host.std.doc.collection.schema,
    blobCRUD: host.std.doc.collection.blobSync,
    docCRUD: {
      create: (id: string) => host.std.doc.collection.createDoc({ id }),
      get: (id: string) => host.std.doc.collection.getDoc(id),
      delete: (id: string) => host.std.doc.collection.removeDoc(id),
    },
    middlewares: [titleMiddleware(host.std.doc.collection.meta.docMetas)],
  });
  const snapshot = job.sliceToSnapshot(slice);
  if (!snapshot) {
    return '';
  }
  processTextInSnapshot(snapshot, host);
  const plainTextAdapter = new PlainTextAdapter(job, host.std.provider);
  const plainText = await plainTextAdapter.fromSliceSnapshot({
    snapshot,
    assets: job.assetsManager,
  });
  return plainText.file;
}

export const markdownToSnapshot = async (
  markdown: string,
  host: EditorHost
) => {
  const job = new Job({
    schema: host.std.doc.collection.schema,
    blobCRUD: host.std.doc.collection.blobSync,
    docCRUD: {
      create: (id: string) => host.std.doc.collection.createDoc({ id }),
      get: (id: string) => host.std.doc.collection.getDoc(id),
      delete: (id: string) => host.std.doc.collection.removeDoc(id),
    },
    middlewares: [defaultImageProxyMiddleware, pasteMiddleware(host.std)],
  });
  const markdownAdapter = new MixTextAdapter(job, host.std.provider);
  const payload = {
    file: markdown,
    assets: job.assetsManager,
    workspaceId: host.std.doc.collection.id,
    pageId: host.std.doc.id,
  };

  const snapshot = await markdownAdapter.toSliceSnapshot(payload);
  assertExists(snapshot, 'import markdown failed, expected to get a snapshot');

  return {
    snapshot,
    job,
  };
};

export async function insertFromMarkdown(
  host: EditorHost,
  markdown: string,
  doc: Doc,
  parent?: string,
  index?: number
) {
  const { snapshot, job } = await markdownToSnapshot(markdown, host);

  const snapshots = snapshot.content.flatMap(x => x.children);

  const models: BlockModel[] = [];
  for (let i = 0; i < snapshots.length; i++) {
    const blockSnapshot = snapshots[i];
    const model = await job.snapshotToBlock(
      blockSnapshot,
      doc,
      parent,
      (index ?? 0) + i
    );
    if (model) {
      models.push(model);
    }
  }

  return models;
}

// FIXME: replace when selection is block is buggy right not
export async function replaceFromMarkdown(
  host: EditorHost,
  markdown: string,
  parent?: string,
  index?: number
) {
  const { snapshot, job } = await markdownToSnapshot(markdown, host);
  await job.snapshotToSlice(snapshot, host.doc, parent, index);
}

export async function markDownToDoc(
  provider: ServiceProvider,
  schema: Schema,
  answer: string,
  additionalMiddlewares?: JobMiddleware[]
) {
  // Should not create a new doc in the original collection
  const collection = new WorkspaceImpl({
    schema,
  });
  collection.meta.initialize();
  const middlewares = [defaultImageProxyMiddleware];
  if (additionalMiddlewares) {
    middlewares.push(...additionalMiddlewares);
  }
  const job = new Job({
    schema: collection.schema,
    blobCRUD: collection.blobSync,
    docCRUD: {
      create: (id: string) => collection.createDoc({ id }),
      get: (id: string) => collection.getDoc(id),
      delete: (id: string) => collection.removeDoc(id),
    },
    middlewares,
  });
  const mdAdapter = new MarkdownAdapter(job, provider);
  const doc = await mdAdapter.toDoc({
    file: answer,
    assets: job.assetsManager,
  });
  if (!doc) {
    console.error('Failed to convert markdown to doc');
  }
  return doc as Doc;
}
