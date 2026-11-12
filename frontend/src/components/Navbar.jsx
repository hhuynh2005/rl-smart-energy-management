import React from 'react';
import { Zap, Activity, Building2, BarChart2, Table, BookOpen, SunMedium, ChevronDown, ExternalLink, Home } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, onOpenDocs, scenarioName }) {
  return (
    <header className="navbar">
      {/* 1. Brand Logo & System Badges */}
      <div className="nav-brand">
        <div className="brand-icon-wrapper">
          <Zap size={22} color="#FFFFFF" />
        </div>
        <div className="brand-titles">
          <div className="brand-title">SEMS-RL</div>
          <div className="brand-subtitle">Smart Energy Management & Microgrid Digital Twin</div>
        </div>
        <div className="nav-badges">
          <span className="badge badge-gym">
            <Activity size={12} /> Gymnasium v1.0
          </span>
          <span className="badge badge-citylearn">
            <Home size={12} /> CityLearn
          </span>
          <span className="badge badge-tou">
            <SunMedium size={12} /> EVN TOU 3-Tier
          </span>
        </div>
      </div>

      {/* 2. Navigation Tabs (Center) */}
      <nav className="nav-tabs">
        <button
          className={`nav-tab-btn ${activeTab === 'house' ? 'active' : ''}`}
          onClick={() => setActiveTab('house')}
          id="tab-btn-house"
        >
          <Building2 size={15} />
          <span>Khuôn Viên Thủy Lợi 3D (Tòa K1)</span>
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
          id="tab-btn-dashboard"
        >
          <BarChart2 size={15} />
          <span>Bảng Điều Khiển Đồ Thị & KPI</span>
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
          id="tab-btn-table"
        >
          <Table size={15} />
          <span>Dữ Liệu 96 Bước & CSV</span>
        </button>
        <button
          className="nav-tab-btn"
          onClick={onOpenDocs}
          id="tab-btn-doc"
        >
          <BookOpen size={15} />
          <span>Báo Cáo TH2 (MDP)</span>
        </button>
        <a
          href="/campus"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-tab-btn"
          title="Mở giao diện 3D khuôn viên toàn màn hình trong tab mới"
          style={{ textDecoration: 'none' }}
        >
          <ExternalLink size={15} />
          <span>Bản 3D Toàn Cảnh</span>
        </a>
      </nav>

      {/* 3. User Admin Profile (Right) */}
      <div className="nav-profile" title="Tài khoản Quản trị viên SEMS-RL">
        <div className="avatar-circle">A</div>
        <span className="admin-name">Admin</span>
        <ChevronDown size={14} color="#94A3B8" />
      </div>
    </header>
  );
}
