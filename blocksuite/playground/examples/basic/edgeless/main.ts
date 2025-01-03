import '../../../style.css';

import { EdgelessEditor } from '@blocksuite/presets';

import { createEmptyDoc } from '../../../apps/_common/helper';

const doc = createEmptyDoc().init();
const editor = new EdgelessEditor();
editor.doc = doc;
document.body.append(editor);
