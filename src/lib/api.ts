import type {
  ClassId,
  CoreMission,
  DailyAssignmentRecord,
  DailyGradeRecord,
  MissionCard,
  PublicStudentMissionResponse,
  Student,
  TeacherUser,
  WorkspaceSnapshot,
} from '../../shared/types.ts';

const TOKEN_STORAGE_KEY = 'classqr_teacher_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Lỗi kết nối (${res.status})`);
  }
  return data as T;
}

export async function loginTeacher(email: string, password: string): Promise<{ token: string; user: TeacherUser }> {
  const res = await apiFetch<{ token: string; user: TeacherUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setStoredToken(res.token);
  return res;
}

export async function registerTeacher(
  email: string,
  password: string,
  name: string,
  subject: string
): Promise<{ token: string; user: TeacherUser }> {
  const res = await apiFetch<{ token: string; user: TeacherUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, subject }),
  });
  setStoredToken(res.token);
  return res;
}

export async function fetchCurrentTeacher(): Promise<TeacherUser | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await apiFetch<{ user: TeacherUser }>('/api/auth/me');
    return res.user;
  } catch {
    setStoredToken(null);
    return null;
  }
}

export async function logoutTeacher(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore
  }
  setStoredToken(null);
}

export async function fetchPublicStudentMission(
  classId: ClassId,
  groupNumber: number,
  date: string
): Promise<PublicStudentMissionResponse> {
  const params = new URLSearchParams({
    class: classId,
    group: String(groupNumber),
    date,
  });
  return apiFetch<PublicStudentMissionResponse>(`/api/public/mission?${params.toString()}`);
}

export async function fetchWorkspace(): Promise<WorkspaceSnapshot> {
  return apiFetch<WorkspaceSnapshot>('/api/workspace');
}

export async function createStudent(payload: Omit<Student, 'id'>): Promise<Student> {
  return apiFetch<Student>('/api/students', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateStudent(id: string, payload: Partial<Student>): Promise<Student> {
  return apiFetch<Student>(`/api/students/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteStudent(id: string): Promise<void> {
  await apiFetch(`/api/students/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function bulkStudentsAction(payload: {
  mode: 'import-merge' | 'import-replace' | 'patch';
  classId?: ClassId;
  students: Array<Partial<Student> & { id?: string }>;
}): Promise<{ students: Student[] }> {
  return apiFetch<{ students: Student[] }>('/api/students/bulk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCoreMission(
  missionId: number,
  payload: { title?: string; summary?: string }
): Promise<CoreMission> {
  return apiFetch<CoreMission>(`/api/missions/${missionId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function addMissionCard(
  missionId: number,
  payload: Omit<MissionCard, 'id' | 'missionId'>
): Promise<MissionCard> {
  return apiFetch<MissionCard>(`/api/missions/${missionId}/cards`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteMissionCard(cardId: string): Promise<void> {
  await apiFetch(`/api/cards/${encodeURIComponent(cardId)}`, {
    method: 'DELETE',
  });
}

export async function saveDailyAssignment(
  payload: Omit<DailyAssignmentRecord, 'id' | 'updatedAt'>
): Promise<DailyAssignmentRecord> {
  return apiFetch<DailyAssignmentRecord>('/api/assignments', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function saveDailyGrade(
  payload: Omit<DailyGradeRecord, 'id' | 'updatedAt'>
): Promise<DailyGradeRecord> {
  return apiFetch<DailyGradeRecord>('/api/grades', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
