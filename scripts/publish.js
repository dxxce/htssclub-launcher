                                              const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Đọc phiên bản hiện tại từ package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = packageJson.version;
const tagName = `v${version}`;

// 2. Xác định đường dẫn file installer .exe dựa trên version
const installerName = `htssclub_${version}_x64-setup.exe`;
const installerPath = path.join(__dirname, `../src-tauri/target/release/bundle/nsis/${installerName}`);

console.log(`==================================================`);
console.log(`🚀 HTSS LAUNCHER AUTOMATED PUBLISH TOOL`);
console.log(`==================================================`);
console.log(`👉 Đang tải phiên bản: ${tagName}`);

if (!fs.existsSync(installerPath)) {
  console.error(`❌ KHÔNG TÌM THẤY BỘ CÀI ĐẶT TẠI: \n   ${installerPath}`);
  console.log(`\n💡 Gợi ý: Hãy chạy lệnh 'npm run tauri build' trước để tạo bộ cài đặt!`);
  process.exit(1);
}

console.log(`✅ Đã tìm thấy bộ cài đặt: ${installerName}`);

// 3. Đọc nhật ký cập nhật từ changelog.txt nếu có
let releaseNotes = `### 👾 Bản cập nhật ${tagName}\n- Tối ưu hóa hệ thống tự động cập nhật.\n- Cập nhật hiệu năng và sửa các lỗi nhỏ.`;
const changelogPath = path.join(__dirname, '../changelog.txt');

if (fs.existsSync(changelogPath)) {
  releaseNotes = fs.readFileSync(changelogPath, 'utf8');
  console.log(`📝 Đã đọc nội dung nhật ký cập nhật từ changelog.txt`);
} else {
  console.log(`📝 Sử dụng nhật ký cập nhật mặc định.`);
  console.log(`💡 Mẹo: Bạn có thể tạo file 'changelog.txt' ở thư mục gốc để ghi nhật ký tùy ý!`);
}

// 4. Kiểm tra xem người dùng đã cài đặt GitHub CLI (gh) chưa
try {
  execSync('gh --version', { stdio: 'ignore' });
} catch (e) {
  console.error(`\n❌ LỖI: Chưa cài đặt GitHub CLI ('gh') trên máy của bạn!`);
  console.log(`\n👉 HƯỚNG DẪN CÀI ĐẶT NHANH (Chỉ làm 1 lần duy nhất):`);
  console.log(`1. Mở PowerShell và chạy lệnh cài đặt:`);
  console.log(`   winget install --id GitHub.cli`);
  console.log(`2. Tắt và mở lại VS Code, sau đó đăng nhập tài khoản GitHub bằng lệnh:`);
  console.log(`   gh auth login`);
  process.exit(1);
}

// 5. Tiến hành tạo và đăng tải tệp lên GitHub Releases
const tempNotesPath = path.join(__dirname, '../temp_notes.md');
try {
  console.log(`\n📦 Đang tiến hành đẩy bộ cài đặt lên GitHub Releases...`);
  
  // Ghi nhật ký vào file tạm để tránh lỗi xuống dòng hoặc ký tự đặc biệt trên CLI
  fs.writeFileSync(tempNotesPath, releaseNotes, 'utf8');
  
  // Câu lệnh tạo và upload tệp bằng GitHub CLI
  const command = `gh release create ${tagName} "${installerPath}" --title "HTSS Launcher ${tagName}" --notes-file "${tempNotesPath}"`;
  
  execSync(command, { stdio: 'inherit' });
  
  console.log(`\n==================================================`);
  console.log(`🎉 ĐÃ ĐĂNG TẢI PHIÊN BẢN MỚI LÊN GITHUB THÀNH CÔNG!`);
  console.log(`==================================================`);
  console.log(`👉 Tất cả người dùng của bạn hiện tại đã có thể cập nhật lên phiên bản ${tagName}!`);
} catch (error) {
  console.error(`\n❌ Thất bại khi đẩy lên GitHub Releases. Vui lòng kiểm tra xem bạn đã đăng nhập tài khoản GitHub bằng 'gh auth login' chưa.`);
} finally {
  if (fs.existsSync(tempNotesPath)) {
    try {
      fs.unlinkSync(tempNotesPath);
    } catch (e) {}
  }
}
