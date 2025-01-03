import { AffineSchemas } from '@blocksuite/blocks';
import type { BlockSuiteFlags } from '@blocksuite/global/types';
import { Job, nanoid, Schema, Text } from '@blocksuite/store';
import {
  type DocCollectionOptions,
  TestWorkspace,
} from '@blocksuite/store/test';
import {
  BroadcastChannelAwarenessSource,
  BroadcastChannelDocSource,
  IndexedDBBlobSource,
  IndexedDBDocSource,
} from '@blocksuite/sync';
import * as Y from 'yjs';

import { WebSocketAwarenessSource } from '../../_common/sync/websocket/awareness';
import { WebSocketDocSource } from '../../_common/sync/websocket/doc';

const BASE_WEBSOCKET_URL = new URL(import.meta.env.PLAYGROUND_WS);

export async function createDefaultDocCollection() {
  const idGenerator = nanoid;
  const schema = new Schema();
  schema.register(AffineSchemas);

  const params = new URLSearchParams(location.search);
  let docSources: DocCollectionOptions['docSources'] = {
    main: new IndexedDBDocSource(),
  };
  let awarenessSources: DocCollectionOptions['awarenessSources'];
  const room = params.get('room');
  if (room) {
    const ws = new WebSocket(new URL(`/room/${room}`, BASE_WEBSOCKET_URL));
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    })
      .then(() => {
        docSources = {
          main: new IndexedDBDocSource(),
          shadows: [new WebSocketDocSource(ws)],
        };
        awarenessSources = [new WebSocketAwarenessSource(ws)];
      })
      .catch(() => {
        docSources = {
          main: new IndexedDBDocSource(),
          shadows: [new BroadcastChannelDocSource()],
        };
        awarenessSources = [
          new BroadcastChannelAwarenessSource('collabPlayground'),
        ];
      });
  }

  const flags: Partial<BlockSuiteFlags> = Object.fromEntries(
    [...params.entries()]
      .filter(([key]) => key.startsWith('enable_'))
      .map(([k, v]) => [k, v === 'true'])
  );

  const options: DocCollectionOptions = {
    id: 'collabPlayground',
    schema,
    idGenerator,
    blobSources: {
      main: new IndexedDBBlobSource('collabPlayground'),
    },
    docSources,
    awarenessSources,
    defaultFlags: {
      enable_synced_doc_block: true,
      enable_pie_menu: true,
      enable_lasso_tool: true,
      enable_color_picker: true,
      ...flags,
    },
  };
  const collection = new TestWorkspace(options);
  collection.start();

  // debug info
  window.collection = collection;
  window.blockSchemas = AffineSchemas;
  window.job = new Job({
    schema: collection.schema,
    blobCRUD: collection.blobSync,
    docCRUD: {
      create: (id: string) => collection.createDoc({ id }),
      get: (id: string) => collection.getDoc(id),
      delete: (id: string) => collection.removeDoc(id),
    },
  });
  window.Y = Y;

  return collection;
}

export async function initDefaultDocCollection(collection: TestWorkspace) {
  const params = new URLSearchParams(location.search);

  await collection.waitForSynced();

  const shouldInit = collection.docs.size === 0 && !params.get('room');
  if (shouldInit) {
    collection.meta.initialize();
    const doc = collection.createDoc({ id: 'doc:home' });
    doc.load();
    const rootId = doc.addBlock('affine:page', {
      title: new Text(),
    });
    doc.addBlock('affine:surface', {}, rootId);
    doc.resetHistory();
  }
}
