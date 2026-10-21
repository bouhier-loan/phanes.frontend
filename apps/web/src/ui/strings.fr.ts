import type {
  AnalyzePhase,
  Diagnostic,
  FileKind,
  FileZone,
  SpeakerOrigin,
  VersionConfidence,
  VersionSource,
} from '@phanes/core';

/** Every user-facing string of the interface. */
export const t = {
  appTitle: 'Phanes',
  tagline: 'Analyseur de jeux Ren’Py, entièrement dans votre navigateur.',
  privacy:
    'Aucun fichier ne quitte votre ordinateur : l’analyse se fait localement, sans connexion réseau.',
  drop: {
    title: 'Déposez le dossier d’un jeu Ren’Py',
    hint: 'Le dossier du jeu, son dossier game/, ou des fichiers .rpa, .rpyc, .rpy.',
    pickFolder: 'Choisir un dossier',
    pickFiles: 'Choisir des fichiers',
    active: 'Relâchez pour analyser',
  },
  progress: {
    collecting: (n: number) => `Lecture du dossier… ${n.toLocaleString('fr-FR')} fichiers trouvés`,
    phase: {
      archives: 'Lecture des archives',
      scripts: 'Décodage des scripts',
      translations: 'Lecture des identifiants de traduction',
      analyses: 'Analyses',
      done: 'Terminé',
    } satisfies Record<AnalyzePhase, string>,
    cancel: 'Annuler',
  },
  errors: {
    empty: 'Aucun fichier trouvé dans ce dépôt.',
    failed: (message: string) => `L’analyse a échoué : ${message}`,
    cancelled: 'Analyse annulée.',
  },
  report: {
    analyzeAnother: 'Analyser un autre jeu',
    export: 'Exporter le rapport (JSON)',
    tabs: {
      overview: 'Vue d’ensemble',
      inventory: 'Inventaire',
      characters: 'Personnages',
      labels: 'Labels',
      diagnostics: 'Diagnostics',
    },
    unavailable: 'Cette analyse n’a pas pu être menée (voir les diagnostics).',
  },
  overview: {
    untitled: 'Jeu sans titre',
    renpyVersion: 'Version de Ren’Py',
    unknown: 'inconnue',
    python: (major: number) => `Python ${major}`,
    labels: 'Labels',
    lines: 'Répliques',
    words: 'Mots',
    cjk: 'Caractères CJK',
    readingTime: 'Temps de lecture estimé',
    menus: 'Menus',
    choices: 'Choix',
    scripts: 'Scripts',
    scriptsDetail: (decoded: number, compiled: number, failed: number) =>
      `${decoded} décodés sur ${compiled}` + (failed > 0 ? `, ${failed} en échec` : ''),
    sourceOnly: (n: number) => `${n} script(s) .rpy sans version compilée (non analysés)`,
    languages: 'Traductions',
    noLanguages: 'aucune',
    content: 'Contenu du jeu',
    confidence: {
      exact: 'exacte',
      approximate: 'approximative',
      range: 'estimée',
    } satisfies Record<VersionConfidence, string>,
    source: {
      vc_version: 'renpy/vc_version.py',
      version_tuple: 'renpy/__init__.py',
      log: 'journal log.txt / traceback.txt',
      script_version: 'game/script_version.txt',
      scripts: 'format des scripts compilés',
    } satisfies Record<VersionSource, string>,
  },
  inventory: {
    search: 'Filtrer par nom ou chemin…',
    columns: { name: 'Nom', size: 'Taille', kind: 'Type', source: 'Provenance' },
    onDisk: 'fichier',
    inArchive: (archive: string) => `dans ${archive}`,
    shadowed: (by: string) => `Masqué par ${by} : Ren’Py charge l’autre copie.`,
    totals: (files: number, archives: number, entries: number) =>
      `${files.toLocaleString('fr-FR')} fichiers sur le disque, ${archives} archive(s) contenant ${entries.toLocaleString('fr-FR')} entrées`,
    tooMany: (shown: number, total: number) =>
      `${shown.toLocaleString('fr-FR')} résultats affichés sur ${total.toLocaleString('fr-FR')}`,
    items: (n: number) => `${n.toLocaleString('fr-FR')} élément${n > 1 ? 's' : ''}`,
    archives: 'Archives',
    archiveColumns: {
      path: 'Archive',
      version: 'Format',
      entries: 'Entrées',
      size: 'Taille',
      status: 'État',
    },
    readable: 'lisible',
    unreadable: 'illisible',
    byKind: 'Répartition',
  },
  kinds: {
    script: 'Script source',
    'compiled-script': 'Script compilé',
    archive: 'Archive',
    image: 'Image',
    audio: 'Audio',
    video: 'Vidéo',
    font: 'Police',
    python: 'Python',
    text: 'Texte',
    other: 'Autre',
  } satisfies Record<FileKind, string>,
  zones: {
    game: 'Jeu',
    cache: 'Cache',
    saves: 'Sauvegardes',
    engine: 'Moteur Ren’Py',
    outside: 'Autre',
  } satisfies Record<FileZone, string>,
  characters: {
    columns: {
      name: 'Personnage',
      variable: 'Variable',
      origin: 'Définition',
      lines: 'Répliques',
      words: 'Mots',
      share: 'Part',
    },
    narrator: 'Narrateur',
    nameless: '(sans nom)',
    nvl: 'NVL',
    dynamic: 'nom dynamique',
    origin: {
      define: 'define',
      default: 'default',
      python: 'bloc python',
      builtin: 'intégré',
      literal: 'nom littéral',
      expression: 'expression',
      undefined: 'non trouvée',
    } satisfies Record<SpeakerOrigin, string>,
    empty: 'Aucune réplique trouvée.',
  },
  labels: {
    search: 'Filtrer les labels…',
    columns: { name: 'Label', file: 'Fichier', line: 'Ligne', lines: 'Répliques', words: 'Mots' },
    local: 'local',
    hidden: 'caché',
    count: (n: number) => `${n.toLocaleString('fr-FR')} labels`,
    duplicates: (names: string) => `Labels définis plusieurs fois : ${names}`,
    empty: 'Aucun label trouvé.',
  },
  diagnostics: {
    none: 'Aucun problème détecté.',
    severity: { error: 'Erreur', warning: 'Avertissement', info: 'Information' } satisfies Record<
      Diagnostic['severity'],
      string
    >,
    summary: (errors: number, warnings: number, infos: number) =>
      `${errors} erreur(s), ${warnings} avertissement(s), ${infos} information(s)`,
  },
};

