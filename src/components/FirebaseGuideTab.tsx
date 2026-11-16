import { useState } from 'react';
import { Check, Copy, Database, Globe, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { getActiveStorageMode, initializeFirestoreDatabase } from '../lib/api.ts';
import { getFirebaseProjectId, isFirebaseEnvConfigured } from '../lib/firebaseClient.ts';

const FIRESTORE_RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
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

    // Danh sách học sinh & trường hạt giống năng lực: giáo viên đăng nhập mới ghi được
    // Học sinh quét QR đọc danh sách thành viên nhóm
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

export function FirebaseGuideTab() {
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [dbInitLoading, setDbInitLoading] = useState(false);
  const [dbInitResult, setDbInitResult] = useState<string>('');
  const [dbInitError, setDbInitError] = useState<string>('');
  const storageMode = getActiveStorageMode();
  const firebaseConfigured = isFirebaseEnvConfigured();
  const projectId = getFirebaseProjectId();

  const handleCopy = (key: string, content: string) => {
    navigator.clipboard?.writeText(content);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleInitFirestore = async (forceReset: boolean) => {
    setDbInitLoading(true);
    setDbInitResult('');
    setDbInitError('');
    try {
      const res = await initializeFirestoreDatabase(forceReset);
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
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="text-xs font-semibold text-blue-700 mb-1">
          Trạng thái kết nối hiện tại:{' '}
          {storageMode === 'firebase'
            ? `Đã kết nối trực tiếp Firebase (${projectId})`
            : storageMode === 'server'
            ? 'Đang chạy trên Máy chủ cục bộ (API Server)'
            : 'Đang lưu cục bộ trên trình duyệt (Chưa gắn biến môi trường Firebase)'}
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          Hướng dẫn Tạo Database Firebase &amp; Gắn vào Web Vercel
        </h2>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
          Trang web này đã được lập trình sẵn bộ kết nối <span className="font-semibold text-slate-900">Firebase Authentication + Cloud Firestore</span>. Ngay khi bạn tạo database trên Firebase và khai báo 6 biến môi trường <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">VITE_FIREBASE_*</span> trên Vercel, web sẽ tự động đồng bộ dữ liệu thật cho cả điện thoại học sinh quét QR.
        </p>

        {firebaseConfigured && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={dbInitLoading}
                onClick={() => handleInitFirestore(false)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                <Database className="w-4 h-4" />
                {dbInitLoading ? 'Đang tạo bảng dữ liệu...' : 'Kiểm tra & Khởi tạo Database Firestore'}
              </button>
              <button
                type="button"
                disabled={dbInitLoading}
                onClick={() => handleInitFirestore(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Nạp lại dữ liệu mẫu mặc định
              </button>
            </div>
            {dbInitResult && (
              <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
                {dbInitResult}
              </div>
            )}
            {dbInitError && (
              <div className="p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {dbInitError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 1 & 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-700 mb-2">
            <Database className="w-4 h-4" />
            Bước 1: Tạo Database Firestore trên Firebase
          </div>
          <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
            <li>
              Truy cập <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">console.firebase.google.com</span> → chọn <strong>Create a project</strong> (hoặc mở project sẵn có).
            </li>
            <li>
              Ở menu bên trái, vào <strong>Build → Firestore Database</strong> → nhấn <strong>Create database</strong>.
            </li>
            <li>
              Ở mục Location, chọn <strong>asia-southeast1 (Singapore)</strong> để tốc độ truy cập tại Việt Nam nhanh nhất, rồi nhấn <strong>Next</strong>.
            </li>
            <li>
              Chọn <strong>Start in production mode</strong> → nhấn <strong>Create</strong>. (Hệ thống sẽ tự động tạo sẵn 4 collection <span className="font-mono text-xs">students</span>, <span className="font-mono text-xs">coreMissions</span>, <span className="font-mono text-xs">dailyAssignments</span>, <span className="font-mono text-xs">dailyGrades</span> ngay lần đầu bạn đăng nhập).
            </li>
          </ol>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-700 mb-2">
            <KeyRound className="w-4 h-4" />
            Bước 2: Bật Đăng nhập Giáo viên &amp; Cấp quyền tên miền
          </div>
          <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
            <li>
              Vào <strong>Build → Authentication → Get started</strong>.
            </li>
            <li>
              Tại tab <strong>Sign-in method</strong>, chọn <strong>Email/Password</strong> → gạt nút <strong>Enable</strong> → nhấn <strong>Save</strong>.
            </li>
            <li>
              Chuyển sang tab <strong>Users → Add user</strong> để tạo tài khoản email/mật khẩu đăng nhập của bạn (hoặc đăng ký ngay tại nút <em>Đăng ký mới</em> trên web).
            </li>
            <li>
              Vào <strong>Authentication → Settings → Authorized domains → Add domain</strong> và thêm tên miền web Vercel của bạn (ví dụ: <span className="font-mono text-xs bg-slate-100 px-1 rounded">math-connect-brown.vercel.app</span>).
            </li>
          </ol>
        </div>
      </div>

      {/* Step 3: Vercel Env Vars */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-700" />
              Bước 3: Lấy mã Web App &amp; Dán vào Vercel Environment Variables
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Trong Firebase, vào <strong>Project Settings (biểu tượng bánh răng) → Your apps → chọn biểu tượng Web (&lt;/&gt;)</strong> để lấy 6 thông số. Sau đó mở <strong>Vercel → Project → Settings → Environment Variables</strong>, dán 6 biến sau rồi nhấn <strong>Deployments → Redeploy</strong>:
            </p>
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
        <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
          {VERCEL_ENV_SNIPPET}
        </pre>
      </div>

      {/* Step 4: Security Rules */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Bước 4: Dán Firestore Security Rules &amp; Nhấn Publish
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Vào <strong>Firestore Database → Rules</strong>, xóa đoạn mặc định (chặn toàn bộ), dán đoạn mã dưới đây rồi nhấn <strong>Publish</strong>:
            </p>
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
        <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
          {FIRESTORE_RULES_SNIPPET}
        </pre>
      </div>
    </div>
  );
}
