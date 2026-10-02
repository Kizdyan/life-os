import type { MediaStorageProvider } from "./media-brain";
import { mediaSectionPath } from "./media-brain";
import type { EditorBundleFile } from "./capcut-export";

export interface StoredEditorBundle {
  projectPath: string;
  candidatePath: string;
  filePaths: string[];
}

export async function writeEditorBundleToProjects(input: {
  provider: MediaStorageProvider;
  rootPath: string;
  projectId: string;
  candidateId: string;
  files: EditorBundleFile[];
}): Promise<StoredEditorBundle> {
  if (!input.files.length) throw new Error("Editor bundle has no files");

  const projectsRoot = mediaSectionPath(input.rootPath, "projects");
  const projectPath = joinPath(projectsRoot, safeSegment(input.projectId));
  const candidatePath = joinPath(projectPath, safeSegment(input.candidateId));

  await input.provider.createFolder(projectPath);
  await input.provider.createFolder(candidatePath);

  const filePaths: string[] = [];
  for (const file of input.files) {
    const target = joinPath(candidatePath, safeRelativePath(file.relativePath));
    await input.provider.upload(
      target,
      new TextEncoder().encode(file.content),
      file.mimeType,
    );

    const observed = await input.provider.stat(target);
    if (!observed) {
      throw new Error(`Editor bundle upload verification failed: ${target}`);
    }
    filePaths.push(target);
  }

  return { projectPath, candidatePath, filePaths };
}

function safeSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Project/candidate id must not be empty");
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

function safeRelativePath(value: string): string {
  const pieces = value
    .replace(/\\/g, "/")
    .split("/")
    .filter((piece) => piece && piece !== "." && piece !== "..")
    .map(safeSegment);
  if (!pieces.length) throw new Error("Bundle file path must not be empty");
  return pieces.join("/");
}

function joinPath(base: string, child: string): string {
  return `${base.replace(/\/+$/, "")}/${child.replace(/^\/+/, "")}`;
}
