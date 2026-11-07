# Règles des analyses de l'histoire et des ressources

Ces règles sont implémentées dans `packages/core/src/analyses/` (`graph.ts`, `menus.ts`,
`variables.ts`, `assets.ts`, `translations.ts`, `flow.ts`) et vérifiées à la main sur les
fixtures (`fixtures/expected/phanes_demo.story.json`, pour les quatre SDK et les deux
dispositions). Comme pour [les statistiques](stats.md), seule la langue par défaut est lue :
les blocs `translate <langue>` ne servent qu'aux traductions. Rien n'est exécuté : tout est
déduit de l'AST et d'une lecture lexicale du code Python (`python-lite/names.ts`).

## Déroulement d'un bloc (`flow.ts`)

Un bloc est parcouru dans l'ordre d'exécution ; on dit qu'il **se termine** si l'exécution
peut atteindre sa fin.

- `jump` et `return` arrêtent le bloc ; `call` revient et continue.
- `if` : chaque branche est parcourue (sauts « conditionnels ») ; l'instruction arrête le bloc
  si elle a un `else` (condition `True`) et qu'aucune branche ne se termine.
- `menu` : chaque choix est parcouru ; l'instruction arrête le bloc si aucun choix ne se
  termine. Un choix soumis à une condition rend ses sauts conditionnels.
- `while` : le corps est parcouru ; `while True` ne se termine jamais.
- Un `label` imbriqué dans un bloc est atteint en passant ; s'il suit un arrêt (`jump`,
  `return`…), seul un saut l'atteint, mais son bloc est parcouru et l'exécution reprend après
  lui. Les blocs `init` et `translate` ne participent pas au déroulement.
- Le bloc de script d'une instruction créée par l'auteur (CDS déclaré avec `block="script"`,
  comme `example:` dans le tutoriel de Ren'Py, et les sous-blocs `subparses`) est parcouru en
  place, puis l'exécution continue : ses répliques, déclarations et labels comptent comme les
  autres, et un label qu'il contient au premier niveau d'un fichier est un label de premier
  niveau.

## Graphe de l'histoire (`storyGraph`)

- **Nœuds** : les labels de la langue par défaut (un par nom, le premier défini).
- **Arêtes** : `jump` et `call` (cible littérale, ou `jump expression` dont l'expression est
  une chaîne constante, `"bad" + "_ending"`), **enchaînement** (`fallthrough`) quand le bloc
  d'un label se termine et qu'un autre label le suit au premier niveau du même fichier, et
  **référence** quand le nom d'un label apparaît comme chaîne constante dans un écran
  (`Jump("x")`, `Call("x")`) ou dans du code Python (`renpy.jump("x")`), ou qu'un hyperlien
  `{a=jump:x}`, `{a=call:x}` ou `{a=x}` (protocole par défaut `call_in_new_context`,
  `renpy/common/00defaults.rpy`) d'une réplique, d'un choix de menu ou d'un texte d'écran le
  vise. Une arête porte le choix de menu dont elle provient.
- Une cible locale `.x` est résolue dans le label global courant. Une cible qui ne nomme aucun
  label est un **saut cassé** ; une expression non constante est listée comme **dynamique**.
- **Atteignable** : depuis `start`, les labels appelés par Ren'Py (`splashscreen`,
  `before_main_menu`, `main_menu`, `after_load`, `after_warp`, `quit`) et les labels
  référencés par un écran ou du code d'initialisation, en suivant toutes les arêtes.
- **Retour** : le label peut atteindre un `return`, explicite ou implicite en fin de fichier.
- **Fin** : un label atteignable qui revient, n'a aucune arête sortante autre que des `call`,
  est atteint autrement que par `call` (ou est `start`) et n'est pas un label spécial.

## Choix (`menus`)

- Chaque `menu`, avec le label qui le contient et sa position (`fichier:ligne`, aussi la clé
  des arêtes du graphe).
- **Invite** : la réplique affichée avec le menu (un `Say` non interactif juste avant), sinon
  la légende du menu (item sans bloc).
