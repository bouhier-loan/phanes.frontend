import { type DragEvent, useEffect, useRef, useState } from 'react';
import { collectFromDrop, collectFromInput, type PickedFile } from '../../adapters/collect';
import { UserMenu } from '../../auth/UserMenu';
import {
  CodeIcon,
  EyeIcon,
  FolderIcon,
  LayersIcon,
  Logo,
  NoSignalIcon,
  ShieldIcon,
  TranslateIcon,
} from '../components/icons';
import { t } from '../strings.fr';

interface Props {
  onFiles: (files: PickedFile[]) => void | Promise<void>;
  onCollecting: (found: number) => void;
  message: string | null;
}

const PRIVACY_ICONS = [NoSignalIcon, ShieldIcon, LayersIcon];
const PERSONA_ICONS = [EyeIcon, CodeIcon, TranslateIcon];

function DropZone({ onFiles, onCollecting, message }: Props) {
  const [active, setActive] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const d = t.home.drop;

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
      aria-labelledby="drop-title"
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
      <FolderIcon size={48} />
      <h2 id="drop-title">{active ? d.active : d.title}</h2>
      <p className="hint">
        {d.hintBefore}
        <code className="inline-code">game/</code>
        {d.hintAfter}
      </p>
      <div className="drop-actions">
        <button type="button" className="btn" onClick={() => folderInput.current?.click()}>
          {d.pickFolder}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => filesInput.current?.click()}
        >
          {d.pickFiles}
        </button>
      </div>
      <p className="drop-note">{d.note}</p>
      {message && (
        <p className="drop-message" role="status">
          {message}
        </p>
      )}
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
    </section>
  );
}

export function HomePage(props: Props) {
  const h = t.home;
  return (
    <div className="home">
      <header className="wrap home-header">
        <a href="#top" className="brand" id="top">
          <Logo />
          {t.appName}
        </a>
        <nav aria-label={h.navLabel} className="home-nav">
          <a href="#fonctionnement">{h.nav.fonctionnement}</a>
          <a href="#confidentialite">{h.nav.confidentialite}</a>
          <a href="#usages">{h.nav.usages}</a>
          <a href="#formats">{h.nav.formats}</a>
        </nav>
        <div className="home-header-end">
          <p className="pill">
            <span className="dot dot-glow" aria-hidden="true" />
            {h.localPill}
          </p>
          <UserMenu compact />
        </div>
      </header>

      <main>
        <section aria-labelledby="titre-hero" className="wrap hero">
          <p className="eyebrow">{h.eyebrow}</p>
          <h1 id="titre-hero">{h.title}</h1>
          <p className="lede">{h.lede}</p>
          <div className="drop-outer">
            <div className="drop-glow" aria-hidden="true" />
            <DropZone {...props} />
          </div>
        </section>

        <section
          id="fonctionnement"
          aria-labelledby="titre-fonctionnement"
          className="wrap section"
        >
          <h2 id="titre-fonctionnement" className="section-title">
            {h.stepsTitle}
          </h2>
          <ol className="cards-3">
            {h.steps.map((step, i) => (
              <li key={step.title} className="step">
                <span className="step-number">{String(i + 1).padStart(2, '0')}</span>
                <span className="step-title">{step.title}</span>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="confidentialite" aria-labelledby="titre-confidentialite" className="band">
          <div className="wrap section">
            <div className="section-head">
              <p className="eyebrow">{h.privacy.eyebrow}</p>
              <h2 id="titre-confidentialite">{h.privacy.title}</h2>
              <p>{h.privacy.lede}</p>
            </div>
            <div className="cards-3">
              {h.privacy.cards.map((card, i) => {
                const Icon = PRIVACY_ICONS[i] ?? ShieldIcon;
                return (
                  <div key={card.title} className="feature">
                    <Icon size={28} />
                    <h3>{card.title}</h3>
                    <p>{card.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="usages" aria-labelledby="titre-usages" className="wrap section usages">
          <div className="section-head">
            <p className="eyebrow">{h.usages.eyebrow}</p>
            <h2 id="titre-usages">{h.usages.title}</h2>
          </div>
          <div className="cards-3">
            {h.usages.personas.map((persona, i) => {
              const Icon = PERSONA_ICONS[i] ?? EyeIcon;
              return (
                <article key={persona.title} className="persona">
                  <Icon size={28} />
                  <h3>{persona.title}</h3>
                  <p className="persona-text">{persona.text}</p>
                  <p className="persona-sections">{persona.sections}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section
          id="formats"
          aria-labelledby="titre-formats"
          className="wrap section formats-section"
        >
          <h2 id="titre-formats" className="formats-title">
            {h.formats.title}
          </h2>
          <dl className="formats">
            {h.formats.rows.map((row) => (
              <div key={row.text}>
                <dt>
                  {row.codes.map((code) => (
                    <code key={code}>{code}</code>
                  ))}
                  {row.label}
                </dt>
                <dd>{row.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="home-footer">
        <div className="wrap">
          {h.footer.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </footer>
    </div>
  );
}
