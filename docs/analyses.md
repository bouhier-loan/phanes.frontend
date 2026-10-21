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
- Un `label` imbriqué dans un bloc est atteint en passant ; les blocs `init` et `translate`
  ne participent pas au déroulement.

## Graphe de l'histoire (`storyGraph`)

- **Nœuds** : les labels de la langue par défaut (un par nom, le premier défini).
- **Arêtes** : `jump` et `call` (cible littérale, ou `jump expression` dont l'expression est
  une chaîne constante, `"bad" + "_ending"`), **enchaînement** (`fallthrough`) quand le bloc
  d'un label se termine et qu'un autre label le suit au premier niveau du même fichier, et
  **référence** quand le nom d'un label apparaît comme chaîne constante dans un écran
  (`Jump("x")`, `Call("x")`) ou dans du code Python (`renpy.jump("x")`). Une arête porte le
  choix de menu dont elle provient.
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
  variable de `for`), `define` avec un autre opérateur ou un indice, toute autre déclaration
  du même nom, et la variable `set` d'un menu.
- **Lues** : tout autre nom du code Python, des conditions (`if`, `while`, choix de menu), des
  expressions (`jump expression`, `show expression`, `with`, `at`, valeur d'une image ou d'une
  autre déclaration), des expressions d'écran, les interpolations `[nom]` des répliques, des
  textes d'écran et des noms de personnages, l'argument de `DynamicCharacter("nom")`, et un
  son nommé dans `play`/`queue` (cherché d'abord dans `audio.`).
- Un nom pointé désigne la plus longue déclaration qui le préfixe (`persistent.seen.add` →
  `persistent.seen`). Les arguments nommés (`f(x=1)`) ne sont pas des lectures.
- Les personnages (définis par une fabrique de `Character`) sont détaillés à part ; les
  réglages lus par Ren'Py lui-même (`config`, `build`, `gui`, `preferences`, `style`,
  `renpy`, `layout`, `achievement`, ou un nom commençant par `_`) ne sont jamais
  « jamais lus ». « Jamais modifiée » ne concerne que les `default`.

## Ressources (`assets`)

- **Images déclarées** : les instructions `image` ; une valeur qui est un chemin littéral (ou
  le premier argument chaîne d'un appel, `Image("x.png")`) est cherchée dans le jeu, puis sous
  `images/`. S'y ajoutent les **images automatiques** de Ren'Py : chaque fichier `.png`,
  `.jpg`, `.jpeg`, `.webp`, `.avif` ou `.svg` sous `images/`, nommé d'après son nom de fichier
  sans extension, en minuscules, découpé aux espaces ; une déclaration explicite l'emporte.
- **Catégorie** : étiquette `bg` → décor, `cg` → CG, étiquette égale à l'`image=` ou au nom en
  minuscules d'un personnage → sprite, sinon autre.
- **Affichage** : `scene` et `show`. Un nom exact désigne son image ; sinon toutes les images de
  la même étiquette qui portent les attributs demandés comptent comme affichées (un `show`
  d'étiquette seule les compte toutes, par prudence). Rien ne correspond → image
  **manquante**, avec le nom déclaré le plus proche (distance d'édition au plus un quart de
  la longueur, deux au minimum). Une image déclarée vers un fichier absent est manquante
  aussi. `show expression` n'est pas résolu.
- **Audio** : `play <canal>`, `queue <canal>` et `voice` (chemin littéral, liste, ou nom
  `audio.x` défini par `define audio.x = "…"` ou par un fichier de `audio/`), et
  `renpy.music.play` / `renpy.sound.play` en Python. Les fichiers audio du jeu sont joués ou
  jamais joués ; un chemin introuvable est manquant.
- **Vidéo** : `Movie(play="…")` dans une image ou une déclaration, `renpy.movie_cutscene("…")`
  en Python.

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
- **Orphelines** : traductions dont l'identifiant n'existe pas dans le jeu (souvent une réplique
  modifiée après la traduction).
- **Chaînes d'interface** : textes des menus et arguments constants de `_()`, `__()`, `_p()`
  dans le code. Les textes des écrans ne sont pas comptés (leurs chaînes ne se distinguent pas
  des expressions) ; les `old` traduits hors de cet ensemble sont comptés à part (`extra`).
