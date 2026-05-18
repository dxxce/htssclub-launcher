"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, ShoppingCart, Package, Moon, Play, Pause, X, Clock, Volume2, VolumeX, Maximize2, SkipForward } from "lucide-react";

const VP_CURRENCY = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";

interface SkinLevel {
  uuid: string;
  displayName: string;
  displayIcon: string | null;
  streamedVideo: string | null;
  levelItem: string | null;
}
interface SkinChroma {
  uuid: string;
  displayName: string;
  displayIcon: string | null;
  fullRender: string | null;
  swatch: string | null;
  streamedVideo: string | null;
}
interface SkinFull {
  uuid: string;
  displayName: string;
  displayIcon: string;
  levels: SkinLevel[];
  chromas: SkinChroma[];
  price: number;
}
interface SkinItem {
  uuid: string;
  displayName: string;
  displayIcon: string;
  streamedVideo: string | null;
  price: number;
  skinFull?: SkinFull;
}

interface BundleWeaponItem {
  uuid: string;
  displayName: string;
  displayIcon: string;
  basePrice: number;
  discountedPrice: number;
  skinFull: SkinFull | null;
}
interface BundleItem {
  uuid: string;
  displayName: string;
  displayIcon: string;
  basePrice: number;
  discountedPrice: number;
  remainingSeconds: number;
  items: BundleWeaponItem[];
}

interface NightMarketItem {
  uuid: string;
  displayName: string;
  displayIcon: string;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  skinFull: SkinFull | null;
}

// Cache to avoid re-fetching
const skinCache: Record<string, SkinFull | null> = {};

async function fetchSkinByLevelId(levelUuid: string, price: number): Promise<SkinFull | null> {
  if (skinCache[levelUuid] !== undefined) return skinCache[levelUuid];
  try {
    // First get the level to find name/icon
    const lvlRes = await fetch(`https://valorant-api.com/v1/weapons/skinlevels/${levelUuid}`);
    const lvlJson = await lvlRes.json();
    if (lvlJson.status !== 200) { skinCache[levelUuid] = null; return null; }
    const lvlData = lvlJson.data;

    // Find parent skin using the level's assetPath pattern
    // Try: scan weapons to find which skin contains this level
    // Lightweight: use the skin name from level to find parent via skins search
    const searchName = encodeURIComponent(lvlData.displayName.replace(/ Level \d+.*$/, '').trim());
    const skinsRes = await fetch(`https://valorant-api.com/v1/weapons/skins?language=en-US`);
    const skinsJson = await skinsRes.json();
    if (skinsJson.status !== 200) {
      const fallback: SkinFull = {
        uuid: levelUuid,
        displayName: lvlData.displayName,
        displayIcon: lvlData.displayIcon || '',
        levels: [{ uuid: levelUuid, displayName: lvlData.displayName, displayIcon: lvlData.displayIcon, streamedVideo: lvlData.streamedVideo || null, levelItem: null }],
        chromas: [],
        price,
      };
      skinCache[levelUuid] = fallback;
      return fallback;
    }
    const parentSkin = skinsJson.data.find((s: any) => s.levels?.some((l: any) => l.uuid === levelUuid));
    if (!parentSkin) {
      skinCache[levelUuid] = null;
      return null;
    }
    const result: SkinFull = {
      uuid: parentSkin.uuid,
      displayName: parentSkin.displayName,
      displayIcon: parentSkin.displayIcon || parentSkin.levels?.[0]?.displayIcon || '',
      levels: parentSkin.levels || [],
      chromas: parentSkin.chromas || [],
      price,
    };
    skinCache[levelUuid] = result;
    return result;
  } catch { skinCache[levelUuid] = null; return null; }
}

// Item type UUIDs from Valorant API
const ITEM_TYPE = {
  SKIN_LEVEL:   'e7c63390-eda7-46e0-bb7a-a6abdacd2433',
  BUDDY_LEVEL:  'dd3bf334-87f3-40bd-b043-682a57a8dc3a',
  PLAYER_CARD:  '3f296c07-64c3-494c-923b-fe692a4fa1bd',
  SPRAY:        'd5f120f8-ff8c-4aac-92ea-f2b5acbe9475',
  TITLE:        'de7caa6b-adf7-4588-bbd1-143831e786c6',
};

const genericCache: Record<string, { displayName: string; displayIcon: string } | null> = {};

