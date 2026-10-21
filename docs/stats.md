# Définitions des statistiques

Ces règles sont implémentées dans `packages/core/src/analyses/dialogue.ts` et
`packages/core/src/text/words.ts`, et vérifiées à la main sur les fixtures
(`fixtures/expected/phanes_demo.stats.json`).

## Réplique

- Un nœud `Say` dans la langue par défaut : hors des blocs `translate <langue>` et des nœuds
  `TranslateSay` dont la langue est définie.
- Une légende de menu (item sans bloc, `"Où allons-nous ?"` dans un `menu:`) compte comme une
  réplique du narrateur.
- `extend "..."` ajoute ses mots au locuteur précédent (dans l'ordre du fichier), sans compter
  comme réplique.
- Les textes des choix de menu sont comptés à part (`choices`), pas comme répliques.
- Les dialogues émis depuis du Python (`renpy.say`, `e("...")` dans un bloc python) ne sont pas
  comptés.

## Locuteur

| `who` dans l'AST                        | Locuteur                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| absent / `None`                         | `narrator` (intégré)                                                                         |
| nom de variable (`e`, `store.e`)        | la variable ; nom résolu depuis `define`, `default` ou une affectation dans un bloc `python` |
| littéral (`"Eileen" "..."`)             | `"Eileen"` (origine `literal`)                                                               |
| autre expression                        | `expr:<code>` (origine `expression`)                                                         |
| `centered`, `vcentered`, `nvl_narrator` | intégrés à Ren'Py                                                                            |

Les fabriques reconnues sont `Character`, `DynamicCharacter`, `ADVCharacter` et `NVLCharacter`.
Le nom est le premier argument positionnel, ou `name=`. `_("...")` est déballé. Un nom contenant
une interpolation (`"[player_name]"`) ou issu de `DynamicCharacter` est marqué dynamique ;
`kind=nvl` ou `NVLCharacter` marque un personnage NVL.

## Mots

- Les balises de texte `{...}` sont retirées ; `{{` est une accolade littérale.
- Une interpolation `[...]` compte pour un mot ; `[[` est un crochet littéral.
- Un mot est une suite de lettres et de chiffres ; une apostrophe ou un trait d'union entre deux
  lettres reste dans le mot (`C'était`, `well-known`).
- Les caractères Han, Hiragana et Katakana sont comptés un par un (`cjkChars`) ; le hangul,
  séparé par des espaces, est compté en mots.

## Temps de lecture

`mots / 200 + caractères CJK / 500`, en minutes, arrondi au dixième.
