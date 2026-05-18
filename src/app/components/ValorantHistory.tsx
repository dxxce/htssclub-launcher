"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { History, Loader2, Crosshair, Skull, Swords, Calendar, ChevronDown, User } from "lucide-react";

interface PlayerStat {
  puuid: string;
  gameName: string;
  tagLine: string;
  teamId: string;
  characterId: string;
  agentIcon: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
}

interface MatchStat {
  matchId: string;
  mapId: string;
  mapName: string;
  agentId: string;
  agentIcon: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  isWin: boolean;
  roundsWon: number;
  roundsLost: number;
  startTime: number;
  players: PlayerStat[];
}

const mapCache: Record<string, string> = {};
const agentCache: Record<string, string> = {};

async function fetchMapName(mapUrl: string) {
  if (mapCache[mapUrl]) return mapCache[mapUrl];
  try {
    const res = await fetch("https://valorant-api.com/v1/maps");
    const json = await res.json();
    const map = json.data.find((m: any) => m.mapUrl === mapUrl);
    const name = map ? map.displayName : "Unknown Map";
    mapCache[mapUrl] = name;
    return name;
  } catch { return "Unknown Map"; }
}

async function fetchAgentIcon(agentId: string) {
  if (agentCache[agentId]) return agentCache[agentId];
  try {
    const res = await fetch(`https://valorant-api.com/v1/agents/${agentId}`);
    const json = await res.json();
    const icon = json.data?.displayIcon || "";
    agentCache[agentId] = icon;
    return icon;
  } catch { return ""; }
}

