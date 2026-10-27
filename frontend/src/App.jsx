import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import SidebarControls from './components/SidebarControls';
import KpiCards from './components/KpiCards';
import SmartHouseSimulation from './components/SmartHouseSimulation';
import AnalyticsCharts from './components/AnalyticsCharts';
import DataTableTab from './components/DataTableTab';
import DocModal from './components/DocModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('house'); // 'house' | 'dashboard' | 'table'
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Simulation Configuration State
  const [config, setConfig] = useState({
    scenario: 'S1: Ngày làm việc điển hình (Typical Weekday)',
    split: 'test',
    targetDay: 0,
    policyMode: 'rbc',
    initialSoc: 0.50,
    applyNoise: false,
  });

  // Metadata from backend (scenarios, splits, specs)
  const [metadata, setMetadata] = useState(null);

  // Current simulation result
  const [simResult, setSimResult] = useState(null);

  // Time scrubber current step (0 to 95)
  const [currentStep, setCurrentStep] = useState(0);

  // Fetch metadata on mount
  useEffect(() => {
    fetch('/api/scenarios')
      .then((res) => {
        if (!res.ok) throw new Error('Không thể kết nối API Backend');
        return res.json();
      })
      .then((data) => setMetadata(data))
      .catch((err) => {
        console.warn('API connection notice:', err);
      });
  }, []);

  // Run simulation API call
  const runSimulation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: config.scenario,
          split: config.split,
          target_day: config.targetDay,
          policy_mode: config.policyMode,
          initial_soc: config.initialSoc,
          apply_noise: config.applyNoise,
        }),
      });

      if (!response.ok) {
        throw new Error(`Mô phỏng thất bại với mã lỗi ${response.status}`);
      }

      const data = await response.json();
      setSimResult(data);
      // Giữ nguyên bước hiện tại nếu còn hợp lệ, hoặc reset về 0
      if (currentStep >= (data.timeline?.length || 96)) {
        setCurrentStep(0);
      }
    } catch (err) {
      console.error('Simulation error:', err);
      setError(err.message || 'Lỗi khi gọi API mô phỏng');
    } finally {
      setIsLoading(false);
    }
  }, [config, currentStep]);

  // Initial simulation on mount
  useEffect(() => {
    runSimulation();
  }, []); // Run once on startup

  const timeline = simResult?.timeline || [];
  const metrics = simResult?.kpi_metrics || null;
  const pTh = metadata?.specs?.peak_threshold_kw || 90.0;

  return (
    <div className="app-container">
      {/* 1. Header Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenDocs={() => setIsDocsOpen(true)}
        scenarioName={config.scenario}
      />

      {/* 2. Main Layout (Sidebar + Content Area) */}
      <div className="main-layout">
        {/* Left Sidebar Controls */}
        <SidebarControls
          config={config}
          setConfig={setConfig}
          metadata={metadata}
          onSimulate={runSimulation}
          isLoading={isLoading}
        />

        {/* Right Content Area */}
        <main className="content-area">
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #EF4444',
                color: '#F87171',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
              }}
            >
              ⚠️ {error} — Vui lòng đảm bảo backend server (`server.py`) đang chạy trên cổng 8000.
            </div>
          )}

          {/* Top KPI Cards (Always visible for instant executive feedback) */}
          <KpiCards metrics={metrics} policyMode={config.policyMode} />

          {/* Tab 1: Smart House & Solar Flow Digital Twin */}
          {activeTab === 'house' && (
            <SmartHouseSimulation
              timeline={timeline}
              currentStep={currentStep}
              setCurrentStep={setCurrentStep}
              specs={metadata?.specs}
            />
          )}

          {/* Tab 2: Analytics Charts Dashboard (Plotly parity) */}
          {activeTab === 'dashboard' && (
            <AnalyticsCharts
              timeline={timeline}
              pTh={pTh}
              currentStep={currentStep}
              onSelectStep={(idx) => setCurrentStep(idx)}
            />
          )}

          {/* Tab 3: Detailed 96-Step Data Table & CSV Download */}
          {activeTab === 'table' && (
            <DataTableTab
              timeline={timeline}
              currentStep={currentStep}
              onSelectStep={(idx) => setCurrentStep(idx)}
              scenario={config.scenario}
              split={config.split}
              targetDay={config.targetDay}
            />
          )}
        </main>
      </div>

      {/* Documentation Modal */}
      <DocModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />
    </div>
  );
}
