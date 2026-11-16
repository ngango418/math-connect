import { useState, type FormEvent } from 'react';
import { Lock, LogIn, UserPlus } from 'lucide-react';
import type { TeacherUser } from '../../shared/types.ts';
import { loginTeacher, registerTeacher } from '../lib/api.ts';
import { getFirebaseProjectId, isFirebaseEnvConfigured } from '../lib/firebaseClient.ts';

interface TeacherLoginViewProps {
  onSuccess: (user: TeacherUser) => void;
  onSwitchToStudent: () => void;
}

export function TeacherLoginView({ onSuccess, onSwitchToStudent }: TeacherLoginViewProps) {
  const firebaseReady = isFirebaseEnvConfigured();
  const firebaseProjectId = getFirebaseProjectId();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(firebaseReady ? '' : 'giaovien@truonghoc.edu.vn');
  const [password, setPassword] = useState(firebaseReady ? '' : '123456');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('Khối 9');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Info & Demo Guide */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-7 flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 mb-3">
              <Lock className="w-4 h-4" />
              Cổng quản trị dành riêng cho Giáo viên
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Đăng nhập Không gian Giáo viên
            </h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Quản lý trọn vẹn 3 lớp <span className="font-semibold text-slate-900">9/23</span>,{' '}
              <span className="font-semibold text-slate-900">9/26</span>,{' '}
              <span className="font-semibold text-slate-900">9/28</span>: phân chia 5 nhiệm vụ theo thẻ QR,
              nhập danh sách học sinh từ Excel, chia tổ ngẫu nhiên cân bằng theo hạt giống năng lực (1–5)
              và chấm điểm xếp hạng theo ngày.
            </p>

            {firebaseReady ? (
              <div className="mt-6 pt-6 border-t border-slate-200 space-y-2.5 text-sm">
                <div className="font-semibold text-emerald-700">
                  Đã kết nối Firebase Project: <span className="font-mono">{firebaseProjectId}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Nếu đây là lần đầu bạn sử dụng dự án Firebase mới, hãy chọn tab{' '}
                  <strong>Đăng ký mới</strong> ở bên phải để tạo tài khoản giáo viên đầu tiên.
                  Ngay sau khi đăng ký thành công, hệ thống sẽ tự động khởi tạo toàn bộ 4 bảng dữ liệu
                  (Lớp học, 5 Nhiệm vụ cứng, Thẻ QR, Bảng điểm) lên Firestore của bạn.
                </p>
              </div>
            ) : (
              <div className="mt-6 pt-6 border-t border-slate-200 space-y-3 text-sm">
                <div className="font-semibold text-slate-900">Tài khoản giáo viên mặc định để dùng thử:</div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 font-mono text-xs space-y-1.5">
                  <div>
                    Email: <span className="font-semibold text-slate-900">giaovien@truonghoc.edu.vn</span>
                  </div>
                  <div>
                    Mật khẩu: <span className="font-semibold text-slate-900">123456</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Sau khi đăng nhập, vào tab <strong>Liên kết Firebase</strong> để xem hướng dẫn gắn cơ sở dữ liệu Firebase nếu chưa cấu hình biến môi trường.
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onSwitchToStudent}
              className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
            >
              Quay lại Cổng Học Sinh (Xem thẻ QR) →
            </button>
          </div>
        </div>

        {/* Right: Login / Register Form */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-7">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`flex-1 py-2 px-3 text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
                if (email === 'giaovien@truonghoc.edu.vn') {
                  setEmail('');
                  setPassword('');
                }
              }}
              className={`flex-1 py-2 px-3 text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
                mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đăng ký mới
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Họ tên giáo viên</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ví dụ: Cô Nguyễn Thu Hà"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Bộ môn / Tổ chuyên môn</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ví dụ: Toán / KHTN Khối 9"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email giáo viên</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="giaovien@truonghoc.edu.vn"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Mật khẩu</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {error && (
              <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors"
            >
              {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {loading
                ? 'Đang xác thực...'
                : mode === 'login'
                ? 'Đăng nhập vào bảng điều khiển'
                : 'Tạo tài khoản & Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
