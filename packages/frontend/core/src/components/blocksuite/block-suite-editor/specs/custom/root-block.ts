import {
  AIEdgelessRootBlockSpec,
  AIPageRootBlockSpec,
} from '@affine/core/blocksuite/presets/ai';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { AppThemeService } from '@affine/core/modules/theme';
import { mixpanel } from '@affine/track';
import {
  ConfigExtension,
  type ExtensionType,
  LifeCycleWatcher,
  StdIdentifier,
} from '@blocksuite/affine/block-std';
import type {
  RootBlockConfig,
  TelemetryEventMap,
  ThemeExtension,
} from '@blocksuite/affine/blocks';
import {
  ColorScheme,
  EdgelessBuiltInManager,
  EdgelessRootBlockSpec,
  EdgelessToolExtension,
  EditorSettingExtension,
  FontLoaderService,
  PageRootBlockSpec,
  TelemetryProvider,
  ThemeExtensionIdentifier,
} from '@blocksuite/affine/blocks';
import {
  createSignalFromObservable,
  type Signal,
  SpecProvider,
} from '@blocksuite/affine-shared/utils';
import type { Container } from '@blocksuite/global/di';
import {
  DocService,
  DocsService,
  FeatureFlagService,
  type FrameworkProvider,
} from '@toeverything/infra';
import type { Observable } from 'rxjs';
import { combineLatest, map } from 'rxjs';

import { getFontConfigExtension } from '../font-extension';
import { createDatabaseOptionsConfig } from './database-block';
import { createLinkedWidgetConfig } from './widgets/linked';
import { createToolbarMoreMenuConfig } from './widgets/toolbar';

function getTelemetryExtension(): ExtensionType {
  return {
    setup: di => {
      di.addImpl(TelemetryProvider, () => ({
        track: <T extends keyof TelemetryEventMap>(
          eventName: T,
          props: TelemetryEventMap[T]
        ) => {
          mixpanel.track(eventName as string, props as Record<string, unknown>);
        },
      }));
    },
  };
}

function getThemeExtension(framework: FrameworkProvider) {
  class AffineThemeExtension
    extends LifeCycleWatcher
    implements ThemeExtension
  {
    static override readonly key = 'affine-theme';

    private readonly themes: Map<string, Signal<ColorScheme>> = new Map();

    protected readonly disposables: (() => void)[] = [];

    static override setup(di: Container) {
      super.setup(di);
      di.override(ThemeExtensionIdentifier, AffineThemeExtension, [
        StdIdentifier,
      ]);
    }

    getAppTheme() {
      const keyName = 'app-theme';
      const cache = this.themes.get(keyName);
      if (cache) return cache;

      const theme$: Observable<ColorScheme> = framework
        .get(AppThemeService)
        .appTheme.theme$.map(theme => {
          return theme === ColorScheme.Dark
            ? ColorScheme.Dark
            : ColorScheme.Light;
        });
      const { signal: themeSignal, cleanup } =
        createSignalFromObservable<ColorScheme>(theme$, ColorScheme.Light);
      this.disposables.push(cleanup);
      this.themes.set(keyName, themeSignal);
      return themeSignal;
    }

    getEdgelessTheme(docId?: string) {
      const doc =
        (docId && framework.get(DocsService).list.doc$(docId).getValue()) ||
        framework.get(DocService).doc;

      const cache = this.themes.get(doc.id);
      if (cache) return cache;

      const appTheme$ = framework.get(AppThemeService).appTheme.theme$;
      const docTheme$ = doc.properties$.map(
        props => props.edgelessColorTheme || 'system'
      );
      const theme$: Observable<ColorScheme> = combineLatest([
        appTheme$,
        docTheme$,
      ]).pipe(
        map(([appTheme, docTheme]) => {
          const theme = docTheme === 'system' ? appTheme : docTheme;
          return theme === ColorScheme.Dark
            ? ColorScheme.Dark
            : ColorScheme.Light;
        })
      );
      const { signal: themeSignal, cleanup } =
        createSignalFromObservable<ColorScheme>(theme$, ColorScheme.Light);
      this.disposables.push(cleanup);
      this.themes.set(doc.id, themeSignal);
      return themeSignal;
    }

    override unmounted() {
      this.dispose();
    }

    dispose() {
      this.disposables.forEach(dispose => dispose());
    }
  }

  return AffineThemeExtension;
}

function getEditorConfigExtension(
  framework: FrameworkProvider
): ExtensionType[] {
  const editorSettingService = framework.get(EditorSettingService);
  return [
    EditorSettingExtension(editorSettingService.editorSetting.settingSignal),
    ConfigExtension('affine:page', {
      linkedWidget: createLinkedWidgetConfig(framework),
      toolbarMoreMenu: createToolbarMoreMenuConfig(framework),
      databaseOptions: createDatabaseOptionsConfig(framework),
    } satisfies RootBlockConfig),
  ];
}

export const extendEdgelessPreviewSpec = (function () {
  let _extension: ExtensionType;
  let _framework: FrameworkProvider;
  return function (framework: FrameworkProvider) {
    if (framework === _framework && _extension) {
      return _extension;
    } else {
      _extension &&
        SpecProvider.getInstance().omitSpec('edgeless:preview', _extension);
      _extension = getThemeExtension(framework);
      _framework = framework;
      SpecProvider.getInstance().extendSpec('edgeless:preview', [_extension]);
      return _extension;
    }
  };
})();

export function createPageRootBlockSpec(
  framework: FrameworkProvider
): ExtensionType[] {
  const featureFlagService = framework.get(FeatureFlagService);
  const enableAI = featureFlagService.flags.enable_ai.value;
  return [
    enableAI ? AIPageRootBlockSpec : PageRootBlockSpec,
    FontLoaderService,
    getThemeExtension(framework),
    getFontConfigExtension(),
    getTelemetryExtension(),
    getEditorConfigExtension(framework),
  ].flat();
}

export function createEdgelessRootBlockSpec(
  framework: FrameworkProvider
): ExtensionType[] {
  const featureFlagService = framework.get(FeatureFlagService);
  const enableAI = featureFlagService.flags.enable_ai.value;
  return [
    enableAI ? AIEdgelessRootBlockSpec : EdgelessRootBlockSpec,
    FontLoaderService,
    getThemeExtension(framework),
    EdgelessToolExtension,
    EdgelessBuiltInManager,
    getFontConfigExtension(),
    getTelemetryExtension(),
    getEditorConfigExtension(framework),
  ].flat();
}
