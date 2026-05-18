import type { ComponentType, Ref } from "react";
import type { ConnectionState, PromptState } from "../components/device-screen";

export interface DeviceSurfaceDevice {
  id: string;
  locale: string;
  timezone: string;
}

export interface DeviceSurfaceProps<TSettings = unknown> {
  assistantResponse: string;
  connectionState: ConnectionState;
  currentTime: string;
  device: DeviceSurfaceDevice;
  errorMessage?: string | undefined;
  onPromptChange: (prompt: string) => void;
  onSubmitPrompt: () => void;
  prompt: string;
  promptComposerVisible: boolean;
  promptInputRef?: Ref<HTMLTextAreaElement> | undefined;
  promptState: PromptState;
  settings: TSettings;
}

export interface DeviceSurfacePlugin<TSettings = unknown> {
  id: string;
  name: string;
  version: string;
  defaultSettings: TSettings;
  Surface: ComponentType<DeviceSurfaceProps<TSettings>>;
}
