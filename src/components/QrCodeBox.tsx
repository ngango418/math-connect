import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeBoxProps {
  value: string;
  size?: number;
  label?: string;
}

export function QrCodeBox({ value, size = 148, label }: QrCodeBoxProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center border border-slate-200 bg-slate-100 text-xs text-slate-500 rounded-lg"
      >
        Đang tạo QR...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={label || 'Mã QR nhiệm vụ nhóm'}
      width={size}
      height={size}
      className="rounded-lg border border-slate-200 bg-white block"
    />
  );
}
