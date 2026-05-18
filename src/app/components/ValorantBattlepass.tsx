"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Target, Loader2, Clock, CheckCircle2, Gift } from "lucide-react";

interface Mission {
  id: string;
  title: string;
  progress: number;
  objective: number;
  xp: number;
  type: string;
  expirationTime: Date;
}

export default function ValorantBattlepass() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [openingRiot, setOpeningRiot] = useState(false);

  const handleOpenRiotClient = async () => {
    setOpeningRiot(true);
    try {
      await invoke("open_riot_client");
      setTimeout(() => {
        loadContracts();
        setOpeningRiot(false);
      }, 6000);
    } catch (err: any) {
      alert("Không thể khởi động Riot Client: " + err.toString());
      setOpeningRiot(false);
    }
  };

  const loadContracts = async () => {
    try {
      setLoading(true);
      setError(null);

      const creds = await invoke<any>("get_riot_credentials");
      const contractsData = await invoke<any>("fetch_valorant_contracts", {
        req: {
          puuid: creds.puuid,
          auth_token: creds.auth_token,
          entitlement_token: creds.entitlement_token,
          shard: creds.shard,
        },
      });

      const activeMissions = contractsData?.Missions || [];
      
      // Fetch mission data from valorant-api
      const missionRes = await fetch("https://valorant-api.com/v1/missions");
      const missionJson = await missionRes.json();
      const missionDefs = missionJson.data || [];

      const parsedMissions: Mission[] = [];

      for (const m of activeMissions) {
        const def = missionDefs.find((d: any) => d.uuid === m.ID);
        if (!def) continue;

        // Skip completed missions if you want, or just show them. m.Complete is boolean
        if (m.Complete) continue;

        const objectiveId = Object.keys(m.Objectives || {})[0];
        const progress = objectiveId ? m.Objectives[objectiveId] : 0;
        const total = def.progressToComplete || 1;

        parsedMissions.push({
          id: m.ID,
          title: def.title || def.displayName || "Nhiệm vụ chưa xác định",
          progress: progress,
          objective: total,
          xp: def.xpGrant || 0,
          type: def.type || "Nhiệm vụ",
          expirationTime: new Date(m.ExpirationTime),
        });
      }

      setMissions(parsedMissions.sort((a, b) => a.expirationTime.getTime() - b.expirationTime.getTime()));
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContracts();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
        <p className="text-neutral-400 font-medium">Đang tải tiến trình nhiệm vụ...</p>
      </div>
    );
  }

  if (error) {
    const isRiotClientError = error.includes("Riot Client") ||
                              error.includes("lockfile") ||
                              error.includes("127.0.0.1") ||
                              error.includes("request for url") ||
                              error.includes("region") ||
                              error.includes("token");

    if (isRiotClientError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[350px] bg-gradient-to-b from-emerald-500/[0.03] to-transparent border border-emerald-500/10 rounded-2xl mt-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mb-5 animate-pulse">
            <Target className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-white font-black text-xl mb-2">Riot Client Chưa Được Mở</h3>
          <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed mb-6">
            Hệ thống cần Riot Client đang chạy ở chế độ nền để lấy thông tin.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleOpenRiotClient}
              disabled={openingRiot}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all cursor-pointer flex items-center gap-2"
            >
              {openingRiot ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang mở...
                </>
              ) : (
                "Mở Riot Client"
              )}
            </button>
            <button
              onClick={loadContracts}
              disabled={openingRiot}
              className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-xl font-bold text-sm border border-white/10 transition-colors cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-emerald-500/5 rounded-2xl border border-emerald-500/10 p-8 text-center mt-6">
        <Target className="w-12 h-12 text-emerald-500 mb-4 opacity-50" />
        <h3 className="text-xl font-bold text-white mb-2">Không thể tải dữ liệu</h3>
        <p className="text-neutral-400 text-sm max-w-md">{error}</p>
        <button
          onClick={loadContracts}
          className="px-6 py-2.5 mt-4 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-xl font-bold text-sm border border-white/10 transition-colors cursor-pointer"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const daily = missions.filter(m => m.type.includes("Daily"));
  const weekly = missions.filter(m => m.type.includes("Weekly"));
  const others = missions.filter(m => !m.type.includes("Daily") && !m.type.includes("Weekly"));

  const renderMission = (m: Mission) => {
    const pct = Math.min(100, (m.progress / m.objective) * 100);
    const isCompleted = m.progress >= m.objective;
    
    return (
      <div key={m.id} className="bg-black/20 border border-white/5 rounded-2xl p-5 relative overflow-hidden group">
        <div className="flex items-start justify-between mb-4">
          <h4 className="text-white font-bold text-lg leading-tight flex-1 pr-4">{m.title}</h4>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-lg border border-emerald-500/20 whitespace-nowrap">
            <Gift className="w-3.5 h-3.5" />
            <span className="text-xs font-black">{m.xp.toLocaleString()} XP</span>
          </div>
        </div>
        
        <div className="relative pt-2">
          <div className="flex justify-between text-xs font-bold text-neutral-400 mb-2">
            <span>TIẾN TRÌNH</span>
            <span className={isCompleted ? "text-emerald-400" : "text-white"}>{m.progress} / {m.objective}</span>
          </div>
          <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {isCompleted && (
          <div className="absolute inset-0 bg-emerald-900/20 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 drop-shadow-lg" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full mt-6">
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Missions */}
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Nhiệm Vụ Hàng Ngày</h2>
          </div>
          <div className="flex flex-col gap-4">
            {daily.length > 0 ? daily.map(renderMission) : <p className="text-neutral-500 italic">Không có nhiệm vụ hàng ngày.</p>}
          </div>
        </div>

        {/* Weekly Missions */}
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
              <Target className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Nhiệm Vụ Tuần</h2>
          </div>
          <div className="flex flex-col gap-4">
            {weekly.length > 0 ? weekly.map(renderMission) : <p className="text-neutral-500 italic">Không có nhiệm vụ tuần.</p>}
            {others.length > 0 && others.map(renderMission)}
          </div>
        </div>
      </div>
      
    </div>
  );
}
