import { BytesSource, type FileSource, readFully } from '@phanes/renpy-formats';
import { fixturePath, walkDirectory } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import { analyzeFiles, buildVfs, effectiveGameEntries, type InventoryResult } from '../src';

const SDKS = ['6.99.14.3', '7.4.11', '8.3.7', '8.5.3'] as const;

const dist = (sdk: string) => walkDirectory(fixturePath('build', sdk, 'phanes_demo', 'dist'));

for (const sdk of SDKS) {
  describe(`distribution built by Ren'Py ${sdk}`, () => {
    it('mounts archive content under the game directory', async () => {
      const { vfs, diagnostics } = await buildVfs(await dist(sdk));
      expect(diagnostics).toEqual([]);
      expect(vfs.rootName).toBe('dist');
      expect(vfs.gameDir).toBe('dist/game');
      expect(vfs.archives.map((a) => [a.path, a.version, a.error])).toEqual([
        ['dist/game/images.rpa', 'RPA-3.0', null],
        ['dist/game/scripts.rpa', 'RPA-3.0', null],
      ]);
      const names = effectiveGameEntries(vfs)
        .map((e) => e.gamePath)
        .sort();
      expect(names).toEqual(
        [
          'audio/theme.ogg',
          'audio/unused.ogg',
          'audio/v1.ogg',
          'characters.rpyc',
          'fonts/demo.ttf',
          'images.rpa',
          'images/bg park.png',
          'images/bg room.png',
          'images/eileen happy.png',
          'images/lucy smile.png',
          'images/unused.png',
          'options.rpyc',
          'script.rpyc',
          'script_version.txt',
          'scripts.rpa',
          'story/extra.rpyc',
          'tl/french/characters.rpyc',
          'tl/french/script.rpyc',
        ].sort(),
      );
    });

    it('reads archive entries lazily, with the original bytes', async () => {
      const { vfs } = await buildVfs(await dist(sdk));
      const fromArchive = vfs.entries.find((e) => e.gamePath === 'images/bg park.png');
      const original = (await walkDirectory(fixturePath('games', 'phanes_demo', 'game'))).find(
        (f) => f.path.endsWith('images/bg park.png'),
      );
      if (!fromArchive || !original) throw new Error('fixture entry missing');
      expect(fromArchive.origin).toEqual({ type: 'archive', archive: 'dist/game/images.rpa' });
      expect(await readFully(fromArchive.source, 1 << 20)).toEqual(
        await readFully(original, 1 << 20),
      );
    });

    it('produces an inventory', async () => {
      const { report } = await analyzeFiles(await dist(sdk), { now: () => new Date(0) });
      const inventory = report.analyses.inventory as InventoryResult;
      expect(inventory.totals.archives).toBe(2);
      expect(inventory.totals.archiveEntries).toBe(11);
      expect(inventory.byKind['compiled-script'].count).toBe(6);
      expect(inventory.byKind.image.count).toBe(5);
      expect(inventory.byKind.audio.count).toBe(3);
      expect(inventory.byKind.font.count).toBe(1);
      expect(inventory.byKind.archive.count).toBe(0);
      expect(inventory.byZone.engine.count).toBeGreaterThanOrEqual(2);
      expect(report.diagnostics).toEqual([]);
      expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    });
  });
}

describe('shadowing and errors', () => {
  it('lets loose files win over archive entries', async () => {
    const files = await dist('8.5.3');
    const loose = new BytesSource('dist/game/script.rpyc', Uint8Array.of(1, 2, 3));
    const { vfs } = await buildVfs([...files, loose]);
    const copies = vfs.entries.filter((e) => e.gamePath === 'script.rpyc');
    expect(copies.map((e) => [e.origin.type, e.shadowedBy])).toEqual([
      ['file', null],
      ['archive', 'dist/game/script.rpyc'],
    ]);
  });

  it("follows Ren'Py's archive order for duplicates", async () => {
    const files = await dist('8.5.3');
    const images = files.find((f) => f.path.endsWith('images.rpa'));
    if (!images) throw new Error('missing images.rpa');
    const copy: FileSource = {
      path: 'dist/game/z_patch.rpa',
      size: images.size,
      read: (s, e) => images.read(s, e),
    };
    const { vfs } = await buildVfs([...files, copy]);
    const bg = vfs.entries.filter((e) => e.gamePath === 'images/bg room.png');
    const winner = bg.find((e) => e.shadowedBy === null);
    expect(winner?.origin).toEqual({ type: 'archive', archive: 'dist/game/z_patch.rpa' });
  });

  it('reports a corrupted archive and keeps everything else', async () => {
    const files = await dist('8.5.3');
    const broken = new BytesSource(
      'dist/game/broken.rpa',
      new TextEncoder().encode('RPA-4.0 nonsense'),
    );
    const { report } = await analyzeFiles([...files, broken]);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RPA_UNKNOWN_HEADER',
        path: 'dist/game/broken.rpa',
        severity: 'error',
      }),
    ]);
    const inventory = report.analyses.inventory as InventoryResult;
    expect(inventory.totals.archiveEntries).toBe(11);
    expect(inventory.archives.find((a) => a.path.endsWith('broken.rpa'))?.error).toBe(
      'RPA_UNKNOWN_HEADER',
    );
  });

  it('isolates a failing analysis', async () => {
    const { report } = await analyzeFiles(await dist('8.5.3'), {
      analyses: [
        {
          id: 'boom',
          run() {
            throw new Error('kaboom');
          },
        },
        { id: 'ok', run: () => 42 },
      ],
    });
    expect(report.analyses).toEqual({ ok: 42 });
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        code: 'ANALYSIS_FAILED',
        details: { analysis: 'boom', cause: 'INTERNAL_ERROR' },
      }),
    ]);
  });
});
