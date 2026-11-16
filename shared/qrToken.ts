import type { GroupNumber } from './types.ts';

const QR_SCOPE_SALT = 'ClassQR-Studio-2026-ScopeLock-v1';

function mixHash(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 15;
  }
  return h >>> 0;
}

export function computeQrAccessToken(
  classId: string,
  groupNumber: GroupNumber,
  date: string
): string {
  const payload = `${classId.trim()}|${groupNumber}|${date.trim()}|${QR_SCOPE_SALT}`;
  const partA = mixHash(payload, 0x811c9dc5).toString(36).padStart(6, '0');
  const partB = mixHash(`${QR_SCOPE_SALT}|${payload}`, 0x9e3779b9).toString(36).padStart(6, '0');
  return `${partA}${partB}`.slice(0, 10);
}

export function verifyQrAccessToken(
  classId: string,
  groupNumber: GroupNumber,
  date: string,
  token: string | null | undefined
): boolean {
  const clean = (token || '').trim();
  if (!clean) return false;
  const expected = computeQrAccessToken(classId, groupNumber, date);
  if (clean.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= clean.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function buildStudentQrUrl(
  origin: string,
  classId: string,
  groupNumber: GroupNumber,
  date: string
): string {
  const token = computeQrAccessToken(classId, groupNumber, date);
  const params = new URLSearchParams({
    view: 'student',
    class: classId,
    group: String(groupNumber),
    date,
    k: token,
  });
  return `${origin}/?${params.toString()}`;
}
