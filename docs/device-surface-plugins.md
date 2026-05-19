# Device Surface Plugins

Device Surface Plugins customize the rendered experience inside the Device UI. They do not replace the Device UI itself: the Device UI still owns Brain Server communication, Device Runtime events, wake behavior, kiosk startup, and Prompt Exchange orchestration.

## Contract

A Device Surface Plugin exports metadata and a React component:

```ts
export interface DeviceSurfacePlugin<TSettings = Record<string, never>> {
  id: string;
  name: string;
  version: string;
  defaultSettings: TSettings;
  Surface: ComponentType<DeviceSurfaceProps<TSettings>>;
}
```

The Device UI renders the active plugin with a Surface Host Contract:

```ts
export interface DeviceSurfaceProps<TSettings> {
  assistantResponse: string;
  connectionState: "connected" | "disconnected";
  currentTime: string;
  device: {
    id: string;
    locale: string;
    timezone: string;
  };
  errorMessage?: string;
  onPromptChange: (prompt: string) => void;
  onSubmitPrompt: () => void;
  prompt: string;
  promptComposerVisible: boolean;
  promptInputRef?: Ref<HTMLTextAreaElement>;
  promptState: "idle" | "sending" | "streaming" | "completed" | "failed";
  settings: TSettings;
}
```

Plugins can render any presentation they need, including fetching their own display data such as photos or weather. Nexus-specific state and actions must come through the Surface Host Contract; plugins must not create their own Brain Server client, subscribe directly to Device Runtime events, or call AI Providers.

Every Device Surface must preserve the Prompt Exchange interaction loop by providing a way to enter prompts and display assistant results.

## Settings

Each plugin defines `defaultSettings`. In the target model, the Brain Server stores Surface Settings per Device UI and active Device Surface. The Device UI resolves those settings and passes them to the plugin.

The first repo-provided surface can use local defaults before Brain-managed settings exist. Later, the Brain Server should provide:

- the Active Device Surface for each device
- available Device Surface Plugin metadata
- acquisition metadata for missing plugins
- per-device Surface Settings
- events or polling responses that let devices switch surfaces without a power cycle

## Acquisition And Fallback

The Brain Server is the source of truth for available Device Surface Plugins and how a Device UI may acquire them. If a Device UI is assigned a surface that is missing locally, it should perform Device Surface Acquisition using Brain-authorized metadata.

If acquisition or loading fails, the Device UI should render a built-in surface and report a System Issue to the Brain Server.

## First Surface

The first plugin is a Nest Hub-style surface:

- full-screen background image
- bottom-right clock while idle
- prompt input and assistant results similar to the current Device UI
- disconnected and error states visible when relevant

Changing from the default surface is a later slice.
