import { useState } from 'react';
import { Check, Copy, Database, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { getActiveStorageMode, initializeSupabaseDatabase } from '../lib/api.ts';
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

interface DatabaseGuideTabProps {
  onRefreshWorkspace?: () => Promise<void>;
}

export function DatabaseGuideTab({ onRefreshWorkspace }: DatabaseGuideTabProps) {
  const supabaseConfigured = isSupabaseEnvConfigured();
  const supabaseRef = getSupabaseProjectRef();
  const storageMode = getActiveStorageMode();

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

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="text-xs font-semibold text-emerald-700 mb-1">
          Trạng thái kết nối hiện tại:{' '}
          {storageMode === 'supabase'
            ? `Đã kết nối Supabase PostgreSQL (${supabaseRef})`
            : storageMode === 'server'
            ? 'Đang chạy trên Máy chủ cục bộ (API Server)'
            : 'Đang lưu cục bộ trên trình duyệt (Chưa gắn biến môi trường Supabase)'}
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          Kết nối Database Supabase (PostgreSQL trên Vercel)
        </h2>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
          Khi liên kết Supabase từ Vercel Storage, hệ thống tự động nhận 2 biến{' '}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_URL</span> và{' '}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>{' '}
          để lưu toàn bộ lớp học, 400 học sinh, mã QR và bảng điểm lên PostgreSQL theo thời gian thực.
        </p>

        {supabaseConfigured && (
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
      </div>

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
              Sao chép đoạn mã SQL bên dưới, dán vào khung soạn thảo và nhấn nút <strong>Run</strong> (chỉ cần chạy 1 lần duy nhất).
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
              Trong Supabase, vào <strong>Authentication → Providers → Email</strong>. Nếu muốn đăng ký xong vào dùng ngay không cần mở email xác nhận, hãy tắt mục <strong>Confirm email</strong> rồi nhấn <strong>Save</strong>.
            </li>
            <li>
              Đảm bảo trên Vercel đã có 2 biến <span className="font-mono text-xs bg-slate-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</span> và <span className="font-mono text-xs bg-slate-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, rồi <strong>Redeploy</strong>.
            </li>
            <li>
              Đăng ký/Đăng nhập tài khoản giáo viên trên web — hệ thống sẽ tự động nạp 10 lớp (`9/1`→`9/10`) và 400 học sinh lên Supabase.
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
    </div>
  );
}
