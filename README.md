# Phanes

Analyseur de jeux [Ren'Py](https://www.renpy.org/) qui fonctionne **entièrement dans le navigateur** :
déposez le dossier d'un jeu (ou des fichiers `.rpa`, `.rpyc`, `.rpy`) et obtenez un rapport sur sa
structure, ses personnages, ses dialogues, ses choix et ses ressources.

Aucun fichier ne quitte votre machine : l'analyse tourne dans un Web Worker, sans aucune requête
réseau. La seule connexion autorisée (CSP `connect-src https://auth.lonedev.fr`) est la connexion
OIDC, faite avant l'affichage de l'application.

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

## Fonctionnalités

- **Inventaire** : arborescence unifiée des fichiers et du contenu des archives `.rpa`
  (RPA-1.0, 2.0, 3.0), tailles, types, fichiers masqués ; les archives ne sont jamais chargées
  en entier (seul leur index est lu).
- **Scripts compilés** `.rpyc`/`.rpymc` de Ren'Py 6.99 à 8.5, y compris dans les archives,
  décodés par une VM pickle qui n'exécute rien.
- **Vue d'ensemble** : version de Ren'Py, labels, répliques, mots, temps de lecture, langues.
- **Personnages** : répliques et mots par personnage (`define`, `init python`,
  `DynamicCharacter`, noms littéraux, narrateur, `extend`), couleur, fichiers, sprites.
- **Labels** avec fichier, ligne et statut, **diagnostics** en français, **export JSON**.
- **Histoire** : graphe des labels (jump, call, choix, fins, labels inaccessibles, sauts cassés),
  menus de choix, variables (où elles sont modifiées et lues), lecteur de script reconstitué.
- **Ressources et langues** : images déclarées et affichées, sons, vidéos (aperçus lus sur place
  par des URL `blob:`, jamais extraits), couverture des traductions.

Définitions des statistiques : [docs/stats.md](docs/stats.md) et [docs/analyses.md](docs/analyses.md).
Format du rapport : [docs/report-schema.md](docs/report-schema.md). Détails des formats :
[docs/formats.md](docs/formats.md).

## Connexion (OIDC)

L'interface demande une connexion au fournisseur d'identité Pocket ID de `auth.lonedev.fr`
(client public `27c855f7-406c-4a57-9117-8370bd85e9dd`, code d'autorisation avec PKCE, réglages
dans `apps/web/src/auth/config.ts`). Toutes les requêtes vers le fournisseur ont lieu avant
l'affichage de l'application ; la session dure le temps de l'onglet (`sessionStorage`) et n'est
jamais rafraîchie pendant une analyse.

À déclarer dans Pocket ID pour ce client :

- URL de rappel : `https://<domaine>/auth/callback`, `http://127.0.0.1:4173/auth/callback` (E2E)
  et `http://localhost:5173/auth/callback` (développement) ;
- URL de rappel de déconnexion : `https://<domaine>/`.

L'application étant statique, la connexion masque l'interface mais ne protège pas le bundle :
un contrôle d'accès réel se ferait devant nginx (oauth2-proxy, forward auth). En développement,
`VITE_AUTH=off pnpm --filter @phanes/web dev` désactive la connexion. Les tests E2E remplacent le
fournisseur par une simulation (`apps/web/e2e/oidc.ts`).

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