export default function ValorantHistory() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchStat[]>([]);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [openingRiot, setOpeningRiot] = useState(false);

  const handleOpenRiotClient = async () => {
    setOpeningRiot(true);
    try {
      await invoke("open_riot_client");
      setTimeout(() => {
        loadHistory();
        setOpeningRiot(false);
      }, 6000);
    } catch (err: any) {
      alert("Không thể khởi động Riot Client: " + err.toString());
      setOpeningRiot(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const creds = await invoke<any>("get_riot_credentials");
      const historyData = await invoke<any[]>("fetch_valorant_match_history", {
        req: {
          puuid: creds.puuid,
          auth_token: creds.auth_token,
          entitlement_token: creds.entitlement_token,
          shard: creds.shard,
        },
      });

      if (!historyData || historyData.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const parsedMatches: MatchStat[] = [];

      for (const match of historyData) {
        if (!match.matchInfo || !match.players || !match.teams) continue;
        
        const myPlayer = match.players.find((p: any) => p.subject === creds.puuid);
        if (!myPlayer) continue;

        const myTeamId = myPlayer.teamId;
        const myTeam = match.teams.find((t: any) => t.teamId === myTeamId);
        const enemyTeam = match.teams.find((t: any) => t.teamId !== myTeamId);

        const isWin = myTeam?.won || false;
        const roundsWon = myTeam?.roundsWon || 0;
        const roundsLost = enemyTeam?.roundsWon || 0;

        const mapName = await fetchMapName(match.matchInfo.mapId);
        const myAgentIcon = await fetchAgentIcon(myPlayer.characterId);

        const playersStat: PlayerStat[] = [];
        for (const p of match.players) {
          const pIcon = await fetchAgentIcon(p.characterId);
          playersStat.push({
            puuid: p.subject,
            gameName: p.gameName,
            tagLine: p.tagLine,
            teamId: p.teamId,
            characterId: p.characterId,
            agentIcon: pIcon,
            kills: p.stats?.kills || 0,
            deaths: p.stats?.deaths || 0,
            assists: p.stats?.assists || 0,
            score: p.stats?.score || 0,
          });
        }

        parsedMatches.push({
          matchId: match.matchInfo.matchId,
          mapId: match.matchInfo.mapId,
          mapName,
          agentId: myPlayer.characterId,
          agentIcon: myAgentIcon,
          kills: myPlayer.stats?.kills || 0,
          deaths: myPlayer.stats?.deaths || 0,
          assists: myPlayer.stats?.assists || 0,
          score: myPlayer.stats?.score || 0,
          isWin,
          roundsWon,
          roundsLost,
          startTime: match.matchInfo.gameStartMillis,
          players: playersStat.sort((a, b) => b.score - a.score),
        });
      }

      setMatches(parsedMatches.sort((a, b) => b.startTime - a.startTime));
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
        <p className="text-neutral-400 font-medium">Đang tải lịch sử đấu (Competitive)...</p>
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
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[350px] bg-gradient-to-b from-purple-500/[0.03] to-transparent border border-purple-500/10 rounded-2xl mt-6">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center mb-5 animate-pulse">
            <History className="w-8 h-8 text-purple-500" />
          </div>
          <h3 className="text-white font-black text-xl mb-2">Riot Client Chưa Được Mở</h3>
          <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed mb-6">
            Hệ thống cần Riot Client đang chạy ở chế độ nền để lấy thông tin.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleOpenRiotClient}
              disabled={openingRiot}
              className="px-6 py-2.5 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 text-white rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all cursor-pointer flex items-center gap-2"
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
              onClick={loadHistory}
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-purple-500/5 rounded-2xl border border-purple-500/10 p-8 text-center mt-6">
        <History className="w-12 h-12 text-purple-500 mb-4 opacity-50" />
        <h3 className="text-xl font-bold text-white mb-2">Không thể tải dữ liệu</h3>
        <p className="text-neutral-400 text-sm max-w-md">{error}</p>
        <button
          onClick={loadHistory}
          className="px-6 py-2.5 mt-4 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-xl font-bold text-sm border border-white/10 transition-colors cursor-pointer"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full mt-6 gap-4">
      {matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] bg-white/[0.02] border border-white/5 rounded-3xl">
          <History className="w-12 h-12 text-neutral-600 mb-4" />
          <p className="text-neutral-400 font-medium">Chưa có trận đấu nào trong mùa giải này.</p>
        </div>
      ) : (
        matches.map((m) => {
          const isDraw = m.roundsWon === m.roundsLost;
          const statusText = isDraw ? "HÒA" : m.isWin ? "THẮNG" : "THUA";
          const statusColor = isDraw ? "text-yellow-500" : m.isWin ? "text-emerald-500" : "text-red-500";
          const bgGradient = isDraw 
            ? "from-yellow-500/10 to-transparent border-yellow-500/20" 
            : m.isWin 
              ? "from-emerald-500/10 to-transparent border-emerald-500/20" 
              : "from-red-500/10 to-transparent border-red-500/20";
          
          const kd = (m.kills / Math.max(1, m.deaths)).toFixed(2);
          
          const date = new Date(m.startTime).toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
          });

          const isExpanded = expandedMatch === m.matchId;

          return (
            <div key={m.matchId} className="flex flex-col gap-2">
              {/* Match Header */}
              <div 
                onClick={() => setExpandedMatch(isExpanded ? null : m.matchId)}
                className={`relative overflow-hidden bg-gradient-to-r ${bgGradient} border bg-[#09090b] rounded-2xl p-5 flex items-center gap-6 group hover:scale-[1.01] transition-all cursor-pointer ${isExpanded ? 'scale-[1.01] border-white/20' : ''}`}
              >
                {/* Agent Icon */}
                <div className="w-16 h-16 rounded-xl bg-black/40 border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {m.agentIcon ? (
                    <img src={m.agentIcon} alt="Agent" className="w-full h-full object-cover scale-110" />
                  ) : (
                    <User className="w-8 h-8 text-neutral-500" />
                  )}
                </div>

                {/* Match Result & Map */}
                <div className="flex-1">
                  <h3 className={`text-2xl font-black ${statusColor} tracking-tight`}>
                    {statusText} <span className="text-white ml-2">{m.roundsWon} - {m.roundsLost}</span>
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5 text-neutral-400 text-sm font-medium">
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {date}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span className="text-white">{m.mapName}</span>
                  </div>
                </div>

                {/* Stats KDA */}
                <div className="flex flex-col items-center justify-center px-6 border-l border-white/10">
                  <div className="text-2xl font-black text-white tracking-widest">
                    {m.kills}<span className="text-neutral-600 font-normal mx-1">/</span>
                    {m.deaths}<span className="text-neutral-600 font-normal mx-1">/</span>
                    {m.assists}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-neutral-500 font-bold uppercase tracking-wider">KDA</span>
                    <span className={`text-sm font-black ${parseFloat(kd) >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {kd}
                    </span>
                  </div>
                </div>

                {/* Score */}
                <div className="flex flex-col items-end justify-center w-24">
                  <p className="text-3xl font-black text-white">{m.score}</p>
                  <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-1">Score</p>
                </div>

                {/* Chevron */}
                <div className="flex items-center justify-center pl-2 border-l border-white/5 opacity-50 group-hover:opacity-100 transition-opacity">
                  <ChevronDown className={`w-5 h-5 text-white transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expanded Scoreboard */}
              {isExpanded && (
                <div className="bg-[#09090b]/80 border border-white/10 rounded-2xl p-4 ml-4 mr-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 mb-3 px-4 py-2 bg-white/5 rounded-xl text-xs font-bold text-neutral-400 uppercase tracking-wider">
                    <div>Người chơi</div>
                    <div className="text-center">ACS</div>
                    <div className="text-center">K</div>
                    <div className="text-center">D</div>
                    <div className="text-center">A</div>
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    {m.players.map((p, idx) => {
                      const totalRounds = m.roundsWon + m.roundsLost;
                      const acs = totalRounds > 0 ? Math.round(p.score / totalRounds) : p.score;
                      const isMe = p.characterId === m.agentId && p.score === m.score;
                      
                      return (
                        <div key={p.puuid} className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 items-center px-4 py-2.5 rounded-xl ${isMe ? 'bg-white/10 border border-white/10' : 'hover:bg-white/5'} transition-colors`}>
                          <div className="flex items-center gap-3">
                            <img src={p.agentIcon} alt="" className="w-8 h-8 rounded bg-black/50" />
                            <div className="flex flex-col">
                              <span className={`font-bold text-sm ${isMe ? 'text-blue-400' : 'text-white'}`}>
                                {p.gameName} <span className="text-neutral-500 font-normal">#{p.tagLine}</span>
                              </span>
                            </div>
                          </div>
                          <div className="text-center font-black text-neutral-300">{acs}</div>
                          <div className="text-center font-bold text-white">{p.kills}</div>
                          <div className="text-center font-bold text-neutral-400">{p.deaths}</div>
                          <div className="text-center font-bold text-neutral-400">{p.assists}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
