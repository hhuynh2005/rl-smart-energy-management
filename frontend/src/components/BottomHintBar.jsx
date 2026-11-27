import React, { useEffect } from 'react';
import { useQualityStore } from '../store/useQualityStore';

const MODE_HINTS = {
  orbit:
    'Kéo để xoay · cuộn để phóng to · chuột phải hoặc hai ngón để di chuyển · bấm vào tòa nhà hoặc thiết bị để xem thông tin',
  satellite:
    'Nhìn thẳng từ trên xuống · kéo để dịch chuyển · cuộn để phóng to · bấm vào tòa nhà hoặc thiết bị để xem thông tin',
  walk:
    'W A S D hoặc phím mũi tên để đi bộ (giữ Shift đi nhanh) · kéo chuột để nhìn xung quanh · bấm vào tòa nhà để xem thông tin',
};

/**
 * BottomHintBar - Dark translucent control hint pill & transient camera preset toast
 */
export default function BottomHintBar() {
  const viewMode3D = useQualityStore((s) => s.viewMode3D);
  const presetToast = useQualityStore((s) => s.presetToast);
  const clearPresetToast = useQualityStore((s) => s.clearPresetToast);

  useEffect(() => {
    if (!presetToast) return undefined;
    const timer = setTimeout(() => {
      clearPresetToast();
    }, 2800);
    return () => clearTimeout(timer);
  }, [presetToast, clearPresetToast]);

  return (
    <div className="bottom-hint-container">
      {presetToast && (
        <div className="preset-toast" key={presetToast.ts}>
          <div className="preset-toast-title">{presetToast.title}</div>
          <div className="preset-toast-desc">{presetToast.description}</div>
        </div>
      )}
      <div className="bottom-hint-pill">{MODE_HINTS[viewMode3D] || MODE_HINTS.orbit}</div>
    </div>
  );
}
