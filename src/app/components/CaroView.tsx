"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Swords, Flag, History, Search, Trophy, Clock, RotateCw, Coins, Plus, LogIn } from "lucide-react";
import { useCaroStore } from "../store/useCaroStore";
import { useCommunityStore } from "../store/useCommunityStore";
import type { CaroGame, CaroPlayer } from "../lib/communityApi";
import LevelBadge, { levelNameStyle } from "./LevelBadge";
import RankBadge from "./RankBadge";
import GameEndOverlay from "./GameEndOverlay";

// Thẻ người chơi caro — avatar, tên (màu level), huy hiệu Level + Rank, điểm RP.
function PlayerChip({ p, mark, active, you }: { p?: CaroPlayer; mark: "X" | "O"; active?: boolean; you?: boolean }) {
  const name = p?.displayName || p?.username || (mark === "X" ? "Người chơi X" : "Người chơi O");
  const color = mark === "X" ? "#f43f5e" : "#38bdf8";
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border transition-all w-[210px] ${active ? "bg-white/[0.05] border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.08)]" : "bg-white/[0.02] border-white/[0.06]"}`}>
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center bg-[#15151f]" style={{ boxShadow: active ? `0 0 0 2px ${color}` : undefined }}>
          {p?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[12px] font-black text-white">{(name || "?").slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <span className="absolute -bottom-1 -right-1 inline-flex w-5 h-5 rounded-md items-center justify-center text-[11px] font-black text-white ring-2 ring-[#08080f]" style={{ background: color }}>{mark}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[13px] font-bold truncate" style={levelNameStyle(p?.level, p?.levelStyle) || { color: "#fff" }}>{name}</span>
          {you && <span className="text-[8px] font-black text-violet-300 px-1 py-0.5 rounded bg-violet-500/15 flex-shrink-0">BẠN</span>}
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <LevelBadge level={p?.level} style={p?.levelStyle} />
          <RankBadge rank={p?.rank} />
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px]">
          {typeof p?.rankPoints === "number" && <span className="text-neutral-400 font-bold">{p.rankPoints.toLocaleString("vi-VN")} RP</span>}
          {active && <span className="text-emerald-300 font-bold">đang đi…</span>}
        </div>
      </div>
    </div>
  );
}

// Bàn cờ 15×15.
function Board({ game, myMark, onPlay }: { game: CaroGame; myMark: 1 | 2 | 0; onPlay: (r: number, c: number) => void }) {
  const size = game.boardSize;
  const lastMove = game.moves.length ? game.moves[game.moves.length - 1] : null;
  const winSet = useMemo(() => new Set(game.winningLine || []), [game.winningLine]);
  const myTurn = game.status === "ACTIVE" && myMark !== 0 && game.turn === myMark;

  return (
    <div className="inline-grid rounded-lg overflow-hidden border border-white/10 bg-[#0c0c16] shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
    >
      {game.board.map((cell, idx) => {
        const r = Math.floor(idx / size);
        const c = idx % size;
        const isLast = lastMove && lastMove.row === r && lastMove.col === c;
        const isWin = winSet.has(idx);
        const empty = cell === 0;
        return (
          <button
            key={idx}
            disabled={!empty || !myTurn}
            onClick={() => onPlay(r, c)}
            className={`relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center border border-white/[0.05] transition-colors ${
              empty && myTurn ? "hover:bg-white/[0.06] cursor-pointer" : "cursor-default"
            } ${isWin ? "bg-emerald-500/25" : isLast ? "bg-white/[0.05]" : ""}`}
          >
            {cell === 1 && <span className={`text-[18px] font-black leading-none ${isWin ? "text-emerald-300" : "text-rose-400"}`}>✕</span>}
            {cell === 2 && <span className={`text-[18px] font-black leading-none ${isWin ? "text-emerald-300" : "text-sky-400"}`}>◯</span>}
          </button>
        );
      })}
    </div>
  );
}

// Đồng hồ đếm ngược lượt đi.
function TurnClock({ game }: { game: CaroGame }) {
  const [left, setLeft] = useState(game.turnSeconds);
  // reset mỗi khi đổi lượt (số nước đi đổi) hoặc trận đổi.
  const moveCount = game.moves.length;
  useEffect(() => {
    if (game.status !== "ACTIVE") return;
    setLeft(game.turnSeconds);
    const t = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [moveCount, game.turnSeconds, game.status]);
  if (game.status !== "ACTIVE") return null;
  const danger = left <= 10;
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-black tabular-nums ${danger ? "bg-rose-500/15 text-rose-300" : "bg-white/[0.05] text-neutral-300"}`}>
      <Clock className="w-3.5 h-3.5" /> {left}s
    </div>
  );
}

