/** A file picked by the user, with its path relative to what was dropped. */
export interface PickedFile {
  readonly path: string;
  readonly file: File;
}

export type CollectProgress = (found: number) => void;

/** Ren'Py ignores dot files and directories (renpy/loader.py walkdir); so do we. */
function isHidden(name: string): boolean {
  return name.startsWith('.');
}

function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

/** readEntries returns at most ~100 entries per call: keep calling until empty. */
async function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await readBatch(reader);
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function isDirectory(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

function isFile(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

/**
 * Collects the files of a drop. Must be called synchronously from the drop
 * event: DataTransfer items are only readable during the event.
 */
export function collectFromDrop(
  items: DataTransferItemList,
  onProgress?: CollectProgress,
): Promise<PickedFile[]> {
  const roots: FileSystemEntry[] = [];
  const plain: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry();
    if (entry) roots.push(entry);
    else {
      const file = item.getAsFile();
      if (file) plain.push(file);
    }
  }
  return walkEntries(roots, plain, onProgress);
}

async function walkEntries(
  roots: FileSystemEntry[],
  plain: File[],
  onProgress?: CollectProgress,
): Promise<PickedFile[]> {
  const out: PickedFile[] = plain.map((file) => ({ path: file.name, file }));
  const queue = [...roots];
  const pendingFiles: FileSystemFileEntry[] = [];
  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry || isHidden(entry.name)) continue;
    if (isDirectory(entry)) queue.push(...(await readAllEntries(entry)));
    else if (isFile(entry)) pendingFiles.push(entry);
  }
  // Resolve File objects a few at a time, so huge folders do not flood the event loop.
  for (let i = 0; i < pendingFiles.length; i += 64) {
    const chunk = pendingFiles.slice(i, i + 64);
    const files = await Promise.all(chunk.map(fileOf));
    files.forEach((file, j) => {
      const entry = chunk[j];
      if (entry) out.push({ path: entry.fullPath.replace(/^\/+/, ''), file });
    });
    onProgress?.(out.length);
  }
  return out;
}

/** Files from an <input type="file">, with or without `webkitdirectory`. */
export function collectFromInput(files: FileList): PickedFile[] {
  return Array.from(files)
    .map((file) => ({ path: file.webkitRelativePath || file.name, file }))
    .filter(({ path }) => !path.split('/').some(isHidden));
}
