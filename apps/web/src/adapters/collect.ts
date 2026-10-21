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
    // Directories need the entries API; plain files are taken directly,
    // which is synchronous and works for every kind of drop.
    const file = entry?.isDirectory ? null : item.getAsFile();
    if (file) plain.push(file);
    else if (entry) roots.push(entry);
  }
  return walkEntries(roots, plain, onProgress);
}

async function walkEntries(
  roots: FileSystemEntry[],
  plain: File[],
  onProgress?: CollectProgress,
): Promise<PickedFile[]> {
  const out: PickedFile[] = plain.map((file) => ({ path: file.name, file }));
  // Breadth-first walk: iterating an array also visits items appended during
  // the loop, without the O(n) cost of shift().
  const queue = [...roots];
  const pendingFiles: FileSystemFileEntry[] = [];
  for (const entry of queue) {
    if (isHidden(entry.name)) continue;
    if (isDirectory(entry)) {
      try {
        for (const child of await readAllEntries(entry)) queue.push(child);
      } catch {
        // An unreadable folder (permissions...) is skipped, the rest is analyzed.
      }
    } else if (isFile(entry)) pendingFiles.push(entry);
  }
  // Resolve File objects a few at a time, so huge folders do not flood the
  // event loop. An unreadable entry is skipped rather than failing the drop.
  for (let i = 0; i < pendingFiles.length; i += 64) {
    const chunk = pendingFiles.slice(i, i + 64);
    const files = await Promise.allSettled(chunk.map(fileOf));
    files.forEach((result, j) => {
      const entry = chunk[j];
      if (entry && result.status === 'fulfilled') {
        out.push({ path: entry.fullPath.replace(/^\/+/, ''), file: result.value });
      }
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
