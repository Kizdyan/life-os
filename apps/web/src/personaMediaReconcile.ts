import type { CreativeMediaMetadata } from './personaMediaIntake';

type ServerAsset = { id?: string };
type Scope = {
  projectId: string;
  contentItemId: string;
  ideaId: string;
  ideaVersion: number;
  sessionId: string;
};

// Register only committed local manifests belonging to this signed revision.
// Neither a prior shooting session nor an earlier revision may be inherited.
export function pendingServerAssets(
  local: readonly CreativeMediaMetadata[],
  server: readonly ServerAsset[],
  scope: Scope,
): CreativeMediaMetadata[] {
  const serverIds = new Set(server.map(asset => asset.id).filter(Boolean));
  const pendingIds = new Set<string>();
  return local.filter(asset => {
    if (asset.storage !== 'device_local' || asset.state !== 'INTAKE_LOCAL' ||
      asset.projectId !== scope.projectId || asset.contentItemId !== scope.contentItemId ||
      asset.ideaId !== scope.ideaId || asset.ideaVersion !== scope.ideaVersion ||
      asset.sessionId !== scope.sessionId || serverIds.has(asset.id) || pendingIds.has(asset.id)) {
      return false;
    }
    pendingIds.add(asset.id);
    return true;
  });
}
