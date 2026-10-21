# Fixtures

| Dossier                  | Contenu                                                                 | Généré par                                   |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------- |
| `games/<jeu>/`           | Sources des mini-jeux (`.rpy`, images et sons factices)                 | à la main                                    |
| `build/<sdk>/<jeu>/project/` | Projet après `renpy.sh <jeu> compile` (`.rpy` + `.rpyc`, `log.txt`) | `tools/fixtures/build.sh`                    |
| `build/<sdk>/<jeu>/dist/`    | Distribution Linux du launcher (`.rpa`, fichiers libres, `renpy/vc_version.py`) | `tools/fixtures/build.sh`          |
| `synthetic/pickle/`      | Cas de test pickle (protocoles 0 à 5) écrits par Python 2.7 et Python 3 | `tools/fixtures/gen_pickle_cases.py`         |
| `synthetic/rpa/`         | Petites archives RPA 1.0/2.0/3.0, multi-segments, index > 4 Gio         | `tools/fixtures/gen_rpa_cases.py`            |
| `expected/<sdk>/<jeu>/canonical/` | Dump JSON canonique de chaque script, décodé par le dépickleur de CPython | `tools/oracle/dump_json.py`        |
| `expected/<sdk>/<jeu>/unrpyc/`    | `unrpyc --dump --comparable` et source décompilé, pour relecture         | `tools/oracle/unrpyc.sh`           |
| `expected/<sdk>/<jeu>/semantic/`  | Projection de chaque statement vu par unrpyc (oracle de l'ACL)          | `tools/oracle/semantic.py`         |
| `expected/phanes_demo.stats.json` | Statistiques comptées à la main (identiques pour tous les SDK)          | à la main, voir `docs/stats.md`    |

SDK épinglés (sha256 vérifiés contre les sommes officielles de renpy.org) : 6.99.14.3, 7.4.11
(Python 2), 8.3.7 (dernier avant les cslots), 8.5.3 (cslots).

```sh
tools/fixtures/build.sh                 # tous les SDK (téléchargés dans tools/fixtures/.cache)
tools/fixtures/build.sh 8.5.3           # un seul
python3 tools/fixtures/gen_pickle_cases.py fixtures/synthetic/pickle/py3.json
tools/fixtures/.cache/renpy-7.4.11-sdk/lib/linux-x86_64/python \
  tools/fixtures/gen_pickle_cases.py fixtures/synthetic/pickle/py2.json
```

Après un rebuild des fixtures, régénérer les références :

```sh
for v in 6.99.14.3 7.4.11 8.3.7 8.5.3; do
  python3 -I tools/oracle/dump_json.py fixtures/build/$v/phanes_demo fixtures/expected/$v/phanes_demo/canonical
done
tools/oracle/unrpyc.sh   # clone aussi unrpyc (commit épinglé) dans tools/oracle/.cache
for v in 6.99.14.3 7.4.11 8.3.7 8.5.3; do
  python3 tools/oracle/semantic.py tools/oracle/.cache/unrpyc \
    fixtures/build/$v/phanes_demo/project fixtures/expected/$v/phanes_demo/semantic
done
```

Les sorties sont commitées : la CI n'a pas besoin des SDK.
