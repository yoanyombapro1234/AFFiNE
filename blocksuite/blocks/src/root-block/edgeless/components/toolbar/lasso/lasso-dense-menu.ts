import { menu } from '@blocksuite/affine-components/context-menu';
import {
  LassoFreeHandIcon,
  LassoPolygonalIcon,
} from '@blocksuite/affine-components/icons';

import { LassoMode } from '../../../../../_common/types.js';
import type { DenseMenuBuilder } from '../common/type.js';

export const buildLassoDenseMenu: DenseMenuBuilder = edgeless => {
  // TODO: active state
  // const prevMode =
  //   edgeless.service.editPropsStore.getLastProps('lasso').mode ??
  //   LassoMode.FreeHand;

  const isActive = edgeless.gfx.tool.currentToolName$.peek() === 'lasso';

  const createSelect = (mode: LassoMode) => () => {
    edgeless.gfx.tool.setTool('lasso', { mode });
  };

  return menu.subMenu({
    name: 'Lasso',
    prefix: LassoFreeHandIcon,
    select: createSelect(LassoMode.FreeHand),
    isSelected: isActive,
    options: {
      items: [
        menu.action({
          prefix: LassoFreeHandIcon,
          name: 'Free',
          select: createSelect(LassoMode.FreeHand),
          // isSelected: isActive && prevMode === LassoMode.FreeHand,
        }),
        menu.action({
          prefix: LassoPolygonalIcon,
          name: 'Polygonal',
          select: createSelect(LassoMode.Polygonal),
          // isSelected: isActive && prevMode === LassoMode.Polygonal,
        }),
      ],
    },
  });
};