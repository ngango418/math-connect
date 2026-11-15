import { useCallback, useEffect, useState } from 'react';
import { LogOut, QrCode } from 'lucide-react';
import {
  CLASS_IDS,
  type ClassId,
  type GroupNumber,
  type TeacherUser,
  type WorkspaceSnapshot,
} from '../shared/types.ts';
import { fetchCurrentTeacher, fetchWorkspace, logoutTeacher } from './lib/api.ts';
import { StudentPortal } from './components/StudentPortal.tsx';
import { TeacherLoginView } from './components/TeacherLoginView.tsx';
import { MissionQrTab } from './components/MissionQrTab.tsx';
import { DailyGradingTab } from './components/DailyGradingTab.tsx';
import { StudentRosterTab } from './components/StudentRosterTab.tsx';
import { SquadSplitTab } from './components/SquadSplitTab.tsx';
import { FirebaseGuideTab } from './components/FirebaseGuideTab.tsx';

type AppMode = 'student' | 'teacher';
type TeacherTab = 'missions' | 'grading' | 'students' | 'squads' | 'firebase';

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseInitialParams(): {
  mode: AppMode;
  classId: ClassId;
  group: GroupNumber;
  date: string;
} {
  if (typeof window === 'undefined') {
    return { mode: 'teacher', classId: '9/23', group: 1, date: getTodayDateString() };
  }
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const rawClass = (params.get('class') || '9/23').replace('-', '/');
  const classId: ClassId =
    rawClass === '9/23' || rawClass === '9/26' || rawClass === '9/28' ? rawClass : '9/23';
  const rawGroup = Number(params.get('group') || 1);
  const group: GroupNumber =
    rawGroup >= 1 && rawGroup <= 5 ? (rawGroup as GroupNumber) : 1;
  const rawDate = params.get('date') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : getTodayDateString();

  return {
    mode: view === 'student' ? 'student' : 'teacher',
    classId,
    group,
    date,
  };
}

