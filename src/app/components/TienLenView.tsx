"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Spade, Flag, History, Search, Trophy, Clock, RotateCw, Users2, Plus, LogIn, Coins, Crown, Hand } from "lucide-react";
import { useTienLenStore } from "../store/useTienLenStore";
import { useCommunityStore } from "../store/useCommunityStore";
import type { TienLenGame, TienLenPlayer, GameRoom } from "../lib/communityApi";
import { rankLabel, suitLabel, isRed, sortCards } from "../lib/tienlenCards";
import LevelBadge, { levelNameStyle } from "./LevelBadge";
import RankBadge from "./RankBadge";
import GameEndOverlay from "./GameEndOverlay";

function Avatar({ url, name, size = 36 }: { url?: string; name?: string; size?: number }) {
  return (
    <div className="rounded-xl overflow-hidden flex items-center justify-center bg-[#15151f] flex-shrink-0" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : <span className="text-[11px] font-black text-white">{(name || "?").slice(0, 2).toUpperCase()}</span>}
    </div>
  );
}

// Một lá bài. size: "table" (bộ trên bàn) | "hand" (bài của mình, lớn hơn).
function Card({ card, selected, onClick, disabled, size = "hand" }: { card: number; selected?: boolean; onClick?: () => void; disabled?: boolean; size?: "table" | "hand" }) {
  const red = isRed(card);
  const dim = size === "hand" ? "w-12 h-[68px] text-[19px]" : "w-9 h-[50px] text-[15px]";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative ${dim} rounded-lg border-2 flex flex-col items-center justify-center font-black bg-white shadow-md transition-transform ${
        selected ? "-translate-y-4 border-violet-500 ring-2 ring-violet-400 shadow-xl" : "border-neutral-300"
      } ${disabled ? "cursor-default" : "cursor-pointer hover:-translate-y-2"}`}
      style={{ color: red ? "#dc2626" : "#111827" }}
    >
      <span className="leading-none">{rankLabel(card)}</span>
      <span className="leading-none">{suitLabel(card)}</span>
    </button>
  );
}

// Bộ bài đang trên bàn.
function ComboOnTable({ cards }: { cards: number[] }) {
  if (!cards.length) return <span className="text-[13px] text-neutral-500 italic">Trống — được tự do ra bài</span>;
  return (
    <div className="flex items-center gap-1.5">
      {sortCards(cards).map((c) => <Card key={c} card={c} size="table" disabled />)}
    </div>
  );
}

// Đồng hồ lượt.
function TurnClock({ game }: { game: TienLenGame }) {
  const [left, setLeft] = useState(game.turnSeconds);
  const turn = game.turn;
  useEffect(() => {
    if (game.status !== "ACTIVE") return;
    setLeft(game.turnSeconds);
    const t = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [turn, game.turnSeconds, game.status]);
  if (game.status !== "ACTIVE") return null;
  const danger = left <= 10;
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-black tabular-nums ${danger ? "bg-rose-500/15 text-rose-300" : "bg-white/[0.05] text-neutral-300"}`}>
      <Clock className="w-3.5 h-3.5" /> {left}s
    </div>
  );
}

