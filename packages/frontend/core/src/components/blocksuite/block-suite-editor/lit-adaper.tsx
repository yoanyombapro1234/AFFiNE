import {
  createReactComponentFromLit,
  useConfirmModal,
  useLitPortalFactory,
} from '@affine/component';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import { DocService, DocsService } from '@affine/core/modules/doc';
import type {
  DatabaseRow,
  DatabaseValueCell,
} from '@affine/core/modules/doc-info/types';
import { EditorService } from '@affine/core/modules/editor';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { JournalService } from '@affine/core/modules/journal';
import { toURLSearchParams } from '@affine/core/modules/navigation';
import { PeekViewService } from '@affine/core/modules/peek-view/services/peek-view';
import { WorkspaceService } from '@affine/core/modules/workspace';
import track from '@affine/track';
import type { DocMode } from '@blocksuite/affine/blocks';
import {
  DocTitle,
  EdgelessEditor,
  PageEditor,
} from '@blocksuite/affine/presets';
import type { Doc } from '@blocksuite/affine/store';
import {
  useFramework,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import React, {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import {
  AffinePageReference,
  AffineSharedPageReference,
} from '../../affine/reference-link';
import {
  type DefaultOpenProperty,
  DocPropertiesTable,
} from '../../doc-properties';
import { BiDirectionalLinkPanel } from './bi-directional-link-panel';
import { BlocksuiteEditorJournalDocTitle } from './journal-doc-title';
import { extendEdgelessPreviewSpec } from './specs/custom/root-block';
import {
  patchDocModeService,
  patchEdgelessClipboard,
  patchEmbedLinkedDocBlockConfig,
  patchForAttachmentEmbedViews,
  patchForMobile,
  patchForSharedPage,
  patchGenerateDocUrlExtension,
  patchNotificationService,
  patchParseDocUrlExtension,
  patchPeekViewService,
  patchQuickSearchService,
  patchReferenceRenderer,
  type ReferenceReactRenderer,
} from './specs/custom/spec-patchers';
import { createEdgelessModeSpecs } from './specs/edgeless';
import { createPageModeSpecs } from './specs/page';
import * as styles from './styles.css';

const adapted = {
  DocEditor: createReactComponentFromLit({
    react: React,
    elementClass: PageEditor,
  }),
  DocTitle: createReactComponentFromLit({
    react: React,
    elementClass: DocTitle,
  }),
  EdgelessEditor: createReactComponentFromLit({
    react: React,
    elementClass: EdgelessEditor,
  }),
};

interface BlocksuiteEditorProps {
  page: Doc;
  shared?: boolean;
  defaultOpenProperty?: DefaultOpenProperty;
}

const usePatchSpecs = (shared: boolean, mode: DocMode) => {
  const [reactToLit, portals] = useLitPortalFactory();
  const {
    peekViewService,
    docService,
    docsService,
    editorService,
    workspaceService,
    featureFlagService,
  } = useServices({
    PeekViewService,
    DocService,
    DocsService,
    WorkspaceService,
    EditorService,
    FeatureFlagService,
  });
  const framework = useFramework();
  const referenceRenderer: ReferenceReactRenderer = useMemo(() => {
    return function customReference(reference) {
      const data = reference.delta.attributes?.reference;
      if (!data) return <span />;

      const pageId = data.pageId;
      if (!pageId) return <span />;

      // title alias
      const title = data.title;
      const params = toURLSearchParams(data.params);

      if (workspaceService.workspace.openOptions.isSharedMode) {
        return (
          <AffineSharedPageReference
            docCollection={workspaceService.workspace.docCollection}
            pageId={pageId}
            params={params}
            title={title}
          />
        );
      }

      return (
        <AffinePageReference pageId={pageId} params={params} title={title} />
      );
    };
  }, [workspaceService]);

  useMemo(() => {
    extendEdgelessPreviewSpec(framework);
  }, [framework]);

  const specs = useMemo(() => {
    return mode === 'edgeless'
      ? createEdgelessModeSpecs(framework)
      : createPageModeSpecs(framework);
  }, [mode, framework]);

  const confirmModal = useConfirmModal();
  const patchedSpecs = useMemo(() => {
    let patched = specs.concat(
      patchReferenceRenderer(reactToLit, referenceRenderer)
    );

    if (featureFlagService.flags.enable_pdf_embed_preview.value) {
      patched = patched.concat(patchForAttachmentEmbedViews(reactToLit));
    }

    patched = patched.concat(patchNotificationService(confirmModal));
    patched = patched.concat(patchPeekViewService(peekViewService));
    patched = patched.concat(patchEdgelessClipboard());
    patched = patched.concat(patchParseDocUrlExtension(framework));
    patched = patched.concat(patchGenerateDocUrlExtension(framework));
    patched = patched.concat(patchQuickSearchService(framework));
    patched = patched.concat(patchEmbedLinkedDocBlockConfig(framework));
    if (shared) {
      patched = patched.concat(patchForSharedPage());
    }
    if (BUILD_CONFIG.isMobileEdition) {
      patched = patched.concat(patchForMobile());
    }
    patched = patched.concat(
      patchDocModeService(docService, docsService, editorService)
    );
    return patched;
  }, [
    confirmModal,
    docService,
    docsService,
    editorService,
    framework,
    peekViewService,
    reactToLit,
    referenceRenderer,
    shared,
    specs,
    featureFlagService,
  ]);

  return [
    patchedSpecs,
    useMemo(
      () => (
        <>
          {portals.map(p => (
            <Fragment key={p.id}>{p.portal}</Fragment>
          ))}
        </>
      ),
      [portals]
    ),
  ] as const;
};

export const BlocksuiteDocEditor = forwardRef<
  PageEditor,
  BlocksuiteEditorProps & {
    onClickBlank?: () => void;
    titleRef?: React.Ref<DocTitle>;
  }
>(function BlocksuiteDocEditor(
  {
    page,
    shared,
    onClickBlank,
    titleRef: externalTitleRef,
    defaultOpenProperty,
  },
  ref
) {
  const titleRef = useRef<DocTitle | null>(null);
  const docRef = useRef<PageEditor | null>(null);
  const journalService = useService(JournalService);
  const isJournal = !!useLiveData(journalService.journalDate$(page.id));

  const editorSettingService = useService(EditorSettingService);

  const onDocRef = useCallback(
    (el: PageEditor) => {
      docRef.current = el;
      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [ref]
  );

  const onTitleRef = useCallback(
    (el: DocTitle) => {
      titleRef.current = el;
      if (externalTitleRef) {
        if (typeof externalTitleRef === 'function') {
          externalTitleRef(el);
        } else {
          (externalTitleRef as any).current = el;
        }
      }
    },
    [externalTitleRef]
  );

  const [specs, portals] = usePatchSpecs(!!shared, 'page');

  const displayBiDirectionalLink = useLiveData(
    editorSettingService.editorSetting.settings$.selector(
      s => s.displayBiDirectionalLink
    )
  );

  const displayDocInfo = useLiveData(
    editorSettingService.editorSetting.settings$.selector(s => s.displayDocInfo)
  );

  const onPropertyChange = useCallback((property: DocCustomPropertyInfo) => {
    track.doc.inlineDocInfo.property.editProperty({
      type: property.type,
    });
  }, []);

  const onPropertyAdded = useCallback((property: DocCustomPropertyInfo) => {
    track.doc.inlineDocInfo.property.addProperty({
      type: property.type,
      control: 'at menu',
    });
  }, []);

  const onDatabasePropertyChange = useCallback(
    (_row: DatabaseRow, cell: DatabaseValueCell) => {
      track.doc.inlineDocInfo.databaseProperty.editProperty({
        type: cell.property.type$.value,
      });
    },
    []
  );

  const onPropertyInfoChange = useCallback(
    (property: DocCustomPropertyInfo, field: string) => {
      track.doc.inlineDocInfo.property.editPropertyMeta({
        type: property.type,
        field,
      });
    },
    []
  );

  return (
    <>
      <div className={styles.affineDocViewport}>
        {!isJournal ? (
          <adapted.DocTitle doc={page} ref={onTitleRef} />
        ) : (
          <BlocksuiteEditorJournalDocTitle page={page} />
        )}
        {!shared && displayDocInfo ? (
          <div className={styles.docPropertiesTableContainer}>
            <DocPropertiesTable
              className={styles.docPropertiesTable}
              onDatabasePropertyChange={onDatabasePropertyChange}
              onPropertyChange={onPropertyChange}
              onPropertyAdded={onPropertyAdded}
              onPropertyInfoChange={onPropertyInfoChange}
              defaultOpenProperty={defaultOpenProperty}
            />
          </div>
        ) : null}
        <adapted.DocEditor
          className={styles.docContainer}
          ref={onDocRef}
          doc={page}
          specs={specs}
          hasViewport={false}
        />
        <div
          className={styles.docEditorGap}
          data-testid="page-editor-blank"
          onClick={onClickBlank}
        ></div>
        {!shared && displayBiDirectionalLink ? (
          <BiDirectionalLinkPanel />
        ) : null}
      </div>
      {portals}
    </>
  );
});
export const BlocksuiteEdgelessEditor = forwardRef<
  EdgelessEditor,
  BlocksuiteEditorProps
>(function BlocksuiteEdgelessEditor({ page, shared }, ref) {
  const [specs, portals] = usePatchSpecs(!!shared, 'edgeless');
  const editorRef = useRef<EdgelessEditor | null>(null);

  const onDocRef = useCallback(
    (el: EdgelessEditor) => {
      editorRef.current = el;
      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [ref]
  );

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateComplete
        .then(() => {
          // make sure editor can get keyboard events on showing up
          editorRef.current?.querySelector('affine-edgeless-root')?.click();
        })
        .catch(console.error);
    }
  }, []);

  return (
    <div className={styles.affineEdgelessDocViewport}>
      <adapted.EdgelessEditor ref={onDocRef} doc={page} specs={specs} />
      {portals}
    </div>
  );
});
