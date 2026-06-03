# 🚀 Quy trình phát hành (Release Runbook) — HTSS Launcher

> **Dành cho AI agent:** Khi người dùng đưa file này vào chat (hoặc nói "chạy RELEASE.md", "release bản mới", "phát hành phiên bản mới"), hãy **tự động thực hiện toàn bộ các bước trong mục [QUY TRÌNH TỰ ĐỘNG](#quy-trình-tự-động) theo đúng thứ tự**. Nếu người dùng không nói rõ loại tăng version, mặc định tăng **patch** (ví dụ `0.9.9` → `0.9.10`). Nếu người dùng cung cấp nội dung changelog, dùng nội dung đó; nếu không, tự tổng hợp changelog từ các thay đổi trong phiên làm việc gần nhất.

---

## 📋 Thông tin dự án

| Mục | Giá trị |
| --- | --- |
| Tên sản phẩm | `htssclub` |
| GitHub repo | `dxxce/htssclub-launcher` |
| Bộ cài đặt (NSIS) | `src-tauri/target/release/bundle/nsis/htssclub_<version>_x64-setup.exe` |
| Lệnh build | `npm run tauri build` |
| Lệnh publish | `npm run publish` |
| Auto-updater | `check_for_updates` trong `src-tauri/src/lib.rs` (đọc release mới nhất từ GitHub) |

## 🗂️ Các file chứa version (PHẢI đồng bộ cùng một số)

1. `package.json` → khóa `"version"`
2. `src-tauri/tauri.conf.json` → khóa `"version"`
3. `src-tauri/Cargo.toml` → `[package]` → `version`
4. `src-tauri/Cargo.lock` → block `name = "app"` → `version` (ngay dưới dòng tên)

> ⚠️ Cả 4 nơi phải cùng một version. Nếu lệch, NSIS sẽ tạo file tên khác với cái `publish.js` đi tìm → publish thất bại.

## ✅ Điều kiện cần (chỉ cài 1 lần)

- **Rust + Cargo**, **Node.js + npm**, **Tauri CLI** (`@tauri-apps/cli` đã có trong devDependencies).
- **GitHub CLI** đã đăng nhập:
  ```powershell
  winget install --id GitHub.cli
  gh auth login
  ```

---

## 🤖 QUY TRÌNH TỰ ĐỘNG

> Agent thực hiện tuần tự. Dừng lại và báo người dùng nếu có bước thất bại.

### Bước 1 — Xác định version mới
- Đọc version hiện tại trong `package.json`.
- Tăng theo yêu cầu người dùng (mặc định **patch +1**). Ví dụ `0.9.9` → `0.9.10`.
- Gọi version mới là `<NEW>`.

### Bước 2 — Cập nhật version ở cả 4 file
Sửa thành `<NEW>` tại:
- `package.json` (`"version"`)
- `src-tauri/tauri.conf.json` (`"version"`)
- `src-tauri/Cargo.toml` (`version` trong `[package]`)
- `src-tauri/Cargo.lock` (`version` trong block `name = "app"`)

### Bước 3 — Cập nhật `changelog.txt`
- Đặt tiêu đề dòng đầu: `### 👾 Bản cập nhật v<NEW>`.
- Liệt kê các thay đổi (theo người dùng cung cấp, hoặc tổng hợp từ phiên làm việc).
- Giữ tiếng Việt, gạch đầu dòng, nhóm theo chủ đề nếu nhiều mục.

### Bước 4 — Build bộ cài đặt
Chạy (background process, có thể mất vài phút):
```powershell
npm run tauri build
```
- `cwd`: thư mục gốc dự án.
- Chờ đến khi thấy: `Finished 2 bundles at:` và file `htssclub_<NEW>_x64-setup.exe`.

### Bước 5 — Kiểm tra installer tồn tại
```
dir "src-tauri\target\release\bundle\nsis\htssclub_<NEW>_x64-setup.exe"
```
- Nếu không có file → báo lỗi, dừng (thường do build fail hoặc version lệch).

### Bước 6 — Publish lên GitHub Releases
```powershell
npm run publish
```
- `scripts/publish.js` tự tạo tag `v<NEW>`, tải installer + changelog lên GitHub.
- Nếu release `v<NEW>` đã tồn tại, script tự cập nhật và tải đè (`--clobber`).
- Thành công khi thấy: `🎉 ĐÃ ĐĂNG TẢI PHIÊN BẢN MỚI LÊN GITHUB THÀNH CÔNG!`

### Bước 7 — Báo cáo kết quả
- Xác nhận version mới, đường dẫn installer, và link release.
- Người dùng trong app sẽ nhận được thông báo cập nhật qua auto-updater.

---

## 🧯 Xử lý sự cố nhanh

| Triệu chứng | Nguyên nhân & cách xử lý |
| --- | --- |
| `KHÔNG TÌM THẤY BỘ CÀI ĐẶT` khi publish | Chưa build, hoặc version 4 file bị lệch. Kiểm tra Bước 2, build lại. |
| `gh: command not found` / chưa đăng nhập | Cài GitHub CLI và `gh auth login`. |
| Release đã tồn tại | `publish.js` tự xử lý (edit + upload --clobber). Không cần làm gì thêm. |
| Build lỗi Rust | Chạy `cargo build` trong `src-tauri` để xem lỗi chi tiết. |
| Auto-updater không thấy bản mới | Kiểm tra `owner`/`repo` trong `check_for_updates` (`src-tauri/src/lib.rs`) khớp repo thật. |

## 📝 Ghi chú

- Bản MSI (`bundle/msi/htssclub_<NEW>_x64_en-US.msi`) cũng được tạo nhưng `publish.js` chỉ đẩy file `.exe` (NSIS). Auto-updater chỉ dùng `.exe`.
- Không cần commit/push code để publish — `publish.js` chỉ thao tác với GitHub Releases. Nếu muốn lưu lịch sử mã nguồn, hãy commit riêng.
