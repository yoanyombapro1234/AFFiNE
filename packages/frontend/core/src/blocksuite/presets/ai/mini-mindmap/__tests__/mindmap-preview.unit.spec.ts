import {
  defaultBlockMarkdownAdapterMatchers,
  inlineDeltaToMarkdownAdapterMatchers,
  markdownInlineToDeltaMatchers,
} from '@blocksuite/affine/blocks';
import { Container } from '@blocksuite/affine/global/di';
import { Schema } from '@blocksuite/store';
import { TestWorkspace } from '@blocksuite/store/test';
import { describe, expect, test } from 'vitest';

import { markdownToMindmap } from '../mindmap-preview.js';

const container = new Container();
[
  ...markdownInlineToDeltaMatchers,
  ...defaultBlockMarkdownAdapterMatchers,
  ...inlineDeltaToMarkdownAdapterMatchers,
].forEach(ext => {
  ext.setup(container);
});
const provider = container.provider();

describe('markdownToMindmap: convert markdown list to a mind map tree', () => {
  test('basic case', () => {
    const markdown = `
- Text A
  - Text B
    - Text C
  - Text D
    - Text E
`;
    const collection = new TestWorkspace({ schema: new Schema() });
    collection.meta.initialize();
    const doc = collection.createDoc();
    const nodes = markdownToMindmap(markdown, doc, provider);

    expect(nodes).toEqual({
      text: 'Text A',
      children: [
        {
          text: 'Text B',
          children: [
            {
              text: 'Text C',
              children: [],
            },
          ],
        },
        {
          text: 'Text D',
          children: [
            {
              text: 'Text E',
              children: [],
            },
          ],
        },
      ],
    });
  });

  test('basic case with different indent', () => {
    const markdown = `
- Text A
    - Text B
        - Text C
    - Text D
        - Text E
`;
    const collection = new TestWorkspace({ schema: new Schema() });
    collection.meta.initialize();
    const doc = collection.createDoc();
    const nodes = markdownToMindmap(markdown, doc, provider);

    expect(nodes).toEqual({
      text: 'Text A',
      children: [
        {
          text: 'Text B',
          children: [
            {
              text: 'Text C',
              children: [],
            },
          ],
        },
        {
          text: 'Text D',
          children: [
            {
              text: 'Text E',
              children: [],
            },
          ],
        },
      ],
    });
  });

  test('empty case', () => {
    const markdown = '';
    const collection = new TestWorkspace({ schema: new Schema() });
    collection.meta.initialize();
    const doc = collection.createDoc();
    const nodes = markdownToMindmap(markdown, doc, provider);

    expect(nodes).toEqual(null);
  });
});
