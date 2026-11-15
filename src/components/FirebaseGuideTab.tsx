import { useState } from 'react';
import { Check, Copy, Database, KeyRound, ShieldCheck } from 'lucide-react';

const FIRESTORE_RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Mặc định từ chối mọi truy cập trái phép
    match /{document=**} {
      allow read, write: if false;
    }

    // Học sinh quét QR chỉ được ĐỌC phân công theo ngày & điểm công khai (không ghi)
    match /dailyAssignments/{docId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.email_verified == true;
    }

    // Danh sách học sinh & trường hạt giống năng lực chỉ Giáo viên đã đăng nhập mới đọc/ghi
    match /students/{studentId} {
      allow read, write: if request.auth != null && request.auth.token.email_verified == true;
    }

    // Kho 5 nhiệm vụ cứng & thẻ
    match /coreMissions/{missionId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.email_verified == true;
    }

    // Bảng điểm theo ngày
    match /dailyGrades/{gradeId} {
      allow read: if resource.data.publishedToStudents == true || (request.auth != null);
      allow write: if request.auth != null && request.auth.token.email_verified == true;
    }
  }
}`;

const FIREBASE_INIT_SNIPPET = `import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);`;

export function FirebaseGuideTab() {
  const [copiedKey, setCopiedKey] = useState<string>('');

  const handleCopy = (key: string, content: string) => {
    navigator.clipboard?.writeText(content);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-bold text-slate-900">
          Hướng dẫn Liên kết Trang Web với Firebase (Auth &amp; Firestore)
        </h2>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
          Hiện tại ứng dụng đã vận hành đầy đủ trên máy chủ riêng của hệ thống (dữ liệu học sinh, thẻ QR và điểm theo ngày được lưu liên tục trên server để học sinh quét QR từ điện thoại đều xem được ngay). Nếu bạn muốn chuyển dữ liệu sang dự án <span className="font-semibold text-slate-900">Firebase</span> cá nhân trên Google Cloud, hãy thực hiện theo 4 bước dưới đây.
        </p>
      </div>

      {/* Step 1 & 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-700 mb-2">
            <Database className="w-4 h-4" />
            Bước 1: Tạo Project &amp; Firestore Database
          </div>
          <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
            <li>Truy cập <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">console.firebase.google.com</span> và nhấn <strong>Add project</strong>.</li>
            <li>Vào menu <strong>Build → Firestore Database → Create database</strong>.</li>
            <li>Chọn khu vực gần Việt Nam nhất (ví dụ <span className="font-mono text-xs">asia-southeast1</span> — Singapore) và chế độ <strong>Production mode</strong>.</li>
            <li>Tạo các collection chính: <span className="font-mono text-xs">students</span>, <span className="font-mono text-xs">coreMissions</span>, <span className="font-mono text-xs">dailyAssignments</span>, <span className="font-mono text-xs">dailyGrades</span>.</li>
          </ol>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-700 mb-2">
            <KeyRound className="w-4 h-4" />
            Bước 2: Bật Firebase Authentication cho Giáo viên
          </div>
          <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
            <li>Vào menu <strong>Build → Authentication → Get started</strong>.</li>
            <li>Tại tab <strong>Sign-in method</strong>, bật <strong>Email/Password</strong> (hoặc <strong>Google</strong>).</li>
            <li>Tại tab <strong>Users → Add user</strong>, thêm tài khoản email của bạn (hoặc các giáo viên đồng bộ) để đăng nhập vào trang quản trị.</li>
            <li>Trong phần <strong>Settings → Authorized domains</strong>, thêm tên miền trang web đang chạy để cho phép đăng nhập.</li>
          </ol>
        </div>
      </div>

      {/* Step 3: Config */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Bước 3: Lấy mã cấu hình Web App (firebaseConfig)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Vào Project Settings (biểu tượng bánh răng) → Your apps → Chọn biểu tượng Web (&lt;/&gt;) để lấy đoạn mã này và dán vào <span className="font-mono">src/firebase.ts</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy('config', FIREBASE_INIT_SNIPPET)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
          >
            {copiedKey === 'config' ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedKey === 'config' ? 'Đã chép' : 'Sao chép mã'}
          </button>
        </div>
        <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
          {FIREBASE_INIT_SNIPPET}
        </pre>
      </div>

      {/* Step 4: Security Rules */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Bước 4: Cấu hình Firestore Security Rules an toàn
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dán bộ quy tắc này vào tab <strong>Firestore Database → Rules</strong> để học sinh quét QR chỉ được xem nhiệm vụ công khai, còn mọi thao tác sửa học sinh/hạt giống/chấm điểm đều yêu cầu tài khoản giáo viên.
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
