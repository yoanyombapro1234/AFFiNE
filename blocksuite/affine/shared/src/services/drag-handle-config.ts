import {
  type BlockStdScope,
  Extension,
  StdIdentifier,
} from '@blocksuite/block-std';
import { type Container, createIdentifier } from '@blocksuite/global/di';
import { Slice, type SliceSnapshot } from '@blocksuite/store';

export const DndApiExtensionIdentifier = createIdentifier<DNDAPIExtension>(
  'AffineDndApiIdentifier'
);

export class DNDAPIExtension extends Extension {
  mimeType = 'application/x-blocksuite-dnd';

  constructor(readonly std: BlockStdScope) {
    super();
  }

  static override setup(di: Container) {
    di.add(this, [StdIdentifier]);

    di.addImpl(DndApiExtensionIdentifier, provider => provider.get(this));
  }

  decodeSnapshot(data: string): SliceSnapshot {
    return JSON.parse(decodeURIComponent(data));
  }

  encodeSnapshot(json: SliceSnapshot) {
    const snapshot = JSON.stringify(json);
    return encodeURIComponent(snapshot);
  }

  fromEntity(options: {
    docId: string;
    flavour?: string;
    blockId?: string;
  }): SliceSnapshot | null {
    const { docId, flavour = 'affine:embed-linked-doc', blockId } = options;

    const slice = Slice.fromModels(this.std.doc, []);
    const job = this.std.getJob();
    const snapshot = job.sliceToSnapshot(slice);
    if (!snapshot) {
      console.error('Failed to convert slice to snapshot');
      return null;
    }
    const props = {
      ...(blockId ? { blockId } : {}),
      pageId: docId,
    };
    return {
      ...snapshot,
      content: [
        {
          id: this.std.collection.idGenerator(),
          type: 'block',
          flavour,
          props,
          children: [],
        },
      ],
    };
  }
}