- Pour chaque choix : texte, condition (absente si `True`), tous les `jump`/`call` du bloc
  (cassés ou dynamiques signalés), nombre de répliques, instructions Python directes, et si le
  bloc se termine (l'histoire continue après le menu).

## Variables (`variables`)

- **Déclarées** : `default` et `define` avec `=`, nom qualifié par le store (`persistent.x`,
  `config.name`) ; la première déclaration fait foi.
- **Modifiées** : cible d'une affectation Python (`=`, `+=`…, tuples, indices, attributs,
  variable de `for` ; `store.x` désigne `x`), `define` avec un autre opérateur ou un indice,
  toute autre déclaration du même nom, la variable `set` d'un menu, et les actions et valeurs
  d'écran : `SetVariable`, `ToggleVariable`, `VariableValue`, `VariableInputValue` (`"x"`),
  `SetField`, `ToggleField`, `FieldValue`, `FieldInputValue` (`obj.f`), `SetDict`,
  `ToggleDict`, `DictValue`, `DictInputValue` (le dictionnaire). Dans le code Python d'un
  écran, un nom simple est une variable d'écran : seuls `store.x` ou `persistent.x` comptent.
- **Lues** : tout autre nom du code Python, des conditions (`if`, `while`, choix de menu), des
  expressions (`jump expression`, `show expression`, `with`, `at`, valeur d'une image ou d'une
  autre déclaration, arguments d'une autre instruction comme `call screen x(a)`), des
  expressions d'écran (à la ligne de chaque instruction de l'écran), les interpolations
  `[nom]` des répliques, des textes d'écran et des noms de personnages, l'argument de
  `DynamicCharacter("nom")`, et un son nommé dans `play`/`queue` (cherché d'abord dans
  `audio.`).
- Un nom pointé désigne la plus longue déclaration qui le préfixe (`persistent.seen.add` →
  `persistent.seen`). Les arguments nommés (`f(x=1)`) ne sont pas des lectures.
- Les personnages (définis par une fabrique de `Character`) sont détaillés à part ; les
  réglages lus par Ren'Py lui-même (`config`, `build`, `gui`, `preferences`, `style`,
  `renpy`, `layout`, `achievement`, un nom commençant par `_`, et les variables du store que
  Ren'Py lit : `menu`, `narrator`, `adv`, `nvl`, `save_name`, `main_menu`, `mouse_visible`,
  `suppress_overlay`, `predict_menu`) ne sont jamais « jamais lus ». « Jamais modifiée » ne concerne que les `default`.

## Ressources (`assets`)

- **Images déclarées** : les instructions `image`. Une valeur chaîne se lit comme Ren'Py
  (`renpy/easy.py`) : avec `[` elle est dynamique, avec `#` c'est une couleur, avec un point
  c'est un fichier, sinon c'est le nom d'une autre image (**alias**,
  `image logo alias = "logo base"`). Un fichier (ou le premier argument chaîne d'un appel,
  `Image("x.png")`) est cherché dans le jeu, puis sous `images/`. S'y ajoutent les **images automatiques** de Ren'Py : chaque fichier `.png`,
  `.jpg`, `.jpeg`, `.webp`, `.avif` ou `.svg` sous `images/`, nommé d'après son nom de fichier
  sans extension, en minuscules, découpé aux espaces ; une déclaration explicite l'emporte.
