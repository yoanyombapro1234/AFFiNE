import type { DefaultOpenProperty } from '@affine/core/components/doc-properties';
import type { DocMode } from '@blocksuite/affine/blocks';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Doc } from '../../doc';
import { DocsService } from '../../doc';
import { type Editor, type EditorSelector, EditorsService } from '../../editor';
import { WorkspaceService } from '../../workspace';

export const useEditor = (
  pageId: string,
  preferMode?: DocMode,
  preferSelector?: EditorSelector,
  defaultOpenProperty?: DefaultOpenProperty
) => {
  const currentWorkspace = useService(WorkspaceService).workspace;
  const docsService = useService(DocsService);
  const docRecordList = docsService.list;
  const docListReady = useLiveData(docRecordList.isReady$);
  const docRecord = docRecordList.doc$(pageId).value;
  const preferModeRef = useRef(preferMode);
  const preferSelectorRef = useRef(preferSelector);
  const defaultOpenPropertyRef = useRef(defaultOpenProperty);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  useLayoutEffect(() => {
    if (!docRecord) {
      return;
    }
    const { doc: opened, release } = docsService.open(pageId);
    setDoc(opened);
    return () => {
      release();
    };
  }, [docRecord, docsService, pageId]);

  useLayoutEffect(() => {
    if (!doc) {
      return;
    }
    const editor = doc.scope.get(EditorsService).createEditor();
    editor.setMode(preferModeRef.current || doc.primaryMode$.value);
    editor.setSelector(preferSelectorRef.current);
    editor.setDefaultOpenProperty(defaultOpenPropertyRef.current);
    setEditor(editor);
    return () => {
      editor.dispose();
    };
  }, [doc]);

  // set sync engine priority target
  useEffect(() => {
    currentWorkspace.engine.doc.setPriority(pageId, 10);
    return () => {
      currentWorkspace.engine.doc.setPriority(pageId, 5);
    };
  }, [currentWorkspace, pageId]);

  return { doc, editor, workspace: currentWorkspace, loading: !docListReady };
};
