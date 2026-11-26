import React from 'react';
import { Brain } from 'lucide-react';

/**
 * Q(s,k) của DDQN tại bước đang chọn: 11 mức hành động, tô đậm mức argmax.
 * Chỉ hiện khi server chạy policy_mode="ddqn" (timeline có khóa `ddqn`).
 */
export default function QValuesPanel({ ddqn, actionGrid, timeStr }) {
  if (!ddqn || !actionGrid) return null;

  const q = ddqn.q_values;
  const lo = Math.min(...q);
  const span = Math.max(...q) - lo || 1;

  return (
    <div className="live-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Brain size={18} color="#A78BFA" />
        <span className="live-label">
          DDQN · Q(s,k) lúc {timeStr || '--:--'} — chọn mức {actionGrid[ddqn.chosen_k] > 0 ? '+' : ''}
          {actionGrid[ddqn.chosen_k].toFixed(1)}
        </span>
        {ddqn.v_value != null && (
          <span className="live-label" style={{ marginLeft: 'auto' }}>V(s) = {ddqn.v_value.toFixed(2)}</span>
        )}
      </div>
      {q.map((value, k) => {
        const a = actionGrid[k];
        const chosen = k === ddqn.chosen_k;
        const tag = a > 0 ? 'sạc' : a < 0 ? 'xả' : 'nghỉ';
        return (
          <div
            key={k}
            style={{
              display: 'grid', gridTemplateColumns: '44px 1fr 90px', alignItems: 'center', gap: '0.5rem',
              fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums',
              color: chosen ? '#F8FAFC' : '#94A3B8', fontWeight: chosen ? 700 : 400,
            }}
          >
            <span>{a > 0 ? '+' : ''}{a.toFixed(1)}</span>
            <div
              style={{
                height: 8, borderRadius: 4, width: `${8 + (92 * (value - lo)) / span}%`,
                background: chosen ? '#8B5CF6' : 'rgba(148, 163, 184, 0.35)',
              }}
            />
            <span>{value.toFixed(2)} {tag}</span>
          </div>
        );
      })}
    </div>
  );
}