// Thẻ người chơi tại bàn — hiện avatar, tên (màu theo level), huy hiệu Level + Rank,
// điểm RP, số lá còn lại, trạng thái lượt/bỏ lượt/hạng.
function PlayerCard({ p, active, isMe }: { p: TienLenPlayer; active: boolean; isMe: boolean }) {
  const u = p.user;
  const nm = u?.displayName || u?.username || `Ghế ${p.seat + 1}`;
  const rp = u?.rankPoints;
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-2xl border transition-all w-[200px] ${active ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_18px_rgba(16,185,129,0.25)]" : "bg-white/[0.02] border-white/[0.06]"} ${!p.connected ? "opacity-50" : ""}`}>
      <div className="relative flex-shrink-0">
        <Avatar url={u?.avatarUrl} name={nm} size={42} />
        {active && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#08080f] animate-pulse" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[13px] font-bold truncate" style={levelNameStyle(u?.level, u?.levelStyle) || { color: "#fff" }}>{nm}</span>
          {isMe && <span className="text-[8px] font-black text-violet-300 px-1 py-0.5 rounded bg-violet-500/15 flex-shrink-0">BẠN</span>}
          {p.place === 1 && <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <LevelBadge level={u?.level} style={u?.levelStyle} />
          <RankBadge rank={u?.rank} />
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400">
          <span className={p.place ? "text-amber-300 font-bold" : ""}>{p.place ? `Hạng ${p.place}` : `${p.handCount} lá`}</span>
          {typeof rp === "number" && <span className="text-neutral-500">· {rp.toLocaleString("vi-VN")} RP</span>}
          {p.passed && !p.place && <span className="text-rose-300/70">· bỏ lượt</span>}
        </div>
      </div>
    </div>
  );
}

export default function TienLenView({ onOpenProfile }: { onOpenProfile?: (userId: string) => void }) {
  const me = useCommunityStore((s) => s.user);
  const phase = useTienLenStore((s) => s.phase);
  const game = useTienLenStore((s) => s.game);
  const searching = useTienLenStore((s) => s.searching);
  const queueSize = useTienLenStore((s) => s.queueSize);
  const room = useTienLenStore((s) => s.room);
  const rooms = useTienLenStore((s) => s.rooms);
  const loadingRooms = useTienLenStore((s) => s.loadingRooms);
  const history = useTienLenStore((s) => s.history);
  const loadingHistory = useTienLenStore((s) => s.loadingHistory);
  const lastChop = useTienLenStore((s) => s.lastChop);

  const connect = useTienLenStore((s) => s.connect);
  const resumeActive = useTienLenStore((s) => s.resumeActive);
  const enterLobby = useTienLenStore((s) => s.enterLobby);
  const leaveLobby = useTienLenStore((s) => s.leaveLobby);
  const loadHistory = useTienLenStore((s) => s.loadHistory);
  const loadRooms = useTienLenStore((s) => s.loadRooms);
  const findMatch = useTienLenStore((s) => s.findMatch);
  const cancelQueue = useTienLenStore((s) => s.cancelQueue);
  const play = useTienLenStore((s) => s.play);
  const pass = useTienLenStore((s) => s.pass);
  const resign = useTienLenStore((s) => s.resign);
  const leaveGame = useTienLenStore((s) => s.leaveGame);
  const createRoom = useTienLenStore((s) => s.createRoom);
  const joinRoom = useTienLenStore((s) => s.joinRoom);
  const toggleReady = useTienLenStore((s) => s.toggleReady);
  const startRoom = useTienLenStore((s) => s.startRoom);
  const leaveRoom = useTienLenStore((s) => s.leaveRoom);

  const [selected, setSelected] = useState<number[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [bet, setBet] = useState(0);
  const [maxP, setMaxP] = useState(4);

  useEffect(() => {
    connect();
    resumeActive();
    loadHistory();
    loadRooms();
  }, [connect, resumeActive, loadHistory, loadRooms]);

  useEffect(() => {
    enterLobby();
    return () => leaveLobby();
  }, [enterLobby, leaveLobby]);

  // reset bài chọn khi đổi lượt / ván.
  const turn = game?.turn;
  useEffect(() => { setSelected([]); }, [turn, game?.id]);

  const mySeat = useMemo(() => {
    if (!game || !me) return null;
    return game.players.find((p) => p.userId === me.id)?.seat ?? null;
  }, [game, me]);

  const myTurn = game?.status === "ACTIVE" && mySeat != null && game.turn === mySeat;
  const myHand = useMemo(() => sortCards(game?.myHand ?? []), [game?.myHand]);
  // Gợi ý nước mở đầu: tới lượt mình, bàn trống và mình còn cầm lá mở đầu (openingCard).
  const openingCard = typeof game?.openingCard === "number" ? game.openingCard : null;
  const mustPlayOpening = !!(myTurn && game && game.currentCombo.length === 0 && openingCard != null && myHand.includes(openingCard));

  const toggleCard = useCallback((c: number) => {
    setSelected((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }, []);

  // ── Đang trong trận / kết thúc ──
  if (game && (phase === "playing" || phase === "finished")) {
    const finished = game.status !== "ACTIVE";
    const others = game.players.filter((p) => p.seat !== mySeat);
    const myPlace = mySeat != null ? game.players.find((p) => p.seat === mySeat)?.place : null;
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#08080f]">
        <div className="h-[52px] flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
          <Spade className="w-4.5 h-4.5 text-emerald-300 flex-shrink-0" />
          <span className="text-[14px] font-black text-white mr-2">Tiến Lên</span>
          {game.mode === "RANKED" && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300">XẾP HẠNG</span>}
          {game.mode === "WAGER" && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 flex items-center gap-1"><Coins className="w-3 h-3" />{game.pot} pot</span>}
          <div className="flex-1" />
          {!finished && <TurnClock game={game} />}
          {finished ? (
            <button onClick={leaveGame} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-bold transition-colors cursor-pointer">
              <RotateCw className="w-3.5 h-3.5" /> Về sảnh
            </button>
          ) : (
            <button onClick={resign} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[12px] font-bold transition-colors cursor-pointer">
              <Flag className="w-3.5 h-3.5" /> Đầu hàng
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-4 sm:p-6 flex flex-col items-center gap-5">
          {/* đối thủ — thẻ người chơi đầy đủ */}
          <div className="w-full max-w-[900px] flex flex-wrap items-center justify-center gap-3">
            {others.map((p) => (
              <button key={p.seat} onClick={() => p.userId && onOpenProfile?.(p.userId)} className="cursor-pointer">
                <PlayerCard p={p} active={!finished && game.turn === p.seat} isMe={false} />
              </button>
            ))}
          </div>

          {/* bàn — bộ hiện tại */}
          <div className="w-full max-w-[900px] rounded-3xl bg-gradient-to-b from-emerald-900/20 to-[#0c0c16] border border-emerald-500/10 p-8 flex flex-col items-center gap-3 min-h-[180px] justify-center shadow-[inset_0_0_40px_rgba(16,185,129,0.06)]">
            <span className="text-[11px] font-black uppercase tracking-widest text-emerald-300/50">Bài trên bàn</span>
            <ComboOnTable cards={game.currentCombo} />
            {lastChop && (
              <div className="text-[14px] font-black text-rose-300 animate-pop-in mt-1">
                💥 Chặt heo!{" "}
                {(lastChop.black || lastChop.red)
                  ? [lastChop.black ? `${lastChop.black} đen` : "", lastChop.red ? `${lastChop.red} đỏ ♥` : ""].filter(Boolean).join(" + ")
                  : `${lastChop.heoCount} heo`}
              </div>
            )}
          </div>

          {/* kết quả */}
          {finished && (() => {
            const rp = game.rpChange && me ? game.rpChange[me.id] : undefined;
            const coin = game.coinChange && me ? game.coinChange[me.id] : undefined;
            const won = (game.instantWin && game.instantWin.userId === me?.id) || myPlace === 1;
            const title = game.instantWin && game.instantWin.userId === me?.id ? "Tới trắng!" : myPlace === 1 ? "Về Nhất!" : myPlace != null ? `Về hạng ${myPlace}` : "Kết thúc";
            return (
              <GameEndOverlay
                kind={won ? "win" : myPlace != null ? "lose" : "draw"}
                title={title}
                subtitle={game.mode === "WAGER" && game.pot ? `Pot ${game.pot.toLocaleString("vi-VN")} xu` : undefined}
                rp={typeof rp === "number" ? rp : undefined}
                coins={typeof coin === "number" ? coin : undefined}
                onPrimary={leaveGame}
                primaryLabel="Về sảnh"
              />
            );
          })()}

          {/* bài của tôi */}
          <div className="w-full max-w-[900px]">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[12px] font-black uppercase tracking-wider text-neutral-500">Bài của bạn ({myHand.length})</span>
              {mustPlayOpening && openingCard != null && (
                <span className="text-[11px] font-bold text-amber-300">Nước mở đầu phải có {rankLabel(openingCard)}{suitLabel(openingCard)}</span>
              )}
              {myTurn && !mustPlayOpening && <span className="text-[12px] font-bold text-emerald-300 animate-pulse">● Tới lượt bạn</span>}
            </div>
            <div className="flex flex-wrap items-end gap-2 justify-center min-h-[72px]">
              {myHand.map((c) => (
                <Card key={c} card={c} selected={selected.includes(c)} disabled={!myTurn} onClick={() => toggleCard(c)} />
              ))}
              {myHand.length === 0 && <span className="text-[13px] text-neutral-600">Bạn đã hết bài.</span>}
            </div>
            {myTurn && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => { if (selected.length) { play(sortCards(selected)); } }}
                  disabled={selected.length === 0}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-default text-white text-[13px] font-black transition-all cursor-pointer active:scale-[0.98]"
                >
                  <Hand className="w-4 h-4" /> Đánh ({selected.length})
                </button>
                <button
                  onClick={() => pass()}
                  disabled={game.currentCombo.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40 disabled:cursor-default text-neutral-200 text-[13px] font-bold transition-all cursor-pointer"
                >
                  Bỏ lượt
                </button>
                {selected.length > 0 && (
                  <button onClick={() => setSelected([])} className="px-3 py-2.5 rounded-xl text-neutral-400 hover:text-white text-[13px] font-bold transition-colors cursor-pointer">Bỏ chọn</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Phòng lobby (đang chờ) ──
  if (room && !room.gameId) {
    const meMember = room.members.find((m) => m.userId === me?.id);
    const isHost = room.hostId === me?.id;
    const everyoneElseReady = room.members.filter((m) => !m.isHost).every((m) => m.ready);
    const canStart = isHost && room.members.length >= room.minPlayers && everyoneElseReady;
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#08080f]">
        <div className="h-[52px] flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
          <Users2 className="w-4.5 h-4.5 text-emerald-300 flex-shrink-0" />
          <span className="text-[14px] font-black text-white mr-2">Phòng {room.name || room.code}</span>
          {room.mode === "WAGER" && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 flex items-center gap-1"><Coins className="w-3 h-3" />{room.betAmount}/người</span>}
          <div className="flex-1" />
          <button onClick={leaveRoom} className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 text-[12px] font-bold transition-colors cursor-pointer">Rời phòng</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-5">
          <div className="max-w-[480px] mx-auto flex flex-col gap-4">
            {room.code && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[12px] text-neutral-400">Mã phòng</span>
                <span className="text-[15px] font-black text-white tracking-widest">{room.code}</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {room.members.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <Avatar url={m.user?.avatarUrl} name={m.user?.displayName || m.user?.username} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-white truncate">{m.user?.displayName || m.user?.username || "Người chơi"}</div>
                    <div className="text-[10px] text-neutral-500">{m.isHost ? "Chủ phòng" : m.ready ? "Đã sẵn sàng" : "Chưa sẵn sàng"}</div>
                  </div>
                  {m.isHost ? <Crown className="w-4 h-4 text-amber-400" /> : m.ready ? <span className="text-[11px] font-black text-emerald-300">✓</span> : <span className="text-[11px] text-neutral-600">…</span>}
                </div>
              ))}
              {Array.from({ length: Math.max(0, room.maxPlayers - room.members.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.01] border border-dashed border-white/[0.08] text-neutral-600 text-[12px]">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.03] flex items-center justify-center"><Plus className="w-4 h-4" /></div>
                  Đang chờ người chơi...
                </div>
              ))}
            </div>
            {isHost ? (
              <button onClick={startRoom} disabled={!canStart} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-default text-white text-[13px] font-black transition-all cursor-pointer">
                Bắt đầu ({room.members.length}/{room.maxPlayers})
              </button>
            ) : (
              <button onClick={toggleReady} className={`w-full py-3 rounded-xl text-[13px] font-black transition-all cursor-pointer ${meMember?.ready ? "bg-white/[0.06] text-neutral-300" : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white"}`}>
                {meMember?.ready ? "Huỷ sẵn sàng" : "Sẵn sàng"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Sảnh ──
  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#08080f]">
      <div className="h-[52px] flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a14]/60">
        <Spade className="w-4.5 h-4.5 text-emerald-300 flex-shrink-0" />
        <span className="text-[14px] font-black text-white">Tiến Lên Miền Nam</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-5">
        <div className="max-w-[560px] mx-auto flex flex-col gap-5">
          {/* tìm trận nhanh theo cỡ bàn */}
          <div className="relative rounded-2xl p-5 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-sky-500/10 border border-white/10 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
            <h3 className="text-[15px] font-black text-white mb-1">Tìm trận nhanh (xếp hạng)</h3>
            <p className="text-[12px] text-neutral-400 mb-3">Chọn số người. Đủ người là vào trận, ăn/trừ RP theo thứ hạng.</p>
            {phase === "queue" ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/10">
                  <Loader2 className="w-4 h-4 text-emerald-300 animate-spin" />
                  <span className="text-[12px] font-bold text-neutral-200">Đang tìm bàn {queueSize} người…</span>
                  {queueSize != null && (searching[String(queueSize)] ?? 0) > 0 && <span className="text-[11px] text-neutral-500">({searching[String(queueSize)]} đang chờ)</span>}
                </div>
                <button onClick={cancelQueue} className="px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 text-[12px] font-bold transition-colors cursor-pointer">Huỷ</button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[2, 3, 4].map((sz) => (
                  <button key={sz} onClick={() => findMatch(sz)} className="relative flex flex-col items-center gap-1 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white transition-all cursor-pointer active:scale-[0.98]">
                    <Users2 className="w-5 h-5 text-emerald-300" />
                    <span className="text-[13px] font-black">{sz} người</span>
                    {(searching[String(sz)] ?? 0) > 0 && <span className="absolute top-1.5 right-1.5 text-[9px] font-black text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded-full">{searching[String(sz)]}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* tạo / vào phòng cược */}
          <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.06]">
            <h3 className="text-[13px] font-black text-white mb-3 flex items-center gap-1.5"><Coins className="w-4 h-4 text-amber-400" /> Phòng cược xu / tuỳ chỉnh</h3>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[11px] text-neutral-400 w-16">Mức cược</label>
              <input type="number" min={0} value={bet} onChange={(e) => setBet(Math.max(0, parseInt(e.target.value) || 0))} className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-[13px] text-white outline-none focus:border-emerald-500/50" />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-[11px] text-neutral-400 w-16">Số người</label>
              <div className="flex gap-1">
                {[2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setMaxP(n)} className={`w-9 h-8 rounded-lg text-[12px] font-black transition-colors cursor-pointer ${maxP === n ? "bg-emerald-600 text-white" : "bg-white/[0.05] text-neutral-400 hover:bg-white/[0.1]"}`}>{n}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => createRoom({ betAmount: bet, maxPlayers: maxP, ranked: bet === 0 })} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[12px] font-black transition-all cursor-pointer active:scale-[0.98]">
                <Plus className="w-4 h-4" /> Tạo phòng
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Nhập mã phòng (TL-XXXX)" className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-[12px] text-white outline-none focus:border-emerald-500/50" />
              <button onClick={() => { if (joinCode.trim()) joinRoom({ code: joinCode.trim() }); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 text-[12px] font-bold transition-colors cursor-pointer">
                <LogIn className="w-4 h-4" /> Vào
              </button>
            </div>
          </div>

          {/* danh sách phòng công khai */}
          {(loadingRooms || rooms.length > 0) && (
            <div>
              <div className="flex items-center gap-2 px-1 mb-2">
                <Users2 className="w-4 h-4 text-neutral-500" />
                <span className="text-[12px] font-black uppercase tracking-wider text-neutral-500">Phòng công khai</span>
                <span className="flex-1 h-px bg-white/[0.06]" />
              </div>
              {loadingRooms ? (
                <div className="py-6 flex items-center justify-center"><Loader2 className="w-5 h-5 text-emerald-300 animate-spin" /></div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {rooms.map((r) => (
                    <button key={r.id} onClick={() => joinRoom({ roomId: r.id })} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] transition-colors cursor-pointer text-left">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0"><Spade className="w-4 h-4 text-emerald-300" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-bold text-neutral-200 truncate">{r.name || r.code}</div>
                        <div className="text-[10px] text-neutral-500">{r.members.length}/{r.maxPlayers} người{r.mode === "WAGER" ? ` · cược ${r.betAmount}` : ""}</div>
                      </div>
                      <LogIn className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* lịch sử */}
          <div>
            <div className="flex items-center gap-2 px-1 mb-2">
              <History className="w-4 h-4 text-neutral-500" />
              <span className="text-[12px] font-black uppercase tracking-wider text-neutral-500">Lịch sử đấu</span>
              <span className="flex-1 h-px bg-white/[0.06]" />
            </div>
            {loadingHistory ? (
              <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 text-emerald-300 animate-spin" /></div>
            ) : history.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <Trophy className="w-8 h-8 text-neutral-700" />
                <p className="text-[12px] text-neutral-600">Chưa có trận nào.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {history.map((g) => {
                  const mp = me ? g.players.find((p) => p.userId === me.id)?.place : null;
                  const win = mp === 1;
                  const rp = g.rpChange && me ? g.rpChange[me.id] : undefined;
                  const coin = g.coinChange && me ? g.coinChange[me.id] : undefined;
                  return (
                    <div key={g.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                      <span className={`w-1.5 h-8 rounded-full flex-shrink-0 ${win ? "bg-amber-400" : "bg-neutral-600"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-bold text-neutral-200">{g.players.length} người · {g.mode === "WAGER" ? "Cược xu" : g.mode === "RANKED" ? "Xếp hạng" : "Giao hữu"}</div>
                        <div className="text-[10px] text-neutral-500">{mp ? `Về hạng ${mp}` : "—"}</div>
                      </div>
                      {typeof rp === "number" ? <span className={`text-[11px] font-black ${rp >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{rp > 0 ? "+" : ""}{rp} RP</span>
                        : typeof coin === "number" ? <span className={`text-[11px] font-black ${coin >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{coin > 0 ? "+" : ""}{coin} xu</span> : null}
                    </div>
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
