import type { CreativeMediaMetadata } from './personaMediaIntake';

type ServerAsset = { id?: string };
type Scope = {
  projectId: string;
  contentItemId: string;
  ideaId: string;
  ideaVersion: number;
  sessionId: string;
};

// Never expose an older IndexedDB response in the current iPhone idea/session.
export function currentSessionAssets(
  local: readonly CreativeMediaMetadata[], scope: Scope,
): CreativeMediaMetadata[] {
  const seen = new Set<string>();
  return local.filter(asset => {
    if (!asset.id || seen.has(asset.id) ||
      asset.storage !== "device_local" || asset.state !== "INTAKE_LOCAL" ||
      asset.projectId !== scope.projectId || asset.contentItemId !== scope.contentItemId ||
      asset.ideaId !== scope.ideaId || asset.ideaVersion !== scope.ideaVersion ||
      asset.sessionId !== scope.sessionId) return false;
    seen.add(asset.id);
    return true;
  });
}
// Register only committed local manifests belonging to this signed revision.
// Neither a prior shooting session nor an earlier revision may be inherited.
export function pendingServerAssets(
  local: readonly CreativeMediaMetadata[],
  server: readonly ServerAsset[],
  scope: Scope,
): CreativeMediaMetadata[] {
  const serverIds = new Set(server.map(asset => asset.id).filter(Boolean));
  return currentSessionAssets(local, scope).filter(asset => !serverIds.has(asset.id));
}
