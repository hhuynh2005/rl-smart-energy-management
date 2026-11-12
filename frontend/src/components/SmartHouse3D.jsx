import React from 'react';

/**
 * SmartHouse3D wrapper: Phục vụ mô hình 3D Digital Twin 
 * Khuôn viên Trường Đại học Thủy Lợi đồng nhất 100% với giao diện /campus.
 */
export default function SmartHouse3D() {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '600px', position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
      <iframe
        src="/campus.html"
        title="Khuôn viên Đại học Thủy Lợi 3D Digital Twin"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  );
}
