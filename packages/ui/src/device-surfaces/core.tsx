import { DeviceScreen } from "../components/device-screen";
import type { DeviceSurfacePlugin, DeviceSurfaceProps } from "./types";

function CoreDeviceSurface({
  assistantResponse,
  connectionState,
  currentTime,
  errorMessage,
  onPromptChange,
  onSubmitPrompt,
  prompt,
  promptComposerVisible,
  promptInputRef,
  promptState,
}: DeviceSurfaceProps) {
  return (
    <DeviceScreen
      assistantResponse={assistantResponse}
      connectionState={connectionState}
      currentTime={currentTime}
      errorMessage={errorMessage}
      onPromptChange={onPromptChange}
      onSubmitPrompt={onSubmitPrompt}
      prompt={prompt}
      promptComposerVisible={promptComposerVisible}
      promptInputRef={promptInputRef}
      promptState={promptState}
    />
  );
}

export const coreDeviceSurfacePlugin: DeviceSurfacePlugin<Record<string, never>> = {
  id: "core",
  name: "Core Device Surface",
  version: "0.1.0",
  defaultSettings: {},
  Surface: CoreDeviceSurface,
};
