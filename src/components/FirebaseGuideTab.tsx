import { useState } from 'react';
import { Check, Copy, Database, Globe, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  getActiveStorageMode,
  initializeFirestoreDatabase,
  initializeSupabaseDatabase,
} from '../lib/api.ts';
import { getFirebaseProjectId, isFirebaseEnvConfigured } from '../lib/firebaseClient.ts';
import { getSupabaseProjectRef, isSupabaseEnvConfigured } from '../lib/supabaseClient.ts';

const SUPABASE_SQL_SNIPPET = `-- Chạy đoạn mã này 1 lần trong Supabase -> SQL Editor -> New query -> Run

create table if not exists public.classes (
  id text primary key,
  name text not null,
  created_at text not null
);

create table if not exists public.students (
  id text primary key,
  student_code text not null,
  name text not null,
  birth_date text not null default '',
  class_id text not null,
  "to" integer not null default 1,
  group_number integer not null default 1,
  is_leader boolean not null default false,
  score numeric not null default 7,
  note text not null default ''
);

create table if not exists public.core_missions (
  id integer primary key,
  title text not null,
  summary text not null default '',
  cards jsonb not null default '[]'::jsonb
);

create table if not exists public.app_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.daily_assignments (
  id text primary key,
  class_id text not null,
  date text not null,
  lesson_topic text not null,
  groups jsonb not null default '{}'::jsonb,
  updated_at text not null
);

create table if not exists public.daily_grades (
  id text primary key,
  class_id text not null,
  date text not null,
  lesson_topic text not null,
  entries jsonb not null default '[]'::jsonb,
  published_to_students boolean not null default true,
  updated_at text not null
);

alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.core_missions enable row level security;
alter table public.app_settings enable row level security;
alter table public.daily_assignments enable row level security;
alter table public.daily_grades enable row level security;

drop policy if exists "Public read classes" on public.classes;
create policy "Public read classes" on public.classes for select using (true);
drop policy if exists "Teacher write classes" on public.classes;
create policy "Teacher write classes" on public.classes for all to authenticated using (true) with check (true);

drop policy if exists "Public read students" on public.students;
create policy "Public read students" on public.students for select using (true);
drop policy if exists "Teacher write students" on public.students;
create policy "Teacher write students" on public.students for all to authenticated using (true) with check (true);

drop policy if exists "Public read missions" on public.core_missions;
create policy "Public read missions" on public.core_missions for select using (true);
drop policy if exists "Teacher write missions" on public.core_missions;
create policy "Teacher write missions" on public.core_missions for all to authenticated using (true) with check (true);

drop policy if exists "Public read settings" on public.app_settings;
create policy "Public read settings" on public.app_settings for select using (true);
drop policy if exists "Teacher write settings" on public.app_settings;
create policy "Teacher write settings" on public.app_settings for all to authenticated using (true) with check (true);

drop policy if exists "Public read assignments" on public.daily_assignments;
create policy "Public read assignments" on public.daily_assignments for select using (true);
drop policy if exists "Teacher write assignments" on public.daily_assignments;
create policy "Teacher write assignments" on public.daily_assignments for all to authenticated using (true) with check (true);

drop policy if exists "Public read grades" on public.daily_grades;
create policy "Public read grades" on public.daily_grades for select using (published_to_students = true or auth.role() = 'authenticated');
drop policy if exists "Teacher write grades" on public.daily_grades;
create policy "Teacher write grades" on public.daily_grades for all to authenticated using (true) with check (true);`;

