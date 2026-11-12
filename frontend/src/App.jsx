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

          {/* Top-right Live 2D Minimap + FPS Pill */}
          <CampusMinimap />

          {/* Bottom-right Building & Microgrid Device Inspector */}
          <InspectorCard
            stepData={interpolatedStep}
            specs={metadata?.specs}
            isDockExpanded={isDockExpanded}
          />

          {/* Compact 1-row Bottom KPI & Telemetry Dock */}
          <BottomTelemetryDock
            stepData={interpolatedStep}
            discreteStep={discreteStep}
            metrics={metrics}
            policyMode={config.policyMode}
            timeline={timeline}
            currentStep={currentStep}
            isExpanded={isDockExpanded}
            onToggleExpand={() => setIsDockExpanded((v) => !v)}
          />

          {/* Bottom-center Dark Translucent Interaction Hint Pill & Preset Toast */}
          <BottomHintBar />
        </>
      ) : (
        <main className="subview-shell">
          {error && (
            <div
              style={{
                background: 'rgba(220, 38, 38, 0.10)',
                border: '1px solid rgba(220, 38, 38, 0.45)',
                color: '#B91C1C',
                padding: '0.55rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              ⚠️ {error} — Vui lòng đảm bảo backend server (`server.py`) đang chạy trên cổng 8000.
            </div>
          )}

          {/* Compact Simulation Controls Strip for 2D / Charts / Data Table */}
          <div className="subview-config-strip">
            <div className="subview-field">
              <span>Kịch bản:</span>
              <select
                className="select-control"
                style={{ width: 'auto', minWidth: '210px' }}
                value={config.scenario}
                onChange={handleSubviewScenarioChange}
              >
                <option value="S1: Ngày làm việc điển hình (Typical Weekday)">S1: Ngày làm việc</option>
                <option value="S2: Ngày cuối tuần (Weekend - Tải thấp, không giờ cao điểm)">S2: Cuối tuần</option>
                <option value="S3: Ngày nhiều mây (Cloudy Day - PV giảm 50%)">S3: Nhiều mây</option>
                <option value="S4: Thử độ bền với Nhiễu (Robustness Test - NoiseWrapper)">S4: Thử nhiễu</option>
                <option value="S5: Tùy chọn ngày tự do (Custom Date Picker)">S5: Tùy chọn ngày</option>
              </select>
            </div>

            {config.scenario.startsWith('S5:') && (
              <>
                <div className="subview-field">
                  <span>Tập:</span>
                  <select
                    className="select-control"
                    style={{ width: 'auto' }}
                    value={config.split}
                    onChange={(e) => setConfig({ ...config, split: e.target.value, targetDay: 0 })}
                  >
                    <option value="test">Test</option>
                    <option value="val">Val</option>
                    <option value="train">Train</option>
                  </select>
                </div>
                <div className="subview-field">
                  <span>Ngày {config.targetDay}:</span>
                  <input
                    type="range"
                    className="slider-orange"
                    style={{ width: '90px' }}
                    min={0}
                    max={Math.max(0, maxDays - 1)}
                    value={config.targetDay}
                    onChange={(e) => setConfig({ ...config, targetDay: parseInt(e.target.value, 10) })}
                  />
                </div>
              </>
            )}

            <div className="subview-field">
              <span>Chiến lược Pin:</span>
              <select
                className="select-control"
                style={{ width: 'auto' }}
                value={config.policyMode}
                onChange={(e) => setConfig({ ...config, policyMode: e.target.value })}
              >
                <option value="rbc">Rule-Based (Chuyên gia)</option>
                <option value="nobat">No-Battery (Đối chuẩn)</option>
                <option value="custom">Interactive Schedule</option>
              </select>
            </div>

            <div className="subview-field">
              <span>SoC đầu: {(config.initialSoc * 100).toFixed(0)}%</span>
              <input
                type="range"
                className="slider-orange"
                style={{ width: '80px' }}
                min={0.2}
                max={0.9}
                step={0.05}
                value={config.initialSoc}
                onChange={(e) => setConfig({ ...config, initialSoc: parseFloat(e.target.value) })}
              />
            </div>

            <button
              className="btn-simulate"
              style={{ width: 'auto', marginLeft: 'auto', padding: '0.45rem 0.9rem' }}
              onClick={runSimulation}
              disabled={isLoading}
            >
              <RefreshCw size={14} className={isLoading ? 'spin-anim' : ''} />
              <span>{isLoading ? 'Đang chạy...' : 'Chạy mô phỏng'}</span>
            </button>
          </div>

          <KpiCards metrics={metrics} policyMode={config.policyMode} />

          {activeTab === 'house' && viewMode === '2D' && (
            <SmartHouseSimulation
              timeline={timeline}
              currentStep={currentStep}
              currentMinute={currentMinute}
              onChangeMinute={handleChangeMinute}
              onSelectStep={handleSelectStep}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
              stepData={interpolatedStep}
              discreteStep={discreteStep}
            />
          )}

          {activeTab === 'dashboard' && (
            <AnalyticsCharts
              timeline={timeline}
              pTh={pTh}
              currentStep={currentStep}
              onSelectStep={handleSelectStep}
            />
          )}

          {activeTab === 'table' && (
            <DataTableTab
              timeline={timeline}
              currentStep={currentStep}
              onSelectStep={handleSelectStep}
              scenario={config.scenario}
              split={config.split}
              targetDay={config.targetDay}
            />
          )}
        </main>
      )}

      <DocModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />
    </div>
  );
}
