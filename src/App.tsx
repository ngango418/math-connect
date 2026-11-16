import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LogOut, Plus, QrCode, Sparkles, Trash2, X } from 'lucide-react';
import {
  DEFAULT_CLASS_NAMES,
  type ClassId,
  type GroupNumber,
  type TeacherUser,
  type WorkspaceSnapshot,
} from '../shared/types.ts';
import {
  createClassroom,
  deleteClassroom,
  fetchCurrentTeacher,
  fetchWorkspace,
  getActiveStorageMode,
  logoutTeacher,
} from './lib/api.ts';
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
    return { mode: 'teacher', classId: '9/1', group: 1, date: getTodayDateString() };
  }
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const rawClass = (params.get('class') || '9/1').trim();
  const classId: ClassId = rawClass || '9/1';
  const rawGroup = Number(params.get('group') || 1);
  const group: GroupNumber =
    rawGroup >= 1 && rawGroup <= 8 ? (rawGroup as GroupNumber) : 1;
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
  const [workspaceError, setWorkspaceError] = useState('');

  // Add class state
  const [addingClass, setAddingClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [classActionBusy, setClassActionBusy] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const data = await fetchWorkspace();
      setWorkspace(data);
      setSelectedClass((prev) => {
        if (data.classes.length === 0) return prev;
        return data.classes.some((c) => c.id === prev) ? prev : data.classes[0].id;
      });
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Không thể tải dữ liệu lớp học.');
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

  const switchToStudentMode = (
    cls: ClassId = selectedClass,
    grp: GroupNumber = 1,
    dt: string = selectedDate
  ) => {
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

  const handleAddClassroom = async (e: FormEvent) => {
    e.preventDefault();
    const clean = newClassName.trim();
    if (!clean) return;
    setClassActionBusy(true);
    try {
      const created = await createClassroom(clean);
      setNewClassName('');
      setAddingClass(false);
      await loadWorkspace();
      setSelectedClass(created.id);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Không thể thêm lớp mới.');
    } finally {
      setClassActionBusy(false);
    }
  };

  const handleDeleteClassroom = async (clsId: string) => {
    if (!workspace || workspace.classes.length <= 1) return;
    setClassActionBusy(true);
    try {
      await deleteClassroom(clsId);
      await loadWorkspace();
    } finally {
      setClassActionBusy(false);
    }
  };

  const teacherNavLinks: Array<{ id: TeacherTab; label: string }> = [
    { id: 'missions', label: 'Phát thẻ & QR' },
    { id: 'grading', label: 'Chấm điểm & Bảng tính' },
    { id: 'students', label: 'Học sinh & AI Excel' },
    { id: 'squads', label: 'Chia 4 Tổ → 8 Nhóm' },
    { id: 'firebase', label: 'Liên kết Database' },
  ];

  const availableClasses = workspace?.classes?.length
    ? workspace.classes
    : DEFAULT_CLASS_NAMES.map((c) => ({ id: c, name: c, createdAt: '' }));

  const classStudentCount = workspace
    ? workspace.students.filter((s) => s.classId === selectedClass).length
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-sky-50/60 via-slate-50 to-slate-50 text-slate-900">
      {/* Top Bar Contract: Single-row, 3 zones separated by gap-8 */}
      <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-40 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => (mode === 'teacher' && teacher ? setActiveTab('missions') : switchToStudentMode())}
            className="inline-flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 text-left"
          >
            <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
            <span>ClassQR Studio</span>
          </button>

          {/* Zone 2: Concise single-line nav links */}
          {mode === 'teacher' && teacher ? (
            <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
              {teacherNavLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    activeTab === link.id
                      ? 'text-blue-600 border-blue-600 font-semibold'
                      : 'border-transparent hover:text-slate-900'
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </nav>
          ) : (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
              {availableClasses.slice(0, 4).map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => switchToStudentMode(cls.id, studentPreviewGroup, selectedDate)}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    mode === 'student' && selectedClass === cls.id
                      ? 'text-blue-600 border-blue-600 font-semibold'
                      : 'border-transparent hover:text-slate-900'
                  }`}
                >
                  Lớp {cls.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => switchToStudentMode(selectedClass, studentPreviewGroup, selectedDate)}
                className="py-1 whitespace-nowrap shrink-0 transition-colors text-slate-700 hover:text-slate-900"
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
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                <QrCode className="w-3.5 h-3.5" />
                Trang Học Sinh
              </button>
            ) : (
              <button
                type="button"
                onClick={switchToTeacherMode}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
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
            {/* Dynamic Class Switcher + Add/Remove Class + Teacher Profile */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {availableClasses.map((cls) => (
                    <div key={cls.id} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => setSelectedClass(cls.id)}
                        className={`px-3.5 py-1.5 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
                          selectedClass === cls.id
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Lớp {cls.name}
                      </button>
                      {availableClasses.length > 1 && selectedClass === cls.id && (
                        <button
                          type="button"
                          disabled={classActionBusy}
                          onClick={() => handleDeleteClassroom(cls.id)}
                          title={`Xóa Lớp ${cls.name}`}
                          className="ml-0.5 p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {addingClass ? (
                  <form onSubmit={handleAddClassroom} className="inline-flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      placeholder="VD: 9/10"
                      autoFocus
                      className="w-24 px-2.5 py-1.5 text-xs font-semibold border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="submit"
                      disabled={classActionBusy || !newClassName.trim()}
                      className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingClass(false);
                        setNewClassName('');
                      }}
                      className="p-1 text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingClass(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Thêm lớp
                  </button>
                )}

                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {classStudentCount} học sinh
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>8 nhóm QR</span>
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
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 bg-slate-100 hover:bg-red-50 rounded-xl transition-colors whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Đăng xuất
                </button>
              </div>
            </div>

            {getActiveStorageMode() === 'local' && activeTab !== 'firebase' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 no-print">
                <span>
                  Ứng dụng đang lưu dữ liệu cục bộ trên trình duyệt này. Để học sinh quét mã QR từ điện thoại khác xem được dữ liệu thời gian thực, hãy kết nối Supabase hoặc Firebase.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('firebase')}
                  className="font-semibold text-blue-700 hover:underline whitespace-nowrap self-start sm:self-auto"
                >
                  Xem hướng dẫn kết nối Database →
                </button>
              </div>
            )}

            {/* Mobile/Tablet Tab Switcher */}
            <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1 no-print">
              {teacherNavLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 ${
                    activeTab === link.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700'
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>

            {activeTab === 'firebase' ? (
              <FirebaseGuideTab onRefreshWorkspace={loadWorkspace} />
            ) : workspaceLoading && !workspace ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
                Đang tải dữ liệu lớp học...
              </div>
            ) : workspaceError ? (
              <div className="bg-white border border-red-200 rounded-2xl p-6 space-y-3">
                <div className="text-sm font-bold text-red-700">Lỗi kết nối Database</div>
                <p className="text-sm text-slate-700">{workspaceError}</p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={loadWorkspace}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
                  >
                    Thử kết nối lại
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('firebase')}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                  >
                    Mở tab Liên kết Database
                  </button>
                </div>
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
                    allocationConfig={workspace.allocationConfig}
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
                    students={workspace.students}
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
              </>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