let sprayMap: Record<string, { displayName: string; displayIcon: string }> | null = null;

async function loadSprayMap() {
  if (sprayMap) return sprayMap;
  try {
    const res = await fetch('https://valorant-api.com/v1/sprays');
    const json = await res.json();
    if (json.status === 200) {
      const map: Record<string, { displayName: string; displayIcon: string }> = {};
      for (const spray of json.data) {
        const icon = spray.fullTransparentIcon || spray.fullIcon || spray.displayIcon || spray.animationGif || '';
        map[spray.uuid] = { displayName: spray.displayName, displayIcon: icon };
        if (spray.levels) {
          for (const lvl of spray.levels) {
            map[lvl.uuid] = { displayName: spray.displayName, displayIcon: lvl.displayIcon || icon };
          }
        }
      }
      sprayMap = map;
      return map;
    }
  } catch (e) {
    console.error('Failed to load spray map:', e);
  }
  return null;
}

async function fetchGenericItem(typeId: string, itemId: string): Promise<{ displayName: string; displayIcon: string } | null> {
  const key = typeId + itemId;
  if (genericCache[key] !== undefined) return genericCache[key];
  try {
    let url = '';
    if (typeId === ITEM_TYPE.BUDDY_LEVEL) {
      const res = await fetch(`https://valorant-api.com/v1/buddies/levels/${itemId}`);
      const json = await res.json();
      if (json.status === 200) {
        const d = json.data;
        genericCache[key] = { displayName: d.displayName, displayIcon: d.displayIcon || '' };
        return genericCache[key];
      }
      genericCache[key] = null;
      return null;
    }
    else if (typeId === ITEM_TYPE.PLAYER_CARD) url = `https://valorant-api.com/v1/playercards/${itemId}`;
    else if (typeId === ITEM_TYPE.SPRAY) {
      const map = await loadSprayMap();
      if (map && map[itemId]) {
        genericCache[key] = map[itemId];
        return map[itemId];
      }
      // Fallback direct request
      const directRes = await fetch(`https://valorant-api.com/v1/sprays/${itemId}`);
      const directJson = await directRes.json();
      if (directJson.status === 200) {
        const d = directJson.data;
        const icon = d.fullTransparentIcon || d.fullIcon || d.displayIcon || d.animationGif || '';
        genericCache[key] = { displayName: d.displayName, displayIcon: icon };
        return genericCache[key];
      }
      genericCache[key] = null;
      return null;
    }
    else if (typeId === ITEM_TYPE.TITLE)   { genericCache[key] = { displayName: 'Player Title', displayIcon: '' }; return genericCache[key]; }
    else { genericCache[key] = null; return null; }
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 200) { genericCache[key] = null; return null; }
    const d = json.data;
    const icon = d.displayIcon || d.fullIcon || d.wideArt || d.swatch || '';
    genericCache[key] = { displayName: d.displayName, displayIcon: icon };
    return genericCache[key];
  } catch { genericCache[key] = null; return null; }
}

async function fetchBundleInfo(uuid: string): Promise<{ displayName: string; displayIcon: string } | null> {
  try {
    const res = await fetch(`https://valorant-api.com/v1/bundles/${uuid}`);
    const json = await res.json();
    if (json.status === 200) {
      return {
        displayName: json.data.displayName,
        displayIcon: json.data.displayIcon2 || json.data.displayIcon,
      };
    }
  } catch {}
  return null;
}

