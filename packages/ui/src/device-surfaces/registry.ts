import { coreDeviceSurfacePlugin } from "./core";
import { nestHubDeviceSurfacePlugin } from "./nest-hub";

export const deviceSurfacePlugins = [coreDeviceSurfacePlugin, nestHubDeviceSurfacePlugin] as const;

export type DeviceSurfacePluginId = (typeof deviceSurfacePlugins)[number]["id"];

export function getDeviceSurfacePlugin(id: string) {
  return deviceSurfacePlugins.find((plugin) => plugin.id === id) ?? coreDeviceSurfacePlugin;
}
