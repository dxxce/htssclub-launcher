"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { User, Trophy, Crosshair, Swords, Activity, Loader2, Package } from "lucide-react";

interface MMRData {
  tier: number;
  rr: number;
  leaderboardRank: number;
  wins: number;
  games: number;
}

export default function ValorantStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mmr, setMmr] = useState<MMRData | null>(null);
  const [tierInfo, setTierInfo] = useState<{name: string, icon: string} | null>(null);
  const [openingRiot, setOpeningRiot] = useState(false);

  const handleOpenRiotClient = async () => {
    setOpeningRiot(true);
    try {
      await invoke("open_riot_client");
      setTimeout(() => {
        loadStats();
        setOpeningRiot(false);
      }, 6000);
    } catch (err: any) {
      alert("Không thể khởi động Riot Client: " + err.toString());
      setOpeningRiot(false);
    }
  };

  const loadStats = async () => {
    try {
        setLoading(true);
        setError(null);

        const creds = await invoke<any>("get_riot_credentials");
        const mmrData = await invoke<any>("fetch_valorant_mmr", {
          req: {
            puuid: creds.puuid,
            auth_token: creds.auth_token,
            entitlement_token: creds.entitlement_token,
            shard: creds.shard,
          },
        });

        const latestUpdate = mmrData?.LatestCompetitiveUpdate;
        let tier = latestUpdate?.TierAfterUpdate || 0;
        let rr = latestUpdate?.RankedRatingAfterUpdate || 0;

        let wins = 0;
        let games = 0;
        if (mmrData?.QueueSkills?.competitive?.SeasonalInfoBySeasonID) {
          const seasons = Object.values(mmrData.QueueSkills.competitive.SeasonalInfoBySeasonID) as any[];
          if (seasons.length > 0) {
            const currentSeason = seasons[seasons.length - 1];
            if (!tier) tier = currentSeason?.CompetitiveTier || 0;
            if (!rr) rr = currentSeason?.RankedRating || 0;
            wins = currentSeason?.NumberOfWins || 0;
            games = currentSeason?.NumberOfGames || 0;
          }
        }

        setMmr({
          tier,
          rr,
          leaderboardRank: latestUpdate?.LeaderboardRank || 0,
          wins,
          games
        });

        // Fetch Tier Info from Valorant API
        if (tier > 0) {
          const tiersRes = await fetch("https://valorant-api.com/v1/competitivetiers");
          const tiersJson = await tiersRes.json();
          if (tiersJson.status === 200 && tiersJson.data.length > 0) {
            const latestTiers = tiersJson.data[tiersJson.data.length - 1].tiers;
            const tierData = latestTiers.find((t: any) => t.tier === tier);
            if (tierData) {
              setTierInfo({
                name: tierData.tierName,
                icon: tierData.largeIcon || tierData.smallIcon
              });
            }
          }
        }
      } catch (err: any) {
        setError(err.toString());
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-neutral-400 font-medium">Đang tải dữ liệu hồ sơ...</p>
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
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[350px] bg-gradient-to-b from-red-500/[0.03] to-transparent border border-red-500/10 rounded-2xl mt-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-5 animate-pulse">
            <User className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-white font-black text-xl mb-2">Riot Client Chưa Được Mở</h3>
          <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed mb-6">
            Cửa hàng Valorant và Hệ thống thống kê cần Riot Client đang chạy ở chế độ nền để lấy thông tin.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleOpenRiotClient}
              disabled={openingRiot}
              className="px-6 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all cursor-pointer flex items-center gap-2"
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
              onClick={loadStats}
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-red-500/5 rounded-2xl border border-red-500/10 p-8 text-center mt-6">
        <User className="w-12 h-12 text-red-500 mb-4 opacity-50" />
        <h3 className="text-xl font-bold text-white mb-2">Không thể tải dữ liệu</h3>
        <p className="text-neutral-400 text-sm max-w-md">{error}</p>
        <button
          onClick={loadStats}
          className="px-6 py-2.5 mt-4 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-xl font-bold text-sm border border-white/10 transition-colors cursor-pointer"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const progressPct = mmr ? Math.min(100, Math.max(0, mmr.rr)) : 0;

  return (
    <div className="flex flex-col h-full w-full mt-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Rank Card */}
        <div className="col-span-1 bg-white/[0.02] border border-white/5 rounded-3xl p-8 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <h2 className="text-lg font-black tracking-widest text-neutral-500 uppercase mb-6 z-10">Rank Hiện Tại</h2>
          
          <div className="relative w-48 h-48 mb-6 z-10">
            {/* Circular Progress */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
              <circle 
                cx="50" cy="50" r="46" fill="none" 
                stroke="currentColor" strokeWidth="6" 
                strokeDasharray={`${progressPct * 2.89} 289`}
                className="text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.6)] transition-all duration-1000 ease-out"
                strokeLinecap="round"
              />
            </svg>
            
            {/* Rank Icon */}
            <div className="absolute inset-0 flex items-center justify-center p-6">
              {tierInfo?.icon ? (
                <img src={tierInfo.icon} alt={tierInfo.name} className="w-full h-full object-contain drop-shadow-2xl group-hover:scale-110 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full rounded-full bg-white/5 flex items-center justify-center">
                  <span className="text-neutral-500 font-bold">UNRANKED</span>
                </div>
              )}
            </div>
          </div>

          <div className="text-center z-10">
            <h3 className="text-3xl font-black text-white uppercase tracking-wider">{tierInfo?.name || "UNRANKED"}</h3>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-blue-400 font-bold text-xl">{mmr?.rr || 0} RR</span>
              {mmr?.leaderboardRank ? (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                  #{mmr.leaderboardRank}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Right Column: Stats Overview */}
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 flex-1">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" /> Tổng quan mùa giải
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-black/20 rounded-2xl p-5 border border-white/5 flex flex-col justify-center">
                <p className="text-neutral-400 font-medium mb-1 flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> Tỉ lệ thắng
                </p>
                <p className="text-3xl font-black text-white">
                  {mmr && mmr.games > 0 ? Math.round((mmr.wins / mmr.games) * 100) : "--"} %
                </p>
                <p className="text-xs text-neutral-500 mt-2">Mùa giải hiện tại</p>
              </div>
              
              <div className="bg-black/20 rounded-2xl p-5 border border-white/5 flex flex-col justify-center">
                <p className="text-neutral-400 font-medium mb-1 flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> Số trận thắng
                </p>
                <p className="text-3xl font-black text-white">
                  {mmr ? mmr.wins : "--"}
                </p>
                <p className="text-xs text-neutral-500 mt-2">Mùa giải hiện tại</p>
              </div>
              
              <div className="bg-black/20 rounded-2xl p-5 border border-white/5 flex flex-col justify-center">
                <p className="text-neutral-400 font-medium mb-1 flex items-center gap-2">
                  <Swords className="w-4 h-4" /> Trận đã chơi
                </p>
                <p className="text-3xl font-black text-white">
                  {mmr ? mmr.games : "--"}
                </p>
                <p className="text-xs text-neutral-500 mt-2">Competitive</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
