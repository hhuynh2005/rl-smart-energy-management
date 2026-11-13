import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import TopNavPill from './components/TopNavPill';
import FloatingControlPanel from './components/FloatingControlPanel';
import CampusMinimap from './components/CampusMinimap';
import BottomHintBar from './components/BottomHintBar';
import InspectorCard from './components/InspectorCard';
import BottomTelemetryDock from './components/BottomTelemetryDock';
import SmartHouse3D from './components/SmartHouse3D';
import KpiCards from './components/KpiCards';
import SmartHouseSimulation from './components/SmartHouseSimulation';
import AnalyticsCharts from './components/AnalyticsCharts';
import DataTableTab from './components/DataTableTab';
import DocModal from './components/DocModal';
import {
  clampMinute,
  interpolateTimelineAtMinute,
} from './utils/timeSync';

export default function App() {
  const [activeTab, setActiveTab] = useState('house'); // 'house' | 'dashboard' | 'table'
  const [viewMode, setViewMode] = useState('3D'); // '3D' | '2D'
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isDockExpanded, setIsDockExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [config, setConfig] = useState({
    scenario: 'S1: Ngày làm việc điển hình (Typical Weekday)',
    split: 'test',
    targetDay: 0,
    policyMode: 'rbc',
    initialSoc: 0.5,
    applyNoise: false,
  });

  const [metadata, setMetadata] = useState(null);
  const [simResult, setSimResult] = useState(null);

  // Continuous minute clock [0..1439], defaulting to 09:30 (step #38)
  const [currentMinute, setCurrentMinute] = useState(570);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const minuteRef = useRef(currentMinute);
  useEffect(() => {
    minuteRef.current = currentMinute;
  }, [currentMinute]);

  // Fetch initial metadata & baseline simulation on mount
  useEffect(() => {
    let cancelled = false;

    fetch('/api/scenarios')
      .then((res) => {
        if (!res.ok) throw new Error('Không thể kết nối API Backend');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setMetadata(data);
      })
      .catch((err) => {
        console.warn('API connection notice:', err);
      });

    fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: 'S1: Ngày làm việc điển hình (Typical Weekday)',
        split: 'test',
        target_day: 0,
        policy_mode: 'rbc',
        initial_soc: 0.5,
        apply_noise: false,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Mô phỏng thất bại với mã lỗi ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setSimResult(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Initial simulation error:', err);
          setError(err.message || 'Lỗi khi gọi API mô phỏng');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // User-triggered simulation run
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
    } catch (err) {
      console.error('Simulation error:', err);
      setError(err.message || 'Lỗi khi gọi API mô phỏng');
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  // Smooth minute playback loop
  useEffect(() => {
    if (!isPlaying) return undefined;
    const stepMinutes = Math.max(1, Math.round(2 * playbackSpeed));
    const timer = setInterval(() => {
      const next = Math.min(1439, minuteRef.current + stepMinutes);
      minuteRef.current = next;
      setCurrentMinute(next);
      if (next >= 1439) {
        setIsPlaying(false);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed]);

  const timeline = simResult?.timeline || [];
  const totalSteps = timeline.length || 96;
  const metrics = simResult?.kpi_metrics || null;
  const pTh = metadata?.specs?.peak_threshold_kw || 90.0;

  const {
    stepIndex: currentStep,
    discreteStep,
    interpolatedStep,
  } = interpolateTimelineAtMinute(timeline, currentMinute);

  const handleTogglePlay = () => {
    if (!isPlaying && currentMinute >= 1439) {
      setCurrentMinute(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleChangeMinute = (minVal) => {
    setIsPlaying(false);
    setCurrentMinute(clampMinute(minVal));
  };

  const handleSelectStep = (stepIdx) => {
    setIsPlaying(false);
    const clampedIdx = Math.max(0, Math.min(totalSteps - 1, stepIdx));
    setCurrentMinute(clampedIdx * 15);
  };

  const handleStepDelta = (deltaSteps) => {
    setIsPlaying(false);
    const nextIdx = Math.max(0, Math.min(totalSteps - 1, currentStep + deltaSteps));
    setCurrentMinute(nextIdx * 15);
  };

  const handleResetTime = () => {
    setIsPlaying(false);
    setCurrentMinute(0);
  };

  const handleSubviewScenarioChange = (e) => {
    const val = e.target.value;
    let newDay = 0;
    let newNoise = false;
    if (val.startsWith('S1:')) newDay = 0;
    else if (val.startsWith('S2:')) newDay = 2;
    else if (val.startsWith('S3:')) newDay = 5;
    else if (val.startsWith('S4:')) {
      newDay = 0;
      newNoise = true;
    }
    setConfig({
      ...config,
      scenario: val,
      split: 'test',
      targetDay: newDay,
      applyNoise: newNoise,
    });
  };

  const is3DFullscreen = activeTab === 'house' && viewMode === '3D';
  const maxDays = (metadata?.splits && metadata.splits[config.split]) || 56;

  return (
    <div className="app-container">
      {/* Top-center Floating Navigation Pill */}
      <TopNavPill
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onOpenDocs={() => setIsDocsOpen(true)}
        error={error}
      />

      {is3DFullscreen ? (
        <>
          {/* Fullscreen 3D TLU Campus & SEMS-RL Microgrid */}
          <SmartHouse3D stepData={interpolatedStep} />

          {/* Top-left Video-Style Collapsible Floating Panel */}
          <FloatingControlPanel
            currentMinute={currentMinute}
            onChangeMinute={handleChangeMinute}
            currentStep={currentStep}
            totalSteps={totalSteps}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onStepDelta={handleStepDelta}
            onResetTime={handleResetTime}
            playbackSpeed={playbackSpeed}
            setPlaybackSpeed={setPlaybackSpeed}
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

      <DocModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />
    </div>
  );
}
