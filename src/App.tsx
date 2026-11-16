import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Award, BellRing, CheckSquare, LogOut, Plus, QrCode, Sparkles, Trash2, Users, X } from 'lucide-react';
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
import { DatabaseGuideTab } from './components/DatabaseGuideTab.tsx';
import { ClassAlertBanner } from './components/ClassAlertBanner.tsx';
import {
  playMissionSuccessChime,
  subscribeClassCompletions,
  type MissionCompletionAlert,
} from './lib/soundAndBroadcast.ts';
import { computeQrAccessToken, verifyQrAccessToken } from '../shared/qrToken.ts';

type AppMode = 'student' | 'teacher';
type TeacherTab = 'missions' | 'grading' | 'students' | 'squads' | 'database';

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
  qrToken: string;
} {
  if (typeof window === 'undefined') {
    return { mode: 'teacher', classId: '9/1', group: 1, date: getTodayDateString(), qrToken: '' };
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
  const qrToken = (params.get('k') || '').trim();

  return {
    mode: view === 'student' ? 'student' : 'teacher',
    classId,
    group,
    date,
    qrToken,
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
  const [qrToken, setQrToken] = useState<string>(initial.qrToken);

  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');

  // Add class state
  const [addingClass, setAddingClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [classActionBusy, setClassActionBusy] = useState(false);

  // Class-wide 3-second mission completion banner + sound
  const [activeClassAlert, setActiveClassAlert] = useState<MissionCompletionAlert | null>(null);
  const alertTimerRef = useRef<number | null>(null);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());

  const triggerClassAlert = useCallback(
    (alert: MissionCompletionAlert, shouldPlaySound: boolean) => {
      if (!alert?.id || seenAlertIdsRef.current.has(alert.id)) return;
      seenAlertIdsRef.current.add(alert.id);
      if (seenAlertIdsRef.current.size > 100) {
        const first = seenAlertIdsRef.current.values().next().value;
        if (first) seenAlertIdsRef.current.delete(first);
      }
      setActiveClassAlert(alert);
      if (shouldPlaySound) {
        playMissionSuccessChime(alert.allCompleted);
      }
      if (alertTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(alertTimerRef.current);
      }
      if (typeof window !== 'undefined') {
        alertTimerRef.current = window.setTimeout(() => {
          setActiveClassAlert((curr) => (curr?.id === alert.id ? null : curr));
        }, 3000);
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      if (alertTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(alertTimerRef.current);
      }
    };
  }, []);

  const hasValidStudentQr = verifyQrAccessToken(
    selectedClass,
    studentPreviewGroup,
    selectedDate,
    qrToken
  );

  useEffect(() => {
    const canListenClassEvents =
      (mode === 'teacher' && teacher !== null) || (mode === 'student' && hasValidStudentQr);
    if (!canListenClassEvents) return undefined;

    return subscribeClassCompletions(selectedClass, (alert) => {
      triggerClassAlert(alert, true);
    });
  }, [mode, teacher, hasValidStudentQr, selectedClass, triggerClassAlert]);

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

  const syncStudentUrlParams = useCallback(
    (cls: ClassId, grp: GroupNumber, dt: string, token: string) => {
      if (typeof window === 'undefined') return;
      const params = token
        ? new URLSearchParams({
            view: 'student',
            class: cls,
            group: String(grp),
            date: dt,
            k: token,
          })
        : new URLSearchParams({
            view: 'student',
          });
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    },
    []
  );

  const switchToTeacherMode = () => {
    setMode('teacher');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const switchToStudentMode = (
    cls: ClassId = selectedClass,
    grp: GroupNumber = 1,
    dt: string = selectedDate,
    allowTeacherPreviewToken = false
  ) => {
    const token =
      allowTeacherPreviewToken && teacher ? computeQrAccessToken(cls, grp, dt) : '';
    setSelectedClass(cls);
    setStudentPreviewGroup(grp);
    setSelectedDate(dt);
    setQrToken(token);
    setMode('student');
    syncStudentUrlParams(cls, grp, dt, token);
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
    { id: 'database', label: 'Liên kết Database' },
  ];

  const availableClasses = workspace?.classes?.length
    ? workspace.classes
    : DEFAULT_CLASS_NAMES.map((c) => ({ id: c, name: c, createdAt: '' }));

  const classStudentCount = workspace
    ? workspace.students.filter((s) => s.classId === selectedClass).length
    : 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col relative overflow-x-clip bg-gradient-to-br from-sky-50 via-amber-50/35 to-emerald-50/45 text-slate-900">
        {/* Ambient drifting educational backdrop shapes (no-print, GPU-only) */}
        <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden no-print -z-0">
          <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-sky-200/35 blur-2xl animate-float-slow" />
          <div className="absolute top-1/3 -right-24 w-80 h-80 rounded-full bg-amber-200/30 blur-2xl animate-float-delayed" />
          <div className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full bg-emerald-200/30 blur-2xl animate-float-slow" />
        </div>

        {/* Top Bar Contract: Single-row, 3 zones */}
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 no-print shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]">
          <div className="max-w-7xl mx-auto px-3.5 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
            {/* Zone 1: Single-line Brand Wordmark */}
            <button
              type="button"
              onClick={() => {
                if (mode === 'teacher' && teacher) setActiveTab('missions');
              }}
              className="inline-flex items-center gap-2 text-base sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 text-left"
            >
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 text-white inline-flex items-center justify-center shadow-sm shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
              <span>ClassQR Studio</span>
            </button>

            {/* Zone 2: Concise single-line nav links (Locked in student mode — no class/group switching) */}
            {mode === 'teacher' && teacher ? (
              <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold text-slate-600 overflow-x-auto">
                {teacherNavLinks.map((link) => {
                  const isActive = activeTab === link.id;
                  return (
                    <button
                      key={link.id}
                      type="button"
                      onClick={() => setActiveTab(link.id)}
                      className={`relative py-2 whitespace-nowrap shrink-0 transition-colors ${
                        isActive ? 'text-blue-600' : 'hover:text-slate-900'
                      }`}
                    >
                      {link.label}
                      {isActive && (
                        <motion.span
                          layoutId="teacher-nav-underline"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600"
                        />
                      )}
                    </button>
                  );
                })}
              </nav>
            ) : (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 min-w-0">
                {hasValidStudentQr ? (
                  <span className="px-2.5 sm:px-3 py-1 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 whitespace-nowrap truncate">
                    <span className="hidden md:inline">Học sinh · </span>
                    Lớp {selectedClass} · Nhóm {studentPreviewGroup}
                  </span>
                ) : (
                  <span className="hidden sm:inline text-slate-500 whitespace-nowrap truncate">
                    Cổng Học Sinh (Quét QR của nhóm)
                  </span>
                )}
              </div>
            )}

            {/* Zone 3: 1 Primary CTA — hidden when unauthenticated student scans QR */}
            {mode === 'teacher' ? (
              <div className="shrink-0">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => switchToStudentMode(selectedClass, 1, selectedDate, Boolean(teacher))}
                  className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 rounded-xl shadow-sm transition-colors whitespace-nowrap shrink-0"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Trang Học Sinh
                </motion.button>
              </div>
            ) : teacher ? (
              <div className="shrink-0">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={switchToTeacherMode}
                  className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-sm transition-colors whitespace-nowrap shrink-0"
                >
                  Bảng điều khiển GV
                </motion.button>
              </div>
            ) : null}
          </div>
        </header>

        {/* Global 3-second Class Completion Notification Banner */}
        <ClassAlertBanner
          alert={activeClassAlert}
          showCardTitle={Boolean(teacher)}
          onDismiss={() => setActiveClassAlert(null)}
        />

        {/* Main Content */}
        <main className="flex-1 relative z-10">
          {mode === 'student' ? (
            <StudentPortal
              classId={selectedClass}
              groupNumber={studentPreviewGroup}
              date={selectedDate}
              qrToken={qrToken}
              onNotifyClass={(alert) => triggerClassAlert(alert, false)}
            />
          ) : !authChecked ? (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-center text-sm text-slate-500">
              Đang kiểm tra phiên đăng nhập...
            </div>
          ) : !teacher ? (
            <TeacherLoginView
              onSuccess={handleTeacherLoginSuccess}
              onSwitchToStudent={() => switchToStudentMode(selectedClass, 1, selectedDate, false)}
            />
          ) : (
            <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
              {/* Dynamic Class Switcher + Add/Remove Class + Teacher Profile */}
              <div className="bg-white/95 backdrop-blur-sm border border-slate-200/90 rounded-3xl p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-[0_6px_22px_-8px_rgba(15,23,42,0.08)] no-print">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-2xl">
                    {availableClasses.map((cls) => {
                      const isSel = selectedClass === cls.id;
                      return (
                        <div key={cls.id} className="inline-flex items-center">
                          <button
                            type="button"
                            onClick={() => setSelectedClass(cls.id)}
                            className={`relative px-3.5 py-1.5 text-sm font-bold rounded-xl transition-colors whitespace-nowrap z-10 ${
                              isSel ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {isSel && (
                              <motion.span
                                layoutId="active-class-pill"
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                className="absolute inset-0 bg-gradient-to-r from-sky-500 to-blue-600 rounded-xl shadow-sm -z-10"
                              />
                            )}
                            Lớp {cls.name}
                          </button>
                          {availableClasses.length > 1 && isSel && (
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
                      );
                    })}
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

              <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 text-xs">
                <div className="text-slate-600 flex flex-wrap items-center gap-x-1.5 min-w-0">
                  <span className="font-semibold text-slate-900">{teacher.name}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono break-all">{teacher.email}</span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 bg-slate-100 hover:bg-red-50 rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Đăng xuất
                </button>
              </div>
            </div>

            {getActiveStorageMode() === 'local' && activeTab !== 'database' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 no-print">
                <span>
                  Ứng dụng đang lưu dữ liệu cục bộ trên trình duyệt này. Để học sinh quét mã QR từ điện thoại khác xem được dữ liệu thời gian thực, hãy kết nối cơ sở dữ liệu Supabase.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('database')}
                  className="font-semibold text-blue-700 hover:underline whitespace-nowrap self-start sm:self-auto"
                >
                  Xem hướng dẫn kết nối Supabase →
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

            {activeTab === 'database' ? (
              <DatabaseGuideTab onRefreshWorkspace={loadWorkspace} />
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
                    onClick={() => setActiveTab('database')}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                  >
                    Mở tab Liên kết Database
                  </button>
                </div>
              </div>
            ) : workspace ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
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
                      onPreviewStudentQr={(cls, grp, dt) => switchToStudentMode(cls, grp, dt, true)}
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
                </motion.div>
              </AnimatePresence>
            ) : null}
          </div>
        )}
      </main>

      {/* Instructional Footer for Students */}
      <footer className="relative z-10 border-t border-slate-200/80 bg-white/90 backdrop-blur-sm no-print mt-8">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-6 sm:py-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                Hướng dẫn Học sinh tham gia hoạt động Nhiệm vụ QR
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thực hiện lần lượt 4 bước bên dưới cùng nhóm của mình trong mỗi tiết học.
              </p>
            </div>
            <span className="text-xs font-semibold text-sky-700 whitespace-nowrap">
              Thang điểm nhóm: tối đa 10 điểm
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-sky-50/80 border border-sky-200/80 flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                <QrCode className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-sky-900">Bước 1 · Quét mã QR nhóm</div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Mở Camera hoặc Zalo quét đúng mã QR của nhóm mình để mở bảng nhiệm vụ riêng tư.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-violet-50/80 border border-violet-200/80 flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-violet-900">Bước 2 · Thảo luận cùng đội</div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Nhóm trưởng phân công thành viên thực hiện theo hướng dẫn trên từng thẻ màu.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckSquare className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-emerald-900">Bước 3 · Tick báo hoàn thành</div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Chạm vào ô thẻ khi làm xong để phát chuông và hiện thông báo cho cả lớp cùng biết.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Award className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-amber-900">Bước 4 · Xem điểm &amp; BTVN</div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Theo dõi điểm cộng/trừ của nhóm (tối đa 10đ) và ghi lại Bài tập về nhà cuối tiết.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              Mỗi thành viên trong nhóm sẽ nhận cùng số điểm tổng kết của nhóm sau buổi học.
            </span>
            <span className="font-semibold text-slate-400">ClassQR Studio</span>
          </div>
        </div>
      </footer>
    </div>
    </MotionConfig>
  );
}