function fmtEndReason(g: CaroGame, meId?: string): string {
  if (g.endReason === "DRAW") return "Hoà";
  const win = g.winner && meId && g.winner === meId;
  const base = win ? "Thắng" : "Thua";
  switch (g.endReason) {
    case "RESIGN": return `${base} (đầu hàng)`;
    case "TIMEOUT": return `${base} (hết giờ)`;
    case "DISCONNECT": return `${base} (mất kết nối)`;
    default: return base;
  }
}

export default function CaroView({ onOpenProfile }: { onOpenProfile?: (userId: string) => void }) {
  const me = useCommunityStore((s) => s.user);
  const phase = useCaroStore((s) => s.phase);
  const game = useCaroStore((s) => s.game);
  const queueSize = useCaroStore((s) => s.queueSize);
  const searching = useCaroStore((s) => s.searching);
  const opponentDisconnectedUntil = useCaroStore((s) => s.opponentDisconnectedUntil);
  const history = useCaroStore((s) => s.history);
  const loadingHistory = useCaroStore((s) => s.loadingHistory);
  const findMatch = useCaroStore((s) => s.findMatch);
  const cancelQueue = useCaroStore((s) => s.cancelQueue);
  const makeMove = useCaroStore((s) => s.makeMove);
  const resign = useCaroStore((s) => s.resign);
  const leaveGame = useCaroStore((s) => s.leaveGame);
  const resumeActive = useCaroStore((s) => s.resumeActive);
  const loadHistory = useCaroStore((s) => s.loadHistory);
  const connect = useCaroStore((s) => s.connect);
  const enterLobby = useCaroStore((s) => s.enterLobby);
  const leaveLobby = useCaroStore((s) => s.leaveLobby);
  const room = useCaroStore((s) => s.room);
  const rooms = useCaroStore((s) => s.rooms);
  const loadingRooms = useCaroStore((s) => s.loadingRooms);
  const loadRooms = useCaroStore((s) => s.loadRooms);
  const createRoom = useCaroStore((s) => s.createRoom);
  const joinRoom = useCaroStore((s) => s.joinRoom);
  const toggleReady = useCaroStore((s) => s.toggleReady);
  const startRoom = useCaroStore((s) => s.startRoom);
  const leaveRoom = useCaroStore((s) => s.leaveRoom);

  const [graceLeft, setGraceLeft] = useState(0);
  const [bet, setBet] = useState(0);
  const [joinCode, setJoinCode] = useState("");

  // Kết nối + thử nối lại trận đang chơi + tải lịch sử khi mở khu game.
  useEffect(() => {
    connect();
    resumeActive();
    loadHistory();
    loadRooms();
  }, [connect, resumeActive, loadHistory, loadRooms]);

  // Vào "sảnh" để nhận số người đang tìm trận realtime; rời khi đóng khu game.
  useEffect(() => {
    enterLobby();
    return () => leaveLobby();
  }, [enterLobby, leaveLobby]);

  // Đếm ngược forfeit khi đối thủ rớt mạng.
  useEffect(() => {
    if (!opponentDisconnectedUntil) { setGraceLeft(0); return; }
    const tick = () => setGraceLeft(Math.max(0, Math.ceil((opponentDisconnectedUntil - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [opponentDisconnectedUntil]);

  const myMark: 1 | 2 | 0 = useMemo(() => {
    if (!game || !me) return 0;
    if (game.players.X?.id === me.id) return 1;
    if (game.players.O?.id === me.id) return 2;
    return 0;
  }, [game, me]);

  const onPlay = useCallback((r: number, c: number) => { makeMove(r, c); }, [makeMove]);

  // ── Đang trong trận / vừa kết thúc ──
  if (game && (phase === "playing" || phase === "finished")) {
    const finished = game.status !== "ACTIVE";
    const xActive = !finished && game.turn === 1;
    const oActive = !finished && game.turn === 2;
    const rp = game.rpChange && me ? game.rpChange[me.id] : undefined;
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#08080f]">
        <div className="h-[52px] flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
          <Swords className="w-4.5 h-4.5 text-rose-300 flex-shrink-0" />
          <span className="text-[14px] font-black text-white mr-2">Cờ Caro</span>
          {game.ranked && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300">XẾP HẠNG</span>}
          <div className="flex-1" />
          {!finished && <TurnClock game={game} />}
          {finished ? (
            <button onClick={leaveGame} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-bold transition-colors cursor-pointer">
              <RotateCw className="w-3.5 h-3.5" /> Trận mới
            </button>
          ) : (
            <button onClick={resign} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[12px] font-bold transition-colors cursor-pointer">
              <Flag className="w-3.5 h-3.5" /> Đầu hàng
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-4 sm:p-6 flex flex-col items-center gap-5">
          {/* hai người chơi */}
          <div className="w-full max-w-[520px] flex items-center justify-between gap-3">
            <PlayerChip p={game.players.X} mark="X" active={xActive} you={myMark === 1} />
            <span className="text-[13px] font-black text-neutral-600">VS</span>
            <PlayerChip p={game.players.O} mark="O" active={oActive} you={myMark === 2} />
          </div>

          {/* trạng thái */}
          {opponentDisconnectedUntil && graceLeft > 0 && !finished && (
            <div className="text-[12px] font-bold text-amber-300 bg-amber-500/10 px-3 py-1.5 rounded-lg">
              Đối thủ mất kết nối — xử thua sau {graceLeft}s nếu không quay lại.
            </div>
          )}
          {finished && (
            <GameEndOverlay
              kind={game.endReason === "DRAW" ? "draw" : game.winner === me?.id ? "win" : "lose"}
              title={fmtEndReason(game, me?.id)}
              subtitle={game.mode === "WAGER" && game.pot ? `Pot ${game.pot.toLocaleString("vi-VN")} xu` : undefined}
              rp={typeof rp === "number" ? rp : undefined}
              onPrimary={leaveGame}
              primaryLabel="Trận mới"
            />
          )}
          {!finished && myMark === 0 && (
            <div className="text-[12px] text-neutral-500">Bạn đang xem trận này.</div>
          )}

          {/* bàn cờ */}
          <Board game={game} myMark={myMark} onPlay={onPlay} />
        </div>
      </div>
    );
  }

  // ── Phòng cược đang chờ (lobby) ──
  if (room && !room.gameId) {
    const meMember = room.members.find((m) => m.userId === me?.id);
    const isHost = room.hostId === me?.id;
    const everyoneElseReady = room.members.filter((m) => !m.isHost).every((m) => m.ready);
    const canStart = isHost && room.members.length >= room.minPlayers && everyoneElseReady;
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#08080f]">
        <div className="h-[52px] flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
          <Swords className="w-4.5 h-4.5 text-rose-300 flex-shrink-0" />
          <span className="text-[14px] font-black text-white mr-2">Phòng {room.name || room.code}</span>
          {room.mode === "WAGER" && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 flex items-center gap-1"><Coins className="w-3 h-3" />{room.betAmount}/người</span>}
          <div className="flex-1" />
          <button onClick={leaveRoom} className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 text-[12px] font-bold transition-colors cursor-pointer">Rời phòng</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-5">
          <div className="max-w-[440px] mx-auto flex flex-col gap-4">
            {room.code && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[12px] text-neutral-400">Mã phòng</span>
                <span className="text-[15px] font-black text-white tracking-widest">{room.code}</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {room.members.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center bg-[#15151f] flex-shrink-0">
                    {m.user?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : <span className="text-[11px] font-black text-white">{(m.user?.displayName || m.user?.username || "?").slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-white truncate">{m.user?.displayName || m.user?.username || "Người chơi"}</div>
                    <div className="text-[10px] text-neutral-500">{m.isHost ? "Chủ phòng" : m.ready ? "Đã sẵn sàng" : "Chưa sẵn sàng"}</div>
                  </div>
                  {m.isHost ? <Trophy className="w-4 h-4 text-amber-400" /> : m.ready ? <span className="text-[11px] font-black text-emerald-300">✓</span> : <span className="text-[11px] text-neutral-600">…</span>}
                </div>
              ))}
            </div>
            {isHost ? (
              <button onClick={startRoom} disabled={!canStart} className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-600 hover:from-rose-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-default text-white text-[13px] font-black transition-all cursor-pointer">
                Bắt đầu ({room.members.length}/{room.maxPlayers})
              </button>
            ) : (
              <button onClick={toggleReady} className={`w-full py-3 rounded-xl text-[13px] font-black transition-all cursor-pointer ${meMember?.ready ? "bg-white/[0.06] text-neutral-300" : "bg-gradient-to-r from-rose-600 to-fuchsia-600 text-white"}`}>
                {meMember?.ready ? "Huỷ sẵn sàng" : "Sẵn sàng"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Sảnh: tìm trận + lịch sử ──
  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#08080f]">
      <div className="h-[52px] flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
        <Swords className="w-4.5 h-4.5 text-rose-300 flex-shrink-0" />
        <span className="text-[14px] font-black text-white">Cờ Caro 1v1</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-5">
        <div className="max-w-[560px] mx-auto flex flex-col gap-5">
          {/* thẻ tìm trận */}
          <div className="relative rounded-2xl p-5 bg-gradient-to-br from-rose-500/15 via-fuchsia-500/10 to-sky-500/10 border border-white/10 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 flex items-center justify-center shadow-[0_0_22px_rgba(244,63,94,0.4)] flex-shrink-0">
                <Swords className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-black text-white">Đấu xếp hạng</h3>
                <p className="text-[12px] text-neutral-400 leading-relaxed mt-0.5">
                  Bàn 15×15, nối đủ 5 quân để thắng. Mỗi nước 30 giây. Thắng/thua ăn điểm hạng (RP).
                </p>
              </div>
              {searching > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-black flex-shrink-0 whitespace-nowrap">
                  <Search className="w-3 h-3" /> {searching} đang tìm
                </span>
              )}
            </div>

            <div className="mt-4">
              {phase === "queue" ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/10">
                    <Loader2 className="w-4 h-4 text-rose-300 animate-spin" />
                    <span className="text-[12px] font-bold text-neutral-200">Đang tìm đối thủ…</span>
                    {queueSize > 0 && <span className="text-[11px] text-neutral-500">({queueSize} trong hàng chờ)</span>}
                  </div>
                  <button onClick={cancelQueue} className="px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 text-[12px] font-bold transition-colors cursor-pointer">
                    Huỷ
                  </button>
                </div>
              ) : (
                <button onClick={findMatch} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-600 hover:from-rose-500 hover:to-fuchsia-500 text-white text-[13px] font-black transition-all cursor-pointer active:scale-[0.99] shadow-[0_8px_24px_rgba(244,63,94,0.3)]">
                  <Search className="w-4 h-4" /> Tìm trận
                </button>
              )}
            </div>
          </div>

          {/* tạo / vào phòng cược xu (1v1) */}
          <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.06]">
            <h3 className="text-[13px] font-black text-white mb-3 flex items-center gap-1.5"><Coins className="w-4 h-4 text-amber-400" /> Phòng cược xu (1v1)</h3>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-[11px] text-neutral-400 w-16">Mức cược</label>
              <input type="number" min={0} value={bet} onChange={(e) => setBet(Math.max(0, parseInt(e.target.value) || 0))} className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-[13px] text-white outline-none focus:border-rose-500/50" />
            </div>
            <button onClick={() => createRoom({ betAmount: bet })} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-600 hover:from-rose-500 hover:to-fuchsia-500 text-white text-[12px] font-black transition-all cursor-pointer active:scale-[0.98]">
              <Plus className="w-4 h-4" /> Tạo phòng {bet > 0 ? `(cược ${bet})` : "(thường)"}
            </button>
            <div className="flex gap-2 mt-2">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Nhập mã phòng (CR-XXXX)" className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-[12px] text-white outline-none focus:border-rose-500/50" />
              <button onClick={() => { if (joinCode.trim()) joinRoom({ code: joinCode.trim() }); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 text-[12px] font-bold transition-colors cursor-pointer">
                <LogIn className="w-4 h-4" /> Vào
              </button>
            </div>
            {(loadingRooms || rooms.length > 0) && (
              <div className="mt-3 flex flex-col gap-1.5">
                {rooms.map((r) => (
                  <button key={r.id} onClick={() => joinRoom({ roomId: r.id })} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] transition-colors cursor-pointer text-left">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center flex-shrink-0"><Swords className="w-4 h-4 text-rose-300" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-bold text-neutral-200 truncate">{r.name || r.code}</div>
                      <div className="text-[10px] text-neutral-500">{r.members.length}/{r.maxPlayers}{r.mode === "WAGER" ? ` · cược ${r.betAmount}` : ""}</div>
                    </div>
                    <LogIn className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* lịch sử */}
          <div>
            <div className="flex items-center gap-2 px-1 mb-2">
              <History className="w-4 h-4 text-neutral-500" />
              <span className="text-[12px] font-black uppercase tracking-wider text-neutral-500">Lịch sử đấu</span>
              <span className="flex-1 h-px bg-white/[0.06]" />
            </div>
            {loadingHistory ? (
              <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 text-rose-300 animate-spin" /></div>
            ) : history.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <Trophy className="w-8 h-8 text-neutral-700" />
                <p className="text-[12px] text-neutral-600">Chưa có trận nào. Tìm trận để bắt đầu!</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {history.map((g) => {
                  const meX = g.players.X?.id === me?.id;
                  const opp = meX ? g.players.O : g.players.X;
                  const oppName = opp?.displayName || opp?.username || "Đối thủ";
                  const win = g.winner && g.winner === me?.id;
                  const draw = g.endReason === "DRAW";
                  const rp = g.rpChange && me ? g.rpChange[me.id] : undefined;
                  return (
                    <button
                      key={g.id}
                      onClick={() => opp?.id && onOpenProfile?.(opp.id)}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] transition-colors cursor-pointer text-left"
                    >
                      <span className={`w-1.5 h-8 rounded-full flex-shrink-0 ${draw ? "bg-neutral-500" : win ? "bg-emerald-400" : "bg-rose-400"}`} />
                      <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-[#15151f] flex-shrink-0">
                        {opp?.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={opp.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : <span className="text-[10px] font-black text-white">{oppName.slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-bold text-neutral-200 truncate">vs {oppName}</div>
                        <div className="text-[10px] text-neutral-500">{g.ranked ? "Xếp hạng" : "Giao hữu"}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-[12px] font-black ${draw ? "text-neutral-300" : win ? "text-emerald-300" : "text-rose-300"}`}>{draw ? "Hoà" : win ? "Thắng" : "Thua"}</div>
                        {typeof rp === "number" && <div className={`text-[10px] font-bold ${rp >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{rp > 0 ? "+" : ""}{rp} RP</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