- **Images en couches** (`layeredimage`, Ren'Py 7+, `renpy/common/00layeredimage.rpy`) : une
  image du nom déclaré, dont les **attributs** sont ceux de ses groupes et ses attributs hors
  groupe. Le calque d'un attribut est l'image écrite, sinon le nom dérivé par Ren'Py
  `<nom>_<groupe>_<variante>_<attribut>` (espaces du nom remplacées par `_`, sans le groupe
  dans un groupe `multiple`) ; un groupe `auto` ajoute un attribut pour chaque image nommée
  `<nom>_<groupe>_<variante>_<x>`. Les calques `always` et `if`/`elif`/`else` sont toujours
  affichés avec l'image (les conditions ne sont pas évaluées).
- **Catégorie** : étiquette `bg` → décor, `cg` → CG, étiquette d'un personnage (voir plus bas)
  → sprite, sinon autre.
- **Images d'un personnage** (`character-images.ts`, fiches des personnages) : ses étiquettes
  sont, dans l'ordre, l'`image=` de sa définition, son nom (minuscules, sans accents, espaces
  remplacés par `_` ou supprimés, premier mot d'un nom composé s'il a trois lettres ou plus) et
  sa variable (deux caractères ou plus) ; un nom dynamique n'en donne aucune. Ses images sont
  celles de ces étiquettes, ses portraits latéraux les images `side <étiquette> …`, et ses
  fichiers associés les fichiers d'image qui ne sont le fichier d'aucune image déclarée et dont
  un dossier porte une de ces étiquettes, ou dont le nom commence par l'une d'elles suivie
  d'une espace, de `_`, `-` ou `.`. Les calques de ses images en couches sont aussi ses
  sprites. Le portrait est l'image la plus affichée, sinon un portrait latéral, sinon le
  premier fichier associé.
- **Affichage** : `scene` et `show`. Un nom exact désigne son image ; sinon toutes les images de
  la même étiquette qui portent les attributs demandés comptent comme affichées (un `show`
  d'étiquette seule les compte toutes, par prudence). Rien ne correspond → image
  **manquante**, avec le nom déclaré le plus proche (distance d'édition au plus un quart de
  la longueur, deux au minimum), sauf pour les images de Ren'Py (`black`, et les étiquettes
  `text` et `vtext`). Une image en couches accepte les attributs de son nom et de ses calques ;
  elle affiche les calques des attributs demandés, ceux par défaut des autres groupes, et ses
  calques `always` et `if`. Un attribut inconnu rend l'image manquante, un calque introuvable
  aussi dès qu'il est affiché. Une image déclarée vers un fichier absent est manquante aussi.
  `show expression` n'est pas résolu.
- **Écrans** (langage d'écran 2, décodé instruction par instruction) : l'image ou le fichier
  d'un `add`, et les mots-clés qui prennent un displayable (`background`, `foreground`,
  `child`, `ground`, `idle`, `hover`, `insensitive` et leurs variantes `selected_…`, barres
  `…_bar`, `thumb`, et les motifs `auto "bouton_%s.png"` développés pour chaque état) comptent
  comme affichages ; les mots-clés `…_sound` et les actions `Play`/`Queue` comme sons joués ;
  `Movie(play=…)` comme vidéo utilisée.
- Comptent aussi comme affichages : les **attributs d'une réplique** (`e happy "…"`) pour les
  images de l'étiquette `image=` du personnage et ses portraits latéraux `side <étiquette> …`
  (`renpy/character.py`) ; une **propriété de style** de ces mêmes noms qui désigne une image
  ou un fichier d'image ; un fichier d'image écrit dans du code Python ou une déclaration
  (`ImageDissolve("x.png")`). Une image affichée affiche ce que sa définition nomme : la cible
  d'un alias (manquante si elle n'existe pas), les images et fichiers d'un `Composite`, les
  images d'un bloc ATL (`image eileen blink:`)…
- **Audio** : `play <canal>`, `queue <canal>` et `voice` (chemin littéral, liste, ou nom
  `audio.x` défini par `define audio.x = "…"` ou par un fichier de `audio/`), et
  `renpy.music.play` / `renpy.sound.play` en Python. Les fichiers audio du jeu sont joués ou
  jamais joués ; un chemin introuvable est manquant.
- **Vidéo** : `Movie(play="…")` dans une image ou une déclaration, `renpy.movie_cutscene("…")`
  en Python. Une image `Movie(play="…")` porte sa vidéo (`movie` : chemin écrit, fichier du jeu
  cherché comme les vidéos, `loop` vrai sauf `loop=False`, `keep_last_frame`, `side_mask`) ; les
  autres images ont `movie: null`.

## Traductions (`translations`)

- Les identifiants de traduction de la langue par défaut ne sont pas dans le slot 1 des
  `.rpyc` (celui qu'on analyse) et leur calcul (MD5 du code des répliques) change selon les
  versions de Ren'Py : sur les fixtures, 8.5.3 donne deux identifiants différents de
  6.99–8.3. Quand le jeu a des traductions (scripts sous `tl/`, `translate <langue>`,
  `translate <langue> strings`), le **slot 2** de chaque script de la langue par défaut est
  relu pour y prendre les enveloppes `translate None` et les nœuds `TranslateSay`. Un slot 2
  illisible donne un diagnostic `TL_IDS_UNAVAILABLE` et un résultat partiel.
- **Répliques** : blocs d'identifiant qui contiennent une réplique (un `nvl clear` seul a un
  identifiant mais pas de texte) ; une langue traduit ceux dont elle a un
  `translate <langue> <identifiant>`.
- **Langues** : celles des blocs `translate <langue>` ; `translate None strings` (dossier
  `tl/None`) personnalise les chaînes de la langue par défaut et n'est pas une traduction.
- **Orphelines** : traductions dont l'identifiant n'existe pas dans le jeu (souvent une réplique
  modifiée après la traduction).
- **Chaînes d'interface** : comme Ren'Py (`renpy/translation/scanstrings.py`), les textes des
  menus et les arguments constants de `_()`, `__()`, `_p()` partout : code, déclarations,
  écrans, styles, images, autres instructions. Les `old` traduits hors de cet ensemble sont
  comptés à part (`extra`) : surtout les chaînes de Ren'Py lui-même (`tl/<langue>/common.rpy`).
