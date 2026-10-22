import type {
  AnalyzePhase,
  CharacterImageMatch,
  Diagnostic,
  FileKind,
  ImageCategory,
  SpeakerOrigin,
  VersionConfidence,
  VersionSource,
} from '@phanes/core';
import type { Section } from './route';

const fr = (n: number) => n.toLocaleString('fr-FR');
const s = (n: number, plural = 's') => (n > 1 ? plural : '');

/** Every user-facing string of the interface. */
export const t = {
  appName: 'Phanes',
  untitled: 'Jeu sans titre',
  crumbs: (title: string, group: string) => `${title} › ${group}`,
  groups: {
    report: 'Rapport',
    story: 'Histoire',
    resources: 'Ressources et langues',
  },
  sections: {
    'vue-ensemble': 'Vue d’ensemble',
    inventaire: 'Inventaire',
    personnages: 'Personnages',
    labels: 'Labels',
    diagnostics: 'Diagnostics',
    graphe: 'Graphe',
    choix: 'Choix',
    variables: 'Variables',
    lecteur: 'Lecteur de script',
    ressources: 'Ressources',
    traductions: 'Traductions',
    export: 'Exporter en JSON',
  } satisfies Record<Section, string>,
  pager: {
    range: (from: number, to: number, total: number) => `${fr(from)}–${fr(to)} sur ${fr(total)}`,
    previous: 'Précédent',
    next: 'Suivant',
  },
  more: (n: number) => `Afficher ${fr(n)} de plus`,
  others: (n: number) => `${fr(n)} autre${s(n)}`,
  unavailable: 'Cette analyse n’a pas pu être menée (voir les diagnostics).',
  none: 'Aucun',
  requests: (n: number) => `${fr(n)} requête${s(n)}`,

  errors: {
    empty: 'Aucun fichier trouvé dans ce dépôt.',
    failed: (message: string) => `L’analyse a échoué : ${message}`,
    cancelled: 'Analyse annulée.',
  },

  auth: {
    signingIn: 'Connexion…',
    redirecting: 'Redirection vers le fournisseur d’identité…',
    errorTitle: 'Connexion impossible',
    retry: 'Réessayer',
    refused: (description: string) =>
      `Le fournisseur d’identité a refusé la connexion : ${description}`,
    stateMismatch:
      'La réponse du fournisseur d’identité ne correspond pas à la demande en cours. Recommencez la connexion.',
    storage:
      'Le stockage de session du navigateur est indisponible (navigation privée stricte ?). Il est nécessaire pour se connecter.',
    unreachable:
      'Le fournisseur d’identité est injoignable. Vérifiez votre connexion, puis réessayez.',
    invalid: (message: string) => `La réponse du fournisseur d’identité est invalide : ${message}`,
    signOut: 'Se déconnecter',
    signedInAs: 'Connecté',
  },

  home: {
    navLabel: 'Navigation principale',
    nav: {
      fonctionnement: 'Fonctionnement',
      confidentialite: 'Confidentialité',
      usages: 'Pour qui ?',
      formats: 'Formats',
    },
    localPill: '100 % local, rien n’est envoyé',
    eyebrow: 'Analyseur de jeux Ren’Py · dans votre navigateur',
    title: 'Faites la lumière sur un jeu Ren’Py.',
    lede: 'Déposez le dossier d’un jeu. Phanes ouvre ses archives .rpa, décode ses scripts compilés et vous rend un rapport sur ses personnages, ses dialogues, ses choix et ses ressources. Sans rien envoyer nulle part.',
    drop: {
      title: 'Glissez le dossier du jeu ici',
      active: 'Relâchez pour analyser',
      hintBefore: 'Le dossier qui contient ',
      hintAfter: ', ou directement des fichiers .rpa, .rpyc, .rpymc ou .rpy.',
      pickFolder: 'Choisir un dossier',
      pickFiles: 'Choisir des fichiers',
      note: 'Plusieurs Go ? Aucun souci : les archives sont lues par tranches, jamais chargées en entier.',
    },
    stepsTitle: 'Fonctionnement',
    steps: [
      {
        title: 'Déposez',
        text: 'Le dossier du jeu, ou seulement quelques fichiers. Rien n’est téléversé : le navigateur lit les fichiers sur place.',
      },
      {
        title: 'Analysez',
        text: 'Archives et scripts sont décodés en arrière-plan, avec une progression visible. L’interface reste fluide.',
      },
      {
        title: 'Explorez',
        text: 'Parcourez le rapport section par section, puis exportez-le en JSON pour le garder ou le comparer.',
      },
    ],
    privacy: {
      eyebrow: 'Confidentialité',
      title: 'Le jeu reste sur votre machine. Toujours.',
      lede: 'Phanes n’a ni serveur d’analyse, ni stockage distant : la connexion sert seulement à vous identifier. Vous n’avez pas à nous croire sur parole : vous pouvez le vérifier.',
      cards: [
        {
          title: 'Zéro requête pendant l’analyse',
          text: 'Une politique de sécurité stricte (CSP) bloque toute connexion, sauf vers le fournisseur d’identité au moment de la connexion. Ouvrez l’onglet Réseau de votre navigateur pendant l’analyse : il reste vide.',
        },
        {
          title: 'Aucun code du jeu n’est exécuté',
          text: 'Les scripts compilés sont lus comme de simples données, avec des limites de taille et de profondeur. Un fichier piégé ne peut rien lancer.',
        },
        {
          title: 'Pensé pour les gros jeux',
          text: 'Les archives de plusieurs Go sont lues morceau par morceau. Seuls les scripts sont décompressés ; images, sons et vidéos sont listés, et lus seulement si vous les ouvrez dans le rapport.',
        },
      ],
    },
    usages: {
      eyebrow: 'Pour qui ?',
      title: 'Un rapport, trois façons de le lire.',
      personas: [
        {
          title: 'Joueurs curieux',
          text: 'Combien d’heures de lecture ? Combien de fins, de choix, de personnages ? Mesurez la taille et les embranchements d’un jeu avant de vous lancer.',
          sections: 'Vue d’ensemble · Graphe · Choix',
        },
        {
          title: 'Créateurs Ren’Py',
          text: 'Auditez votre projet compilé : labels jamais atteints, jumps vers des labels inexistants, images déclarées mais jamais affichées, fichiers manquants.',
          sections: 'Labels · Diagnostics · Ressources',
        },
        {
          title: 'Traducteurs et moddeurs',
          text: 'Repérez les textes à traduire, les langues déjà présentes et leur couverture, puis lisez le script reconstitué avant de vous y plonger.',
          sections: 'Personnages · Traductions · Lecteur',
        },
      ],
    },
    formats: {
      title: 'Formats pris en charge',
      rows: [
        {
          codes: ['.rpa', '.rpi'],
          label: null,
          text: 'Archives RPA-1.0, RPA-2.0 et RPA-3.0 : l’index est décodé, le contenu est listé, les scripts sont lus directement dans l’archive.',
        },
        {
          codes: ['.rpyc', '.rpymc'],
          label: null,
          text: 'Scripts compilés de Ren’Py 6, 7 et 8, qu’ils soient dans le dossier du jeu ou rangés dans une archive.',
        },
        {
          codes: ['.rpy'],
          label: null,
          text: 'Scripts source : inventoriés. Seuls les scripts compilés sont analysés.',
        },
        {
          codes: [],
          label: 'Images, audio, vidéo, polices',
          text: 'Inventoriés avec leur taille et leur emplacement. Jamais extraits : une image ou une vidéo n’est lue que lorsque vous l’ouvrez dans le rapport.',
        },
      ],
    },
    footer: [
      'Phanes lit, il ne modifie rien : pas d’extraction en masse, pas de reconditionnement.',
      'Projet indépendant, non affilié à Ren’Py.',
    ],
  },

  analysis: {
    eyebrow: (clock: string) => `Analyse en cours · ${clock}`,
    title: {
      collecting: 'Lecture du dossier…',
      archives: 'Lecture des archives…',
      scripts: 'Décodage des scripts…',
      translations: 'Identifiants de traduction…',
      analyses: 'Analyses…',
      done: 'Rapport prêt',
    } satisfies Record<AnalyzePhase | 'collecting', string>,
    lede: 'L’analyse se fait en arrière-plan, dans votre navigateur. Le rapport s’affiche dès qu’elle est terminée.',
    cancel: 'Annuler',
    networkPill: (n: number) => `Réseau : ${fr(n)} requête${s(n)}`,
    progress: 'Progression globale',
    dropped: (files: number, bytes: string) => `${fr(files)} fichiers · ${bytes} déposés`,
    stepsLabel: 'Étapes de l’analyse',
    steps: {
      collecting: 'Inventaire des fichiers',
      archives: 'Lecture des index d’archives',
      scripts: 'Décodage des scripts compilés',
      translations: 'Identifiants de traduction',
      analyses: 'Analyses',
    },
    analysesDetail: 'personnages, labels, graphe, choix, variables, ressources, traductions',
    translationsDetail: 'relecture des scripts de la langue par défaut',
    status: { done: 'Terminé', running: 'En cours', waiting: 'En attente' },
    errors: (n: number) => `${fr(n)} erreur${s(n)}`,
    count: (done: number, total: number) => `${fr(done)} sur ${fr(total)}`,
    found: (n: number) => `${fr(n)} fichiers trouvés`,
    analysisNames: {
      overview: 'vue d’ensemble',
      inventory: 'inventaire',
      characters: 'personnages',
      labels: 'labels',
      diagnostics: 'diagnostics',
      storyGraph: 'graphe de l’histoire',
      menus: 'choix',
      variables: 'variables',
      assets: 'ressources',
      translations: 'traductions',
    } as Readonly<Record<string, string>>,
    asideLabel: 'Suivi de l’analyse',
    networkTitle: 'Requêtes réseau depuis le début',
    networkText:
      'Vérifiez-le vous-même dans l’onglet Réseau des outils de développement de votre navigateur.',
    journal: 'Journal',
    journalCollected: (n: number) => `${fr(n)} fichiers inventoriés`,
    journalPhase: (phase: string) => `${phase} : début`,
  },

  nav: {
    label: 'Sections du rapport',
    menu: 'Menu',
    newAnalysis: 'Nouvelle analyse',
    offline: (n: number) => `Hors ligne · ${fr(n)} requête${s(n)} réseau`,
    gameMeta: (size: string, version: string | null) =>
      version ? `${size} · Ren’Py ${version}` : size,
  },

  overview: {
    lede: (duration: string | null, decoded: number, compiled: number) =>
      `${duration ? `Analyse terminée en ${duration} · ` : ''}${fr(decoded)} script${s(decoded)} compilé${s(decoded)} décodé${s(decoded)} sur ${fr(compiled)}.`,
    failed: (n: number) =>
      n > 1
        ? `${fr(n)} scripts n’ont pas pu être décodés : les chiffres ci-dessous ne les incluent pas.`
        : '1 script n’a pas pu être décodé : les chiffres ci-dessous ne l’incluent pas.',
    seeDiagnostics: 'Voir les diagnostics',
    readingTime: 'Temps de lecture estimé',
    underAMinute: '< 1 min',
    readingNote:
      'Pour lire tout le texte du jeu, toutes branches confondues. Une seule partie est plus courte.',
    speed: 'Vitesse de lecture',
    wpm: (n: number) => `${n} mots/min`,
    labels: 'Labels',
    lines: 'Répliques',
    words: 'Mots',
    cjk: (n: number) => `${fr(n)} caractères CJK`,
    characters: 'Personnages',
    menus: 'Menus de choix',
    options: (n: number) => `${fr(n)} option${s(n)}`,
    endings: 'Fins',
    seeGraph: 'Voir le graphe',
    keyFigures: 'Chiffres clés',
    breakdown: 'Répartition du contenu',
    breakdownTotal: (bytes: string, files: number) => `${bytes} · ${fr(files)} fichiers`,
    breakdownRow: (count: number, bytes: string, percent: string) =>
      `${fr(count)} · ${bytes} · ${percent}`,
    kinds: {
      image: 'Images',
      audio: 'Audio',
      video: 'Vidéo',
      script: 'Scripts',
      font: 'Polices',
      other: 'Autres',
    },
    voices: 'Qui parle le plus ?',
    voicesNote: 'Part des mots prononcés.',
    allCharacters: (n: number) => `Les ${fr(n)} personnages`,
    diagnostics: 'Diagnostics',
    severities: (n: number) => ({
      error: `erreur${s(n)}`,
      warning: `avertissement${s(n)}`,
      info: `info${s(n)}`,
    }),
    noDiagnostics: 'Aucun problème détecté.',
    allDiagnostics: 'Tous les diagnostics',
    engine: 'Moteur et formats',
    renpyVersion: 'Version de Ren’Py',
    unknown: 'inconnue',
    fromSource: (source: string) => `d’après ${source}`,
    archives: 'Archives',
    noArchives: 'Aucune',
    unrecognized: (n: number) => `${fr(n)} non reconnue${s(n)}`,
    scripts: 'Scripts',
    sourceOnly: (n: number) => `${fr(n)} .rpy sans version compilée, non analysé${s(n)}`,
    languages: 'Langues',
    languagesValue: (n: number) =>
      n === 0 ? 'Langue par défaut uniquement' : `Langue par défaut + ${fr(n)} traduction${s(n)}`,
    openInventory: 'Ouvrir l’inventaire',
    confidence: {
      exact: 'exacte',
      approximate: 'approximative',
      range: 'estimée',
    } satisfies Record<VersionConfidence, string>,
    source: {
      vc_version: 'renpy/vc_version.py',
      version_tuple: 'renpy/__init__.py',
      log: 'log.txt / traceback.txt',
      script_version: 'script_version.txt',
      scripts: 'le format des scripts compilés',
    } satisfies Record<VersionSource, string>,
    python: (major: number) => `Python ${major}`,
  },

  inventory: {
    lede: 'Les fichiers du dossier et le contenu des archives, réunis dans une seule arborescence.',
    search: 'Filtrer par nom ou chemin',
    kindsLabel: 'Type de fichier',
    all: 'Tout',
    kinds: {
      scripts: 'Scripts',
      image: 'Images',
      audio: 'Audio',
      video: 'Vidéo',
      font: 'Polices',
      archive: 'Archives',
      other: 'Autres',
    },
    showArchives: 'Afficher le contenu des archives',
    totals: (files: number, archives: number, entries: number) =>
      `${fr(files)} fichiers sur le disque · ${fr(archives)} archive${s(archives)} · ${fr(entries)} entrées`,
    tree: 'Arborescence',
    columns: { name: 'Nom', type: 'Type', size: 'Taille' },
    dir: (n: number) => `Dossier · ${fr(n)} élément${s(n)}`,
    expand: (name: string) => `Déplier ${name}`,
    collapse: (name: string) => `Replier ${name}`,
    archiveType: (version: string | null, entries: number) =>
      version ? `Archive ${version} · ${fr(entries)} entrées` : 'Archive',
    inArchive: 'dans l’archive',
    badges: {
      unreadable: 'illisible',
      unrecognized: 'non reconnue',
      shadowed: 'masqué',
      limit: 'limite atteinte',
    },
    shadowed: (by: string) => `Masqué par ${by} : Ren’Py charge l’autre copie.`,
    tooMany: (shown: number, total: number) => `${fr(shown)} résultats affichés sur ${fr(total)}`,
    detailsLabel: 'Détails de la sélection',
    selectHint: 'Sélectionnez une archive ou un fichier pour voir ses détails.',
    size: 'Taille',
    sizeValue: (pretty: string, bytes: number) => `${pretty} · ${fr(bytes)} octets`,
    index: 'Index',
    indexValue: (offset: string, protocol: number | null) =>
      `offset ${offset}${protocol === null ? '' : ` · pickle protocole ${protocol}`}`,
    key: 'Clé XOR',
    content: 'Contenu',
    entries: (n: number) => `${fr(n)} entrée${s(n)}`,
    skipped: (n: number) => `${fr(n)} ignorée${s(n)}`,
    decoding: 'Décodage des scripts',
    decodingValue: (ok: number, failed: number) =>
      `${fr(ok)} réussi${s(ok)}${failed > 0 ? ` · ${fr(failed)} illisible${s(failed)}` : ''}`,
    error: 'Erreur',
    kind: 'Type',
    location: 'Emplacement',
    onDisk: 'sur le disque',
    archiveNote:
      'Le contenu des archives est listé, jamais extrait. Seuls les scripts sont décompressés pour l’analyse.',
    heaviest: 'Fichiers les plus lourds',
    seeInResources: 'Voir dans Ressources',
    preview: {
      title: 'Aperçu',
      loading: 'Chargement…',
      unavailable: 'Ce fichier ne peut pas être ouvert.',
      enlarge: 'Agrandir',
      close: 'Fermer',
      zoomLabel: 'Zoom',
      fit: 'Ajuster',
      actual: '100 %',
      imageAlt: (name: string) => `Aperçu de ${name}`,
      pixels: (w: number, h: number) => `${fr(w)} × ${fr(h)} px`,
      cannotShow: 'Ce navigateur ne sait pas afficher cette image.',
      cannotPlay: 'Ce navigateur ne sait pas lire ce format.',
      duration: (text: string) => `Durée ${text}`,
      textNote: (shown: string, total: string) =>
        `Aperçu limité aux ${shown} premiers, sur ${total}.`,
      binary: (n: number) => `Contenu binaire : les ${fr(n)} premiers octets en hexadécimal.`,
      fontSample: 'Portez ce vieux whisky au juge blond qui fume.',
      fontAlphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 àéèêçœ',
      fontTooLarge: (limit: string) => `Police trop lourde pour un aperçu (plus de ${limit}).`,
      fontFailed: 'Ce navigateur ne sait pas lire cette police.',
      labels: (n: number) => `Labels de ce script · ${fr(n)}`,
      archive:
        'Le contenu d’une archive se parcourt dans l’arborescence : cochez « Afficher le contenu des archives ».',
      localNote:
        'Lu directement dans le fichier, sur cette machine. Rien n’est extrait ni enregistré.',
    },
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

  characters: {
    lede: (n: number, lines: number, words: number) =>
      `${fr(n)} personnage${s(n)} · ${fr(lines)} répliques · ${fr(words)} mots.`,
    sortLabel: 'Trier par',
    byWords: 'Trier par mots',
    byLines: 'par répliques',
    tableLabel: 'Tableau des personnages',
    columns: {
      name: 'Personnage',
      defined: 'Défini dans',
      lines: 'Répliques',
      words: 'Mots',
      share: 'Part des mots',
      ratio: 'Mots / réplique',
    },
    narrator: 'Narrateur',
    nameless: '(sans nom)',
    narratorDefined: 'Répliques sans personnage',
    builtin: 'Intégré à Ren’Py',
    literal: 'Nom écrit dans la réplique',
    notFound: 'Définition introuvable',
    others: (n: number) => `${fr(n)} autres personnages`,
    nvl: 'NVL',
    dynamic: 'nom dynamique',
    dynamicCallout: (lines: number) =>
      `a un nom interpolé à l’exécution : ${lines > 1 ? `ses ${fr(lines)} répliques sont comptées` : 'sa réplique est comptée'} à part, sous son nom de variable.`,
    definition: 'Définition',
    firstLine: (loc: string) => `Première réplique · ${loc}`,
    presentIn: 'Présent dans',
    presentInValue: (n: number, total: number) => `${fr(n)} label${s(n)} sur ${fr(total)}`,
    linesByFile: 'Répliques par fichier',
    sprites: (n: number) => `Sprites · ${fr(n)} image${s(n)}`,
    seeResources: 'Tout voir dans Ressources',
    neverShown: 'jamais affichée',
    noSprites: 'Aucune image trouvée pour ce personnage.',
    imagesTitle: 'Images du personnage',
    portrait: (name: string) => `Portrait de ${name}`,
    matchedBy: 'Trouvées par l’étiquette',
    match: {
      image: 'image= de la définition',
      name: 'nom du personnage',
      variable: 'nom de variable',
    } satisfies Record<CharacterImageMatch, string>,
    side: (n: number) => `Portraits latéraux · ${fr(n)}`,
    files: (n: number) => `Fichiers associés · ${fr(n)}`,
    filesNote:
      'Fichiers d’image rangés sous son nom ou nommés d’après lui (parties de layeredimage…) : déduits du chemin, à vérifier.',
    missingImages: (n: number) => `Affichées mais introuvables · ${fr(n)}`,
    imagesNote:
      'Phanes cherche les images dont l’étiquette est l’image= de la définition, le nom du personnage ou sa variable, ses portraits « side », et les fichiers rangés sous son nom.',
    moreImages: (n: number) => `et ${fr(n)} de plus dans Ressources`,
    select: (name: string) => `Afficher la fiche de ${name}`,
    empty: 'Aucune réplique trouvée.',
    origin: {
      define: 'define',
      default: 'default',
      python: 'bloc python',
      builtin: 'intégré',
      literal: 'nom littéral',
      expression: 'expression',
      undefined: 'non trouvée',
    } satisfies Record<SpeakerOrigin, string>,
  },

  labels: {
    lede: (n: number) => `${fr(n)} labels, avec leur fichier source et leur numéro de ligne.`,
    search: 'Rechercher un label',
    filterLabel: 'Filtrer les labels',
    filters: {
      all: 'Tous',
      entry: 'Point d’entrée',
      endings: 'Fins',
      unreachable: 'Inaccessibles',
      local: 'Labels locaux',
    },
    listLabel: 'Liste des labels',
    columns: {
      name: 'Label',
      file: 'Fichier source',
      line: 'Ligne',
      lines: 'Répliques',
      status: 'Statut',
    },
    status: {
      entry: 'Point d’entrée',
      ending: 'Fin',
      unreachable: 'Inaccessible',
      local: 'Label local',
      hidden: 'caché',
    },
    duplicates: (names: string) => `Labels définis plusieurs fois : ${names}`,
    noteBefore: 'Les statuts « Point d’entrée », « Fin » et « Inaccessible » viennent du ',
    noteLink: 'graphe de l’histoire',
    empty: 'Aucun label trouvé.',
    noMatch: 'Aucun label ne correspond.',
  },

  diagnostics: {
    lede: 'Les fichiers illisibles ou non pris en charge, et pourquoi. Aucun de ces problèmes n’empêche l’affichage du reste du rapport.',
    filterLabel: 'Filtrer par niveau',
    all: 'Tous',
    plural: { error: 'Erreurs', warning: 'Avertissements', info: 'Informations' },
    severity: {
      error: 'Erreur',
      warning: 'Avertissement',
      info: 'Information',
    } satisfies Record<Diagnostic['severity'], string>,
    showDetails: 'Détails',
    hideDetails: 'Masquer les détails',
    code: 'Code',
    none: 'Aucun problème détecté.',
    seeTranslations: 'Voir les traductions',
  },

  export: {
    title: 'Exporter le rapport',
    lede: 'Un fichier JSON, une clé par analyse. Il est créé dans votre navigateur : aucune copie n’est envoyée.',
    sections: 'Sections à inclure',
    options: 'Options',
    includeText: 'Inclure le texte des répliques',
    includeTextNote: 'Beaucoup plus lourd : tout le dialogue du jeu.',
    indent: 'JSON indenté',
    size: 'Taille estimée',
    computing: 'calcul…',
    download: 'Télécharger le JSON',
    copy: 'Copier dans le presse-papiers',
    copied: 'Copié dans le presse-papiers.',
    copyFailed: 'La copie a été refusée par le navigateur.',
    preview: 'Aperçu',
    moreLines: (n: number) => `… ${fr(n)} lignes de plus`,
    keys: {
      overview: 'Vue d’ensemble',
      inventory: 'Inventaire',
      characters: 'Personnages',
      labels: 'Labels',
      diagnostics: 'Bilan des diagnostics',
      storyGraph: 'Graphe de l’histoire',
      menus: 'Choix',
      variables: 'Variables',
      assets: 'Ressources',
      translations: 'Traductions',
    } as Readonly<Record<string, string>>,
    diagnosticsList: 'Liste des diagnostics',
  },

  graph: {
    title: 'Graphe de l’histoire',
    lede: 'Les labels, reliés par les jump, les call et les choix des menus.',
    counters: {
      labels: 'labels',
      endings: 'fins',
      unreachable: 'inaccessibles',
      broken: 'jumps cassés',
    },
    scope: 'Portée',
    wholeGame: 'Tout le jeu',
    legend: 'Légende',
    legendItems: {
      jump: 'jump',
      call: 'call',
      choice: 'choix',
      broken: 'vers un label inexistant',
    },
    zoom: 'Zoom',
    zoomIn: 'Zoomer',
    zoomOut: 'Dézoomer',
    recenter: 'Recentrer',
    canvasLabel: (scope: string) => `Graphe : ${scope}`,
    tooBig: (n: number) =>
      `Le jeu compte ${fr(n)} labels : choisissez une portée (un fichier) pour afficher le graphe.`,
    node: {
      unreachable: 'inaccessible',
      missing: 'label inexistant',
      outOfScope: 'hors de la portée',
      ending: (loc: string) => `FIN · ${loc}`,
      menu: (n: number) => `menu · ${fr(n)} choix`,
      screen: 'écran ou code',
    },
    selectedLabel: 'Label sélectionné',
    selectHint: 'Sélectionnez un label dans le graphe.',
    lines: (n: number) => `${fr(n)} réplique${s(n)}`,
    comesFrom: 'Arrive depuis',
    leadsTo: 'Mène vers',
    edgeKind: {
      jump: 'jump',
      call: 'call',
      fallthrough: 'enchaînement',
      reference: 'référence',
      choice: 'choix',
      conditionalChoice: 'choix conditionnel',
      conditional: 'jump conditionnel',
    },
    speakers: 'Personnages présents',
    read: 'Lire dans le lecteur',
    seeMenu: 'Voir les choix',
    structure: 'Structure du jeu entier',
    broken: (n: number) => `Jumps cassés · ${fr(n)}`,
    unreachable: (n: number) => `Labels inaccessibles · ${fr(n)}`,
    unreachableNote: 'Aucun jump, call ni choix n’y mène depuis start.',
    endings: (n: number) => `Fins · ${fr(n)}`,
    endingsNote: 'Labels qui terminent la partie sans mener ailleurs.',
    dynamic: (n: number) => `Sauts calculés · ${fr(n)}`,
    dynamicNote: 'jump expression et call expression dont la cible dépend du jeu en cours.',
    inLabel: (loc: string, label: string | null) => (label ? `${loc} · dans ${label}` : loc),
    resolved: (target: string) => `→ ${target}`,
  },

  choices: {
    lede: (menus: number, options: number, conditional: number) =>
      `${fr(menus)} menu${s(menus)} · ${fr(options)} option${s(options)}, dont ${fr(conditional)} soumise${s(conditional)} à une condition.`,
    filterLabel: 'Filtrer les menus',
    filters: { all: 'Tous', conditional: 'Avec conditions', prompt: 'Avec invite' },
    file: 'Fichier',
    allFiles: 'Tous les fichiers',
    menuIn: 'Menu dans ',
    outsideLabel: 'hors label',
    seeGraph: 'Voir dans le graphe',
    noPrompt: 'Sans invite',
    columns: { option: 'Option', condition: 'Condition', next: 'Suite' },
    lines: (n: number) => `bloc de ${fr(n)} réplique${s(n)}`,
    then: ', puis ',
    continues: 'la suite du label',
    broken: ' · mène à un jump cassé',
    more: (n: number) => `Afficher ${fr(n)} autres menus`,
    empty: 'Ce jeu n’a aucun menu de choix.',
  },

  variables: {
    lede: (n: number, d: number, f: number, c: number) =>
      `${fr(n)} variables : ${fr(d)} default, ${fr(f)} define dont ${fr(c)} personnage${s(c)}. Où elles naissent, où elles changent, où elles comptent.`,
    search: 'Rechercher une variable',
    filterLabel: 'Filtrer les variables',
    filters: {
      all: 'Toutes',
      default: 'default',
      define: 'define',
      neverRead: 'Jamais lues',
      neverWritten: 'Jamais modifiées',
    },
    tableLabel: 'Tableau des variables',
    columns: {
      name: 'Variable',
      kind: 'Déclaration',
      value: 'Valeur initiale',
      file: 'Fichier',
      writes: 'Modifiée',
      reads: 'Lue',
    },
    neverRead: 'jamais lue',
    engine: 'réglage Ren’Py',
    writtenAt: (n: number) => `Modifiée à ${fr(n)} endroit${s(n)}`,
    readAt: (n: number) => `Lue à ${fr(n)} endroit${s(n)}`,
    noSite: 'Nulle part dans le script.',
    shown: (shown: number, total: number) => `${fr(shown)} sur ${fr(total)} affichées.`,
    charactersBefore: 'Les personnages sont détaillés dans ',
    heuristic:
      'Les modifications faites dans des blocs python: ou par des fonctions sont repérées au mieux, sans exécuter le code du jeu.',
    toggle: (name: string) => `Détails de ${name}`,
    empty: 'Aucune variable déclarée avec default ou define.',
  },

  resources: {
    lede: {
      images:
        'Les images déclarées, comparées à celles que le script affiche vraiment avec scene et show.',
      audio: 'Les sons du jeu, comparés à ceux que le script joue avec play, queue et voice.',
      video: 'Les vidéos du jeu, lues sur place quand votre navigateur connaît leur format.',
    },
    tabsLabel: 'Type de ressource',
    tabs: { images: 'Images', audio: 'Audio', video: 'Vidéo' },
    summaryLabel: 'Bilan',
    declared: 'Images déclarées',
    automatic: (n: number) => `dont ${fr(n)} définie${s(n)} automatiquement depuis images/`,
    displayed: 'Affichées au moins une fois',
    neverDisplayed: 'Jamais affichées',
    neverBytes: (bytes: string) => `${bytes} au total`,
    missing: 'Manquantes',
    missingNote: 'affichées mais introuvables',
    gallery: 'Galerie',
    categoryLabel: 'Catégorie d’image',
    categories: {
      all: 'Toutes',
      background: 'Décors',
      sprite: 'Sprites',
      cg: 'CG',
      other: 'Autres',
    } satisfies Record<ImageCategory | 'all', string>,
    neverShown: 'jamais affichée',
    thumbsNote:
      'Les vignettes sont décodées au fil du défilement, directement depuis les fichiers.',
    search: 'Filtrer par nom ou chemin',
    statusLabel: 'État',
    imageStatus: {
      all: 'Toutes',
      displayed: 'Affichées',
      never: 'Jamais affichées',
      'missing-file': 'Fichier introuvable',
      'no-file': 'Sans fichier',
    },
    audioStatus: { all: 'Tous', played: 'Joués', never: 'Jamais joués' },
    channelLabel: 'Canal',
    allChannels: 'Tous les canaux',
    channel: (c: string) => (c === 'python' ? 'code Python' : c),
    groupByTag: 'Grouper par étiquette',
    groupByFolder: 'Grouper par dossier',
    rootFolder: '(racine du jeu)',
    groupSummary: (n: number, bytes: string) => `${fr(n)} · ${bytes}`,
    expandGroup: (name: string) => `Déplier ${name}`,
    collapseGroup: (name: string) => `Replier ${name}`,
    shown: (n: number, total: number, bytes: string) =>
      n === total ? `${fr(n)} · ${bytes}` : `${fr(n)} sur ${fr(total)} · ${bytes}`,
    noMatch: 'Aucune ressource ne correspond à ces filtres.',
    resetFilters: 'Effacer les filtres',
    select: (name: string) => `Afficher ${name}`,
    pickAudio: 'Sélectionnez un son pour l’écouter et voir où le script le joue.',
    duration: (text: string) => `Durée ${text}`,
    playedIn: (n: number) => `Joué ${fr(n)} fois par le script`,
    neverPlayedNote: 'Aucune instruction du script ne joue ce son.',
    moreSites: (n: number) => `et ${fr(n)} autre${s(n)}`,
    fit: 'Ajuster',
    actual: '100 %',
    zoomLabel: 'Zoom',
    previous: 'Image précédente',
    next: 'Image suivante',
    file: 'Fichier',
    format: 'Format',
    declaration: 'Déclaration',
    automaticDeclaration: 'Automatique, depuis images/',
    statementAt: (loc: string) => `image · ${loc}`,
    displayedTimes: (n: number) => `Affichée ${fr(n)} fois`,
    notDisplayed: 'Jamais affichée',
    localNote:
      'Lue directement dans le fichier, sur cette machine. Rien n’est extrait ni enregistré.',
    noFile: 'Aucun fichier associé (image composée ou ATL).',
    loading: 'Chargement…',
    cannotShow: 'Ce navigateur ne sait pas afficher ce fichier.',
    preview: (name: string) => `Aperçu de ${name}`,
    missingTitle: 'Images manquantes',
    missingColumns: { statement: 'Instruction', location: 'Emplacement', problem: 'Problème' },
    undeclared: 'Aucune image déclarée sous ce nom.',
    suggestion: 'Nom proche : ',
    fileMissing: (path: string) => `Déclarée vers ${path}, fichier introuvable.`,
    sortLabel: 'Trier par',
    sort: { size: 'Taille', name: 'Nom', folder: 'Dossier', uses: 'Utilisations' },
    pythonWarning:
      'Les images affichées par du code Python (renpy.show, ConditionSwitch, noms construits avec des variables) ne sont repérées qu’en partie. Vérifiez avant de supprimer quoi que ce soit.',
    noImages: 'Ce jeu ne déclare aucune image.',
    audioFiles: 'Fichiers audio',
    audioPlayed: 'Joués par le script',
    audioNever: 'Jamais joués',
    audioMissing: 'Introuvables',
    audioMissingNote: 'joués mais absents du jeu',
    audioList: 'Sons du jeu',
    playedBy: (n: number) => `Joué ${fr(n)} fois`,
    neverPlayed: 'jamais joué',
    listen: (name: string) => `Écouter ${name}`,
    noAudio: 'Ce jeu ne contient aucun fichier audio.',
    missingAudio: 'Sons introuvables',
    videos: 'Vidéos',
    playable: 'Lisibles dans ce navigateur',
    notPlayable: 'Non lisibles',
    usedByScript: 'Utilisées par le script',
    totalBytes: (bytes: string) => `${bytes} au total`,
    playableHere: 'lisible ici',
    notPlayableHere: 'non lisible ici',
    checking: 'vérification…',
    notPlayableNote:
      'Ce navigateur ne sait pas lire ce format. Les informations du fichier restent disponibles.',
    container: 'Conteneur',
    dimensions: 'Définition, durée, taille',
    usedIn: 'Utilisée dans le script',
    notUsed: 'Aucun usage repéré dans le script.',
    videoList: 'Vidéos du jeu',
    streamNote:
      'La vidéo est lue depuis le fichier, morceau par morceau : elle n’est jamais chargée en entier, ni enregistrée.',
    noVideo: 'Ce jeu ne contient aucune vidéo.',
  },

  reader: {
    lede: 'Le script reconstitué à partir des fichiers compilés, label par label.',
    search: 'Rechercher dans le texte',
    modeLabel: 'Mode d’affichage',
    modes: { read: 'Lecture', source: 'Source reconstituée', play: 'Jeu' },
    staging: 'Afficher la mise en scène',
    thumbs: 'Vignettes et aperçu de scène',
    nav: 'Fichiers et labels',
    header: (loc: string, n: number) => `${loc} · ${fr(n)} réplique${s(n)}`,
    note: 'Reconstitué à partir des scripts compilés : les commentaires et la mise en forme d’origine n’existent plus.',
    sceneCaption: (line: number) =>
      `Scène à la ligne ${line}, recomposée d’après les scene et show qui précèdent. Positions approximatives, transformations ATL ignorées.`,
    onScreen: 'À l’écran',
    background: 'Décor',
    characters: 'Personnages',
    music: 'Musique',
    listen: (name: string) => `Écouter ${name}`,
    listenShort: 'Écouter',
    open: 'ouvrir',
    viewImage: (name: string) => `Voir l’image ${name}`,
    fold: (from: number, to: number, n: number) =>
      `Afficher les lignes ${from} à ${to} · ${fr(n)} réplique${s(n)}`,
    choose: 'Choisissez un label dans la liste.',
    notFound: (name: string) => `Le label ${name} n’existe pas.`,
    loading: 'Chargement…',
    results: (n: number, query: string) => `${fr(n)} résultat${s(n)} pour « ${query} »`,
    noResults: (query: string) => `Aucune réplique ne contient « ${query} ».`,
    narrator: 'Narrateur',
    if: 'si',
    playFrom: 'Jouer depuis ce label',
    play: {
      screen: 'Scène jouée',
      controls: 'Commandes de la scène',
      loading: 'Chargement de la scène…',
      next: 'Suivant',
      back: 'Retour',
      restart: 'Recommencer',
      sound: 'Son',
      history: 'Historique',
      fullscreen: 'Plein écran',
      exitFullscreen: 'Quitter le plein écran',
      keys: 'Espace, Entrée ou → : continuer · ← : revenir · 1 à 9 : choisir',
      continueHint: 'Continuer',
      branchTitle: 'Le jeu teste une condition',
      branchNote: 'Phanes n’exécute pas le code du jeu : choisissez la branche à suivre.',
      keywords: { if: 'si', elif: 'sinon si', else: 'sinon', while: 'tant que' },
      noBranch: 'Aucune condition vraie',
      whileEnter: 'Entrer dans la boucle',
      whileSkip: 'Sortir de la boucle',
      dynamicTitle: 'Saut calculé pendant le jeu',
      dynamicNote: 'Sa cible dépend des variables du jeu : choisissez le label à suivre.',
      dynamicPick: 'Label à suivre',
      go: 'Aller',
      missing: (name: string) => `Le label ${name} n’existe pas : le jeu s’arrêterait ici.`,
      loop: 'Le script tourne en boucle sans rien afficher.',
      end: 'Fin',
      endNote: 'Le jeu reviendrait ici au menu principal.',
      backToReading: 'Revenir à la lecture',
      seeLine: 'Voir dans le script',
      calls: (n: number) => `${fr(n)} appel${s(n)} en cours`,
      historyEmpty: 'Aucune réplique pour l’instant.',
      note: 'Rejoué d’après les scripts compilés : décors, sprites, textes et sons du jeu. Les positions sont approximatives et les transformations ATL ignorées.',
    },
  },

  translations: {
    lede: 'Les langues présentes dans tl/ et la part du texte qu’elles couvrent.',
    languagesLabel: 'Langues',
    default: 'Langue par défaut',
    defaultNote: 'Le texte du script lui-même, sert de référence',
    lines: 'Répliques',
    strings: 'Chaînes d’interface',
    files: (language: string, n: number) => `tl/${language}/ · ${fr(n)} fichier${s(n)}`,
    orphans: (n: number) =>
      n === 0 ? 'Aucune traduction orpheline' : `${fr(n)} traduction${s(n)} orpheline${s(n)}`,
    missingIn: 'Ce qui manque en ',
    languageLabel: 'Langue détaillée',
    missingCaption: 'Répliques non traduites, par fichier source',
    columns: { file: 'Fichier', missing: 'Manquantes', coverage: 'Couverture du fichier' },
    orphansNote: (language: string) =>
      `Ces blocs translate ${language} visent des répliques qui n’existent plus dans le script : leur identifiant est introuvable.`,
    orphansHint: 'Souvent le signe d’une réplique modifiée après la traduction.',
    noOrphans: 'Toutes les traductions visent une réplique du jeu.',
    none: 'Ce jeu n’a pas de traduction.',
    partial:
      'Les identifiants de certains scripts n’ont pas pu être relus : la couverture est une borne basse.',
    stringsNote:
      'Chaînes : textes des menus et chaînes _() du code ; les textes des écrans ne sont pas comptés.',
    extra: (n: number) => `${fr(n)} autre${s(n)} chaîne${s(n)} traduite${s(n)} (écrans, code)`,
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
    case 'TL_IDS_UNAVAILABLE':
      return 'Les identifiants de traduction de ce script n’ont pas pu être relus.';
    default:
      return d.message;
  }
}

/** What a diagnostic means for the rest of the report. */
export function consequenceOf(d: Diagnostic): string | null {
  switch (d.code) {
    case 'RPA_UNKNOWN_HEADER':
    case 'RPA_BAD_HEADER':
    case 'RPA_BAD_INDEX':
    case 'RPA_MISSING_DATA':
      return 'Archive ignorée : son contenu n’apparaît pas dans le rapport.';
    case 'RPA_ENTRY_SKIPPED':
      return 'Cette entrée n’apparaît pas dans l’inventaire.';
    case 'RPYC_BAD_HEADER':
    case 'RPYC_NO_SLOT':
    case 'RPYC_BAD_PAYLOAD':
    case 'ZLIB_INVALID':
    case 'PICKLE_INVALID':
    case 'PICKLE_UNSUPPORTED':
    case 'TRUNCATED':
    case 'IO_READ_FAILED':
      return 'Fichier ignoré : ses répliques ne sont pas comptées.';
    case 'ZLIB_LIMIT':
    case 'TOO_LARGE':
    case 'PICKLE_LIMIT':
      return 'Décodage interrompu par sécurité. Le fichier figure dans l’inventaire, pas dans les statistiques.';
    case 'RPYC_SLOT_FALLBACK':
      return 'Les statistiques de ce script restent valables.';
    case 'AST_UNKNOWN_NODE':
      return 'Les répliques des blocs connus restent comptées.';
    case 'AST_MALFORMED':
      return 'Les instructions lisibles restent comptées.';
    case 'ANALYSIS_FAILED':
      return 'La section correspondante du rapport est absente.';
    case 'TL_IDS_UNAVAILABLE':
      return 'La couverture des traductions est une borne basse.';
    default:
      return null;
  }
}