function formatVP(amount: number) {
  return amount.toLocaleString("vi-VN");
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)} ngày`;
  return `${h}g ${m}p`;
}

function SkinViewerModal({ skin, onClose }: { skin: SkinFull; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeLevel, setActiveLevel] = useState(0);
  const [activeChroma, setActiveChroma] = useState(0);
  const [lastPicked, setLastPicked] = useState<'level' | 'chroma'>('level');


  // User last picked level → prefer level video; last picked chroma → prefer chroma video
  const currentChroma = skin.chromas[activeChroma];
  const currentLevel = skin.levels[activeLevel];
  const videoUrl = lastPicked === 'chroma' ? (currentChroma?.streamedVideo ?? null) : (currentLevel?.streamedVideo ?? null);
  const effectiveVideo = videoUrl ?? (lastPicked === 'chroma' ? currentLevel?.streamedVideo : currentChroma?.streamedVideo) ?? null;
  const displayIcon = currentChroma?.fullRender || currentLevel?.displayIcon || skin.displayIcon;

  const handleLevelClick = (idx: number) => { setActiveLevel(idx); setLastPicked('level'); };
  const handleChromaClick = (idx: number) => { setActiveChroma(idx); setLastPicked('chroma'); };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true); }
    else { videoRef.current.pause(); setPlaying(false); }
  };
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setMuted(v => !v);
  };
  const handleFullscreen = () => videoRef.current?.requestFullscreen?.();
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100 || 0);
  };
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pct * videoRef.current.duration;
  };

  useEffect(() => {
    setPlaying(true);
    setProgress(0);
    if (videoRef.current) videoRef.current.load();
  }, [effectiveVideo]);

  const levelLabel = (item: string | null) => {
    if (!item) return '';
    return item.replace('EEquippableSkinLevelItem::', '');
  };

  return (
    <div className="fixed top-0 bottom-0 right-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm" style={{ left: '260px' }} onClick={onClose}>
      <div
        className="relative w-full max-w-[820px] mx-6 bg-[#0c0c0f] border border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.8)] flex flex-col"
        style={{ maxHeight: 'calc(100vh - 56px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
          {skin.displayIcon && (
            <img src={skin.displayIcon} alt="" className="w-9 h-9 object-contain rounded-lg bg-white/5 p-1 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm leading-tight truncate">{skin.displayName}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <img src="https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png" alt="VP" className="w-3 h-3" />
              <span className="text-yellow-400 font-bold text-xs">{formatVP(skin.price)} VP</span>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/5 hover:bg-red-500/30 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0">
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>

        <div className="flex">
          {/* Video / Image */}
          <div className="flex-1 flex flex-col">
            <div className="relative bg-black aspect-video">
              { effectiveVideo ? (
                <video
                  ref={videoRef}
                  src={effectiveVideo}
                  autoPlay
                  loop
                  className="w-full h-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
              ) : (
                <img src={displayIcon || ''} alt={skin.displayName} className="w-full h-full object-contain p-8" />
              )}
            </div>

            {/* Controls */}
            { effectiveVideo && (
              <div className="px-4 py-2.5 bg-[#080809] border-t border-white/[0.05] flex-shrink-0">
                {/* Progress bar */}
                <div className="group h-1 bg-white/10 rounded-full cursor-pointer mb-2.5 relative" onClick={handleSeek}>
                  <div className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full" style={{ width: `${progress}%` }}>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progress}% - 5px)` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={togglePlay} className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer border border-white/[0.06]">
                    {playing ? <Pause className="w-3 h-3 text-white fill-white" /> : <Play className="w-3 h-3 text-white fill-white ml-0.5" />}
                  </button>
                  <button onClick={toggleMute} className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer border border-white/[0.06]">
                    {muted ? <VolumeX className="w-3 h-3 text-white" /> : <Volume2 className="w-3 h-3 text-white" />}
                  </button>
                  <div className="flex-1" />
                  <span className="text-neutral-700 text-[10px] tabular-nums">{Math.round(progress)}%</span>
                  <button onClick={handleFullscreen} className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer border border-white/[0.06]">
                    <Maximize2 className="w-3 h-3 text-white" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Side Panel */}
          <div
            className="w-44 flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-[#09090c] overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' } as React.CSSProperties}
          >
            {/* Levels */}
            {skin.levels.length >= 1 && (
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-0.5 h-3 bg-red-500 rounded-full" />
                  <p className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.15em]">Levels</p>
                </div>
                <div className="flex flex-col gap-0.5">
                  {skin.levels.map((lv, idx) => {
                    const active = activeLevel === idx;
                    return (
                      <button key={lv.uuid} onClick={() => handleLevelClick(idx)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer border ${
                          active ? 'bg-red-500/15 text-red-400 border-red-500/25' : 'text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.04] border-transparent'
                        }`}>
                        <div className="font-bold flex items-center gap-1.5">
                          {lv.streamedVideo && <Play className="w-2.5 h-2.5 fill-current opacity-50 flex-shrink-0" />}
                          Level {idx + 1}
                        </div>
                        {lv.levelItem && <div className="text-[9px] mt-0.5 opacity-50">{levelLabel(lv.levelItem)}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Chromas */}
            {skin.chromas.length > 1 && (
              <div className="p-3 border-t border-white/[0.04]">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-0.5 h-3 bg-yellow-500 rounded-full" />
                  <p className="text-[9px] font-black text-neutral-500 uppercase tracking-[0.15em]">Chromas</p>
                </div>
                <div className="flex flex-col gap-0.5">
                  {skin.chromas.map((ch, idx) => {
                    const active = activeChroma === idx;
                    const label = idx === 0 ? 'Default' : (ch.displayName.split('\n').pop()?.replace(/[()]/g,'').trim() || `Variant ${idx}`);
                    return (
                      <button key={ch.uuid} onClick={() => handleChromaClick(idx)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer border ${
                          active ? 'bg-yellow-500/12 text-yellow-400 border-yellow-500/25' : 'text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.04] border-transparent'
                        }`}>
                        {ch.swatch
                          ? <img src={ch.swatch} alt="" className={`w-5 h-5 rounded-full object-cover flex-shrink-0 ring-1 ${active ? 'ring-yellow-500/60' : 'ring-white/10'}`} />
                          : <div className={`w-5 h-5 rounded-full bg-white/10 flex-shrink-0 ring-1 ${active ? 'ring-yellow-500/60' : 'ring-white/10'}`} />
                        }
                        <span className="font-semibold truncate text-[11px]">{label}</span>
                        {ch.streamedVideo && <Play className="w-2 h-2 fill-current opacity-40 flex-shrink-0 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkinCard({ item, onWatch }: { item: SkinItem; onWatch: () => void }) {
  return (
    <div className="group relative bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden hover:border-red-500/30 hover:bg-white/[0.06] transition-all duration-300 cursor-pointer flex flex-col">
      <div className="relative h-44 flex items-center justify-center p-6 bg-gradient-to-b from-white/[0.02] to-transparent">
        {item.displayIcon ? (
          <img src={item.displayIcon} alt={item.displayName} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500 drop-shadow-2xl" />
        ) : (
          <div className="w-full h-full rounded-xl bg-white/5 flex items-center justify-center">
            <Package className="w-10 h-10 text-white/20" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onWatch(); }}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50"
        >
          <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_25px_rgba(239,68,68,0.6)]">
            <Play className="w-5 h-5 fill-white text-white ml-0.5" />
          </div>
        </button>
      </div>
      <div className="p-4 border-t border-white/5 bg-black/20 mt-auto">
        <p className="text-white font-bold text-sm truncate group-hover:text-red-400 transition-colors">{item.displayName}</p>
        <div className="flex items-center gap-1.5 mt-2">
          <img src="https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png" alt="VP" className="w-4 h-4" />
          <span className="text-yellow-400 font-bold text-sm">{formatVP(item.price)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ValorantStore() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailySkins, setDailySkins] = useState<SkinItem[]>([]);
  const [bundles, setBundles] = useState<BundleItem[]>([]);
  const [nightMarket, setNightMarket] = useState<NightMarketItem[]>([]);
  const [remainingTime, setRemainingTime] = useState(0);
  const [activeSkin, setActiveSkin] = useState<SkinFull | null>(null);
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"daily" | "bundle" | "night">("daily");
  const [openingRiot, setOpeningRiot] = useState(false);
  const [revealedNM, setRevealedNM] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('nm_revealed') || '[]')); } catch { return new Set(); }
  });
  const revealNM = (uuid: string) => {
    setRevealedNM(prev => {
      const next = new Set(prev);
      next.add(uuid);
      localStorage.setItem('nm_revealed', JSON.stringify([...next]));
      return next;
    });
  };

  const handleOpenRiotClient = async () => {
    setOpeningRiot(true);
    try {
      await invoke("open_riot_client");
      // Auto reload after 6 seconds to give Riot Client time to generate lockfile and run in background
      setTimeout(() => {
        loadStore();
        setOpeningRiot(false);
      }, 6000);
    } catch (err: any) {
      alert("Không thể khởi động Riot Client: " + err.toString());
      setOpeningRiot(false);
    }
  };

  async function loadStore() {
    try {
      setLoading(true);
      setError(null);

      const creds = await invoke<any>("get_riot_credentials");
      const storefront = await invoke<any>("fetch_valorant_storefront", {
        req: {
          puuid: creds.puuid,
          auth_token: creds.auth_token,
          entitlement_token: creds.entitlement_token,
          shard: creds.shard,
        },
      });

      // --- Daily Skins ---
      const singleOffers: any[] = storefront?.SkinsPanelLayout?.SingleItemStoreOffers || [];
      setRemainingTime(storefront?.SkinsPanelLayout?.SingleItemOffersRemainingDurationInSeconds || 0);

      const skinPromises = singleOffers.map(async (offer: any) => {
        const uuid = offer.OfferID;
        const price = offer.Cost?.[VP_CURRENCY] || 0;
        const skinFull = await fetchSkinByLevelId(uuid, price);
        if (!skinFull) return null;
        const lv1 = skinFull.levels[0];
        return {
          uuid,
          price,
          displayName: skinFull.displayName,
          displayIcon: skinFull.displayIcon || lv1?.displayIcon || '',
          streamedVideo: lv1?.streamedVideo || null,
          skinFull,
        } as SkinItem;
      });
      const skins = (await Promise.all(skinPromises)).filter(Boolean) as SkinItem[];
      setDailySkins(skins);

      // --- Bundles ---
      const bundleList: any[] = storefront?.FeaturedBundle?.Bundles ||
                                 (storefront?.FeaturedBundle?.Bundle ? [storefront.FeaturedBundle] : []);
      const bundlePromises = bundleList.map(async (b: any) => {
        const bundleData = b?.Bundle || b;
        const dataAssetId = bundleData?.DataAssetID;
        const basePrice = bundleData?.TotalBaseCost?.[VP_CURRENCY] || 0;
        const discountedPrice = bundleData?.TotalDiscountedCost?.[VP_CURRENCY] || basePrice;
        const remaining = b?.BundleRemainingDurationInSeconds || bundleData?.DurationRemainingInSeconds || 0;
        if (!dataAssetId) return null;
        const info = await fetchBundleInfo(dataAssetId);
        if (!info) return null;
        // Parse bundle items (skins + buddies + cards + sprays)
        const rawItems: any[] = bundleData?.Items || [];
        const itemPromises = rawItems.map(async (it: any) => {
          const itemId = it?.Item?.ItemID;
          const typeId = it?.Item?.ItemTypeID || '';
          if (!itemId) return null;
          const iBasePrice = it?.BasePrice || 0;
          const iDiscPrice = it?.DiscountedPrice ?? iBasePrice;
          if (typeId === ITEM_TYPE.SKIN_LEVEL) {
            const sf = await fetchSkinByLevelId(itemId, iBasePrice);
            if (!sf) return null;
            return { uuid: itemId, displayName: sf.displayName, displayIcon: sf.displayIcon, basePrice: iBasePrice, discountedPrice: iDiscPrice, skinFull: sf } as BundleWeaponItem;
          } else {
            const g = await fetchGenericItem(typeId, itemId);
            if (!g) return null;
            return { uuid: itemId, displayName: g.displayName, displayIcon: g.displayIcon, basePrice: iBasePrice, discountedPrice: iDiscPrice, skinFull: null } as BundleWeaponItem;
          }
        });
        const items = (await Promise.all(itemPromises)).filter(Boolean) as BundleWeaponItem[];
        return { uuid: dataAssetId, basePrice, discountedPrice, remainingSeconds: remaining, items, ...info } as BundleItem;
      });
      const bundleResults = (await Promise.all(bundlePromises)).filter(Boolean) as BundleItem[];
      setBundles(bundleResults);

      // --- Night Market ---
      const bonusOffers: any[] = storefront?.BonusStore?.BonusStoreOffers || [];
      const nmPromises = bonusOffers.map(async (b: any) => {
        const uuid = b?.Offer?.OfferID;
        if (!uuid) return null;
        const originalPrice = b?.Offer?.Cost?.[VP_CURRENCY] || 0;
        const discountedPrice = b?.DiscountCosts?.[VP_CURRENCY] || 0;
        const discountPercent = b?.DiscountPercent || 0;
        const skinFull = await fetchSkinByLevelId(uuid, discountedPrice);
        if (!skinFull) return null;
        const lv1 = skinFull.levels[0];
        return {
          uuid,
          originalPrice,
          discountedPrice,
          discountPercent,
          displayName: skinFull.displayName,
          displayIcon: skinFull.displayIcon || lv1?.displayIcon || '',
          skinFull,
        } as NightMarketItem;
      });
      const nmResults = (await Promise.all(nmPromises)).filter(Boolean) as NightMarketItem[];
      setNightMarket(nmResults);

    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStore();
  }, []);

  const tabs = [
    { id: "daily", label: "Cửa Hàng Hôm Nay", icon: ShoppingCart, count: dailySkins.length },
    { id: "bundle", label: "Bundle", icon: Package, count: bundles.length },
    { id: "night", label: "Night Market", icon: Moon, count: nightMarket.length },
  ] as const;

  if (error && !loading) {
    const isRiotClientError = error.includes("Riot Client") ||
                              error.includes("lockfile") ||
                              error.includes("127.0.0.1") ||
                              error.includes("request for url") ||
                              error.includes("region");

    if (isRiotClientError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[350px] bg-gradient-to-b from-red-500/[0.03] to-transparent border border-red-500/10 rounded-2xl mt-6 select-none">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-5 animate-pulse">
            <Package className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-white font-black text-xl mb-2">Riot Client Chưa Được Mở</h3>
          <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed mb-6">
            Cửa hàng Valorant cần Riot Client đang chạy ở chế độ nền để tự động lấy thông tin tài khoản của bạn.
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
              onClick={loadStore}
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-red-500/5 rounded-2xl border border-red-500/10 p-8 text-center mt-6 select-none">
        <Package className="w-12 h-12 text-red-500 mb-4 opacity-50" />
        <h3 className="text-xl font-bold text-white mb-2">Không thể tải dữ liệu cửa hàng</h3>
        <p className="text-neutral-400 text-sm max-w-md">{error}</p>
        <button
          onClick={loadStore}
          className="px-6 py-2.5 mt-4 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-xl font-bold text-sm border border-white/10 transition-colors cursor-pointer"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Valorant Store</h1>
          {!loading && remainingTime > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 text-neutral-400 text-sm">
              <Clock className="w-3.5 h-3.5" />
              <span>Hết hạn sau <span className="text-white font-semibold">{formatTime(remainingTime)}</span></span>
            </div>
          )}
        </div>
        <button
          onClick={loadStore}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-neutral-300 hover:text-white transition-all cursor-pointer disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06] mb-6 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === tab.id
                ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? "bg-white/20" : "bg-white/10"}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex-1 flex items-center justify-center min-h-[300px]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(239,68,68,0.4)]" />
            <p className="text-neutral-400 text-sm">Đang tải cửa hàng...</p>
          </div>
        </div>
      )}

      {/* Daily Skins */}
      {!loading && !error && activeTab === "daily" && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {dailySkins.length === 0 ? (
            <p className="col-span-4 text-center text-neutral-500 py-16">Không tìm thấy skin nào hôm nay.</p>
          ) : (
            dailySkins.map(item => (
              <SkinCard key={item.uuid} item={item} onWatch={() => item.skinFull && setActiveSkin(item.skinFull)} />
            ))
          )}
        </div>
      )}

      {/* Bundles */}
      {!loading && !error && activeTab === "bundle" && (
        <div className="flex flex-col gap-6">
          {bundles.length === 0 ? (
            <p className="text-center text-neutral-500 py-16">Không có bundle nào đang hiển thị.</p>
          ) : (
            bundles.map(b => (
              <div key={b.uuid} className="rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.02]">
                {/* Banner */}
                <div className="relative cursor-pointer" onClick={() => setExpandedBundle(expandedBundle === b.uuid ? null : b.uuid)}>
                  <img src={b.displayIcon} alt={b.displayName} className="w-full h-52 object-cover opacity-80" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-5 flex items-end justify-between w-full">
                    <div>
                      <p className="text-white font-black text-xl">{b.displayName}</p>
                      {b.remainingSeconds > 0 && (
                        <div className="flex items-center gap-1.5 mt-1 text-neutral-300 text-xs">
                          <Clock className="w-3 h-3" />
                          <span>Còn <span className="text-white font-semibold">{formatTime(b.remainingSeconds)}</span></span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {b.discountedPrice !== b.basePrice && (
                        <span className="text-neutral-400 text-xs line-through flex items-center gap-1">
                          <img src="https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png" alt="VP" className="w-3 h-3" />{formatVP(b.basePrice)}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 bg-black/70 px-3 py-1.5 rounded-xl border border-white/10">
                        <img src="https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png" alt="VP" className="w-4 h-4" />
                        <span className="text-yellow-400 font-black text-base">{formatVP(b.discountedPrice)}</span>
                      </div>
                      <button className="text-xs text-neutral-400 hover:text-white transition-colors mt-1">
                        {expandedBundle === b.uuid ? 'Thu gọn ▲' : `Xem ${b.items.length} vật phẩm ▼`}
                      </button>
                    </div>
                  </div>
                </div>
                {/* Items Grid */}
                {expandedBundle === b.uuid && b.items.length > 0 && (
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 p-4 border-t border-white/[0.06] bg-black/20">
                    {b.items.map(item => (
                      <div key={item.uuid} className="group relative bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden hover:border-red-500/20 transition-all flex flex-col cursor-pointer"
                        onClick={() => item.skinFull && setActiveSkin(item.skinFull)}>
                        <div className="relative h-32 flex items-center justify-center p-4">
                          {item.displayIcon
                            ? <img src={item.displayIcon} alt={item.displayName} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300 drop-shadow-xl" />
                            : <Package className="w-8 h-8 text-white/20" />
                          }
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                            <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                              <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                            </div>
                          </div>
                        </div>
                        <div className="px-3 pb-3 mt-auto">
                          <p className="text-white text-xs font-semibold truncate group-hover:text-red-400 transition-colors">{item.displayName}</p>
                          <div className="flex items-center gap-1 mt-1.5">
                            {item.discountedPrice !== item.basePrice && (
                              <span className="text-neutral-500 text-[10px] line-through">{formatVP(item.basePrice)}</span>
                            )}
                            <img src="https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png" alt="VP" className="w-3 h-3" />
                            <span className="text-yellow-400 text-xs font-bold">{formatVP(item.discountedPrice)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Night Market */}
      {!loading && !error && activeTab === "night" && (
        <div>
          {nightMarket.length === 0 ? (
            <div className="text-center py-20">
              <Moon className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
              <p className="text-neutral-500 font-medium">Night Market hiện chưa có hoặc đã kết thúc.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {nightMarket.map(item => {
                const revealed = revealedNM.has(item.uuid);
                return (
                  <div key={item.uuid} className="group relative rounded-2xl overflow-hidden flex flex-col"
                    style={{ background: revealed ? 'rgba(168,85,247,0.04)' : 'rgba(88,28,135,0.15)', border: revealed ? '1px solid rgba(168,85,247,0.25)' : '1px solid rgba(168,85,247,0.15)' }}>
                    {revealed ? (
                      // Revealed: show skin + info + open viewer
                      <>
                        <div className="relative h-40 flex items-center justify-center p-6 bg-gradient-to-b from-purple-900/20 to-transparent cursor-pointer"
                          onClick={() => item.skinFull && setActiveSkin(item.skinFull)}>
                          {item.displayIcon && (
                            <img src={item.displayIcon} alt={item.displayName} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300 drop-shadow-2xl" />
                          )}
                          <div className="absolute top-2 right-2 bg-purple-500 text-white text-xs font-black px-2 py-1 rounded-lg shadow-[0_0_12px_rgba(168,85,247,0.5)]">
                            -{item.discountPercent}%
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.5)]">
                              <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                            </div>
                          </div>
                        </div>
                        <div className="p-4 border-t border-purple-500/10 bg-black/20">
                          <p className="text-white font-bold text-sm truncate">{item.displayName}</p>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center gap-1">
                              <img src="https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png" alt="VP" className="w-3.5 h-3.5" />
                              <span className="text-yellow-400 font-black text-sm">{formatVP(item.discountedPrice)}</span>
                            </div>
                            <span className="text-neutral-500 text-xs line-through">{formatVP(item.originalPrice)}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      // Locked: scratch card style
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] p-6 text-center cursor-pointer select-none"
                        onClick={() => revealNM(item.uuid)}>
                        <div className="w-16 h-16 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mb-4 group-hover:bg-purple-500/30 transition-colors">
                          <Moon className="w-8 h-8 text-purple-400" />
                        </div>
                        <p className="text-purple-300 font-black text-sm">Night Market</p>
                        <p className="text-neutral-500 text-xs mt-1">Nhấn để mở</p>
                        <div className="mt-3 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30">
                          <span className="text-purple-400 text-xs font-bold">??? VP</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Skin Viewer Modal */}
      {activeSkin && <SkinViewerModal skin={activeSkin} onClose={() => setActiveSkin(null)} />}
    </div>
  );
}
