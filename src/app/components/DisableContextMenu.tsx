"use client";

import { useEffect } from "react";

/**
 * Tắt menu chuột phải mặc định của WebView trên toàn ứng dụng.
 * Vẫn cho phép menu mặc định trong ô nhập liệu (input/textarea/contentEditable)
 * để người dùng dán/sao chép văn bản bình thường.
 */
export default function DisableContextMenu() {
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest("input, textarea, [contenteditable='true'], [data-allow-context]")) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, []);
  return null;
}