function detail(d: Diagnostic, key: string): string {
  const value = d.details?.[key];
  return value === undefined || value === null ? '' : String(value);
}

/** French explanation of a diagnostic; falls back to the technical message. */
export function describeDiagnostic(d: Diagnostic): string {
  switch (d.code) {
    case 'RPA_UNKNOWN_HEADER':
      return `Archive dans un format non pris en charge (en-tête « ${detail(d, 'header')} ») : variante non standard ou obfusquée.`;
    case 'RPA_BAD_HEADER':
      return 'En-tête d’archive RPA invalide.';
    case 'RPA_BAD_INDEX':
      return 'Index d’archive RPA invalide.';
    case 'RPA_ENTRY_SKIPPED':
      return `Entrée « ${detail(d, 'entry')} » ignorée : ${d.message}.`;
    case 'RPA_MISSING_DATA':
      return 'Index RPA-1.0 (.rpi) sans le fichier de données .rpa correspondant.';
    case 'RPYC_BAD_HEADER':
      return `Script compilé illisible (en-tête « ${detail(d, 'header')} ») : fichier obfusqué, corrompu ou d’un autre format.`;
    case 'RPYC_NO_SLOT':
    case 'RPYC_BAD_PAYLOAD':
      return 'Script compilé sans contenu exploitable.';
    case 'RPYC_SLOT_FALLBACK':
      return 'Première version du script illisible ; la seconde (après transformations) a été utilisée.';
    case 'ZLIB_INVALID':
      return 'Données compressées corrompues.';
    case 'ZLIB_LIMIT':
    case 'TOO_LARGE':
      return 'Fichier trop volumineux pour être décodé sans risque.';
    case 'PICKLE_INVALID':
      return 'Données sérialisées (pickle) corrompues.';
    case 'PICKLE_UNSUPPORTED':
      return 'Données sérialisées dans une forme non prise en charge.';
    case 'PICKLE_LIMIT':
      return 'Données sérialisées hors des limites de sécurité.';
    case 'TRUNCATED':
      return 'Fichier tronqué.';
    case 'IO_READ_FAILED':
      return 'Fichier illisible (droits d’accès ou fichier déplacé ?).';
    case 'AST_UNKNOWN_NODE':
      return `${detail(d, 'count')} instruction(s) de type ${detail(d, 'className')} non interprétée(s).`;
    case 'AST_MALFORMED':
      return 'Certaines instructions du script n’ont pas pu être lues.';
    case 'MULTIPLE_GAME_DIRS':
      return `Plusieurs dossiers game/ déposés ; seul « ${detail(d, 'chosen')} » est analysé.`;
    case 'ANALYSIS_FAILED':
      return `L’analyse « ${detail(d, 'analysis')} » a échoué ; les autres sections restent valables.`;
    default:
      return d.message;
  }
}
