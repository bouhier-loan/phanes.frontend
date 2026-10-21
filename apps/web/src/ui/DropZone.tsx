import { useEffect, useRef, useState, type DragEvent } from 'react';
import { collectFromDrop, collectFromInput, type PickedFile } from '../adapters/collect';
import { t } from './strings.fr';

interface Props {
  onFiles: (files: PickedFile[]) => void | Promise<void>;
  onCollecting: (found: number) => void;
  message: string | null;
}

export function DropZone({ onFiles, onCollecting, message }: Props) {
  const [active, setActive] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Not in React's typings; supported by every target browser.
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, []);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setActive(false);
    // Items must be read synchronously, during the event.
    const pending = collectFromDrop(event.dataTransfer.items, onCollecting);
    onCollecting(0);
    void pending.then(onFiles);
  };

  const onPick = (input: HTMLInputElement | null) => {
    if (!input?.files) return;
    const files = collectFromInput(input.files);
    input.value = '';
    void onFiles(files);
  };

  return (
    <section
      className={active ? 'dropzone active' : 'dropzone'}
      data-testid="dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setActive(true);
      }}
      onDragLeave={() => {
        setActive(false);
      }}
      onDrop={onDrop}
    >
      <h2>{active ? t.drop.active : t.drop.title}</h2>
      <p>{t.drop.hint}</p>
      <div className="actions">
        <button type="button" onClick={() => folderInput.current?.click()}>
          {t.drop.pickFolder}
        </button>
        <button type="button" className="secondary" onClick={() => filesInput.current?.click()}>
          {t.drop.pickFiles}
        </button>
      </div>
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        data-testid="folder-input"
        onChange={(e) => {
          onPick(e.currentTarget);
        }}
      />
      <input
        ref={filesInput}
        type="file"
        multiple
        hidden
        accept=".rpa,.rpi,.rpyc,.rpymc,.rpy,.rpym,.py,.txt"
        data-testid="files-input"
        onChange={(e) => {
          onPick(e.currentTarget);
        }}
      />
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
