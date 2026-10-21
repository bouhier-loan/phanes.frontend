import { BytesSource, ConcatSource, type FileSource, SliceSource } from '@phanes/renpy-formats';
import { BlobFileSource } from './blob-file-source';
import { mediaType } from './media-type';

function parts(source: FileSource, depth: number): Blob | null {
  if (depth > 16) return null;
  if (source instanceof BlobFileSource) return source.blob;
  if (source instanceof SliceSource) {
    return (
      parts(source.parent, depth + 1)?.slice(source.offset, source.offset + source.size) ?? null
    );
  }
  if (source instanceof BytesSource) return new Blob([source.bytes.slice()]);
  if (source instanceof ConcatSource) {
    const blobs = source.parts.map((p) => parts(p, depth + 1));
    return blobs.every((b): b is Blob => b !== null) ? new Blob(blobs) : null;
  }
  return null;
}

/**
 * A Blob over a VFS source without reading it: a file is its File, an archive
 * entry a slice of the archive's File (plus prefix bytes). Media elements then
 * read it lazily from disk. Null for sources that are not file-backed.
 */
export function blobOf(source: FileSource, path: string): Blob | null {
  const blob = parts(source, 0);
  return blob ? blob.slice(0, blob.size, mediaType(path)) : null;
}
