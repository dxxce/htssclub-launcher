"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera, Loader2, Check, User as UserIcon, Coins, Quote, FileText } from "lucide-react";
import { useCommunityStore } from "../store/useCommunityStore";
import { toast } from "./Toast";
import AvatarCropper from "./AvatarCropper";

interface Props {
  onClose: () => void;
}

function initials(name?: string) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Cài đặt tài khoản cộng đồng: đổi tên hiển thị + upload avatar (có crop).
 */
export default function CommunityAccountSettings({ onClose }: Props) {
  const user = useCommunityStore((s) => s.user);
  const updateProfile = useCommunityStore((s) => s.updateProfile);
  const uploadAvatar = useCommunityStore((s) => s.uploadAvatar);

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [statusMessage, setStatusMessage] = useState(user?.statusMessage || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [savingName, setSavingName] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDisplayName(user?.displayName || "");
  }, [user?.displayName]);
  useEffect(() => { setStatusMessage(user?.statusMessage || ""); }, [user?.statusMessage]);
  useEffect(() => { setBio(user?.bio || ""); }, [user?.bio]);

  if (!user) return null;

  const nameChanged = displayName.trim() !== (user.displayName || "").trim() && displayName.trim().length > 0;
  const profileChanged =
    statusMessage.trim() !== (user.statusMessage || "").trim() ||
    bio.trim() !== (user.bio || "").trim();

  const pickFile = () => fileRef.current?.click();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại cùng file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn một tệp ảnh.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Ảnh quá lớn (tối đa 8MB).");
      return;
    }
    const url = URL.createObjectURL(file);
    setCropSrc(url);
  };

  const handleCropConfirm = async (blob: Blob) => {
    setUploadingAvatar(true);
    try {
      const url = await toast.promise(uploadAvatar(blob, "avatar.png"), {
        loading: "Đang tải ảnh lên...",
        success: "Đã tải ảnh lên!",
        error: (e) => e?.message || "Tải ảnh thất bại.",
      });
      await toast.promise(updateProfile({ avatarUrl: url }), {
        loading: "Đang cập nhật avatar...",
        success: "Đã cập nhật avatar!",
        error: (e) => e?.message || "Cập nhật thất bại.",
      });
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    } catch {
      /* toast đã báo */
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveName = async () => {
    if (!nameChanged || savingName) return;
    setSavingName(true);
    try {
      await toast.promise(updateProfile({ displayName: displayName.trim() }), {
        loading: "Đang lưu tên...",
        success: "Đã cập nhật tên hiển thị!",
        error: (e) => e?.message || "Cập nhật thất bại.",
      });
    } catch {
      /* toast đã báo */
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileChanged || savingProfile) return;
    setSavingProfile(true);
    try {
      await toast.promise(updateProfile({ statusMessage: statusMessage.trim(), bio: bio.trim() }), {
        loading: "Đang lưu hồ sơ...",
        success: "Đã cập nhật hồ sơ!",
        error: (e) => e?.message || "Cập nhật thất bại.",
      });
    } catch {
      /* toast đã báo */
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={() => !uploadingAvatar && !savingName && onClose()}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-[440px] glass rounded-2xl shadow-2xl animate-pop-in overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-px grad-hairline" />
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/[0.06]">
          <h3 className="text-base font-black text-white">Cài đặt tài khoản</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {cropSrc ? (
          <div className="p-6">
            <p className="text-[12px] text-neutral-400 mb-3 text-center font-semibold">Cắt ảnh đại diện</p>
            <AvatarCropper
              src={cropSrc}
              busy={uploadingAvatar}
              onCancel={() => {
                URL.revokeObjectURL(cropSrc);
                setCropSrc(null);
              }}
              onConfirm={handleCropConfirm}
            />
          </div>
        ) : (
          <div className="p-6">
            {/* Avatar + tên */}
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={pickFile}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center text-xl font-black text-white overflow-hidden group cursor-pointer flex-shrink-0 ${user.avatarUrl ? "bg-[#15151f]" : "bg-gradient-to-tr from-indigo-500 to-fuchsia-500"}`}
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  initials(user.displayName || user.username)
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-base font-black text-white truncate">{user.displayName || user.username}</div>
                <div className="text-[12px] text-neutral-500 truncate">@{user.username}</div>
                <button
                  onClick={pickFile}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-[12px] font-bold text-neutral-200 hover:bg-white/[0.1] transition-all cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Đổi ảnh đại diện
                </button>
              </div>
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

            {/* Tên hiển thị */}
            <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5">
              Tên hiển thị
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <UserIcon className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={32}
                  placeholder="Tên hiển thị của bạn"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 transition-all"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                />
              </div>
              <button
                onClick={handleSaveName}
                disabled={!nameChanged || savingName}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Lưu
              </button>
            </div>

            {/* Câu trạng thái */}
            <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5 mt-5">
              Câu trạng thái
            </label>
            <div className="relative">
              <Quote className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                maxLength={128}
                placeholder="Bạn đang nghĩ gì?"
                className="w-full pl-9 pr-14 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-600 tabular-nums">{statusMessage.length}/128</span>
            </div>

            {/* Giới thiệu (bio) */}
            <label className="block text-[11px] font-black uppercase tracking-widest text-neutral-500 mb-1.5 mt-4">
              Giới thiệu
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Giới thiệu đôi chút về bạn..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-violet-500/50 transition-all resize-none custom-scrollbar"
              />
              <span className="block text-right text-[10px] font-bold text-neutral-600 tabular-nums mt-1">{bio.length}/300</span>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={!profileChanged || savingProfile}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Lưu hồ sơ
            </button>

            {/* Thông tin chỉ đọc */}
            <div className="mt-5 flex flex-col gap-2">
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[12px] font-semibold text-neutral-400">Tên đăng nhập</span>
                <span className="text-[12px] font-bold text-neutral-200">@{user.username}</span>
              </div>
              {user.email && (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[12px] font-semibold text-neutral-400">Email</span>
                  <span className="text-[12px] font-bold text-neutral-200 truncate ml-2">{user.email}</span>
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[12px] font-semibold text-neutral-400">Số dư</span>
                <span className="flex items-center gap-1 text-[12px] font-black text-amber-300">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  {user.balance.toLocaleString("vi-VN")}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
