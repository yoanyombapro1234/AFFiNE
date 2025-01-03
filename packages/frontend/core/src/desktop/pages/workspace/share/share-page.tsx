import { Scrollable } from '@affine/component';
import { EditorOutlineViewer } from '@affine/core/components/blocksuite/outline-viewer';
import { useActiveBlocksuiteEditor } from '@affine/core/components/hooks/use-block-suite-editor';
import { usePageDocumentTitle } from '@affine/core/components/hooks/use-global-state';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { PageDetailEditor } from '@affine/core/components/page-detail-editor';
import { AppContainer } from '@affine/core/desktop/components/app-container';
import {
  AuthService,
  FetchService,
  GraphQLService,
  ServerService,
} from '@affine/core/modules/cloud';
import { type Doc, DocsService } from '@affine/core/modules/doc';
import {
  type Editor,
  type EditorSelector,
  EditorService,
  EditorsService,
} from '@affine/core/modules/editor';
import { PeekViewManagerModal } from '@affine/core/modules/peek-view';
import { ShareReaderService } from '@affine/core/modules/share-doc';
import { ViewIcon, ViewTitle } from '@affine/core/modules/workbench';
import {
  type Workspace,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { CloudBlobStorage } from '@affine/core/modules/workspace-engine';
import { useI18n } from '@affine/i18n';
import {
  type DocMode,
  DocModes,
  RefNodeSlotsProvider,
} from '@blocksuite/affine/blocks';
import type { AffineEditorContainer } from '@blocksuite/affine/presets';
import { DisposableGroup } from '@blocksuite/global/utils';
import { Logo1Icon } from '@blocksuite/icons/rc';
import {
  EmptyBlobStorage,
  FrameworkScope,
  ReadonlyDocStorage,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import clsx from 'clsx';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';

import { PageNotFound } from '../../404';
import { ShareFooter } from './share-footer';
import { ShareHeader } from './share-header';
import * as styles from './share-page.css';

export const SharePage = ({
  workspaceId,
  docId,
}: {
  workspaceId: string;
  docId: string;
}) => {
  const { shareReaderService, serverService } = useServices({
    ShareReaderService,
    ServerService,
  });

  const isLoading = useLiveData(shareReaderService.reader.isLoading$);
  const error = useLiveData(shareReaderService.reader.error$);
  const data = useLiveData(shareReaderService.reader.data$);

  const location = useLocation();

  const { mode, selector, isTemplate, templateName, templateSnapshotUrl } =
    useMemo(() => {
      const searchParams = new URLSearchParams(location.search);
      const queryStringMode = searchParams.get('mode') as DocMode | null;
      const blockIds = searchParams
        .get('blockIds')
        ?.split(',')
        .filter(v => v.length);
      const elementIds = searchParams
        .get('elementIds')
        ?.split(',')
        .filter(v => v.length);

      return {
        mode:
          queryStringMode && DocModes.includes(queryStringMode)
            ? queryStringMode
            : null,
        selector: {
          blockIds,
          elementIds,
          refreshKey: searchParams.get('refreshKey') || undefined,
        },
        isTemplate: searchParams.has('isTemplate'),
        templateName: searchParams.get('templateName') || '',
        templateSnapshotUrl: searchParams.get('snapshotUrl') || '',
      };
    }, [location.search]);

  useEffect(() => {
    shareReaderService.reader.loadShare({
      serverId: serverService.server.id,
      workspaceId,
      docId,
    });
  }, [shareReaderService, docId, workspaceId, serverService.server.id]);

  let element: ReactNode = null;
  if (isLoading) {
    element = null;
  } else if (data) {
    element = (
      <SharePageInner
        workspaceId={data.workspaceId}
        docId={data.docId}
        workspaceBinary={data.workspaceBinary}
        docBinary={data.docBinary}
        publishMode={mode || data.publishMode}
        selector={selector}
        isTemplate={isTemplate}
        templateName={templateName}
        templateSnapshotUrl={templateSnapshotUrl}
      />
    );
  } else if (error) {
    // TODO(@JimmFly): handle error
    element = <PageNotFound />;
  } else {
    element = <PageNotFound noPermission />;
  }

  return <AppContainer fallback={!element}>{element}</AppContainer>;
};

const SharePageInner = ({
  workspaceId,
  docId,
  workspaceBinary,
  docBinary,
  publishMode = 'page' as DocMode,
  selector,
  isTemplate,
  templateName,
  templateSnapshotUrl,
}: {
  workspaceId: string;
  docId: string;
  workspaceBinary: Uint8Array;
  docBinary: Uint8Array;
  publishMode?: DocMode;
  selector?: EditorSelector;
  isTemplate?: boolean;
  templateName?: string;
  templateSnapshotUrl?: string;
}) => {
  const workspacesService = useService(WorkspacesService);
  const fetchService = useService(FetchService);
  const graphQLService = useService(GraphQLService);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [page, setPage] = useState<Doc | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorContainer, setActiveBlocksuiteEditor] =
    useActiveBlocksuiteEditor();

  useEffect(() => {
    // create a workspace for share page
    const { workspace } = workspacesService.open(
      {
        metadata: {
          id: workspaceId,
          flavour: 'affine-cloud',
        },
        isSharedMode: true,
      },
      {
        getDocStorage() {
          return new ReadonlyDocStorage({
            [workspaceId]: workspaceBinary,
            [docId]: docBinary,
          });
        },
        getAwarenessConnections() {
          return [];
        },
        getDocServer() {
          return null;
        },
        getLocalBlobStorage() {
          return EmptyBlobStorage;
        },
        getRemoteBlobStorages() {
          return [
            new CloudBlobStorage(workspaceId, fetchService, graphQLService),
          ];
        },
      }
    );

    setWorkspace(workspace);

    workspace.engine
      .waitForRootDocReady()
      .then(() => {
        const { doc } = workspace.scope.get(DocsService).open(docId);

        doc.blockSuiteDoc.readonly = true;

        setPage(doc);

        const editor = doc.scope.get(EditorsService).createEditor();
        editor.setMode(publishMode);

        if (selector) {
          editor.setSelector(selector);
        }

        setEditor(editor);
      })
      .catch(err => {
        console.error(err);
      });
  }, [
    docId,
    workspaceId,
    workspacesService,
    publishMode,
    selector,
    workspaceBinary,
    docBinary,
    fetchService,
    graphQLService,
  ]);

  const t = useI18n();
  const pageTitle = useLiveData(page?.title$) ?? t['unnamed']();
  const { jumpToPageBlock, openPage } = useNavigateHelper();

  usePageDocumentTitle(pageTitle);

  const onEditorLoad = useCallback(
    (editorContainer: AffineEditorContainer) => {
      setActiveBlocksuiteEditor(editorContainer);
      if (!editor) {
        return;
      }
      const unbind = editor.bindEditorContainer(editorContainer);

      const disposable = new DisposableGroup();
      const refNodeSlots =
        editorContainer.host?.std.getOptional(RefNodeSlotsProvider);
      if (refNodeSlots) {
        disposable.add(
          refNodeSlots.docLinkClicked.on(({ pageId, params }) => {
            if (params) {
              const { mode, blockIds, elementIds } = params;
              jumpToPageBlock(workspaceId, pageId, mode, blockIds, elementIds);
              return;
            }

            if (editor.doc.id === pageId) {
              return;
            }

            return openPage(workspaceId, pageId);
          })
        );
      }

      return () => {
        unbind();
      };
    },
    [editor, setActiveBlocksuiteEditor, jumpToPageBlock, openPage, workspaceId]
  );

  if (!workspace || !page || !editor) {
    return;
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <FrameworkScope scope={page.scope}>
        <FrameworkScope scope={editor.scope}>
          <ViewIcon icon={publishMode === 'page' ? 'doc' : 'edgeless'} />
          <ViewTitle title={pageTitle} />
          <div className={styles.root}>
            <div className={styles.mainContainer}>
              <ShareHeader
                pageId={page.id}
                publishMode={publishMode}
                isTemplate={isTemplate}
                templateName={templateName}
                snapshotUrl={templateSnapshotUrl}
              />
              <Scrollable.Root>
                <Scrollable.Viewport
                  className={clsx(
                    'affine-page-viewport',
                    styles.editorContainer
                  )}
                >
                  <PageDetailEditor onLoad={onEditorLoad} />
                  {publishMode === 'page' && !BUILD_CONFIG.isElectron ? (
                    <ShareFooter />
                  ) : null}
                </Scrollable.Viewport>
                <Scrollable.Scrollbar />
              </Scrollable.Root>
              <EditorOutlineViewer
                editor={editorContainer}
                show={publishMode === 'page'}
              />
              {!BUILD_CONFIG.isElectron && <SharePageFooter />}
            </div>
          </div>
          <PeekViewManagerModal />
        </FrameworkScope>
      </FrameworkScope>
    </FrameworkScope>
  );
};

const SharePageFooter = () => {
  const t = useI18n();
  const editorService = useService(EditorService);
  const isPresent = useLiveData(editorService.editor.isPresenting$);
  const authService = useService(AuthService);
  const loginStatus = useLiveData(authService.session.status$);

  if (isPresent || loginStatus === 'authenticated') {
    return null;
  }
  return (
    <a
      href="https://affine.pro"
      target="_blank"
      className={styles.link}
      rel="noreferrer"
    >
      <span className={styles.linkText}>
        {t['com.affine.share-page.footer.built-with']()}
      </span>
      <Logo1Icon fontSize={20} />
    </a>
  );
};
