import { EditPropsStore } from '@blocksuite/affine-shared/services';
import {
  type BlockStdScope,
  Extension,
  StdIdentifier,
} from '@blocksuite/block-std';
import { GfxControllerIdentifier } from '@blocksuite/block-std/gfx';
import { type Container, createIdentifier } from '@blocksuite/global/di';
import type { BlockModel } from '@blocksuite/store';

import type { SurfaceBlockModel } from '../surface-model';
import { getLastPropsKey } from '../utils/get-last-props-key';
import { isConnectable, isNoteBlock } from './query';

export const EdgelessCRUDIdentifier = createIdentifier<EdgelessCRUDExtension>(
  'AffineEdgelessCrudService'
);

export class EdgelessCRUDExtension extends Extension {
  constructor(readonly std: BlockStdScope) {
    super();
  }

  static override setup(di: Container) {
    di.add(this, [StdIdentifier]);
    di.addImpl(EdgelessCRUDIdentifier, provider => provider.get(this));
  }

  private get _gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  private get _surface() {
    return this._gfx.surface as SurfaceBlockModel | null;
  }

  deleteElements = (elements: BlockSuite.EdgelessModel[]) => {
    const surface = this._surface;
    if (!surface) {
      console.error('surface is not initialized');
      return;
    }

    const gfx = this.std.get(GfxControllerIdentifier);
    const set = new Set(elements);
    elements.forEach(element => {
      if (isConnectable(element)) {
        const connectors = surface.getConnectors(element.id);
        connectors.forEach(connector => set.add(connector));
      }
    });

    set.forEach(element => {
      if (isNoteBlock(element)) {
        const children = gfx.doc.root?.children ?? [];
        if (children.length > 1) {
          gfx.doc.deleteBlock(element);
        }
      } else {
        gfx.deleteElement(element.id);
      }
    });
  };

  addBlock = (
    flavour: BlockSuite.EdgelessModelKeys | string,
    props: Record<string, unknown>,
    parentId?: string | BlockModel,
    parentIndex?: number
  ) => {
    const gfx = this.std.get(GfxControllerIdentifier);
    const key = getLastPropsKey(flavour as BlockSuite.EdgelessModelKeys, props);
    if (key) {
      props = this.std.get(EditPropsStore).applyLastProps(key, props);
    }

    const nProps = {
      ...props,
      index: gfx.layer.generateIndex(),
    };

    return this.std.doc.addBlock(
      flavour as never,
      nProps,
      parentId,
      parentIndex
    );
  };

  addElement = <T extends Record<string, unknown>>(type: string, props: T) => {
    const surface = this._surface;
    if (!surface) {
      console.error('surface is not initialized');
      return;
    }

    const gfx = this.std.get(GfxControllerIdentifier);
    const key = getLastPropsKey(type as BlockSuite.EdgelessModelKeys, props);
    if (key) {
      props = this.std.get(EditPropsStore).applyLastProps(key, props) as T;
    }

    const nProps = {
      ...props,
      type,
      index: props.index ?? gfx.layer.generateIndex(),
    };

    return surface.addElement(nProps);
  };

  updateElement = (id: string, props: Record<string, unknown>) => {
    const surface = this._surface;
    if (!surface) {
      console.error('surface is not initialized');
      return;
    }

    const element = this._surface.getElementById(id);
    if (element) {
      const key = getLastPropsKey(
        element.type as BlockSuite.EdgelessModelKeys,
        { ...element.yMap.toJSON(), ...props }
      );
      key && this.std.get(EditPropsStore).recordLastProps(key, props);
      this._surface.updateElement(id, props);
      return;
    }

    const block = this.std.doc.getBlockById(id);
    if (block) {
      const key = getLastPropsKey(
        block.flavour as BlockSuite.EdgelessModelKeys,
        { ...block.yBlock.toJSON(), ...props }
      );
      key && this.std.get(EditPropsStore).recordLastProps(key, props);
      this.std.doc.updateBlock(block, props);
    }
  };

  getElementById(id: string): BlockSuite.EdgelessModel | null {
    const surface = this._surface;
    if (!surface) {
      return null;
    }
    const el =
      surface.getElementById(id) ??
      (this.std.doc.getBlockById(
        id
      ) as BlockSuite.EdgelessBlockModelType | null);
    return el;
  }

  getElementsByType<K extends keyof BlockSuite.SurfaceElementModelMap>(
    type: K
  ): BlockSuite.SurfaceElementModelMap[K][] {
    if (!this._surface) {
      return [];
    }
    return this._surface.getElementsByType(type);
  }
}
