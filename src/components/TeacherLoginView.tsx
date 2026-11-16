import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Lock, LogIn, QrCode, Scale, Sparkles, UserPlus } from 'lucide-react';
import type { TeacherUser } from '../../shared/types.ts';
import { loginTeacher, registerTeacher, resetTeacherPassword } from '../lib/api.ts';
import { getSupabaseProjectRef, isSupabaseEnvConfigured } from '../lib/supabaseClient.ts';
import classroomHeroImg from '../assets/images/classroom_quest_hero_1794836621343.jpg';

interface TeacherLoginViewProps {
  onSuccess: (user: TeacherUser) => void;
  onSwitchToStudent: () => void;
}

export function TeacherLoginView({ onSuccess, onSwitchToStudent }: TeacherLoginViewProps) {
  const supabaseReady = isSupabaseEnvConfigured();
  const supabaseRef = getSupabaseProjectRef();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(supabaseReady ? '' : 'giaovien@truonghoc.edu.vn');
  const [password, setPassword] = useState(supabaseReady ? '' : '123456');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('Khối 9');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const handleResetPassword = async () => {
    setError('');
    setResetMsg('');
    try {
      await resetTeacherPassword(email);
      setResetMsg(`Đã gửi email đặt lại mật khẩu tới ${email}. Hãy kiểm tra hộp thư (kể cả mục Spam).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi email đặt lại mật khẩu.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await loginTeacher(email, password);
        onSuccess(res.user);
      } else {
        const res = await registerTeacher(email, password, name, subject);
        onSuccess(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-stretch">
        {/* Left: Colorful Classroom Quest Showcase */}
        <motion.div
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-6 bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 rounded-3xl p-7 text-white flex flex-col justify-between shadow-[0_18px_42px_-14px_rgba(37,99,235,0.45)] relative overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-amber-300/20 animate-float-slow pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute -left-10 bottom-12 w-32 h-32 rounded-full bg-emerald-300/20 animate-float-delayed pointer-events-none"
          />

          <div className="relative space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-200">
              <Lock className="w-4 h-4" />
              Không gian Giáo viên Chủ nhiệm
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-balance">
              Biến mỗi tiết học thành hành trình khám phá đầy hứng khởi
            </h1>

            <p className="text-sm text-sky-100 leading-relaxed">
              Quản lý lớp học trực quan: nhập danh sách bằng AI đọc file Excel, chia 4 Tổ thành 8 Nhóm
              ngẫu nhiên cân bằng tổng điểm, phát thẻ nhiệm vụ qua mã QR riêng biệt và chấm điểm cộng/trừ cuối buổi.
            </p>

            {/* Custom Editorial Classroom Illustration */}
            <div className="rounded-2xl overflow-hidden border-2 border-white/25 bg-white/10 shadow-lg">
              {!heroImgFailed ? (
                <img
                  src={classroomHeroImg}
                  alt="Học sinh vui vẻ thảo luận nhóm cùng thẻ nhiệm vụ QR"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-48 sm:h-52 object-cover block"
                />
              ) : (
                <div className="w-full h-48 flex items-center justify-center bg-white/10 text-white/90">
                  <Sparkles className="w-12 h-12" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-xs">
                <div className="font-bold text-amber-200 flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5" /> 4 Tổ → 8 Nhóm
                </div>
                <div className="text-sky-100 mt-0.5">Chia cân điểm</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-xs">
                <div className="font-bold text-emerald-200 flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5" /> 8 Mã QR
                </div>
                <div className="text-sky-100 mt-0.5">Khóa từng nhóm</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-xs">
                <div className="font-bold text-rose-200 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> AI Excel
                </div>
                <div className="text-sky-100 mt-0.5">Nhập lớp siêu nhanh</div>
              </div>
            </div>

            {supabaseReady ? (
              <div className="pt-3 border-t border-white/20 text-xs text-sky-100">
                <span className="font-bold text-emerald-200">
                  Đã kết nối Supabase: <span className="font-mono">{supabaseRef}</span>
                </span>
              </div>
            ) : (
              <div className="pt-3 border-t border-white/20 text-xs text-sky-100 font-mono">
                Dùng thử nhanh: giaovien@truonghoc.edu.vn · MK: 123456
              </div>
            )}
          </div>

          <div className="relative mt-5 pt-4 border-t border-white/20">
            <button
              type="button"
              onClick={onSwitchToStudent}
              className="text-xs sm:text-sm font-bold text-amber-200 hover:text-white hover:underline whitespace-nowrap"
            >
              Mở Trạm Quét Mã QR Học Sinh →
            </button>
          </div>
        </motion.div>

        {/* Right: Animated Login / Register Card */}
        <motion.div
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-6 bg-white border border-slate-200/90 rounded-3xl p-7 sm:p-8 shadow-[0_14px_38px_-14px_rgba(15,23,42,0.12)] flex flex-col justify-center"
        >
          <div className="mb-6">
            <h2 className="text-xl font-extrabold text-slate-900">
              {mode === 'login' ? 'Chào thầy/cô quay trở lại!' : 'Tạo tài khoản giáo viên mới'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Đăng nhập để chia nhóm, phát thẻ QR và chấm điểm buổi học.
            </p>
          </div>

          <div className="relative flex items-center gap-1 p-1.5 bg-slate-100 rounded-2xl mb-6">
            {(['login', 'register'] as const).map((tab) => {
              const active = mode === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setMode(tab);
                    setError('');
                    if (tab === 'register' && email === 'giaovien@truonghoc.edu.vn') {
                      setEmail('');
                      setPassword('');
                    }
                  }}
                  className={`relative flex-1 py-2 px-3 text-sm font-bold rounded-xl transition-colors whitespace-nowrap z-10 ${
                    active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="auth-mode-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      className="absolute inset-0 bg-white rounded-xl shadow-sm -z-10"
                    />
                  )}
                  {tab === 'login' ? 'Đăng nhập' : 'Đăng ký mới'}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Họ tên giáo viên</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ví dụ: Cô Ngô Thị Thanh Nga"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bộ môn / Tổ chuyên môn</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ví dụ: Toán / KHTN Khối 9"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </motion.div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email giáo viên</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="giaovien@truonghoc.edu.vn"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Mật khẩu</label>
                {supabaseReady && mode === 'login' && (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    Quên mật khẩu?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {resetMsg && (
              <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl">
                {resetMsg}
              </div>
            )}

            {error && (
              <div className="p-3 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div>{error}</div>
                {mode === 'register' && error.includes('đã được đăng ký') && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                    }}
                    className="font-semibold text-blue-700 hover:underline block"
                  >
                    Chuyển sang tab Đăng nhập với email này →
                  </button>
                )}
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 rounded-2xl shadow-md shadow-blue-600/20 transition-all"
            >
              {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {loading
                ? 'Đang xác thực...'
                : mode === 'login'
                ? 'Đăng nhập vào bảng điều khiển'
                : 'Tạo tài khoản & Đăng nhập'}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