const FIRESTORE_RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    match /classes/{classId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /settings/{settingId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Học sinh quét QR chỉ được ĐỌC phân công theo ngày & nhiệm vụ cứng
    match /dailyAssignments/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /coreMissions/{missionId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Danh sách học sinh: giáo viên đăng nhập mới ghi được
    match /students/{studentId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Bảng điểm theo ngày
    match /dailyGrades/{gradeId} {
      allow read: if resource.data.publishedToStudents == true || (request.auth != null);
      allow write: if request.auth != null;
    }
  }
}`;

const VERCEL_ENV_SNIPPET = `VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=ten-du-an.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ten-du-an
VITE_FIREBASE_STORAGE_BUCKET=ten-du-an.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef`;

interface FirebaseGuideTabProps {
  onRefreshWorkspace?: () => Promise<void>;
}

export function FirebaseGuideTab({ onRefreshWorkspace }: FirebaseGuideTabProps) {
  const supabaseConfigured = isSupabaseEnvConfigured();
  const firebaseConfigured = isFirebaseEnvConfigured();
  const supabaseRef = getSupabaseProjectRef();
  const projectId = getFirebaseProjectId();
  const storageMode = getActiveStorageMode();

  const [providerTab, setProviderTab] = useState<'supabase' | 'firebase'>(
    firebaseConfigured && !supabaseConfigured ? 'firebase' : 'supabase'
  );
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [dbInitLoading, setDbInitLoading] = useState(false);
  const [dbInitResult, setDbInitResult] = useState<string>('');
  const [dbInitError, setDbInitError] = useState<string>('');

  const handleCopy = (key: string, content: string) => {
    navigator.clipboard?.writeText(content);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleInitSupabase = async (forceReset: boolean) => {
    setDbInitLoading(true);
    setDbInitResult('');
    setDbInitError('');
    try {
      const res = await initializeSupabaseDatabase(forceReset);
      if (onRefreshWorkspace) {
        await onRefreshWorkspace();
      }
      setDbInitResult(
        `${res.created ? 'Đã nạp mới dữ liệu lên' : 'Database đã sẵn sàng trên'} Supabase (${supabaseRef}): ${res.counts.missions} nhiệm vụ · ${res.counts.students} học sinh · ${res.counts.assignments} phân công · ${res.counts.grades} bảng điểm.`
      );
    } catch (err) {
      setDbInitError(err instanceof Error ? err.message : 'Không thể khởi tạo dữ liệu Supabase.');
    } finally {
      setDbInitLoading(false);
    }
  };

  const handleInitFirestore = async (forceReset: boolean) => {
    setDbInitLoading(true);
    setDbInitResult('');
    setDbInitError('');
    try {
      const res = await initializeFirestoreDatabase(forceReset);
      if (onRefreshWorkspace) {
        await onRefreshWorkspace();
      }
      setDbInitResult(
        `${res.created ? 'Đã khởi tạo mới' : 'Database đã sẵn sàng'} trên Firestore (${projectId}): ${res.counts.missions} nhiệm vụ cứng · ${res.counts.students} học sinh · ${res.counts.assignments} phân công · ${res.counts.grades} bảng điểm.`
      );
    } catch (err) {
      setDbInitError(err instanceof Error ? err.message : 'Không thể khởi tạo Firestore.');
    } finally {
      setDbInitLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div className="text-xs font-semibold text-blue-700">
            Trạng thái kết nối hiện tại:{' '}
            {storageMode === 'supabase'
              ? `Đã kết nối Supabase PostgreSQL (${supabaseRef})`
              : storageMode === 'firebase'
              ? `Đã kết nối Firebase Firestore (${projectId})`
              : storageMode === 'server'
              ? 'Đang chạy trên Máy chủ cục bộ (API Server)'
              : 'Đang lưu cục bộ trên trình duyệt (Chưa gắn Database đám mây)'}
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
            <button
              type="button"
              onClick={() => setProviderTab('supabase')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                providerTab === 'supabase'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Supabase (Vercel Postgres)
            </button>
            <button
              type="button"
              onClick={() => setProviderTab('firebase')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                providerTab === 'firebase'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Firebase Firestore
            </button>
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-900">
          {providerTab === 'supabase'
            ? 'Kết nối Database Supabase (PostgreSQL trên Vercel)'
            : 'Hướng dẫn Tạo Database Firebase & Gắn vào Web Vercel'}
        </h2>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
          {providerTab === 'supabase'
            ? 'Khi bạn tạo Database trên Vercel Storage (tích hợp Supabase), Vercel sẽ tự động cấp các biến NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY. Dự án đã được lập trình sẵn để tự động nhận các biến này và lưu toàn bộ lớp học, 400 học sinh, QR và bảng điểm lên PostgreSQL.'
            : 'Nếu dùng Firebase Authentication + Cloud Firestore, bạn chỉ cần khai báo 6 biến VITE_FIREBASE_* trên Vercel và cấu hình Rules bên dưới.'}
        </p>

        {providerTab === 'supabase' && supabaseConfigured && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={dbInitLoading}
                onClick={() => handleInitSupabase(false)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                <Database className="w-4 h-4" />
                {dbInitLoading ? 'Đang kiểm tra...' : 'Kiểm tra & Khởi tạo Database Supabase'}
              </button>
              <button
                type="button"
                disabled={dbInitLoading}
                onClick={() => handleInitSupabase(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Nạp lại dữ liệu mẫu 10 lớp (40 HS/lớp)
              </button>
            </div>
            {dbInitResult && (
              <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl">
                {dbInitResult}
              </div>
            )}
            {dbInitError && (
              <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl">
                {dbInitError}
              </div>
            )}
          </div>
        )}

        {providerTab === 'firebase' && firebaseConfigured && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={dbInitLoading}
                onClick={() => handleInitFirestore(false)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                <Database className="w-4 h-4" />
                {dbInitLoading ? 'Đang tạo bảng dữ liệu...' : 'Kiểm tra & Khởi tạo Database Firestore'}
              </button>
              <button
                type="button"
                disabled={dbInitLoading}
                onClick={() => handleInitFirestore(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Nạp lại dữ liệu mẫu 10 lớp (40 HS/lớp)
              </button>
            </div>
            {dbInitResult && (
              <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl">
                {dbInitResult}
              </div>
            )}
            {dbInitError && (
              <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl">
                {dbInitError}
              </div>
            )}
          </div>
        )}
      </div>

      {providerTab === 'supabase' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 mb-2">
                <Database className="w-4 h-4" />
                Bước 1: Tạo 6 bảng dữ liệu trong Supabase
              </div>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Mở trang quản trị <strong>Supabase Dashboard</strong> của project bạn (từ Vercel chọn Storage → Open in Supabase).
                </li>
                <li>
                  Ở thanh bên trái, chọn <strong>SQL Editor → New query</strong>.
                </li>
                <li>
                  Sao chép toàn bộ đoạn mã SQL bên dưới, dán vào khung soạn thảo và nhấn nút <strong>Run</strong> (chỉ cần chạy 1 lần duy nhất).
                </li>
              </ol>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 mb-2">
                <KeyRound className="w-4 h-4" />
                Bước 2: Bật đăng nhập Giáo viên &amp; Redeploy Vercel
              </div>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Trong Supabase, vào <strong>Authentication → Providers → Email</strong>. Nếu muốn đăng ký xong vào được ngay mà không cần mở email bấm xác nhận, hãy tắt mục <strong>Confirm email</strong> rồi nhấn <strong>Save</strong>.
                </li>
                <li>
                  Đảm bảo trên Vercel đã có 2 biến <span className="font-mono text-xs bg-slate-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</span> và <span className="font-mono text-xs bg-slate-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> (hoặc <span className="font-mono text-xs bg-slate-100 px-1 rounded">VITE_SUPABASE_*</span>), rồi <strong>Redeploy</strong>.
                </li>
                <li>
                  Đăng ký/Đăng nhập tài khoản giáo viên trên web — hệ thống sẽ tự động nạp 10 lớp (`9/1`→`9/10`) và 400 học sinh vào Supabase!
                </li>
              </ol>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  Đoạn mã SQL tạo Bảng &amp; Phân quyền RLS (Chạy 1 lần trong Supabase SQL Editor)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tự động tạo 6 bảng (<span className="font-mono">classes, students, core_missions, app_settings, daily_assignments, daily_grades</span>) kèm quyền đọc QR cho học sinh và quyền ghi cho giáo viên.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('sql', SUPABASE_SQL_SNIPPET)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
              >
                {copiedKey === 'sql' ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'sql' ? 'Đã chép SQL' : 'Sao chép SQL'}
              </button>
            </div>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed max-h-96">
              {SUPABASE_SQL_SNIPPET}
            </pre>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-blue-700 mb-2">
                <Database className="w-4 h-4" />
                Bước 1: Tạo Database Firestore trên Firebase
              </div>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Truy cập <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">console.firebase.google.com</span> → chọn <strong>Create a project</strong>.
                </li>
                <li>
                  Ở menu bên trái, vào <strong>Build → Firestore Database</strong> → nhấn <strong>Create database</strong>.
                </li>
                <li>
                  Chọn vị trí <strong>asia-southeast1 (Singapore)</strong> → <strong>Start in production mode</strong> → nhấn <strong>Create</strong>.
                </li>
              </ol>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-blue-700 mb-2">
                <KeyRound className="w-4 h-4" />
                Bước 2: Bật Đăng nhập Giáo viên &amp; Cấp quyền tên miền
              </div>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Vào <strong>Build → Authentication → Get started</strong> → bật <strong>Email/Password</strong>.
                </li>
                <li>
                  Vào <strong>Authentication → Settings → Authorized domains → Add domain</strong> và thêm tên miền web Vercel của bạn.
                </li>
              </ol>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-700" />
                  Bước 3: Dán 6 biến Web App vào Vercel Environment Variables
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('env', VERCEL_ENV_SNIPPET)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
              >
                {copiedKey === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'env' ? 'Đã chép' : 'Sao chép biến'}
              </button>
            </div>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
              {VERCEL_ENV_SNIPPET}
            </pre>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  Bước 4: Dán Firestore Security Rules &amp; Nhấn Publish
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('rules', FIRESTORE_RULES_SNIPPET)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
              >
                {copiedKey === 'rules' ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'rules' ? 'Đã chép' : 'Sao chép Rules'}
              </button>
            </div>
            <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
              {FIRESTORE_RULES_SNIPPET}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
