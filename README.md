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

## Fonctionnalités (MVP)

- **Inventaire** : arborescence unifiée des fichiers et du contenu des archives `.rpa`
  (RPA-1.0, 2.0, 3.0), tailles, types, fichiers masqués ; les archives ne sont jamais chargées
  en entier (seul leur index est lu).
- **Scripts compilés** `.rpyc`/`.rpymc` de Ren'Py 6.99 à 8.5, y compris dans les archives,
  décodés par une VM pickle qui n'exécute rien.
- **Vue d'ensemble** : version de Ren'Py, labels, répliques, mots, temps de lecture, langues.
- **Personnages** : répliques et mots par personnage (`define`, `init python`,
  `DynamicCharacter`, noms littéraux, narrateur, `extend`).
- **Labels** avec fichier et ligne, **diagnostics** en français, **export JSON**.

Définitions des statistiques : [docs/stats.md](docs/stats.md). Format du rapport :
[docs/report-schema.md](docs/report-schema.md). Détails des formats : [docs/formats.md](docs/formats.md).

## Développement

Prérequis : Node 22 et pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm --filter @phanes/web dev   # serveur de dev (sans CSP)
pnpm lint && pnpm typecheck && pnpm test
pnpm build                      # build statique dans apps/web/dist
pnpm e2e                        # Playwright sur le build de prod (CSP active)
pnpm phanes analyze <dossier>   # CLI de développement
```

Les tests E2E vérifient qu'aucune requête réseau n'a lieu pendant l'analyse, qu'aucune
violation de CSP ne se produit, qu'un fichier corrompu n'empêche pas le rapport, et qu'une
archive creuse de 6 Gio s'analyse sans être chargée.

## Déploiement

Image statique servie par nginx, avec la CSP en en-tête (`deploy/`) :

```sh
docker build -f deploy/Dockerfile -t phanes .
docker run -p 8080:80 phanes        # http://localhost:8080, santé : /healthz
```

Sur Dokploy : application de type Dockerfile, chemin `deploy/Dockerfile`, contexte `.`,
port 80. Pour rejouer les E2E contre une instance déployée :
`PHANES_BASE_URL=https://… pnpm e2e --project chromium`.

## Licence

MIT — voir [LICENSE](LICENSE) et [NOTICE](NOTICE) pour les attributions (Ren'Py, unrpyc).
