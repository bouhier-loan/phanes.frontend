# Phanes

Analyseur de jeux [Ren'Py](https://www.renpy.org/) qui fonctionne **entièrement dans le navigateur** :
déposez le dossier d'un jeu (ou des fichiers `.rpa`, `.rpyc`, `.rpy`) et obtenez un rapport sur sa
structure, ses personnages, ses dialogues, ses choix et ses ressources.

Aucun fichier ne quitte votre machine : l'analyse tourne dans un Web Worker, sans aucune requête
réseau (CSP `connect-src 'none'`).

## Structure

| Dossier                  | Rôle                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `packages/renpy-formats` | Décodage pur : lecture par tranches, VM pickle, archives RPA, scripts RPYC |
| `packages/core`          | Modèle de domaine, couche anti-corruption de l'AST Ren'Py, VFS, analyses   |
| `packages/testkit`       | Aides de test Node (sources de fichiers, fixtures)                         |
| `apps/web`               | Interface React, Worker, adaptateurs navigateur                            |
| `apps/cli`               | CLI de développement (`pnpm phanes …`)                                     |
| `fixtures`               | Mini-jeux compilés avec plusieurs SDK Ren'Py                               |
| `tools`                  | Génération des fixtures, oracle unrpyc                                     |

## Développement

Prérequis : Node 22 et pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm --filter @phanes/web dev   # serveur de dev
pnpm lint && pnpm typecheck && pnpm test
pnpm build                      # build statique dans apps/web/dist
```

## Licence

MIT — voir [LICENSE](LICENSE) et [NOTICE](NOTICE) pour les attributions (Ren'Py, unrpyc).
