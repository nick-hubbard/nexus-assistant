export function mergeGateChecks(): readonly string[] {
  return ["lint", "check-types", "test", "build"];
}
