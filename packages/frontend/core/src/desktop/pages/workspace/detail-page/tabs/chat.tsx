import { ChatPanel } from '@affine/core/blocksuite/presets/ai';
import {
  DocModeProvider,
  RefNodeSlotsProvider,
} from '@blocksuite/affine/blocks';
import type { AffineEditorContainer } from '@blocksuite/affine/presets';
import { forwardRef, useEffect, useRef } from 'react';

import * as styles from './chat.css';

export interface SidebarTabProps {
  editor: AffineEditorContainer | null;
  onLoad?: ((component: HTMLElement) => void) | null;
}

// A wrapper for CopilotPanel
export const EditorChatPanel = forwardRef(function EditorChatPanel(
  { editor, onLoad }: SidebarTabProps,
  ref: React.ForwardedRef<ChatPanel>
) {
  const chatPanelRef = useRef<ChatPanel | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (onLoad && chatPanelRef.current) {
      (chatPanelRef.current as ChatPanel).updateComplete
        .then(() => {
          if (ref) {
            if (typeof ref === 'function') {
              ref(chatPanelRef.current);
            } else {
              ref.current = chatPanelRef.current;
            }
          }
        })
        .catch(console.error);
    }
  }, [onLoad, ref]);

  useEffect(() => {
    if (!editor || !editor.host) return;

    if (!chatPanelRef.current) {
      chatPanelRef.current = new ChatPanel();
      chatPanelRef.current.host = editor.host;
      chatPanelRef.current.doc = editor.doc;
      containerRef.current?.append(chatPanelRef.current);
    } else {
      chatPanelRef.current.host = editor.host;
      chatPanelRef.current.doc = editor.doc;
    }

    const docModeService = editor.host.std.get(DocModeProvider);
    const refNodeService = editor.host.std.getOptional(RefNodeSlotsProvider);
    const disposable = [
      refNodeService?.docLinkClicked.on(() => {
        (chatPanelRef.current as ChatPanel).doc = editor.doc;
      }),
      docModeService?.onPrimaryModeChange(() => {
        if (!editor.host) return;
        (chatPanelRef.current as ChatPanel).host = editor.host;
      }, editor.doc.id),
    ];

    return () => disposable.forEach(d => d?.dispose());
  }, [editor]);

  return <div className={styles.root} ref={containerRef} />;
});
