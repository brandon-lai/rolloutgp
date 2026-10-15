import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { migrateProfile } from '../src/store/profile.ts';
import { readHash } from '../src/app/share.ts';
import { parseBackup } from '../src/store/backup.ts';
const legacy = JSON.parse(readFileSync(new URL('./fixtures/profile-a2d8cdf.json', import.meta.url), 'utf8'));
it('opens a frozen a2d8cdf profile without changing builds, ghosts, medals or sticker references', () => {
  const next = migrateProfile(legacy);
  expect(next).toEqual(legacy);
});
it('opens a share link encoded by a2d8cdf', async () => {
  const hash = readFileSync(new URL('./fixtures/share-a2d8cdf.txt', import.meta.url), 'utf8').trim();
  expect(await readHash(hash)).toEqual({ kind: 'build', build: legacy.builds[0] });
});
it('repairs malformed ghosts and fractional active indices without discarding valid runs', () => {
  const p = migrateProfile({ ...legacy, active: .5, ghosts: { ...legacy.ghosts, bad: null, invalid: { time: 'oops' } } });
  expect(p.active).toBe(0);
  expect(p.ghosts).toEqual(legacy.ghosts);
});
it('restores legacy exports and rejects unrelated JSON before writing', () => {
  expect(parseBackup(legacy).profile).toEqual(legacy);
  expect(() => parseBackup({ foo: 'bar' })).toThrow();
  expect(() => parseBackup({ format: 'rolloutgp-backup', version: 2 })).toThrow();
});
it('preserves local sticker bytes in a backup and rejects remote image references', async () => {
  const b = { format: 'rolloutgp-backup', version: 1, profile: legacy, uploads: { 'legacy-image': 'data:image/png;base64,AQID' } };
  expect([...new Uint8Array(await parseBackup(b).uploads.get('legacy-image')!.arrayBuffer())]).toEqual([1,2,3]);
  expect(() => parseBackup({ ...b, uploads: { 'legacy-image': 'https://example.org/image.png' } })).toThrow();
});
