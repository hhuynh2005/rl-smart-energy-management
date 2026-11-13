import React from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { useQualityStore } from '../../store/useQualityStore';
import CameraRig from './CameraRig';
import Lighting from './Lighting';
import CampusGrounds from './CampusGrounds';
import Vegetation from './Vegetation';
import Traffic from './Traffic';
import Pedestrians from './Pedestrians';
import CampusBuildings from './CampusBuildings';
import SolarField from './SolarField';
import BESS from './BESS';
import GridTower from './GridTower';
import EnergyFlow from './EnergyFlow';
import FloatingBadges from './FloatingBadges';
import PostFX from './PostFX';

/**
 * Scene Component - Orchestrator of the 3D Dai Hoc Thuy Loi Campus & SEMS-RL Microgrid
 */
export default function Scene({ stepData = {}, onSelectEntity }) {
  const setFps = useQualityStore((s) => s.setFps);
  const handlePerformanceDegrade = useQualityStore((s) => s.handlePerformanceDegrade);
  const forceNightLights = useQualityStore((s) => s.forceNightLights);

  const rawHour = stepData.hour ?? 9.5;
  const hour = forceNightLights ? 20.5 : rawHour;
  const isNight = rawHour < 6 || rawHour > 18.2 || forceNightLights;

  return (
    <>
      <PerformanceMonitor
        onIncline={() => {}}
        onDecline={() => handlePerformanceDegrade()}
        onChange={({ fps }) => setFps(Math.round(fps))}
      />

      <CameraRig />

      <Lighting hour={hour} />
      <CampusGrounds isNight={isNight} />
      <Vegetation />
      <Traffic hour={hour} />
      <Pedestrians />

      <CampusBuildings
        hour={hour}
        pLoad={stepData.p_load_kw || 0}
        onSelectEntity={onSelectEntity}
      />

      <SolarField
        pPv={stepData.p_pv_kw || 0}
        hour={hour}
        onSelectEntity={onSelectEntity}
      />

      <BESS
        socPct={stepData.soc_pct || 90}
        pBatt={stepData.p_batt_kw || 0}
        hour={hour}
        onSelectEntity={onSelectEntity}
      />

      <GridTower
        pBuy={stepData.p_buy_kw || 0}
        pSell={stepData.p_sell_kw || 0}
        hour={hour}
        onSelectEntity={onSelectEntity}
      />

      <EnergyFlow stepData={stepData} />
      <FloatingBadges stepData={stepData} onSelectEntity={onSelectEntity} />
      <PostFX />
    </>
  );
}
