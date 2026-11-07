# Fixtures

| Dossier                  | Contenu                                                                 | Généré par                                   |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------- |
| `games/<jeu>/`           | Sources des mini-jeux (`.rpy`, images et sons factices) ; `sdks.txt` limite les SDK qui les construisent (`phanes_layers` : `layeredimage`, Ren'Py 7+) | à la main                                    |
| `build/<sdk>/<jeu>/project/` | Projet après `renpy.sh <jeu> compile` (`.rpy` + `.rpyc`, `log.txt`) | `tools/fixtures/build.sh`                    |
| `build/<sdk>/<jeu>/dist/`    | Distribution Linux du launcher (`.rpa`, fichiers libres, `renpy/vc_version.py`) | `tools/fixtures/build.sh`          |
| `synthetic/pickle/`      | Cas de test pickle (protocoles 0 à 5) écrits par Python 2.7 et Python 3 | `tools/fixtures/gen_pickle_cases.py`         |
| `synthetic/rpa/`         | Petites archives RPA 1.0/2.0/3.0, multi-segments, index > 4 Gio         | `tools/fixtures/gen_rpa_cases.py`            |
| `expected/<sdk>/<jeu>/canonical/` | Dump JSON canonique de chaque script, décodé par le dépickleur de CPython | `tools/oracle/dump_json.py`        |
| `expected/<sdk>/<jeu>/unrpyc/`    | `unrpyc --dump --comparable` et source décompilé, pour relecture         | `tools/oracle/unrpyc.sh`           |
| `expected/<sdk>/<jeu>/semantic/`  | Projection de chaque statement vu par unrpyc (oracle de l'ACL)          | `tools/oracle/semantic.py`         |
| `expected/phanes_demo.stats.json` | Statistiques comptées à la main (identiques pour tous les SDK)          | à la main, voir `docs/stats.md`    |
| `corpus/<sdk>/<jeu>/`             | Jeux livrés avec les SDK (`the_question`, `tutorial`) : `.rpyc` tels que livrés, fichiers de version `renpy/`, et `files.json` (chemin et taille des autres fichiers) | `tools/fixtures/build.sh --corpus` |
| `expected/corpus/<sdk>/<jeu>/`    | `canonical.json.gz` et `semantic.json.gz` (oracles en un seul fichier compressé), `summary.json` (résumé des analyses) | oracles ; `pnpm test -u` pour le résumé |

SDK épinglés (sha256 vérifiés contre les sommes officielles de renpy.org) : 6.99.14.3, 7.4.11
(Python 2), 8.3.7 (dernier avant les cslots), 8.5.3 (cslots).

```sh
tools/fixtures/build.sh                 # tous les SDK (téléchargés dans tools/fixtures/.cache)
tools/fixtures/build.sh 8.5.3           # un seul
tools/fixtures/build.sh --game phanes_layers   # un seul jeu
python3 tools/fixtures/gen_pickle_cases.py fixtures/synthetic/pickle/py3.json
tools/fixtures/.cache/renpy-7.4.11-sdk/lib/linux-x86_64/python \
  tools/fixtures/gen_pickle_cases.py fixtures/synthetic/pickle/py2.json
```

Après un rebuild des fixtures, régénérer les références :

```sh
for build in fixtures/build/*/*/; do
  rel=${build#fixtures/build/}; rel=${rel%/}
  python3 -I tools/oracle/dump_json.py "$build" "fixtures/expected/$rel/canonical"
done
tools/oracle/unrpyc.sh   # clone aussi unrpyc (commit épinglé) dans tools/oracle/.cache
for build in fixtures/build/*/*/; do
  rel=${build#fixtures/build/}; rel=${rel%/}
  python3 tools/oracle/semantic.py tools/oracle/.cache/unrpyc \
    "$build/project" "fixtures/expected/$rel/semantic"
done
```

Corpus réaliste : `the_question` pour les quatre SDK et `tutorial` pour 8.5.3 (≈ 110 000 lignes,
écrans, `layeredimage`, onze langues). Seuls les scripts compilés sont commités ; les images, sons
et sources sont relus comme des fichiers virtuels vides de la bonne taille (`openCorpus` dans
`packages/testkit`), ce qui suffit à toutes les analyses.

```sh
tools/fixtures/build.sh --corpus        # recopie le corpus depuis les SDK du cache
for d in fixtures/corpus/*/*/; do
  rel=${d#fixtures/corpus/}; out=fixtures/expected/corpus/${rel%/}
  python3 -I tools/oracle/dump_json.py "$d" "$out/canonical.json.gz"
  python3 tools/oracle/semantic.py tools/oracle/.cache/unrpyc "$d" "$out/semantic.json.gz"
done
pnpm test -u                            # réécrit les summary.json après un changement voulu
```

`summary.json` résume ce que les analyses trouvent sur chaque jeu (labels inaccessibles, sauts
cassés, images manquantes ou jamais affichées, variables jamais lues…) : c'est la liste des faux
positifs restants, et son diff montre l'effet de chaque amélioration.

Les sorties sont commitées : la CI n'a pas besoin des SDK.