export default function App() {
  const initial = parseInitialParams();

  const [mode, setMode] = useState<AppMode>(initial.mode);
  const [teacher, setTeacher] = useState<TeacherUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [activeTab, setActiveTab] = useState<TeacherTab>('missions');
  const [selectedClass, setSelectedClass] = useState<ClassId>(initial.classId);
  const [selectedDate, setSelectedDate] = useState<string>(initial.date);
  const [studentPreviewGroup, setStudentPreviewGroup] = useState<GroupNumber>(initial.group);

  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
    try {
      const data = await fetchWorkspace();
      setWorkspace(data);
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentTeacher()
      .then((user) => {
        setTeacher(user);
        if (user) {
          return loadWorkspace();
        }
        return undefined;
      })
      .finally(() => setAuthChecked(true));
  }, [loadWorkspace]);

  const syncStudentUrlParams = useCallback((cls: ClassId, grp: GroupNumber, dt: string) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams({
      view: 'student',
      class: cls,
      group: String(grp),
      date: dt,
    });
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  const switchToTeacherMode = () => {
    setMode('teacher');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const switchToStudentMode = (cls: ClassId = selectedClass, grp: GroupNumber = 1, dt: string = selectedDate) => {
    setSelectedClass(cls);
    setStudentPreviewGroup(grp);
    setSelectedDate(dt);
    setMode('student');
    syncStudentUrlParams(cls, grp, dt);
  };

  const handleTeacherLoginSuccess = async (user: TeacherUser) => {
    setTeacher(user);
    await loadWorkspace();
    switchToTeacherMode();
  };

  const handleLogout = async () => {
    await logoutTeacher();
    setTeacher(null);
    setWorkspace(null);
  };

  const teacherNavLinks: Array<{ id: TeacherTab; label: string }> = [
    { id: 'missions', label: 'Phân thẻ & QR' },
    { id: 'grading', label: 'Chấm điểm ngày' },
    { id: 'students', label: 'Học sinh & Excel' },
    { id: 'squads', label: 'Tổ & Chia nhóm' },
    { id: 'firebase', label: 'Liên kết Firebase' },
  ];

  const classStudentCount = workspace
    ? workspace.students.filter((s) => s.classId === selectedClass).length
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Single-row, 3 zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => (mode === 'teacher' && teacher ? setActiveTab('missions') : switchToStudentMode())}
            className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 text-left"
          >
            ClassQR Studio
          </button>

          {/* Zone 2: 4–5 concise single-line nav links */}
          {mode === 'teacher' && teacher ? (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
              {teacherNavLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    activeTab === link.id
                      ? 'text-blue-700 border-blue-700 font-semibold'
                      : 'border-transparent hover:text-slate-900'
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </nav>
          ) : (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              {CLASS_IDS.map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => switchToStudentMode(cls, studentPreviewGroup, selectedDate)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    mode === 'student' && selectedClass === cls
                      ? 'text-blue-700 border-blue-700 font-semibold'
                      : 'border-transparent hover:text-slate-900'
                  }`}
                >
                  Lớp {cls}
                </button>
              ))}
              <button
                type="button"
                onClick={() => switchToStudentMode(selectedClass, studentPreviewGroup, selectedDate)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  mode === 'student'
                    ? 'text-slate-900 border-transparent font-medium'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                Quét thẻ QR
              </button>
            </nav>
          )}

          {/* Zone 3: 1 Primary CTA */}
          <div className="shrink-0">
            {mode === 'teacher' ? (
              <button
                type="button"
                onClick={() => switchToStudentMode(selectedClass, 1, selectedDate)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <QrCode className="w-3.5 h-3.5" />
                Trang Học Sinh
              </button>
            ) : (
              <button
                type="button"
                onClick={switchToTeacherMode}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {teacher ? 'Bảng điều khiển GV' : 'Đăng nhập Giáo viên'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {mode === 'student' ? (
          <StudentPortal
            initialClassId={selectedClass}
            initialGroup={studentPreviewGroup}
            initialDate={selectedDate}
            onSyncUrlParams={syncStudentUrlParams}
          />
        ) : !authChecked ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-center text-sm text-slate-500">
            Đang kiểm tra phiên đăng nhập...
          </div>
        ) : !teacher ? (
          <TeacherLoginView
            onSuccess={handleTeacherLoginSuccess}
            onSwitchToStudent={() => switchToStudentMode(selectedClass, 1, selectedDate)}
          />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            {/* Workspace Control Strip: 3 Classes (9/23, 9/26, 9/28) + Mobile Tabs + Teacher Logout */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {CLASS_IDS.map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setSelectedClass(cls)}
                      className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors whitespace-nowrap ${
                        selectedClass === cls
                          ? 'bg-blue-700 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Lớp {cls}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span>Sĩ số lớp {selectedClass}:</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {classStudentCount} học sinh
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>5 nhóm QR</span>
                </div>
              </div>

              <div className="flex items-center justify-between lg:justify-end gap-4 text-xs">
                <div className="text-slate-600">
                  <span className="font-semibold text-slate-900">{teacher.name}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-mono">{teacher.email}</span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 bg-slate-100 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Đăng xuất
                </button>
              </div>
            </div>

            {/* Mobile Tab Switcher */}
            <div className="flex md:hidden items-center gap-1.5 overflow-x-auto pb-1 no-print">
              {teacherNavLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 ${
                    activeTab === link.id
                      ? 'bg-blue-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-700'
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>

            {workspaceLoading && !workspace ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
                Đang tải dữ liệu lớp học...
              </div>
            ) : workspace ? (
              <>
                {activeTab === 'missions' && (
                  <MissionQrTab
                    classId={selectedClass}
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                    students={workspace.students}
                    coreMissions={workspace.coreMissions}
                    assignments={workspace.assignments}
                    onRefreshWorkspace={loadWorkspace}
                    onPreviewStudentQr={(cls, grp, dt) => switchToStudentMode(cls, grp, dt)}
                  />
                )}
                {activeTab === 'grading' && (
                  <DailyGradingTab
                    classId={selectedClass}
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                    assignments={workspace.assignments}
                    grades={workspace.grades}
                    onRefreshWorkspace={loadWorkspace}
                  />
                )}
                {activeTab === 'students' && (
                  <StudentRosterTab
                    classId={selectedClass}
                    students={workspace.students}
                    onRefreshWorkspace={loadWorkspace}
                  />
                )}
                {activeTab === 'squads' && (
                  <SquadSplitTab
                    classId={selectedClass}
                    students={workspace.students}
                    onRefreshWorkspace={loadWorkspace}
                  />
                )}
                {activeTab === 'firebase' && <FirebaseGuideTab />}
              </>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
