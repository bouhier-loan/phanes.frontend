# Formats Ren'Py : détails vérifiés

Chaque point est vérifié dans les sources de Ren'Py (MIT) ou sur les fixtures compilées avec les
SDK 6.99.14.3, 7.4.11, 8.3.7 et 8.5.3.

## Archives RPA (`renpy/loader.py`, `launcher/game/archiver.rpy`)

- **RPA-3.0** : en-tête `RPA-3.0 %016x %08x\n`. Ren'Py lit 40 octets, prend
  `offset = int(l[8:24], 16)` et `key = int(l[25:33], 16)`. Index = `zlib(pickle)` de l'offset à
  la fin du fichier : dict nom → liste de `(offset ^ key, longueur ^ key[, préfixe])`.
  Le launcher écrit toujours la clé `0x42424242`, un préfixe `b""` et du padding
  `"Made with Ren'Py."`, en `HIGHEST_PROTOCOL` (2 sous Python 2, 5 sous Python 3).
- **RPA-2.0** : `RPA-2.0 %016x\n`, pas de XOR.
- **RPA-1.0** : index `.rpi` (zlib, `78 9C`) à côté d'un `.rpa` de données sans en-tête.
- Les archives sont cherchées **récursivement** dans `game/` et triées par
  `(radical, extension, chemin)` **inversé** ; les fichiers libres passent avant les archives.
- Autres en-têtes (`RPA-3.2`, `RPA-4.0`, `ALT-1.0`…) : non supportés, diagnostic
  `RPA_UNKNOWN_HEADER` avec l'en-tête lu.

## Scripts compilés RPYC (`renpy/script.py`)

- `RENPY RPC2`, puis des triplets `struct "III"` (ordre natif, little-endian en pratique) lus
  dans les 1024 premiers octets jusqu'au slot 0 ; un MD5 de 16 octets termine le fichier.
- Slot 1 : AST avant transformations statiques. Slot 2 : après `translation.restructure`
  (wrappers `Translate`). Ren'Py charge 2 puis 1 ; Phanes, comme unrpyc, lit 1 puis 2.
- Format legacy : le fichier entier est un flux zlib.
- Contenu : pickle de `(data, stmts)`, `data = {"version": 5003000, "key": "unlocked", …}`.

## Protocoles pickle observés

| SDK       | Python | `.rpyc` | index `.rpa` | Source                                    |
| --------- | ------ | ------- | ------------ | ----------------------------------------- |
| 6.99, 7.x | 2.7    | 2       | 2            | `dumps((data, stmts), 2)`                 |
| 8.0–8.3   | 3      | **2**   | 5            | `renpy/compat/pickle.py` : `PROTOCOL = 2` |
| 8.4+      | 3      | 5       | 5            | `PROTOCOL = pickle.HIGHEST_PROTOCOL`      |

Le protocole ne suffit donc pas à reconnaître Python 2 : la VM signale les opcodes de `str`
Python 2 (`STRING`, `BINSTRING`, `SHORT_BINSTRING`), que Python 3 n'écrit jamais.
Ren'Py 8 décode ces chaînes en UTF-8 avec `surrogateescape` ; Phanes fait de même.

## Sérialisation de l'AST

- Jusqu'à 8.3 : classes à `__slots__`, `NEWOBJ` puis `BUILD (None, {slots})`. Les champs
  `name`, `filename`, `linenumber` et `next` sont présents.
- 8.4+ (`renpy.cslots`) : même forme, avec `linenumber`, `col_offset`, et le nom d'un label dans
  `_name` (les autres nœuds : `name_version`/`name_serial`). **`next` n'est plus sérialisé** :
  le flot de contrôle doit être reconstruit à partir de l'ordre des blocs.
- `PyCode` : état en tuple `(1, source, location, mode[, py, hashcode, col_offset])`.
- `PyExpr` : sous-classe de `str`, `renpy.ast.PyExpr` jusqu'à 8.3 (`NEWOBJ`),
  `renpy.astsupport.PyExpr` ensuite (`REDUCE`, 6 arguments).
- Les labels locaux sont stockés avec leur nom complet (`park.bench`).
