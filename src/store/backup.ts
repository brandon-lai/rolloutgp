import { migrateProfile, type Profile } from './profile.ts';
import { getUpload, restoreData } from './db.ts';

export interface Backup { format: 'rolloutgp-backup'; version: 1; profile: Profile; uploads: Record<string, string> }
export function uploadIds(profile: Profile): string[] {
  const recipes = [...profile.builds.map(b => b.body), ...profile.designs, ...Object.values(profile.ghosts).map(g => g.build.body)];
  return [...new Set(recipes.flatMap(r => r.paint.decals.filter(d => d.sticker.startsWith('upload:')).map(d => d.sticker.slice(7))))];
}
export async function exportBackup(profile: Profile): Promise<Backup> {
  const uploads: Record<string, string> = {};
  for (const id of uploadIds(profile)) {
    const blob = await getUpload(id);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    uploads[id] = `data:${blob.type};base64,${btoa(binary)}`;
  }
  return { format: 'rolloutgp-backup', version: 1, profile, uploads };
}
export function parseBackup(input: unknown): { profile: Profile; uploads: Map<string, Blob> } {
  if (!input || typeof input !== 'object') throw new Error('Choose a Rollout GP save file.');
  const b = input as Partial<Backup>;
  const raw = b.format === 'rolloutgp-backup' ? b.profile : input as Profile;
  if (b.format && (b.format !== 'rolloutgp-backup' || b.version !== 1)) throw new Error('Unsupported backup version.');
  if (!raw || raw.v !== 1 || !Array.isArray(raw.builds) || !raw.builds.length || typeof raw.owner !== 'string') throw new Error('This is not a Rollout GP save.');
  const profile = migrateProfile(raw);
  const uploads = new Map<string, Blob>();
  for (const id of uploadIds(profile)) {
    const data = b.uploads?.[id];
    if (data === undefined) continue;
    if (typeof data !== 'string' || data.length > 6_000_000) throw new Error('Invalid sticker in backup.');
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!m) throw new Error('Invalid sticker in backup.');
    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    uploads.set(id, new Blob([bytes], { type: m[1] }));
  }
  return { profile, uploads };
}
export async function importBackup(input: unknown): Promise<Profile> {
  const parsed = parseBackup(input);
  await restoreData(parsed.profile, parsed.uploads);
  return parsed.profile;
}
