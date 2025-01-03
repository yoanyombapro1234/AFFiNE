import { BookmarkBlockMarkdownAdapterExtension } from '@blocksuite/affine-block-bookmark';
import { CodeBlockMarkdownAdapterExtension } from '@blocksuite/affine-block-code';
import { DatabaseBlockMarkdownAdapterExtension } from '@blocksuite/affine-block-database';
import { DividerBlockMarkdownAdapterExtension } from '@blocksuite/affine-block-divider';
import {
  EmbedFigmaMarkdownAdapterExtension,
  EmbedGithubMarkdownAdapterExtension,
  EmbedLinkedDocMarkdownAdapterExtension,
  EmbedLoomMarkdownAdapterExtension,
  EmbedSyncedDocMarkdownAdapterExtension,
  EmbedYoutubeMarkdownAdapterExtension,
} from '@blocksuite/affine-block-embed';
import { ImageBlockMarkdownAdapterExtension } from '@blocksuite/affine-block-image';
import { LatexBlockMarkdownAdapterExtension } from '@blocksuite/affine-block-latex';
import { ListBlockMarkdownAdapterExtension } from '@blocksuite/affine-block-list';
import { ParagraphBlockMarkdownAdapterExtension } from '@blocksuite/affine-block-paragraph';

import { RootBlockMarkdownAdapterExtension } from '../../../root-block/adapters/markdown.js';

export const defaultBlockMarkdownAdapterMatchers = [
  EmbedFigmaMarkdownAdapterExtension,
  EmbedGithubMarkdownAdapterExtension,
  EmbedLinkedDocMarkdownAdapterExtension,
  EmbedLoomMarkdownAdapterExtension,
  EmbedSyncedDocMarkdownAdapterExtension,
  EmbedYoutubeMarkdownAdapterExtension,
  ListBlockMarkdownAdapterExtension,
  ParagraphBlockMarkdownAdapterExtension,
  BookmarkBlockMarkdownAdapterExtension,
  CodeBlockMarkdownAdapterExtension,
  DatabaseBlockMarkdownAdapterExtension,
  DividerBlockMarkdownAdapterExtension,
  ImageBlockMarkdownAdapterExtension,
  LatexBlockMarkdownAdapterExtension,
  RootBlockMarkdownAdapterExtension,
];
