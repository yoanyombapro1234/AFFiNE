import type { EditorHost } from '@blocksuite/block-std';
import type { TestUtils } from '@blocksuite/blocks';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { BlockSchema, Doc, DocCollection, Job } from '@blocksuite/store';
import type { z } from 'zod';
import type * as Y from 'yjs';

declare global {
  type HTMLTemplate = [
    string,
    Record<string, unknown>,
    ...(HTMLTemplate | string)[],
  ];

  interface Window {
    editor: AffineEditorContainer;
    doc: Doc;
    collection: DocCollection;
    blockSchemas: z.infer<typeof BlockSchema>[];
    job: Job;
    Y: typeof Y;
    std: typeof std;
    testUtils: TestUtils;
    host: EditorHost;
    testWorker: Worker;

    wsProvider: ReturnType<typeof setupBroadcastProvider>;
    bcProvider: ReturnType<typeof setupBroadcastProvider>;

    devtoolsFormatters: {
      header: (obj: unknown, config: unknown) => null | HTMLTemplate;
      hasBody: (obj: unknown, config: unknown) => boolean | null;
      body: (obj: unknown, config: unknown) => null | HTMLTemplate;
    }[];
  }
}
