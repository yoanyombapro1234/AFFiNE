import {
  BlockViewExtension,
  CommandExtension,
  type ExtensionType,
  FlavourExtension,
  WidgetViewMapExtension,
} from '@blocksuite/block-std';
import { literal } from 'lit/static-html.js';

import { commands } from './commands.js';

export const PageSurfaceRefBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:surface-ref'),
  CommandExtension(commands),
  BlockViewExtension('affine:surface-ref', literal`affine-surface-ref`),
  WidgetViewMapExtension('affine:surface-ref', {
    surfaceToolbar: literal`affine-surface-ref-toolbar`,
  }),
];

export const EdgelessSurfaceRefBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:surface-ref'),
  BlockViewExtension(
    'affine:surface-ref',
    literal`affine-edgeless-surface-ref`
  ),
];
