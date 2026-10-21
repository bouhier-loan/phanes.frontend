# Rapport JSON (schéma v1)

L'export du rapport est l'objet `Report` de `packages/core/src/pipeline/report.ts` :

```jsonc
{
  "schemaVersion": 1,
  "generator": { "name": "Phanes", "version": "0.1.0" },
  "generatedAt": "2026-10-21T13:00:00.000Z",
  "input": {
    "rootName": "MyGame-1.0-pc",
    "gameDir": "MyGame-1.0-pc/game",
    "fileCount": 1234,
    "totalBytes": 2147483648,
  },
  "analyses": {
    "overview": {
      /* OverviewResult : titre, version de Ren'Py, compteurs, temps de lecture, langues */
    },
    "inventory": {
      /* InventoryResult : totaux, répartition par type et par zone, archives, entrées */
    },
    "characters": {/* CharactersResult : locuteurs, répliques et mots */},
    "labels": {/* LabelsResult : labels avec fichier, ligne et statistiques */},
    "diagnostics": {/* DiagnosticsResult : décompte par gravité et par code */},
  },
  "diagnostics": [
    {
      "severity": "error",
      "code": "RPA_UNKNOWN_HEADER",
      "message": "...",
      "path": "game/x.rpa",
      "details": { "header": "RPA-4.0 ..." },
    },
  ],
}
```

Une analyse qui échoue est absente de `analyses` et produit un diagnostic `ANALYSIS_FAILED`.
Les types TypeScript de chaque résultat (`OverviewResult`, `InventoryResult`, `CharactersResult`,
`LabelsResult`, `DiagnosticsResult`) font foi ; toute modification incompatible incrémente
`schemaVersion`.

## Codes de diagnostic

| Code                                                   | Signification                                               |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `RPA_UNKNOWN_HEADER`                                   | Archive dans une variante non supportée (en-tête fourni)    |
| `RPA_BAD_HEADER`, `RPA_BAD_INDEX`                      | Archive RPA corrompue                                       |
| `RPA_ENTRY_SKIPPED`                                    | Entrée d'index invalide, ignorée                            |
| `RPA_MISSING_DATA`                                     | Index RPA-1.0 (`.rpi`) sans son `.rpa`                      |
| `RPYC_BAD_HEADER`                                      | Script compilé illisible ou obfusqué                        |
| `RPYC_NO_SLOT`, `RPYC_BAD_PAYLOAD`                     | Script compilé sans contenu exploitable                     |
| `RPYC_SLOT_FALLBACK`                                   | Slot 1 illisible, slot 2 utilisé                            |
| `ZLIB_INVALID`, `ZLIB_LIMIT`                           | Données compressées corrompues ou trop volumineuses         |
| `PICKLE_INVALID`, `PICKLE_UNSUPPORTED`, `PICKLE_LIMIT` | Pickle corrompu, non supporté ou hors limites               |
| `TRUNCATED`, `TOO_LARGE`, `IO_READ_FAILED`             | Fichier tronqué, trop gros ou illisible                     |
| `AST_UNKNOWN_NODE`                                     | Statements d'une classe inconnue (comptés, non interprétés) |
| `AST_MALFORMED`                                        | Statements illisibles ou imbrication excessive              |
| `MULTIPLE_GAME_DIRS`                                   | Plusieurs dossiers `game/` déposés                          |
| `ANALYSIS_FAILED`                                      | Une analyse a échoué ; les autres sont présentes            |
