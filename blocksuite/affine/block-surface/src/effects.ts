import type {
  autoArrangeElementsCommand,
  autoResizeElementsCommand,
} from './commands/auto-align.js';
import type { reassociateConnectorsCommand } from './commands/reassociate-connectors.js';
import { SurfaceBlockComponent } from './surface-block.js';
import { SurfaceBlockVoidComponent } from './surface-block-void.js';
import type { SurfaceBlockModel } from './surface-model.js';
import type { SurfaceBlockService } from './surface-service.js';

export function effects() {
  customElements.define('affine-surface-void', SurfaceBlockVoidComponent);
  customElements.define('affine-surface', SurfaceBlockComponent);
}

declare global {
  namespace BlockSuite {
    interface BlockServices {
      'affine:surface': SurfaceBlockService;
    }
    interface BlockModels {
      'affine:surface': SurfaceBlockModel;
    }
    interface Commands {
      reassociateConnectors: typeof reassociateConnectorsCommand;
      autoArrangeElements: typeof autoArrangeElementsCommand;
      autoResizeElements: typeof autoResizeElementsCommand;
    }
  }
}
