export function mergeGateChecks(): readonly string[] {
  return ["lint", "check-types", "test", "build"];
}

export function localDevWorkspaceTargets(): readonly string[] {
  return ["@open-nexus/brain", "@open-nexus/device-ui", "@open-nexus/device-runtime"];
}
