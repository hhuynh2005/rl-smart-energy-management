import React from 'react';
import { Zap, BarChart2, Table, BookOpen, Box, Layers, AlertTriangle } from 'lucide-react';

/**
 * TopNavPill - Centered Light Frosted Glass navigation bar
 */
export default function TopNavPill({
  activeTab,
  setActiveTab,
  viewMode,
  setViewMode,
  onOpenDocs,
  error,
}) {
  return (
    <header className="top-nav-pill">
      <div className="nav-brand-chip">
        <div className="brand-icon-badge">
          <Zap size={15} color="#FFFFFF" />
        </div>
        <span className="brand-name-text">SEMS-RL</span>
      </div>

      <nav className="nav-pill-group">
        <button
          className={`nav-pill-btn ${activeTab === 'house' ? 'active' : ''}`}
          onClick={() => setActiveTab('house')}
          id="tab-btn-house"
        >
          <Box size={14} />
          <span>Mô phỏng</span>
        </button>

        {activeTab === 'house' && (
          <div className="view-inline-toggle" title="Chuyển chế độ 3D / 2D">
            <button
              className={`view-inline-btn ${viewMode === '3D' ? 'active' : ''}`}
              onClick={() => setViewMode('3D')}
              id="btn-toggle-3d"
            >
              3D
            </button>
            <button
              className={`view-inline-btn ${viewMode === '2D' ? 'active' : ''}`}
              onClick={() => setViewMode('2D')}
              id="btn-toggle-2d"
            >
              <Layers size={11} style={{ marginRight: 2, verticalAlign: '-1px' }} />
              2D
            </button>
          </div>
        )}

        <button
          className={`nav-pill-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
          id="tab-btn-dashboard"
        >
          <BarChart2 size={14} />
          <span>Đồ thị & KPI</span>
        </button>

        <button
          className={`nav-pill-btn ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
          id="tab-btn-table"
        >
          <Table size={14} />
          <span>Dữ liệu 96 bước</span>
        </button>

        <button
          className="nav-pill-btn"
          onClick={onOpenDocs}
          id="tab-btn-doc"
        >
          <BookOpen size={14} />
          <span>Báo cáo TH2</span>
        </button>
      </nav>

      {error && (
        <span className="nav-error-dot" title={error}>
          <AlertTriangle size={12} />
          <span>API Offline</span>
        </span>
      )}
    </header>
  );
}
