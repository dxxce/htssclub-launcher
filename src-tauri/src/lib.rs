use std::fs;
use std::path::PathBuf;
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use tauri::http::Response;
use url::Url;
use percent_encoding::{percent_decode_str, utf8_percent_encode, NON_ALPHANUMERIC};
use std::sync::OnceLock;

#[tauri::command]
async fn create_pip_window(app: tauri::AppHandle, url: String, width: f64, height: f64) -> Result<(), String> {
    use tauri::Manager;
    
    // Close existing
    if let Some(window) = app.get_webview_window("htss-pip-window") {
        let _ = window.close();
    }
    
    // Create new
    let _ = tauri::WebviewWindowBuilder::new(
        &app,
        "htss-pip-window",
        tauri::WebviewUrl::App(url.parse().unwrap())
    )
    .title("HTSS PiP")
    .inner_size(width, height)
    .always_on_top(true)
    .decorations(false)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    
    Ok(())
}
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn create_silent_command<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RiotCredentials {
    pub port: String,
    pub password: String,
    pub auth_token: String,
    pub entitlement_token: String,
    pub puuid: String,
    pub shard: String,
    pub game_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedRiotAccount {
    pub puuid: String,
    pub game_name: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub shard: String,
    pub auth_token: String,
    pub entitlement_token: String,
    pub last_updated: u64,
    pub login_type: String, // "riot_client" hoặc "credentials"
    // Reauth cookies (ssid, ...) cho phép tự động gia hạn token khi hết hạn,
    // không cần đăng nhập lại. Mặc định None để tương thích file cũ.
    #[serde(default)]
    pub reauth_cookies: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActiveAccountConfig {
    pub puuid: Option<String>,
}

async fn riot_login(username: &str, password: &str) -> Result<(String, String, String, String), String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .cookie_store(true)
        .build()
        .map_err(|e| e.to_string())?;

    // Step 1: Khởi tạo session để lấy Cookies.
    //
    // Dùng luồng OAuth của Riot Client desktop (`client_id = riot-client`).
    // Luồng web `play-valorant-web-prod` hiện đã chặn đăng nhập bằng
    // username/password trực tiếp (yêu cầu hCaptcha) nên luôn trả về
    // `auth_failure` dù mật khẩu đúng. Luồng riot-client vẫn nhận trực tiếp.
    let init_url = "https://auth.riotgames.com/api/v1/authorization";
    let init_body = serde_json::json!({
        "acr_values": "",
        "claims": "",
        "client_id": "riot-client",
        "code_challenge": "",
        "code_challenge_method": "",
        "nonce": uuid::Uuid::new_v4().simple().to_string(),
        "redirect_uri": "http://localhost/redirect",
        "response_type": "token id_token",
        "scope": "openid link ban lol_region account"
    });

    let init_resp = client.post(init_url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "RiotClient/63.0.9.4909983.4789131 rso-auth (Windows;10;;Professional, x64)")
        .header("Accept", "application/json")
        .json(&init_body)
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối Riot Auth (Khởi tạo): {}", e))?;

    // Thu thập cookie từ bước khởi tạo (asid, ...). reqwest cũng tự lưu vào
    // cookie store và gửi lại ở request tiếp theo, nhưng ta vẫn gom thủ công
    // để dành cho việc gia hạn token (reauth) sau này.
    let mut session_cookies: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for cookie in init_resp.headers().get_all("set-cookie") {
        if let Ok(cookie_str) = cookie.to_str() {
            if let Some(first) = cookie_str.split(';').next() {
                if let Some((k, v)) = first.split_once('=') {
                    session_cookies.insert(k.trim().to_string(), v.trim().to_string());
                }
            }
        }
    }

    // Step 2: Gửi tài khoản và mật khẩu
    let auth_body = serde_json::json!({
        "type": "auth",
        "username": username,
        "password": password,
        "remember": true,
        "language": "en_US"
    });

    // Riot yêu cầu header `Referer` trỏ tới một subdomain ngẫu nhiên của
    // riotgames.com cho request đăng nhập, nếu không sẽ bị chặn (luôn trả về
    // auth_failure). Tham khảo: floxay/python-riot-auth.
    let referer = format!("https://{}.riotgames.com/", uuid::Uuid::new_v4().simple());

    let auth_resp = client.put(init_url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "RiotClient/63.0.9.4909983.4789131 rso-auth (Windows;10;;Professional, x64)")
        .header("Accept", "application/json")
        .header("Referer", &referer)
        .json(&auth_body)
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối Riot Auth (Đăng nhập): {}", e))?;

    // Bổ sung cookie phiên (ssid, clid, tdid, ...) trả về sau khi đăng nhập để
    // dùng cho việc gia hạn token sau này mà không cần nhập lại mật khẩu.
    for cookie in auth_resp.headers().get_all("set-cookie") {
        if let Ok(cookie_str) = cookie.to_str() {
            if let Some(first) = cookie_str.split(';').next() {
                if let Some((k, v)) = first.split_once('=') {
                    session_cookies.insert(k.trim().to_string(), v.trim().to_string());
                }
            }
        }
    }
    let reauth_cookies = session_cookies
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("; ");

    let auth_json: serde_json::Value = auth_resp.json().await
        .map_err(|e| format!("Lỗi đọc phản hồi đăng nhập: {}", e))?;

    // Xử lý lỗi đăng nhập
    if let Some(error) = auth_json["error"].as_str() {
        let display_error = match error {
            "auth_failure" => "Tên đăng nhập hoặc mật khẩu không chính xác!",
            "rate_limited" => "Bạn đang bị giới hạn lượt đăng nhập từ Riot! Vui lòng thử lại sau.",
            _ => error,
        };
        return Err(format!("Riot đăng nhập thất bại: {}", display_error));
    }

    if auth_json["type"].as_str() == Some("multifactor") {
        return Err("Tài khoản này đã bật bảo mật 2 lớp (2FA). Để liên kết, vui lòng đăng nhập trên Riot Client và nhấn nút 'Lưu tài khoản từ Riot Client đang chạy' thay thế!".to_string());
    }

    // Trích xuất access_token từ URL redirect
    let uri = auth_json["response"]["parameters"]["uri"].as_str()
        .ok_or_else(|| {
            if auth_json["type"].as_str() == Some("auth") {
                "Tên đăng nhập hoặc mật khẩu không chính xác!".to_string()
            } else {
                format!("Không tìm thấy thông tin đăng nhập thành công. Phản hồi: {}", auth_json.to_string())
            }
        })?;

    let parsed_url = Url::parse(uri)
        .map_err(|e| format!("Lỗi phân tích URL redirect: {}", e))?;
    
    let fragment = parsed_url.fragment()
        .ok_or_else(|| "Không tìm thấy token trong phản hồi".to_string())?;

    let mut access_token = String::new();
    for pair in fragment.split('&') {
        let mut parts = pair.splitn(2, '=');
        if let (Some(key), Some(val)) = (parts.next(), parts.next()) {
            if key == "access_token" {
                access_token = val.to_string();
                break;
            }
        }
    }

    if access_token.is_empty() {
        return Err("Không trích xuất được access token".to_string());
    }

    // Step 3: Lấy Entitlement Token
    let ent_url = "https://entitlements.auth.riotgames.com/api/v1/entitlements/token";
    let ent_resp = client.post(ent_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
        .body("{}")
        .send()
        .await
        .map_err(|e| format!("Lỗi lấy Entitlement Token: {}", e))?;

    let ent_json: serde_json::Value = ent_resp.json().await
        .map_err(|e| format!("Lỗi đọc Entitlement JSON: {}", e))?;

    let entitlement_token = ent_json["entitlements_token"].as_str()
        .ok_or_else(|| "Không tìm thấy entitlements_token trong phản hồi".to_string())?
        .to_string();

    // Step 4: Lấy UserInfo để xác định PUUID
    let userinfo_url = "https://auth.riotgames.com/userinfo";
    let userinfo_resp = client.get(userinfo_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
        .send()
        .await
        .map_err(|e| format!("Lỗi lấy UserInfo: {}", e))?;

    let userinfo_json: serde_json::Value = userinfo_resp.json().await
        .map_err(|e| format!("Lỗi đọc UserInfo JSON: {}", e))?;

    let puuid = userinfo_json["sub"].as_str()
        .ok_or_else(|| "Không tìm thấy PUUID trong UserInfo".to_string())?
        .to_string();

    Ok((access_token, entitlement_token, puuid, reauth_cookies))
}

/// Gia hạn token bằng reauth cookie (ssid). Đây là cách Riot Client tự làm mới
/// phiên: gọi authorization endpoint với cookie phiên đã lưu để lấy access_token
/// mới mà không cần mật khẩu. Trả về (access_token, entitlement_token, cookies_mới).
async fn riot_reauth_with_cookies(cookies: &str) -> Result<(String, String, String), String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    // GET authorization với prompt=none + cookie phiên → redirect chứa token.
    // Dùng client web `play-valorant-web-prod` để khớp với phiên đăng nhập tạo
    // qua trình duyệt; cookie `ssid` là phiên SSO dùng chung nên vẫn gia hạn
    // được cho cả tài khoản lưu từ luồng khác.
    let reauth_url = "https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&nonce=1&scope=account%20openid";

    let resp = client.get(reauth_url)
        .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
        .header("Cookie", cookies)
        .send()
        .await
        .map_err(|e| format!("Lỗi gia hạn phiên: {}", e))?;

    // Cập nhật cookie phiên nếu Riot trả về cookie mới (xoay vòng ssid).
    let mut merged: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for c in cookies.split(';') {
        if let Some((k, v)) = c.split_once('=') {
            merged.insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    for cookie in resp.headers().get_all("set-cookie") {
        if let Ok(cookie_str) = cookie.to_str() {
            if let Some(first) = cookie_str.split(';').next() {
                if let Some((k, v)) = first.split_once('=') {
                    merged.insert(k.trim().to_string(), v.trim().to_string());
                }
            }
        }
    }
    let new_cookies = merged
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("; ");

    // Token nằm trong fragment của Location header.
    let location = resp.headers().get("location")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "REAUTH_EXPIRED".to_string())?
        .to_string();

    let parsed = Url::parse(&location).map_err(|e| format!("Lỗi parse redirect gia hạn: {}", e))?;
    let fragment = parsed.fragment().ok_or_else(|| "REAUTH_EXPIRED".to_string())?;

    let mut access_token = String::new();
    for pair in fragment.split('&') {
        let mut parts = pair.splitn(2, '=');
        if let (Some(key), Some(val)) = (parts.next(), parts.next()) {
            if key == "access_token" {
                access_token = val.to_string();
                break;
            }
        }
    }
    if access_token.is_empty() {
        return Err("REAUTH_EXPIRED".to_string());
    }

    // Lấy lại entitlement token mới.
    let ent_resp = client.post("https://entitlements.auth.riotgames.com/api/v1/entitlements/token")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
        .body("{}")
        .send()
        .await
        .map_err(|e| format!("Lỗi lấy Entitlement khi gia hạn: {}", e))?;
    let ent_json: serde_json::Value = ent_resp.json().await
        .map_err(|e| format!("Lỗi đọc Entitlement JSON khi gia hạn: {}", e))?;
    let entitlement_token = ent_json["entitlements_token"].as_str()
        .ok_or_else(|| "Không lấy được entitlements_token khi gia hạn".to_string())?
        .to_string();

    Ok((access_token, entitlement_token, new_cookies))
}

async fn fetch_game_name(shard: &str, puuid: &str, auth_token: &str, entitlement_token: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let (client_version, client_platform) = get_valorant_client_headers(&client).await?;
    let name_url = format!("https://pd.{}.a.pvp.net/name-service/v2/players", shard);
    let puuids_vec = vec![puuid.to_string()];
    
    let name_res = client.put(&name_url)
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("X-Riot-Entitlements-JWT", entitlement_token)
        .header("X-Riot-ClientVersion", &client_version)
        .header("X-Riot-ClientPlatform", client_platform)
        .json(&puuids_vec)
        .send()
        .await
        .map_err(|e| format!("Lỗi gọi Name Service: {}", e))?;
        
    let names_json: serde_json::Value = name_res.json().await
        .map_err(|e| format!("Lỗi parse Name Service JSON: {}", e))?;
        
    if let Some(arr) = names_json.as_array() {
        if let Some(n) = arr.first() {
            if let (Some(gn), Some(tag)) = (n["GameName"].as_str(), n["TagLine"].as_str()) {
                return Ok(format!("{}#{}", gn, tag));
            }
        }
    }
    
    Err("Không tìm thấy thông tin GameName/TagLine từ Riot Name Service API".to_string())
}

#[tauri::command]
async fn get_riot_credentials() -> Result<RiotCredentials, String> {
    // Always read from the currently running Riot Client
    let local_app_data = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let lockfile_path = PathBuf::from(local_app_data)
        .join("Riot Games")
        .join("Riot Client")
        .join("Config")
        .join("lockfile");

    let lockfile_content = fs::read_to_string(lockfile_path).map_err(|_| "RIOT_CLIENT_NOT_RUNNING".to_string())?;
    
    // Format: name:pid:port:password:protocol
    let parts: Vec<&str> = lockfile_content.split(':').collect();
    if parts.len() < 5 {
        return Err("Lockfile không hợp lệ".to_string());
    }

    let port = parts[2].to_string();
    let password = parts[3].to_string();

    let auth_raw = format!("riot:{}", password);
    let base64_auth = general_purpose::STANDARD.encode(auth_raw);

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    // Get Tokens & PUUID
    let local_url = format!("https://127.0.0.1:{}/entitlements/v1/token", port);
    let resp = client.get(&local_url)
        .header("Authorization", format!("Basic {}", base64_auth))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let access_token = json["accessToken"].as_str().unwrap_or("").to_string();
    let entitlement_token = json["token"].as_str().unwrap_or("").to_string();
    let puuid = json["subject"].as_str().unwrap_or("").to_string();

    if access_token.is_empty() {
        return Err("Không lấy được token. Vui lòng đăng nhập vào Riot Client.".to_string());
    }

    if puuid.is_empty() {
        return Err(format!("Lỗi: PUUID bị rỗng. Dữ liệu trả về: {}", json.to_string()));
    }

    // Get Region & Map to Shard
    let region_url = format!("https://127.0.0.1:{}/riotclient/region-locale", port);
    let region_resp = client.get(&region_url)
        .header("Authorization", format!("Basic {}", base64_auth))
        .send()
        .await
        .map_err(|e| format!("Lỗi region: {}", e))?;
    let region_json: serde_json::Value = region_resp.json().await.unwrap_or(serde_json::json!({}));
    let region = region_json["region"].as_str().unwrap_or("ap").to_lowercase();
    
    let shard = match region.as_str() {
        "latam" | "br" | "na" | "pbe" => "na",
        "kr" => "kr",
        "eu" => "eu",
        _ => "ap",
    };

    // Get Game Name
    let session_url = format!("https://127.0.0.1:{}/chat/v1/session", port);
    let session_resp = client.get(&session_url)
        .header("Authorization", format!("Basic {}", base64_auth))
        .send()
        .await;
        
    let mut game_name = None;
    if let Ok(resp) = session_resp {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(name) = json["game_name"].as_str() {
                if let Some(tag) = json["game_tag"].as_str() {
                    game_name = Some(format!("{}#{}", name, tag));
                }
            }
        }
    }

    Ok(RiotCredentials {
        port,
        password,
        auth_token: access_token,
        entitlement_token,
        puuid,
        shard: shard.to_string(),
        game_name,
    })
}

#[tauri::command]
async fn add_valorant_account_credentials(username: String, password: String, shard: String) -> Result<SavedRiotAccount, String> {
    // 1. Đăng nhập qua Riot API
    let (auth_token, entitlement_token, puuid, reauth_cookies) = riot_login(&username, &password).await?;
    
    // 2. Lấy thông tin GameName#Tag
    let game_name = fetch_game_name(&shard, &puuid, &auth_token, &entitlement_token).await
        .unwrap_or_else(|_| format!("RiotAccount#{}", &puuid[..5]));
        
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
        
    let account = SavedRiotAccount {
        puuid: puuid.clone(),
        game_name,
        username: Some(username),
        password: Some(password),
        shard: shard.clone(),
        auth_token,
        entitlement_token,
        last_updated: now,
        login_type: "credentials".to_string(),
        reauth_cookies: if reauth_cookies.is_empty() { None } else { Some(reauth_cookies) },
    };
    
    // 3. Lưu danh sách accounts
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_dir = PathBuf::from(&app_data).join("htssclub");
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    let accounts_path = config_dir.join("valorant_accounts.json");
    
    let mut accounts = Vec::new();
    if accounts_path.exists() {
        if let Ok(content) = fs::read_to_string(&accounts_path) {
            accounts = serde_json::from_str::<Vec<SavedRiotAccount>>(&content).unwrap_or_default();
        }
    }
    
    if let Some(pos) = accounts.iter().position(|a| a.puuid == puuid) {
        accounts[pos] = account.clone();
    } else {
        accounts.push(account.clone());
    }
    
    let pretty = serde_json::to_string_pretty(&accounts).map_err(|e| e.to_string())?;
    fs::write(&accounts_path, pretty).map_err(|e| e.to_string())?;
    
    // Đặt tài khoản này thành active
    let active_path = config_dir.join("active_account.json");
    let active_config = ActiveAccountConfig { puuid: Some(puuid) };
    if let Ok(active_pretty) = serde_json::to_string_pretty(&active_config) {
        let _ = fs::write(&active_path, active_pretty);
    }
    
    Ok(account)
}

/// Thử lấy GameName#Tag bằng shard ưu tiên trước, nếu thất bại thì dò qua các
/// shard còn lại (tài khoản có thể ở khu vực khác với lựa chọn của người dùng).
/// Trả về (game_name, shard_thực_tế).
async fn fetch_game_name_smart(preferred: &str, puuid: &str, auth: &str, ent: &str) -> (String, String) {
    let mut shards = vec![preferred.to_string()];
    for s in ["ap", "na", "eu", "kr"] {
        if s != preferred {
            shards.push(s.to_string());
        }
    }
    for s in &shards {
        if let Ok(name) = fetch_game_name(s, puuid, auth, ent).await {
            return (name, s.clone());
        }
    }
    let short = &puuid[..puuid.len().min(5)];
    (format!("RiotAccount#{}", short), preferred.to_string())
}

/// Hoàn tất đăng nhập từ một access_token đã có sẵn (ví dụ lấy qua trình duyệt):
/// lấy entitlement token + puuid + tên game rồi lưu tài khoản vào file.
///
/// `riot_cookies` là cookie SSO bắt được; nếu có `ssid` ta dựng file session để
/// đăng nhập được vào Riot Client (login_type = "riot_client").
async fn finalize_and_save_riot_login(
    access_token: String,
    reauth_cookies: String,
    riot_cookies: Vec<RiotCookie>,
    shard_hint: String,
) -> Result<SavedRiotAccount, String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    // ── PUUID: lấy từ access_token (JWT "sub") hoặc cookie "sub"/"ssid" trước,
    //    không phụ thuộc mạng. Chỉ gọi /userinfo khi tất cả thất bại. ──
    let puuid = jwt_extract_str(&access_token, "sub")
        .or_else(|| {
            riot_cookies
                .iter()
                .find(|c| c.name == "sub" && !c.value.is_empty())
                .map(|c| c.value.clone())
        })
        .or_else(|| {
            // ssid là JWT, payload chứa "sub" = PUUID.
            riot_cookies
                .iter()
                .find(|c| c.name == "ssid")
                .and_then(|c| jwt_extract_str(&c.value, "sub"))
        });

    let puuid = match puuid {
        Some(p) => p,
        None => {
            // Fallback cuối: gọi userinfo.
            let userinfo_resp = client
                .get("https://auth.riotgames.com/userinfo")
                .header("Authorization", format!("Bearer {}", access_token))
                .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
                .send()
                .await
                .map_err(|e| format!("Lỗi lấy UserInfo: {}", e))?;
            let userinfo_json: serde_json::Value = userinfo_resp
                .json()
                .await
                .map_err(|e| format!("Lỗi đọc UserInfo JSON: {}", e))?;
            userinfo_json["sub"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "Không xác định được PUUID của tài khoản.".to_string())?
        }
    };

    // ── Entitlement token: best-effort (thử cả 2 endpoint). KHÔNG chặn việc lưu
    //    tài khoản / đăng nhập Riot Client nếu thất bại — vì Client chỉ cần ssid. ──
    let mut entitlement_token = String::new();
    for url in [
        "https://entitlements.auth.riotgames.com/api/token/v1",
        "https://entitlements.auth.riotgames.com/api/v1/entitlements/token",
    ] {
        let resp = match client
            .post(url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
            .body("{}")
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };
        let body = resp.text().await.unwrap_or_default();
        let json: serde_json::Value =
            serde_json::from_str(&body).unwrap_or(serde_json::Value::Null);
        if let Some(t) = json["entitlements_token"].as_str() {
            entitlement_token = t.to_string();
            break;
        }
    }

    // ── Tên game + shard: best-effort. Nếu không lấy được (vd thiếu entitlement)
    //    thì dùng tên tạm; người dùng vẫn đăng nhập Client được. ──
    let (game_name, shard) = if entitlement_token.is_empty() {
        let short = &puuid[..puuid.len().min(5)];
        (format!("Riot Account #{}", short), shard_hint.clone())
    } else {
        fetch_game_name_smart(&shard_hint, &puuid, &access_token, &entitlement_token).await
    };

    // Dựng file session để đăng nhập được vào Riot Client (nếu bắt được ssid).
    // Nếu thành công, đánh dấu là "riot_client" để khi "Chọn sử dụng" sẽ khôi
    // phục session và mở Riot Client; ngược lại chỉ dùng API ("credentials").
    let region = jwt_extract_region(&access_token).unwrap_or_default();
    let session_saved = save_browser_session_yaml(&puuid, &region, &riot_cookies);
    let login_type = if session_saved { "riot_client" } else { "credentials" };

    let account = SavedRiotAccount {
        puuid: puuid.clone(),
        game_name,
        username: None,
        password: None,
        shard,
        auth_token: access_token,
        entitlement_token,
        last_updated: now_secs(),
        login_type: login_type.to_string(),
        reauth_cookies: if reauth_cookies.is_empty() {
            None
        } else {
            Some(reauth_cookies)
        },
    };

    // Lưu vào danh sách + đặt active.
    let mut accounts = read_accounts_raw();
    if let Some(pos) = accounts.iter().position(|a| a.puuid == puuid) {
        // Giữ lại username/password cũ nếu trước đó đã lưu bằng mật khẩu.
        let prev = &accounts[pos];
        let mut merged = account.clone();
        if merged.username.is_none() {
            merged.username = prev.username.clone();
        }
        if merged.password.is_none() {
            merged.password = prev.password.clone();
        }
        accounts[pos] = merged;
    } else {
        accounts.push(account.clone());
    }
    write_accounts_raw(&accounts)?;

    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let active_path = PathBuf::from(&app_data)
        .join("htssclub")
        .join("active_account.json");
    let active_config = ActiveAccountConfig {
        puuid: Some(puuid.clone()),
    };
    if let Ok(active_pretty) = serde_json::to_string_pretty(&active_config) {
        let _ = fs::write(&active_path, active_pretty);
    }

    // Tự kích hoạt tài khoản vừa đăng nhập: khôi phục session vào Riot Client
    // và mở Client để người dùng vào chơi ngay, không cần bấm "Chọn sử dụng".
    if session_saved {
        let puuid_for_activate = puuid.clone();
        tauri::async_runtime::spawn(async move {
            let _ = restore_riot_session(&puuid_for_activate);
            let _ = open_riot_client();
        });
    }

    Ok(account)
}

/// Lệnh: đăng nhập Riot bằng cách mở một cửa sổ trình duyệt thật.
///
/// Đây là cách đáng tin cậy nhất vì Riot hiện chặn đăng nhập username/password
/// trực tiếp (hCaptcha) và hỗ trợ cả tài khoản bật 2FA. Người dùng đăng nhập
/// trong cửa sổ, ta bắt redirect chứa access_token rồi lưu phiên (cookie ssid)
/// để tự động gia hạn về sau.
#[tauri::command]
async fn add_valorant_account_browser(
    app: tauri::AppHandle,
    shard: String,
) -> Result<SavedRiotAccount, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
    use tokio::sync::oneshot;

    // Đóng cửa sổ đăng nhập cũ nếu còn mở.
    if let Some(w) = app.get_webview_window("riot-login") {
        let _ = w.close();
    }

    // Dùng một thư mục profile riêng cho cửa sổ đăng nhập và XÓA nó trước mỗi
    // lần mở. Cách này cho phiên mới hoàn toàn (không "dính" tài khoản trước)
    // mà vẫn đọc được cookie HttpOnly như ssid (chế độ incognito thì không đọc
    // được cookie HttpOnly nên không lấy được ssid để đăng nhập Riot Client).
    let login_profile_dir = {
        let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
        let dir = PathBuf::from(app_data).join("htssclub").join("riot_login_profile");
        let _ = fs::remove_dir_all(&dir);
        dir
    };

    let auth_url = "https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&nonce=1&scope=account%20openid";

    let (tx, rx) = oneshot::channel::<Option<String>>();
    let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));

    // Theo dõi URL cuối cùng cửa sổ đi qua — dùng cho chẩn đoán khi không bắt
    // được token (hiện ra thông báo lỗi trên UI để biết redirect đi đâu).
    let last_url = std::sync::Arc::new(std::sync::Mutex::new(String::new()));

    // Bắt redirect chứa token ngay trong quá trình điều hướng.
    let tx_nav = tx.clone();
    let last_url_nav = last_url.clone();
    let window = WebviewWindowBuilder::new(
        &app,
        "riot-login",
        WebviewUrl::External(
            auth_url
                .parse()
                .map_err(|e| format!("URL đăng nhập không hợp lệ: {}", e))?,
        ),
    )
    .title("Đăng nhập tài khoản Riot")
    .inner_size(520.0, 760.0)
    .data_directory(login_profile_dir)
    .center()
    .on_navigation(move |url| {
        let full = url.as_str();
        log::info!("[riot-login] navigate: {}", full);
        if let Ok(mut g) = last_url_nav.lock() {
            *g = full.to_string();
        }

        // Token có thể nằm ở fragment (#access_token=) hoặc query (?access_token=),
        // tuỳ phản hồi của Riot. Quét toàn bộ URL để bắt cho chắc.
        let extract = |s: &str| -> Option<String> {
            for pair in s.split(['&', '#', '?']) {
                let mut p = pair.splitn(2, '=');
                if let (Some(k), Some(v)) = (p.next(), p.next()) {
                    if k == "access_token" && !v.is_empty() {
                        return Some(v.to_string());
                    }
                }
            }
            None
        };

        let token = url
            .fragment()
            .and_then(extract)
            .or_else(|| url.query().and_then(extract))
            .or_else(|| extract(full));

        if let Some(t) = token {
            log::info!("[riot-login] captured access_token (len {})", t.len());
            if let Ok(mut guard) = tx_nav.lock() {
                if let Some(sender) = guard.take() {
                    let _ = sender.send(Some(t));
                }
            }
            // Dừng điều hướng tới trang đích, ta đã có token.
            return false;
        }
        true
    })
    .build()
    .map_err(|e| format!("Không mở được cửa sổ đăng nhập: {}", e))?;

    // Nếu người dùng tự đóng cửa sổ trước khi đăng nhập xong → huỷ.
    let tx_close = tx.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed = event {
            if let Ok(mut guard) = tx_close.lock() {
                if let Some(sender) = guard.take() {
                    let _ = sender.send(None);
                }
            }
        }
    });

    // Chờ token (tối đa 5 phút). Song song, poll URL của cửa sổ vì `on_navigation`
    // đôi khi không bắt được fragment (#access_token) khi redirect xử lý phía client.
    let received = {
        let app_poll = app.clone();
        let tx_poll = tx.clone();
        let last_url_poll = last_url.clone();
        let poller = tokio::spawn(async move {
            let extract = |s: &str| -> Option<String> {
                for pair in s.split(['&', '#', '?']) {
                    let mut p = pair.splitn(2, '=');
                    if let (Some(k), Some(v)) = (p.next(), p.next()) {
                        if k == "access_token" && !v.is_empty() {
                            return Some(v.to_string());
                        }
                    }
                }
                None
            };
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                let w = match app_poll.get_webview_window("riot-login") {
                    Some(w) => w,
                    None => break, // cửa sổ đã đóng
                };
                if let Ok(u) = w.url() {
                    let s = u.as_str().to_string();
                    if let Ok(mut g) = last_url_poll.lock() {
                        *g = s.clone();
                    }
                    if let Some(t) = extract(&s) {
                        log::info!("[riot-login] poll captured token (len {})", t.len());
                        if let Ok(mut guard) = tx_poll.lock() {
                            if let Some(sender) = guard.take() {
                                let _ = sender.send(Some(t));
                            }
                        }
                        break;
                    }
                }
            }
        });

        let r = tokio::time::timeout(std::time::Duration::from_secs(300), rx).await;
        poller.abort();
        r
    };

    // Lấy cookie phiên (ssid, sub, csid, clid, tdid, ...) từ cửa sổ trước khi
    // đóng — vừa để gia hạn token, vừa để dựng file session đăng nhập Riot Client.
    // Chờ một nhịp để WebView2 ghi xong cookie (ssid được set ở bước /authorize).
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    let mut riot_cookies: Vec<RiotCookie> = Vec::new();
    if let Some(w) = app.get_webview_window("riot-login") {
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut collect = |list: Vec<tauri::webview::Cookie<'static>>| {
            for c in list {
                let name = c.name().to_string();
                if name.is_empty() || seen.contains(&name) {
                    continue;
                }
                seen.insert(name.clone());
                riot_cookies.push(RiotCookie {
                    name,
                    value: c.value().to_string(),
                    domain: c.domain().unwrap_or("").to_string(),
                    http_only: c.http_only().unwrap_or(true),
                    secure: c.secure().unwrap_or(true),
                    persistent: c.expires().is_some(),
                });
            }
        };
        if let Ok(auth_origin) = "https://auth.riotgames.com".parse::<Url>() {
            if let Ok(cookies) = w.cookies_for_url(auth_origin) {
                log::info!("[riot-login] cookies_for_url(auth) trả về {} cookie", cookies.len());
                collect(cookies);
            } else {
                log::warn!("[riot-login] cookies_for_url(auth) lỗi");
            }
        }
        if let Ok(all) = w.cookies() {
            log::info!("[riot-login] cookies() trả về {} cookie", all.len());
            collect(all);
        } else {
            log::warn!("[riot-login] cookies() lỗi");
        }
        log::info!(
            "[riot-login] tổng cookie bắt được: [{}]",
            riot_cookies.iter().map(|c| c.name.as_str()).collect::<Vec<_>>().join(", ")
        );
        let _ = w.close();
    }

    let reauth_cookies = riot_cookies
        .iter()
        .map(|c| format!("{}={}", c.name, c.value))
        .collect::<Vec<_>>()
        .join("; ");

    let last = last_url.lock().map(|g| g.clone()).unwrap_or_default();
    let token = received
        .map_err(|_| format!("Hết thời gian đăng nhập (quá 5 phút). URL cuối: {}", last))?
        .map_err(|_| "Đăng nhập bị huỷ.".to_string())?
        .ok_or_else(|| format!("Bạn đã đóng cửa sổ đăng nhập. URL cuối: {}", last))?;

    finalize_and_save_riot_login(token, reauth_cookies, riot_cookies, shard).await
}

/// Một cookie phiên Riot kèm các thuộc tính cần để dựng lại file session.
#[derive(Clone)]
struct RiotCookie {
    name: String,
    value: String,
    domain: String,
    http_only: bool,
    secure: bool,
    persistent: bool,
}

/// Dựng nội dung file `RiotGamesPrivateSettings.yaml` từ danh sách cookie SSO
/// bắt được qua trình duyệt. Riot Client đọc file này để tự đăng nhập: phần
/// quan trọng nhất là cookie `ssid` (phiên SSO sống lâu) cùng `sub`, `csid`,
/// `clid`, `tdid`. Định dạng khớp với file gốc của Riot Client.
///
/// Chỉ giữ đúng các cookie SSO của Riot, loại bỏ cookie rác (analytics,
/// cloudflare, hcaptcha, ...) để khớp định dạng file gốc và tránh Client từ chối.
fn build_riot_private_settings_yaml(puuid: &str, region: &str, cookies: &[RiotCookie]) -> String {
    fn yaml_bool(b: bool) -> &'static str {
        if b { "true" } else { "false" }
    }

    // Các cookie nằm trong session của riot-login (đúng theo file gốc của Riot).
    const SESSION_NAMES: [&str; 6] = ["asid", "ccid", "clid", "sub", "csid", "ssid"];

    // Gom cookie theo tên, ưu tiên domain auth.riotgames.com.
    let find = |name: &str| -> Option<&RiotCookie> {
        cookies
            .iter()
            .find(|c| c.name == name && c.domain.contains("auth.riotgames.com"))
            .or_else(|| cookies.iter().find(|c| c.name == name))
    };

    let mut out = String::new();
    out.push_str("riot-login:\n");
    out.push_str("    persist:\n");
    out.push_str(&format!("        region: \"{}\"\n", region));
    out.push_str("        scopes:\n");
    for s in ["account", "openid", "link", "ban", "lol_region", "lol", "summoner", "offline_access"] {
        out.push_str(&format!("        - \"{}\"\n", s));
    }
    out.push_str("        session:\n");
    out.push_str("            cookies:\n");
    for name in SESSION_NAMES {
        // Lấy cookie bắt được; riêng `sub` nếu thiếu thì dựng từ puuid,
        // `ccid` phải là "riot-client" (trình duyệt trả về client_id của web).
        let cookie = find(name);
        let (value, http_only, secure, persistent) = match name {
            "ccid" => ("riot-client".to_string(), true, true, true),
            _ => match cookie {
                Some(c) => (c.value.clone(), c.http_only, c.secure, c.persistent),
                None if name == "sub" => (puuid.to_string(), true, true, true),
                None => continue,
            },
        };
        if value.is_empty() {
            continue;
        }
        out.push_str("            -   domain: \"auth.riotgames.com\"\n");
        out.push_str("                hostOnly: true\n");
        out.push_str(&format!("                httpOnly: {}\n", yaml_bool(http_only)));
        out.push_str(&format!("                name: \"{}\"\n", name));
        out.push_str("                path: \"/\"\n");
        out.push_str(&format!("                persistent: {}\n", yaml_bool(persistent)));
        out.push_str(&format!("                secureOnly: {}\n", yaml_bool(secure)));
        out.push_str(&format!("                value: \"{}\"\n", value));
    }

    if let Some(t) = find("tdid") {
        out.push_str("rso-authenticator:\n");
        out.push_str("    tdid:\n");
        out.push_str("        domain: \"riotgames.com\"\n");
        out.push_str("        expiryTime: 1811903735\n");
        out.push_str("        hostOnly: false\n");
        out.push_str(&format!("        httpOnly: {}\n", yaml_bool(t.http_only)));
        out.push_str("        name: \"tdid\"\n");
        out.push_str("        path: \"/\"\n");
        out.push_str("        persistent: true\n");
        out.push_str(&format!("        secureOnly: {}\n", yaml_bool(t.secure)));
        out.push_str(&format!("        value: \"{}\"\n", t.value));
    }

    out
}

/// Lưu file session (yaml) cho một tài khoản đăng nhập qua trình duyệt để sau
/// này khôi phục vào Riot Client. Trả về true nếu có cookie ssid hợp lệ.
fn save_browser_session_yaml(puuid: &str, region: &str, cookies: &[RiotCookie]) -> bool {
    let has_ssid = cookies.iter().any(|c| c.name == "ssid" && !c.value.is_empty());
    if !has_ssid {
        log::warn!("[riot-login] KHÔNG có cookie ssid → không tạo được session Riot Client");
        return false;
    }
    let yaml = build_riot_private_settings_yaml(puuid, region, cookies);
    let app_data = match std::env::var("APPDATA") {
        Ok(p) => p,
        Err(_) => return false,
    };
    let dir = PathBuf::from(app_data).join("htssclub").join("riot_sessions");
    if !dir.exists() && fs::create_dir_all(&dir).is_err() {
        return false;
    }
    let path = dir.join(format!("{}.yaml", puuid));
    let ok = fs::write(&path, yaml).is_ok();
    log::info!("[riot-login] lưu session yaml ({}): {}", if ok {"OK"} else {"LỖI"}, path.display());
    ok
}

// ── Helpers chung cho việc đọc/ghi danh sách tài khoản ──────────────────────

fn accounts_file_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    Ok(PathBuf::from(&app_data).join("htssclub").join("valorant_accounts.json"))
}

fn read_accounts_raw() -> Vec<SavedRiotAccount> {
    accounts_file_path()
        .ok()
        .filter(|p| p.exists())
        .and_then(|p| fs::read_to_string(&p).ok())
        .and_then(|c| serde_json::from_str::<Vec<SavedRiotAccount>>(&c).ok())
        .unwrap_or_default()
}

fn write_accounts_raw(accounts: &[SavedRiotAccount]) -> Result<(), String> {
    let path = accounts_file_path()?;
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let pretty = serde_json::to_string_pretty(accounts).map_err(|e| e.to_string())?;
    fs::write(&path, pretty).map_err(|e| e.to_string())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Kiểm tra nhanh token còn hạn không bằng cách giải mã phần payload của JWT
/// và đọc trường `exp`. Trả về true nếu token còn hạn ít nhất `skew` giây nữa.
fn jwt_still_valid(token: &str, skew: u64) -> bool {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return false;
    }
    let payload = match general_purpose::URL_SAFE_NO_PAD.decode(parts[1]) {
        Ok(p) => p,
        Err(_) => match general_purpose::STANDARD_NO_PAD.decode(parts[1]) {
            Ok(p) => p,
            Err(_) => return false,
        },
    };
    let json: serde_json::Value = match serde_json::from_slice(&payload) {
        Ok(j) => j,
        Err(_) => return false,
    };
    match json["exp"].as_u64() {
        Some(exp) => exp > now_secs() + skew,
        None => false,
    }
}

/// Giải mã payload JWT và lấy một trường string (vd: "sub" = PUUID).
fn jwt_extract_str(token: &str, key: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let payload = general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .or_else(|_| general_purpose::STANDARD_NO_PAD.decode(parts[1]))
        .ok()?;
    let json: serde_json::Value = serde_json::from_slice(&payload).ok()?;
    json[key].as_str().map(|s| s.to_string())
}

/// Trích region (vd "VN2") từ access_token. Riot nhét vào `dat.r`, hoặc trong
/// mảng `clm` dưới dạng "rgn_VN2". Dùng để điền vào file session Riot Client.
fn jwt_extract_region(token: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let payload = general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .or_else(|_| general_purpose::STANDARD_NO_PAD.decode(parts[1]))
        .ok()?;
    let json: serde_json::Value = serde_json::from_slice(&payload).ok()?;

    if let Some(r) = json["dat"]["r"].as_str() {
        if !r.is_empty() {
            return Some(r.to_string());
        }
    }
    if let Some(arr) = json["clm"].as_array() {
        for c in arr {
            if let Some(s) = c.as_str() {
                if let Some(rgn) = s.strip_prefix("rgn_") {
                    if !rgn.is_empty() {
                        return Some(rgn.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Thu thập tất cả cookie (name=value) từ một cây JSON, tìm mọi mảng "cookies".
/// Dùng để bóc cookie phiên (ssid, clid, sub, ...) từ file session của Riot Client.
fn collect_cookies_from_json(
    value: &serde_json::Value,
    out: &mut std::collections::HashMap<String, String>,
) {
    match value {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                if k == "cookies" {
                    if let Some(arr) = v.as_array() {
                        for c in arr {
                            if let (Some(name), Some(val)) =
                                (c["name"].as_str(), c["value"].as_str())
                            {
                                if !name.is_empty() && !val.is_empty() {
                                    out.insert(name.to_string(), val.to_string());
                                }
                            }
                        }
                    }
                }
                collect_cookies_from_json(v, out);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                collect_cookies_from_json(v, out);
            }
        }
        _ => {}
    }
}

/// Trích xuất chuỗi cookie phiên từ nội dung RiotGamesPrivateSettings.yaml.
/// Hỗ trợ định dạng mới (`private: <base64 JSON>`) lẫn định dạng cũ (cookie list
/// dạng name:/value: trong YAML thuần). Trả về None nếu không tìm thấy cookie nào.
fn extract_reauth_cookies_from_yaml(yaml: &str) -> Option<String> {
    let mut cookies: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    // Định dạng mới: dòng `private:` chứa blob base64 mã hoá JSON.
    for line in yaml.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("private:") {
            let b64 = rest.trim().trim_matches('"').trim_matches('\'');
            if b64.is_empty() {
                continue;
            }
            let decoded = general_purpose::STANDARD
                .decode(b64)
                .or_else(|_| general_purpose::URL_SAFE.decode(b64));
            if let Ok(bytes) = decoded {
                if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    collect_cookies_from_json(&json, &mut cookies);
                }
            }
        }
    }

    // Fallback: YAML thuần với danh sách cookie (name: / value:).
    if cookies.is_empty() {
        let mut last_name: Option<String> = None;
        for line in yaml.lines() {
            let t = line.trim();
            if let Some(n) = t.strip_prefix("name:") {
                last_name = Some(n.trim().trim_matches('"').trim_matches('\'').to_string());
            } else if let Some(v) = t.strip_prefix("value:") {
                if let Some(n) = last_name.take() {
                    let val = v.trim().trim_matches('"').trim_matches('\'').to_string();
                    if !n.is_empty() && !val.is_empty() {
                        cookies.insert(n, val);
                    }
                }
            }
        }
    }

    if cookies.is_empty() {
        return None;
    }
    Some(
        cookies
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("; "),
    )
}

/// Đọc cookie phiên từ file session đã sao lưu của một tài khoản (theo puuid).
fn read_backup_session_cookies(puuid: &str) -> Option<String> {
    let app_data = std::env::var("APPDATA").ok()?;
    let path = PathBuf::from(app_data)
        .join("htssclub")
        .join("riot_sessions")
        .join(format!("{}.yaml", puuid));
    let content = fs::read_to_string(&path).ok()?;
    extract_reauth_cookies_from_yaml(&content)
}

/// Đọc cookie phiên từ file session đang hoạt động của Riot Client trên máy.
fn read_live_session_cookies() -> Option<String> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let path = PathBuf::from(local)
        .join("Riot Games")
        .join("Riot Client")
        .join("Data")
        .join("RiotGamesPrivateSettings.yaml");
    let content = fs::read_to_string(&path).ok()?;
    extract_reauth_cookies_from_yaml(&content)
}

/// Làm mới token cho một tài khoản đã lưu (theo puuid).
/// Ưu tiên dùng reauth cookie; nếu thất bại và có username/password thì đăng
/// nhập lại bằng mật khẩu. Lưu token mới vào file và trả về tài khoản đã cập nhật.
async fn refresh_account_tokens(puuid: &str) -> Result<SavedRiotAccount, String> {
    let mut accounts = read_accounts_raw();
    let idx = accounts
        .iter()
        .position(|a| a.puuid == puuid)
        .ok_or_else(|| "Không tìm thấy tài khoản đã lưu".to_string())?;

    let (username, password, cookies) = {
        let a = &accounts[idx];
        (a.username.clone(), a.password.clone(), a.reauth_cookies.clone())
    };

    // 1. Thử gia hạn bằng cookie đã lưu (không cần mật khẩu).
    if let Some(ck) = cookies.as_ref().filter(|c| !c.is_empty()) {
        if let Ok((new_auth, new_ent, new_cookies)) = riot_reauth_with_cookies(ck).await {
            let acc = &mut accounts[idx];
            acc.auth_token = new_auth;
            acc.entitlement_token = new_ent;
            if !new_cookies.is_empty() {
                acc.reauth_cookies = Some(new_cookies);
            }
            acc.last_updated = now_secs();
            let updated = acc.clone();
            write_accounts_raw(&accounts)?;
            return Ok(updated);
        }
    }

    // 2. Tài khoản kiểu Riot Client: lấy cookie phiên từ file session đã sao
    //    lưu (RiotGamesPrivateSettings.yaml chứa ssid sống rất lâu) để gia hạn.
    if let Some(ck) = read_backup_session_cookies(puuid).filter(|c| !c.is_empty()) {
        if let Ok((new_auth, new_ent, new_cookies)) = riot_reauth_with_cookies(&ck).await {
            let acc = &mut accounts[idx];
            acc.auth_token = new_auth;
            acc.entitlement_token = new_ent;
            // Lưu lại cookie để lần sau gia hạn nhanh hơn.
            acc.reauth_cookies = Some(if new_cookies.is_empty() { ck } else { new_cookies });
            acc.last_updated = now_secs();
            let updated = acc.clone();
            write_accounts_raw(&accounts)?;
            return Ok(updated);
        }
    }

    // 3. Fallback: đăng nhập lại bằng mật khẩu (nếu có).
    if let (Some(u), Some(p)) = (username, password) {
        if !u.is_empty() && !p.is_empty() {
            let (new_auth, new_ent, _puuid, new_cookies) = riot_login(&u, &p).await?;
            let acc = &mut accounts[idx];
            acc.auth_token = new_auth;
            acc.entitlement_token = new_ent;
            if !new_cookies.is_empty() {
                acc.reauth_cookies = Some(new_cookies);
            }
            acc.last_updated = now_secs();
            let updated = acc.clone();
            write_accounts_raw(&accounts)?;
            return Ok(updated);
        }
    }

    Err("SESSION_EXPIRED".to_string())
}

/// Lệnh: làm mới thủ công token của một tài khoản đã lưu (nút "Gia hạn").
#[tauri::command]
async fn refresh_valorant_account(puuid: String) -> Result<SavedRiotAccount, String> {
    let mut acc = refresh_account_tokens(&puuid).await?;
    // Ẩn mật khẩu trước khi trả về frontend.
    if acc.password.is_some() {
        acc.password = Some("••••••••".to_string());
    }
    acc.reauth_cookies = None;
    Ok(acc)
}

/// Lệnh: trả về credentials hợp lệ của tài khoản ĐANG được chọn để gọi API.
/// - Nếu active là "running_client": đọc token trực tiếp từ Riot Client đang chạy.
/// - Nếu active là tài khoản đã lưu: dùng token đã lưu, tự động gia hạn nếu hết hạn.
#[tauri::command]
async fn get_active_credentials() -> Result<RiotCredentials, String> {
    let active = get_active_valorant_account().await?;

    if active == "running_client" {
        return get_riot_credentials().await;
    }

    // Tài khoản đã lưu.
    let accounts = read_accounts_raw();
    let acc = accounts
        .iter()
        .find(|a| a.puuid == active)
        .cloned()
        .ok_or_else(|| "Không tìm thấy tài khoản đang chọn".to_string())?;

    // Token còn hạn → dùng luôn; nếu sắp/đã hết hạn → gia hạn.
    let valid = jwt_still_valid(&acc.auth_token, 120);
    let acc = if valid {
        acc
    } else {
        refresh_account_tokens(&active).await?
    };

    Ok(RiotCredentials {
        port: String::new(),
        password: String::new(),
        auth_token: acc.auth_token,
        entitlement_token: acc.entitlement_token,
        puuid: acc.puuid,
        shard: acc.shard,
        game_name: Some(acc.game_name),
    })
}

fn kill_riot_client_processes() {
    // Tắt hoàn toàn tiến trình Riot Client để giải phóng file lock
    let _ = create_silent_command("taskkill")
        .args(["/F", "/IM", "RiotClientServices.exe"])
        .output();
    let _ = create_silent_command("taskkill")
        .args(["/F", "/IM", "Riot Client.exe"])
        .output();
    // Chờ 500ms để tiến trình kết thúc hoàn toàn
    std::thread::sleep(std::time::Duration::from_millis(500));
}

fn backup_riot_session(puuid: &str) -> Result<(), String> {
    let local_app_data = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let src_path = PathBuf::from(local_app_data)
        .join("Riot Games")
        .join("Riot Client")
        .join("Data")
        .join("RiotGamesPrivateSettings.yaml");

    if src_path.exists() {
        let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
        let dest_dir = PathBuf::from(app_data)
            .join("htssclub")
            .join("riot_sessions");
        
        if !dest_dir.exists() {
            fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
        }
        
        let dest_path = dest_dir.join(format!("{}.yaml", puuid));
        fs::copy(&src_path, &dest_path).map_err(|e| format!("Lỗi sao lưu session Riot Client: {}", e))?;
    }
    Ok(())
}

fn restore_riot_session(puuid: &str) -> Result<(), String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    
    // Sao lưu file session GỐC (mặc định) nếu chưa từng được sao lưu trước đó
    if puuid != "original_session" {
        let original_path = PathBuf::from(&app_data)
            .join("htssclub")
            .join("riot_sessions")
            .join("original_session.yaml");
            
        let local_app_data = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
        let active_yaml_path = PathBuf::from(&local_app_data)
            .join("Riot Games")
            .join("Riot Client")
            .join("Data")
            .join("RiotGamesPrivateSettings.yaml");

        if active_yaml_path.exists() && !original_path.exists() {
            let parent_dir = original_path.parent().unwrap();
            if !parent_dir.exists() {
                let _ = fs::create_dir_all(parent_dir);
            }
            let _ = fs::copy(&active_yaml_path, &original_path);
        }
    }

    let src_path = PathBuf::from(app_data)
        .join("htssclub")
        .join("riot_sessions")
        .join(format!("{}.yaml", puuid));

    if src_path.exists() {
        // 1. Tắt Riot Client để tránh khóa tệp
        kill_riot_client_processes();

        // 2. Ghi đè tệp RiotGamesPrivateSettings.yaml
        let local_app_data = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
        let dest_dir = PathBuf::from(local_app_data)
            .join("Riot Games")
            .join("Riot Client")
            .join("Data");
        
        if !dest_dir.exists() {
            fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
        }
        
        let dest_path = dest_dir.join("RiotGamesPrivateSettings.yaml");
        
        if dest_path.exists() {
            let _ = fs::remove_file(&dest_path);
        }
        
        fs::copy(&src_path, &dest_path).map_err(|e| format!("Lỗi khôi phục session Riot Client: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn add_valorant_account_client() -> Result<SavedRiotAccount, String> {
    // 1. Kiểm tra Riot Client local lockfile
    let local_app_data = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let lockfile_path = PathBuf::from(local_app_data)
        .join("Riot Games")
        .join("Riot Client")
        .join("Config")
        .join("lockfile");

    if !lockfile_path.exists() {
        return Err("Riot Client chưa mở hoặc không tìm thấy lockfile. Vui lòng mở Riot Client!".to_string());
    }
    
    let lockfile_content = fs::read_to_string(lockfile_path)
        .map_err(|e| format!("Không thể đọc lockfile: {}", e))?;
    
    let parts: Vec<&str> = lockfile_content.split(':').collect();
    if parts.len() < 5 {
        return Err("Lockfile không hợp lệ".to_string());
    }

    let port = parts[2].to_string();
    let password = parts[3].to_string();
    let auth_raw = format!("riot:{}", password);
    let base64_auth = general_purpose::STANDARD.encode(auth_raw);

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let local_url = format!("https://127.0.0.1:{}/entitlements/v1/token", port);
    let resp = client.get(&local_url)
        .header("Authorization", format!("Basic {}", base64_auth))
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối Riot Client local API: {}", e))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let auth_token = json["accessToken"].as_str().unwrap_or("").to_string();
    let entitlement_token = json["token"].as_str().unwrap_or("").to_string();
    let puuid = json["subject"].as_str().unwrap_or("").to_string();

    if auth_token.is_empty() || entitlement_token.is_empty() || puuid.is_empty() {
        return Err("Không lấy được thông tin đăng nhập. Hãy chắc chắn bạn đã đăng nhập Riot Client!".to_string());
    }

    // Lấy Region / Shard
    let region_url = format!("https://127.0.0.1:{}/riotclient/region-locale", port);
    let region_resp = client.get(&region_url)
        .header("Authorization", format!("Basic {}", base64_auth))
        .send()
        .await
        .map_err(|e| format!("Lỗi region: {}", e))?;
    let region_json: serde_json::Value = region_resp.json().await.unwrap_or(serde_json::json!({}));
    let region = region_json["region"].as_str().unwrap_or("ap").to_lowercase();
    
    let shard = match region.as_str() {
        "latam" | "br" | "na" | "pbe" => "na",
        "kr" => "kr",
        "eu" => "eu",
        _ => "ap",
    }.to_string();

    // Lấy GameName
    let session_url = format!("https://127.0.0.1:{}/chat/v1/session", port);
    let session_resp = client.get(&session_url)
        .header("Authorization", format!("Basic {}", base64_auth))
        .send()
        .await;
        
    let mut game_name = format!("RiotAccount#{}", &puuid[..5]);
    if let Ok(resp) = session_resp {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(name) = json["game_name"].as_str() {
                if let Some(tag) = json["game_tag"].as_str() {
                    game_name = format!("{}#{}", name, tag);
                }
            }
        }
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let account = SavedRiotAccount {
        puuid: puuid.clone(),
        game_name,
        username: None,
        password: None,
        shard,
        auth_token,
        entitlement_token,
        last_updated: now,
        login_type: "riot_client".to_string(),
        // Bóc cookie phiên (ssid sống lâu) từ file session của Riot Client đang
        // chạy để có thể tự gia hạn token sau này mà không cần mở lại Client.
        reauth_cookies: read_live_session_cookies(),
    };

    // Sao lưu tệp session của Riot Games Client để phục vụ tính năng khôi phục tài khoản
    let _ = backup_riot_session(&puuid);

    // Lưu
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_dir = PathBuf::from(&app_data).join("htssclub");
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    let accounts_path = config_dir.join("valorant_accounts.json");
    
    let mut accounts = Vec::new();
    if accounts_path.exists() {
        if let Ok(content) = fs::read_to_string(&accounts_path) {
            accounts = serde_json::from_str::<Vec<SavedRiotAccount>>(&content).unwrap_or_default();
        }
    }
    
    if let Some(pos) = accounts.iter().position(|a| a.puuid == puuid) {
        accounts[pos] = account.clone();
    } else {
        accounts.push(account.clone());
    }
    
    let pretty = serde_json::to_string_pretty(&accounts).map_err(|e| e.to_string())?;
    fs::write(&accounts_path, pretty).map_err(|e| e.to_string())?;

    // Đặt thành active
    let active_path = config_dir.join("active_account.json");
    let active_config = ActiveAccountConfig { puuid: Some(puuid) };
    if let Ok(active_pretty) = serde_json::to_string_pretty(&active_config) {
        let _ = fs::write(&active_path, active_pretty);
    }
    
    Ok(account)
}

#[tauri::command]
async fn get_valorant_accounts() -> Result<Vec<SavedRiotAccount>, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let accounts_path = PathBuf::from(&app_data)
        .join("htssclub")
        .join("valorant_accounts.json");
        
    if !accounts_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&accounts_path).map_err(|e| e.to_string())?;
    let accounts: Vec<SavedRiotAccount> = serde_json::from_str(&content).unwrap_or_default();
    
    // Ẩn mật khẩu khi gửi lên frontend để bảo mật
    let mut safe_accounts = accounts;
    for acc in &mut safe_accounts {
        if acc.password.is_some() {
            acc.password = Some("••••••••".to_string());
        }
    }
    
    Ok(safe_accounts)
}

#[tauri::command]
async fn delete_valorant_account(puuid: String) -> Result<(), String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_dir = PathBuf::from(&app_data).join("htssclub");
    let accounts_path = config_dir.join("valorant_accounts.json");
    
    if accounts_path.exists() {
        let content = fs::read_to_string(&accounts_path).map_err(|e| e.to_string())?;
        let mut accounts = serde_json::from_str::<Vec<SavedRiotAccount>>(&content).unwrap_or_default();
        
        if let Some(pos) = accounts.iter().position(|a| a.puuid == puuid) {
            accounts.remove(pos);
            let pretty = serde_json::to_string_pretty(&accounts).map_err(|e| e.to_string())?;
            fs::write(&accounts_path, pretty).map_err(|e| e.to_string())?;
        }
    }
    
    // Nếu xóa tài khoản đang active, reset về mặc định
    let active_path = config_dir.join("active_account.json");
    if active_path.exists() {
        if let Ok(content) = fs::read_to_string(&active_path) {
            if let Ok(config) = serde_json::from_str::<ActiveAccountConfig>(&content) {
                if config.puuid == Some(puuid) {
                    let new_config = ActiveAccountConfig { puuid: Some("running_client".to_string()) };
                    if let Ok(pretty) = serde_json::to_string_pretty(&new_config) {
                        let _ = fs::write(&active_path, pretty);
                    }
                }
            }
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn set_active_valorant_account(puuid: String) -> Result<(), String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_dir = PathBuf::from(&app_data).join("htssclub");
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    let active_path = config_dir.join("active_account.json");
    
    let active_config = ActiveAccountConfig { puuid: Some(puuid.clone()) };
    let pretty = serde_json::to_string_pretty(&active_config).map_err(|e| e.to_string())?;
    fs::write(&active_path, pretty).map_err(|e| e.to_string())?;

    if puuid == "running_client" {
        // Khôi phục lại session mặc định gốc của máy tính, mở lại Riot Client.
        let _ = restore_riot_session("original_session");
        let _ = open_riot_client();
        return Ok(());
    }

    // Xác định loại tài khoản để quyết định cách kích hoạt.
    let login_type = read_accounts_raw()
        .into_iter()
        .find(|a| a.puuid == puuid)
        .map(|a| a.login_type)
        .unwrap_or_else(|| "riot_client".to_string());

    if login_type == "credentials" {
        // Tài khoản mật khẩu dùng token đã lưu (tự gia hạn) để gọi API trực
        // tiếp, không cần Riot Client. Chỉ cần đảm bảo token còn hạn.
        let _ = refresh_account_if_needed(&puuid).await;
    } else {
        // Tài khoản kiểu Riot Client: gia hạn session (ssid xoay vòng) rồi khôi
        // phục tệp session và mở lại Client để chắc chắn đăng nhập được.
        let _ = refresh_riot_client_session(&puuid).await;
        let _ = restore_riot_session(&puuid);
        let _ = open_riot_client();
    }

    Ok(())
}

/// Gia hạn phiên SSO của một tài khoản kiểu Riot Client trước khi khôi phục vào
/// Client. Dùng reauth cookie (ssid) đã lưu để lấy token + cookie mới, rồi cập
/// nhật lại file session yaml (`riot_sessions/<puuid>.yaml`) với ssid mới nhất.
/// Không trả lỗi ra ngoài — nếu gia hạn thất bại vẫn dùng session cũ.
async fn refresh_riot_client_session(puuid: &str) -> Result<(), String> {
    // Lấy cookie reauth từ tài khoản đã lưu, hoặc từ chính file session.
    let accounts = read_accounts_raw();
    let acc = accounts.into_iter().find(|a| a.puuid == puuid);
    let cookies = acc
        .as_ref()
        .and_then(|a| a.reauth_cookies.clone())
        .filter(|c| !c.is_empty())
        .or_else(|| read_backup_session_cookies(puuid));

    let cookies = match cookies {
        Some(c) => c,
        None => return Ok(()), // không có gì để gia hạn
    };

    // Gọi reauth để lấy access_token + cookie phiên mới.
    let (new_auth, _new_ent, new_cookies) = match riot_reauth_with_cookies(&cookies).await {
        Ok(v) => v,
        Err(_) => return Ok(()), // ssid hết hạn hẳn → giữ session cũ, để Client tự xử lý
    };

    // Chuyển chuỗi cookie mới thành RiotCookie để dựng lại file session.
    let mut riot_cookies: Vec<RiotCookie> = Vec::new();
    for pair in new_cookies.split(';') {
        if let Some((k, v)) = pair.split_once('=') {
            let name = k.trim().to_string();
            let value = v.trim().to_string();
            if name.is_empty() || value.is_empty() {
                continue;
            }
            riot_cookies.push(RiotCookie {
                name,
                value,
                domain: "auth.riotgames.com".to_string(),
                http_only: true,
                secure: true,
                persistent: true,
            });
        }
    }

    // Dựng lại file session với ssid mới (nếu có).
    let region = jwt_extract_region(&new_auth).unwrap_or_default();
    if riot_cookies.iter().any(|c| c.name == "ssid") {
        let _ = save_browser_session_yaml(puuid, &region, &riot_cookies);
        log::info!("[riot-login] đã gia hạn session cho {}", puuid);
    }

    // Cập nhật token + cookie mới vào danh sách tài khoản để API vẫn dùng được.
    let mut accounts = read_accounts_raw();
    if let Some(a) = accounts.iter_mut().find(|a| a.puuid == puuid) {
        a.auth_token = new_auth;
        if !new_cookies.is_empty() {
            a.reauth_cookies = Some(new_cookies);
        }
        a.last_updated = now_secs();
        let _ = write_accounts_raw(&accounts);
    }

    Ok(())
}

/// Gia hạn token nếu sắp/đã hết hạn; bỏ qua nếu còn hạn. Không trả lỗi ra ngoài.
async fn refresh_account_if_needed(puuid: &str) -> Result<(), String> {
    let acc = read_accounts_raw().into_iter().find(|a| a.puuid == puuid);
    if let Some(acc) = acc {
        if !jwt_still_valid(&acc.auth_token, 120) {
            let _ = refresh_account_tokens(puuid).await?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn get_active_valorant_account() -> Result<String, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let active_path = PathBuf::from(&app_data)
        .join("htssclub")
        .join("active_account.json");
        
    if !active_path.exists() {
        return Ok("running_client".to_string());
    }
    
    let content = fs::read_to_string(&active_path).map_err(|e| e.to_string())?;
    let config: ActiveAccountConfig = serde_json::from_str(&content).unwrap_or(ActiveAccountConfig { puuid: Some("running_client".to_string()) });
    
    Ok(config.puuid.unwrap_or_else(|| "running_client".to_string()))
}

#[tauri::command]
async fn logout_riot_client_keep_session() -> Result<(), String> {
    // 1. Tắt Riot Client đang chạy để tránh khóa tệp
    kill_riot_client_processes();
    
    // 2. Xóa tệp cấu hình session RiotGamesPrivateSettings.yaml
    let local_app_data = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let yaml_path = PathBuf::from(local_app_data)
        .join("Riot Games")
        .join("Riot Client")
        .join("Data")
        .join("RiotGamesPrivateSettings.yaml");
        
    if yaml_path.exists() {
        let _ = fs::remove_file(&yaml_path);
    }
    
    // 3. Reset active account trạng thái về mặc định
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let active_path = PathBuf::from(&app_data)
        .join("htssclub")
        .join("active_account.json");
        
    let active_config = ActiveAccountConfig { puuid: Some("running_client".to_string()) };
    if let Ok(pretty) = serde_json::to_string_pretty(&active_config) {
        let _ = fs::write(&active_path, pretty);
    }
    
    // 4. Mở lại Riot Client (sẽ mở màn hình đăng nhập mới sạch sẽ)
    let _ = open_riot_client();
    
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorefrontRequest {
    pub puuid: String,
    pub auth_token: String,
    pub entitlement_token: String,
    pub shard: String,
}

async fn get_valorant_client_headers(client: &reqwest::Client) -> Result<(String, &'static str), String> {
    let version_resp: serde_json::Value = client.get("https://valorant-api.com/v1/version")
        .send()
        .await
        .map_err(|e| format!("Lỗi khi lấy version: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Lỗi parse version JSON: {}", e))?;

    let client_version = version_resp["data"]["riotClientVersion"]
        .as_str()
        .unwrap_or("release-08.09-shipping-1-2487373")
        .to_string();

    let client_platform = "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9";

    Ok((client_version, client_platform))
}

#[tauri::command]
async fn fetch_valorant_storefront(req: StorefrontRequest) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let (client_version, client_platform) = get_valorant_client_headers(&client).await?;

    let url = format!(
        "https://pd.{}.a.pvp.net/store/v3/storefront/{}",
        req.shard, req.puuid
    );

    let resp = client.post(&url)
        .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
        .header("Authorization", format!("Bearer {}", req.auth_token))
        .header("X-Riot-Entitlements-JWT", req.entitlement_token)
        .header("X-Riot-ClientVersion", &client_version)
        .header("X-Riot-ClientPlatform", client_platform)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .map_err(|e| format!("Lỗi khi gọi Store API: {}", e))?;

    let status = resp.status();
    let store_resp_raw = resp.text().await.map_err(|e| format!("Lỗi đọc body Store API: {}", e))?;

    if !status.is_success() {
        return Err(format!("Riot API lỗi - Shard: {}, PUUID: {}, Status: {}, Body: {}", req.shard, req.puuid, status, store_resp_raw));
    }

    let store_resp: serde_json::Value = serde_json::from_str(&store_resp_raw)
        .map_err(|e| format!("Lỗi parse JSON: {}", e))?;

    Ok(store_resp)
}

#[tauri::command]
async fn fetch_valorant_mmr(req: StorefrontRequest) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let (client_version, client_platform) = get_valorant_client_headers(&client).await?;

    let url = format!(
        "https://pd.{}.a.pvp.net/mmr/v1/players/{}",
        req.shard, req.puuid
    );

    let resp = client.get(&url)
        .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
        .header("Authorization", format!("Bearer {}", req.auth_token))
        .header("X-Riot-Entitlements-JWT", req.entitlement_token)
        .header("X-Riot-ClientVersion", &client_version)
        .header("X-Riot-ClientPlatform", client_platform)
        .send()
        .await
        .map_err(|e| format!("Lỗi khi gọi MMR API: {}", e))?;

    let status = resp.status();
    let resp_raw = resp.text().await.map_err(|e| format!("Lỗi đọc body MMR API: {}", e))?;

    if !status.is_success() {
        return Err(format!("Riot API lỗi - Shard: {}, PUUID: {}, Status: {}, Body: {}", req.shard, req.puuid, status, resp_raw));
    }

    let json: serde_json::Value = serde_json::from_str(&resp_raw).map_err(|e| format!("Lỗi parse JSON: {}", e))?;
    Ok(json)
}

#[tauri::command]
async fn fetch_valorant_match_history(req: StorefrontRequest) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let (client_version, client_platform) = get_valorant_client_headers(&client).await?;

    // 1. Fetch History list (last 5 comp matches)
    let history_url = format!("https://pd.{}.a.pvp.net/match-history/v1/history/{}?startIndex=0&endIndex=5&queue=competitive", req.shard, req.puuid);
    let hist_resp = client.get(&history_url)
        .header("Authorization", format!("Bearer {}", req.auth_token))
        .header("X-Riot-Entitlements-JWT", &req.entitlement_token)
        .header("X-Riot-ClientVersion", &client_version)
        .header("X-Riot-ClientPlatform", client_platform)
        .send()
        .await
        .map_err(|e| format!("Lỗi History: {}", e))?;
    
    let hist_json: serde_json::Value = hist_resp.json().await.unwrap_or(serde_json::json!({}));
    let matches = hist_json["History"].as_array();
    
    if matches.is_none() {
        return Ok(serde_json::json!([]));
    }

    let matches_arr = matches.unwrap();
    let mut results = vec![];
    let mut all_puuids = std::collections::HashSet::new();

    // 2. Sequentially fetch match details (max 5)
    for m in matches_arr.iter().take(5) {
        if let Some(match_id) = m["MatchID"].as_str() {
            let detail_url = format!("https://pd.{}.a.pvp.net/match-details/v1/matches/{}", req.shard, match_id);
            if let Ok(res) = client.get(&detail_url)
                .header("Authorization", format!("Bearer {}", req.auth_token))
                .header("X-Riot-Entitlements-JWT", &req.entitlement_token)
                .header("X-Riot-ClientVersion", &client_version)
                .header("X-Riot-ClientPlatform", client_platform)
                .send()
                .await 
            {
                if let Ok(json) = res.json::<serde_json::Value>().await {
                    if let Some(players) = json["players"].as_array() {
                        for p in players {
                            if let Some(puuid) = p["subject"].as_str() {
                                all_puuids.insert(puuid.to_string());
                            }
                        }
                    }
                    results.push(json);
                }
            }
        }
    }

    // 3. Resolve names using name-service
    if !all_puuids.is_empty() {
        let puuids_vec: Vec<String> = all_puuids.into_iter().collect();
        let name_url = format!("https://pd.{}.a.pvp.net/name-service/v2/players", req.shard);
        if let Ok(name_res) = client.put(&name_url)
            .header("Authorization", format!("Bearer {}", req.auth_token))
            .header("X-Riot-Entitlements-JWT", &req.entitlement_token)
            .header("X-Riot-ClientVersion", &client_version)
            .header("X-Riot-ClientPlatform", client_platform)
            .json(&puuids_vec)
            .send()
            .await 
        {
            if let Ok(names_json) = name_res.json::<serde_json::Value>().await {
                if let Some(names_arr) = names_json.as_array() {
                    let mut name_map = std::collections::HashMap::new();
                    for n in names_arr {
                        if let (Some(subj), Some(gn), Some(tag)) = (n["Subject"].as_str(), n["GameName"].as_str(), n["TagLine"].as_str()) {
                            name_map.insert(subj.to_string(), (gn.to_string(), tag.to_string()));
                        }
                    }

                    for match_detail in results.iter_mut() {
                        if let Some(players) = match_detail["players"].as_array_mut() {
                            for p in players {
                                if let Some(puuid) = p["subject"].as_str() {
                                    if let Some((gn, tag)) = name_map.get(puuid) {
                                        p["gameName"] = serde_json::json!(gn);
                                        p["tagLine"] = serde_json::json!(tag);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!(results))
}

#[tauri::command]
async fn fetch_valorant_contracts(req: StorefrontRequest) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let (client_version, client_platform) = get_valorant_client_headers(&client).await?;

    let url = format!("https://pd.{}.a.pvp.net/contracts/v1/contracts/{}", req.shard, req.puuid);
    let resp = client.get(&url)
        .header("Authorization", format!("Bearer {}", req.auth_token))
        .header("X-Riot-Entitlements-JWT", req.entitlement_token)
        .header("X-Riot-ClientVersion", &client_version)
        .header("X-Riot-ClientPlatform", client_platform)
        .send()
        .await
        .map_err(|e| format!("Lỗi Contracts API: {}", e))?;
    
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
fn open_riot_client() -> Result<(), String> {
    let paths = [
        r"C:\Riot Games\Riot Client\RiotClientServices.exe",
        r"D:\Riot Games\Riot Client\RiotClientServices.exe",
        r"E:\Riot Games\Riot Client\RiotClientServices.exe",
    ];

    for path in &paths {
        if std::path::Path::new(path).exists() {
            create_silent_command(path)
                .spawn()
                .map_err(|e| format!("Không thể chạy Riot Client: {}", e))?;
            return Ok(());
        }
    }

    // Fallback to custom protocol
    #[cfg(target_os = "windows")]
    {
        create_silent_command("cmd")
            .args(&["/C", "start", "riotclient://"])
            .spawn()
            .map_err(|e| format!("Không thể mở giao thức Riot Client: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Hệ điều hành không hỗ trợ tự động mở Riot Client".to_string())
    }
}

// ════════════════════════════════════════════════════════════════════════════
// QUẢN LÝ TÀI KHOẢN STEAM
//
// Steam lưu danh sách tài khoản đã đăng nhập ở `<Steam>/config/loginusers.vdf`
// và tài khoản tự đăng nhập ở registry `HKCU\Software\Valve\Steam\AutoLoginUser`.
// Để đổi tài khoản: đặt AutoLoginUser = account name, bật cờ trong vdf, tắt
// Steam rồi mở lại — Steam sẽ tự đăng nhập (nếu RememberPassword được bật).
// ════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SteamAccount {
    pub steam_id: String,
    pub account_name: String,
    pub persona_name: String,
    pub remember_password: bool,
    pub most_recent: bool,
    pub timestamp: u64,
    // Các trường vdf gốc để có thể khôi phục đầy đủ entry vào loginusers.vdf
    // khi chuyển tài khoản (kể cả khi Steam đã xoá account khỏi vdf).
    #[serde(default)]
    pub wants_offline_mode: String,
    #[serde(default)]
    pub skip_offline_warning: String,
    #[serde(default)]
    pub allow_auto_login: String,
    // Ghi chú/nhãn tuỳ chỉnh người dùng đặt cho tài khoản (lưu vào file).
    #[serde(default)]
    pub note: String,
    // Tài khoản này có đang nằm trong loginusers.vdf của Steam không (runtime).
    // KHÔNG dùng skip_serializing vì struct này cũng là response trả về frontend
    // (cần gửi đi). Khi ghi file giá trị này luôn là mặc định nên vô hại.
    #[serde(default)]
    pub in_vdf: bool,
}

/// Đường dẫn file quản lý tài khoản Steam của riêng app.
fn steam_accounts_file() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let dir = PathBuf::from(&app_data).join("htssclub");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join("steam_accounts.json"))
}

/// Đọc danh sách tài khoản Steam đã lưu trong file quản lý của app.
fn read_managed_steam_accounts() -> Vec<SteamAccount> {
    steam_accounts_file()
        .ok()
        .filter(|p| p.exists())
        .and_then(|p| fs::read_to_string(&p).ok())
        .and_then(|c| serde_json::from_str::<Vec<SteamAccount>>(&c).ok())
        .unwrap_or_default()
}

/// Ghi danh sách tài khoản Steam vào file quản lý của app.
fn write_managed_steam_accounts(accounts: &[SteamAccount]) -> Result<(), String> {
    let path = steam_accounts_file()?;
    let pretty = serde_json::to_string_pretty(accounts).map_err(|e| e.to_string())?;
    fs::write(&path, pretty).map_err(|e| e.to_string())
}

/// Lấy đường dẫn cài đặt Steam từ registry (fallback về thư mục mặc định).
fn get_steam_path() -> Option<PathBuf> {
    let output = create_silent_command("reg")
        .args([
            "query",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "SteamPath",
        ])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if line.contains("SteamPath") {
            // Dạng: "    SteamPath    REG_SZ    c:/program files (x86)/steam"
            if let Some(idx) = line.find("REG_SZ") {
                let p = line[idx + "REG_SZ".len()..].trim();
                if !p.is_empty() {
                    return Some(PathBuf::from(p.replace('/', "\\")));
                }
            }
        }
    }
    let default = PathBuf::from(r"C:\Program Files (x86)\Steam");
    if default.exists() {
        Some(default)
    } else {
        None
    }
}

/// Đọc giá trị registry AutoLoginUser hiện tại.
fn get_steam_autologin_user() -> Option<String> {
    let output = create_silent_command("reg")
        .args([
            "query",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "AutoLoginUser",
        ])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if line.contains("AutoLoginUser") {
            if let Some(idx) = line.find("REG_SZ") {
                let v = line[idx + "REG_SZ".len()..].trim();
                return Some(v.to_string());
            }
        }
    }
    None
}

/// Parser tối giản cho định dạng VDF của loginusers.vdf.
/// Trả về danh sách (steam_id, map<key, value>).
fn parse_loginusers_vdf(content: &str) -> Vec<(String, std::collections::HashMap<String, String>)> {
    let mut result = Vec::new();
    let mut current_id: Option<String> = None;
    let mut current_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut depth = 0; // 0 = ngoài "users", 1 = trong users, 2 = trong 1 account

    // Tách các token nằm trong dấu ngoặc kép.
    fn quoted_tokens(line: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut chars = line.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '"' {
                let mut s = String::new();
                for c2 in chars.by_ref() {
                    if c2 == '"' {
                        break;
                    }
                    s.push(c2);
                }
                out.push(s);
            }
        }
        out
    }

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "{" {
            depth += 1;
            continue;
        }
        if trimmed == "}" {
            if depth == 2 {
                // Kết thúc một account.
                if let Some(id) = current_id.take() {
                    result.push((id, std::mem::take(&mut current_map)));
                }
            }
            if depth > 0 {
                depth -= 1;
            }
            continue;
        }

        let tokens = quoted_tokens(trimmed);
        if depth == 1 && tokens.len() == 1 {
            // Tên block account = steam_id.
            current_id = Some(tokens[0].clone());
            current_map.clear();
        } else if depth == 2 && tokens.len() >= 2 {
            current_map.insert(tokens[0].clone(), tokens[1].clone());
        }
    }

    result
}

/// Đọc tài khoản từ loginusers.vdf (trạng thái sống của Steam).
fn read_vdf_steam_accounts() -> Vec<SteamAccount> {
    let steam_path = match get_steam_path() {
        Some(p) => p,
        None => return Vec::new(),
    };
    let vdf_path = steam_path.join("config").join("loginusers.vdf");
    if !vdf_path.exists() {
        return Vec::new();
    }
    let bytes = match fs::read(&vdf_path) {
        Ok(b) => b,
        Err(_) => return Vec::new(),
    };
    let content = String::from_utf8_lossy(&bytes);

    parse_loginusers_vdf(&content)
        .into_iter()
        .map(|(steam_id, m)| SteamAccount {
            steam_id,
            account_name: m.get("AccountName").cloned().unwrap_or_default(),
            persona_name: m.get("PersonaName").cloned().unwrap_or_default(),
            remember_password: m.get("RememberPassword").map(|v| v == "1").unwrap_or(false),
            most_recent: m.get("MostRecent").map(|v| v == "1").unwrap_or(false),
            timestamp: m.get("Timestamp").and_then(|v| v.parse().ok()).unwrap_or(0),
            wants_offline_mode: m.get("WantsOfflineMode").cloned().unwrap_or_else(|| "0".to_string()),
            skip_offline_warning: m.get("SkipOfflineModeWarning").cloned().unwrap_or_else(|| "0".to_string()),
            allow_auto_login: m.get("AllowAutoLogin").cloned().unwrap_or_else(|| "0".to_string()),
            note: String::new(),
            in_vdf: true,
        })
        .collect()
}

#[tauri::command]
async fn get_steam_accounts() -> Result<Vec<SteamAccount>, String> {
    // 1. Đọc trạng thái sống từ loginusers.vdf.
    let live = read_vdf_steam_accounts();

    // 2. Gộp vào danh sách quản lý riêng của app: thêm mới / cập nhật thông tin,
    //    nhưng GIỮ LẠI tài khoản đã lưu kể cả khi Steam đã xoá khỏi vdf.
    let live_ids: std::collections::HashSet<String> =
        live.iter().map(|a| a.steam_id.clone()).collect();
    let mut managed = read_managed_steam_accounts();
    for acc in &live {
        if let Some(existing) = managed.iter_mut().find(|a| a.steam_id == acc.steam_id) {
            // Cập nhật thông tin mới nhất từ vdf.
            existing.account_name = acc.account_name.clone();
            if !acc.persona_name.is_empty() {
                existing.persona_name = acc.persona_name.clone();
            }
            existing.remember_password = acc.remember_password;
            existing.most_recent = acc.most_recent;
            if acc.timestamp > 0 {
                existing.timestamp = acc.timestamp;
            }
            existing.wants_offline_mode = acc.wants_offline_mode.clone();
            existing.skip_offline_warning = acc.skip_offline_warning.clone();
            existing.allow_auto_login = acc.allow_auto_login.clone();
        } else {
            managed.push(acc.clone());
        }
    }

    let _ = write_managed_steam_accounts(&managed);

    // 3. Đánh dấu tài khoản nào đang có trong loginusers.vdf (đang đăng nhập sẵn
    //    trên Steam).
    for acc in managed.iter_mut() {
        acc.in_vdf = live_ids.contains(&acc.steam_id);
    }

    // 4. Sắp xếp: tài khoản đang active (MostRecent) lên đầu, rồi tới các tài
    //    khoản đang có trong vdf, cuối cùng theo thời gian đăng nhập gần nhất.
    managed.sort_by(|a, b| {
        b.most_recent
            .cmp(&a.most_recent)
            .then(b.in_vdf.cmp(&a.in_vdf))
            .then(b.timestamp.cmp(&a.timestamp))
    });
    Ok(managed)
}

/// Lấy ảnh đại diện của một tài khoản Steam dưới dạng data URI base64.
/// (Không thể load trực tiếp file local trong webview nên trả về base64.)
#[tauri::command]
async fn get_steam_avatar(steam_id: String) -> Result<Option<String>, String> {
    let steam_path = match get_steam_path() {
        Some(p) => p,
        None => return Ok(None),
    };
    let avatar_path = steam_path
        .join("config")
        .join("avatarcache")
        .join(format!("{}.png", steam_id));
    if !avatar_path.exists() {
        return Ok(None);
    }
    let bytes = match fs::read(&avatar_path) {
        Ok(b) => b,
        Err(_) => return Ok(None),
    };
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(Some(format!("data:image/png;base64,{}", b64)))
}

/// Tắt Steam SẠCH SẼ và chờ thoát hẳn. Quan trọng: chỉ dùng `-shutdown` (cách
/// chính thức) và CHỜ Steam tự đóng. KHÔNG force-kill giữa chừng vì sẽ tạo file
/// `.crash` khiến Steam khởi động lại ở chế độ phục hồi và bỏ qua AutoLoginUser.
/// Trả về true nếu Steam đã đóng hẳn.
fn shutdown_steam_clean() -> bool {
    let steam_running = || -> bool {
        create_silent_command("tasklist")
            .args(["/FI", "IMAGENAME eq steam.exe", "/NH"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains("steam.exe"))
            .unwrap_or(false)
    };

    if !steam_running() {
        return true;
    }

    // Gửi lệnh thoát chính thức.
    if let Some(steam_path) = get_steam_path() {
        let exe = steam_path.join("steam.exe");
        if exe.exists() {
            let _ = create_silent_command(exe).args(["-shutdown"]).spawn();
        }
    }

    // Chờ Steam tự đóng hoàn toàn (tối đa ~15s). Steam cần thời gian flush token.
    for _ in 0..30 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if !steam_running() {
            // Chờ thêm một nhịp để Steam ghi xong file config.
            std::thread::sleep(std::time::Duration::from_millis(800));
            return true;
        }
    }

    // Hết thời gian mà Steam vẫn chạy → để gọi nơi khác quyết định.
    false
}

/// Tắt Steam (ưu tiên sạch; chỉ force-kill khi `-shutdown` không hiệu quả).
fn kill_steam_processes() {
    if shutdown_steam_clean() {
        return;
    }
    // Fallback: Steam treo, buộc phải kill.
    for img in ["steam.exe", "steamwebhelper.exe", "steamservice.exe"] {
        let _ = create_silent_command("taskkill")
            .args(["/F", "/T", "/IM", img])
            .output();
    }
    std::thread::sleep(std::time::Duration::from_millis(1000));
}

/// Mở lại Steam. Nếu có `login_user`, truyền `-login <user>` để Steam đăng nhập
/// thẳng tài khoản đó (kết hợp token đã lưu). Nếu không, mở bình thường (Steam
/// dùng AutoLoginUser trong registry).
fn launch_steam_with(login_user: Option<&str>) -> Result<(), String> {
    let steam_path = get_steam_path().ok_or_else(|| "Không tìm thấy Steam.".to_string())?;
    let exe = steam_path.join("steam.exe");
    if exe.exists() {
        let mut cmd = create_silent_command(&exe);
        if let Some(user) = login_user {
            if !user.is_empty() {
                cmd.args(["-login", user]);
            }
        }
        cmd.spawn()
            .map_err(|e| format!("Không thể chạy Steam: {}", e))?;
        Ok(())
    } else {
        #[cfg(target_os = "windows")]
        {
            create_silent_command("cmd")
                .args(["/C", "start", "steam://open/main"])
                .spawn()
                .map_err(|e| format!("Không thể mở Steam: {}", e))?;
            Ok(())
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err("Chỉ hỗ trợ trên Windows.".to_string())
        }
    }
}

/// Mở lại Steam (theo AutoLoginUser trong registry).
fn launch_steam_internal() -> Result<(), String> {
    launch_steam_with(None)
}

#[tauri::command]
async fn launch_steam() -> Result<(), String> {
    launch_steam_internal()
}

/// Thêm tài khoản Steam mới: tắt Steam, xoá AutoLoginUser để Steam mở ra màn
/// hình đăng nhập trống, người dùng đăng nhập tài khoản mới (nhớ tích "Ghi nhớ
/// mật khẩu") thì lần sau sẽ xuất hiện trong danh sách.
#[tauri::command]
async fn add_steam_account() -> Result<(), String> {
    // 1. Tắt Steam sạch trước.
    kill_steam_processes();

    // 2. Xoá AutoLoginUser để Steam hiện màn đăng nhập (không tự vào tài khoản cũ).
    let _ = create_silent_command("reg")
        .args([
            "delete",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "AutoLoginUser",
            "/f",
        ])
        .output();

    // 3. Mở lại Steam ở màn hình đăng nhập.
    launch_steam_internal()?;
    Ok(())
}

/// Đăng xuất / Clear: xoá toàn bộ tài khoản khỏi loginusers.vdf của Steam và
/// bỏ AutoLoginUser. Sau khi mở lại, Steam hiện màn hình đăng nhập trống; tài
/// khoản nào đăng nhập sẽ được Steam tự thêm lại vào loginusers.vdf.
/// (Danh sách quản lý trong app vẫn được giữ để tham khảo.)
#[tauri::command]
async fn logout_steam_account() -> Result<(), String> {
    // 1. Tắt Steam sạch.
    kill_steam_processes();

    // 2. Bỏ AutoLoginUser để Steam không tự đăng nhập.
    let _ = create_silent_command("reg")
        .args([
            "delete",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "AutoLoginUser",
            "/f",
        ])
        .output();

    // 3. Clear loginusers.vdf — ghi block users rỗng. Steam sẽ tự gắn lại tài
    //    khoản khi đăng nhập.
    if let Some(steam_path) = get_steam_path() {
        let vdf_path = steam_path.join("config").join("loginusers.vdf");
        let empty = "\"users\"\n{\n}\n";
        let _ = fs::write(&vdf_path, empty);
    }

    // 4. Mở lại Steam (màn hình đăng nhập trống).
    launch_steam_internal()?;
    Ok(())
}
#[tauri::command]
async fn switch_steam_account(account_name: String, steam_id: String) -> Result<(), String> {
    if account_name.trim().is_empty() {
        return Err("Tên tài khoản trống.".to_string());
    }

    // 1. TẮT STEAM TRƯỚC. Steam giữ config trong bộ nhớ và ghi đè loginusers.vdf
    //    khi thoát, nên phải tắt sạch trước rồi mới ghi cấu hình.
    kill_steam_processes();

    // 2. Đặt registry AutoLoginUser = account_name.
    let set_user = create_silent_command("reg")
        .args([
            "add",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "AutoLoginUser",
            "/t",
            "REG_SZ",
            "/d",
            &account_name,
            "/f",
        ])
        .output()
        .map_err(|e| format!("Lỗi đặt AutoLoginUser: {}", e))?;
    if !set_user.status.success() {
        return Err("Không thể ghi AutoLoginUser vào registry.".to_string());
    }

    // Steam còn đọc AutoLoginUser ở nhánh con theo ngôn ngữ; ghi cả hai cho chắc.
    let _ = create_silent_command("reg")
        .args([
            "add",
            r"HKCU\Software\Valve\Steam\ActiveProcess",
            "/v",
            "AutoLoginUser",
            "/t",
            "REG_SZ",
            "/d",
            &account_name,
            "/f",
        ])
        .output();

    // 3. Bật RememberPassword (DWORD) để Steam không hỏi mật khẩu.
    let _ = create_silent_command("reg")
        .args([
            "add",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "RememberPassword",
            "/t",
            "REG_DWORD",
            "/d",
            "1",
            "/f",
        ])
        .output();

    // 4. Khôi phục & cập nhật loginusers.vdf từ danh sách quản lý: tài khoản
    //    được chọn được bật MostRecent/AllowAutoLogin, các tài khoản khác tắt.
    //    Dựng lại toàn bộ file để chắc chắn entry tồn tại (kể cả khi Steam đã
    //    xoá account khỏi vdf trước đó).
    if let Some(steam_path) = get_steam_path() {
        let vdf_path = steam_path.join("config").join("loginusers.vdf");
        let managed = read_managed_steam_accounts();
        let new_vdf = generate_loginusers_vdf(&managed, &steam_id);
        let _ = fs::write(&vdf_path, new_vdf);
    }

    // 5. Mở lại Steam, đăng nhập thẳng tài khoản đã chọn.
    launch_steam_with(Some(&account_name))?;
    Ok(())
}

/// Dựng lại toàn bộ nội dung loginusers.vdf từ danh sách tài khoản quản lý.
/// Tài khoản `active_id` được đặt MostRecent=1 & AllowAutoLogin=1, các tài khoản
/// còn lại đặt =0. Đảm bảo entry của active_id luôn tồn tại trong file.
fn generate_loginusers_vdf(accounts: &[SteamAccount], active_id: &str) -> String {
    fn esc(s: &str) -> String {
        s.replace('\\', "\\\\").replace('"', "\\\"")
    }

    let mut out = String::from("\"users\"\n{\n");
    for acc in accounts {
        if acc.steam_id.is_empty() || acc.account_name.is_empty() {
            continue;
        }
        let is_active = acc.steam_id == active_id;
        let most_recent = if is_active { "1" } else { "0" };
        let allow_auto = if is_active { "1" } else { "0" };
        let remember = if acc.remember_password || is_active { "1" } else { "0" };

        out.push_str(&format!("\t\"{}\"\n\t{{\n", esc(&acc.steam_id)));
        out.push_str(&format!("\t\t\"AccountName\"\t\t\"{}\"\n", esc(&acc.account_name)));
        out.push_str(&format!("\t\t\"PersonaName\"\t\t\"{}\"\n", esc(&acc.persona_name)));
        out.push_str(&format!("\t\t\"RememberPassword\"\t\t\"{}\"\n", remember));
        out.push_str(&format!("\t\t\"WantsOfflineMode\"\t\t\"{}\"\n",
            if acc.wants_offline_mode.is_empty() { "0" } else { &acc.wants_offline_mode }));
        out.push_str(&format!("\t\t\"SkipOfflineModeWarning\"\t\t\"{}\"\n",
            if acc.skip_offline_warning.is_empty() { "0" } else { &acc.skip_offline_warning }));
        out.push_str(&format!("\t\t\"AllowAutoLogin\"\t\t\"{}\"\n", allow_auto));
        out.push_str(&format!("\t\t\"MostRecent\"\t\t\"{}\"\n", most_recent));
        out.push_str(&format!("\t\t\"Timestamp\"\t\t\"{}\"\n", acc.timestamp));
        out.push_str("\t}\n");
    }
    out.push_str("}\n");
    out
}

/// Gỡ một tài khoản khỏi DANH SÁCH QUẢN LÝ của app (steam_accounts.json).
/// Không đụng tới loginusers.vdf của Steam.
#[tauri::command]
async fn remove_steam_account(steam_id: String) -> Result<(), String> {
    let mut managed = read_managed_steam_accounts();
    managed.retain(|a| a.steam_id != steam_id);
    write_managed_steam_accounts(&managed)?;
    Ok(())
}

/// Gỡ một tài khoản khỏi loginusers.vdf của Steam (gỡ khỏi màn hình đăng nhập
/// Steam). Chỉ thao tác trên các tài khoản ĐANG có thật trong vdf, giữ nguyên
/// các tài khoản còn lại. Không xoá khỏi danh sách quản lý, không xoá game.
#[tauri::command]
async fn remove_steam_from_vdf(steam_id: String) -> Result<(), String> {
    let steam_path = get_steam_path().ok_or_else(|| "Không tìm thấy Steam.".to_string())?;
    let vdf_path = steam_path.join("config").join("loginusers.vdf");
    if !vdf_path.exists() {
        return Ok(());
    }
    let mut live = read_vdf_steam_accounts();
    if !live.iter().any(|a| a.steam_id == steam_id) {
        return Ok(()); // không có trong vdf → không cần làm gì
    }
    live.retain(|a| a.steam_id != steam_id);
    // Giữ nguyên tài khoản đang active (MostRecent) nếu nó không bị gỡ.
    let active_id = live
        .iter()
        .find(|a| a.most_recent)
        .map(|a| a.steam_id.clone())
        .unwrap_or_default();
    let new_vdf = generate_loginusers_vdf(&live, &active_id);
    fs::write(&vdf_path, new_vdf).map_err(|e| format!("Lỗi ghi loginusers.vdf: {}", e))?;
    Ok(())
}

/// Lấy tên tài khoản Steam đang được đặt tự động đăng nhập (AutoLoginUser).
#[tauri::command]
async fn get_active_steam_account() -> Result<Option<String>, String> {
    Ok(get_steam_autologin_user())
}

/// Mở thư mục userdata của một tài khoản Steam trong Explorer.
/// Steam lưu userdata theo SteamID3 (account id) = SteamID64 - 76561197960265728.
#[tauri::command]
async fn open_steam_userdata(steam_id: String) -> Result<(), String> {
    let steam_path = get_steam_path().ok_or_else(|| "Không tìm thấy Steam.".to_string())?;

    // Chuyển SteamID64 → SteamID3 (account id).
    let id64: u64 = steam_id
        .trim()
        .parse()
        .map_err(|_| "SteamID không hợp lệ.".to_string())?;
    const STEAM64_BASE: u64 = 76561197960265728;
    if id64 < STEAM64_BASE {
        return Err("SteamID không hợp lệ.".to_string());
    }
    let id3 = id64 - STEAM64_BASE;

    let userdata_dir = steam_path.join("userdata").join(id3.to_string());

    // Nếu thư mục theo id chưa tồn tại, mở thư mục userdata gốc để người dùng tự xem.
    let target = if userdata_dir.exists() {
        userdata_dir
    } else {
        let root = steam_path.join("userdata");
        if !root.exists() {
            return Err("Không tìm thấy thư mục userdata của Steam.".to_string());
        }
        root
    };

    #[cfg(target_os = "windows")]
    {
        create_silent_command("explorer")
            .arg(target.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Không thể mở thư mục: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = target;
        Err("Chỉ hỗ trợ trên Windows.".to_string())
    }
}


static ASYNC_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_async_http_client() -> &'static reqwest::Client {
    ASYNC_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .pool_max_idle_per_host(20)
            .tcp_nodelay(true)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

fn rewrite_manifest(text: &str, base_url_str: &str) -> String {
    let base_url = match Url::parse(base_url_str) {
        Ok(url) => url,
        Err(_) => return text.to_string(),
    };
    let mut new_text = String::new();
    
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            new_text.push_str(line);
            new_text.push('\n');
            continue;
        }
        
        if trimmed.starts_with('#') {
            // Rewrite URI="..." tags
            if let Some(uri_start) = trimmed.find("URI=\"") {
                let rest = &trimmed[uri_start + 5..];
                if let Some(uri_end) = rest.find('"') {
                    let raw_url = &rest[..uri_end];
                    if let Ok(resolved_url) = base_url.join(raw_url) {
                        let rewritten = format!(
                            "http://vstream.localhost/?url={}",
                            utf8_percent_encode(resolved_url.as_str(), NON_ALPHANUMERIC)
                        );
                        let mut line_rewritten = trimmed[..uri_start + 5].to_string();
                        line_rewritten.push_str(&rewritten);
                        line_rewritten.push_str(&rest[uri_end..]);
                        new_text.push_str(&line_rewritten);
                        new_text.push('\n');
                        continue;
                    }
                }
            }
            new_text.push_str(line);
            new_text.push('\n');
        } else {
            // It's a segment URL — resolve to absolute then proxy
            if let Ok(resolved_url) = base_url.join(trimmed) {
                let rewritten = format!(
                    "http://vstream.localhost/?url={}",
                    utf8_percent_encode(resolved_url.as_str(), NON_ALPHANUMERIC)
                );
                new_text.push_str(&rewritten);
                new_text.push('\n');
            } else {
                new_text.push_str(line);
                new_text.push('\n');
            }
        }
    }
    new_text
}

// ─── Discord Tools Commands ───────────────────────────────────────────────

#[tauri::command]
async fn check_discord_running() -> bool {
    let output = create_silent_command("tasklist")
        .args(&["/FI", "IMAGENAME eq Discord.exe", "/NH", "/FO", "CSV"])
        .output();
    match output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).contains("Discord.exe"),
        Err(_) => false,
    }
}

fn parse_version(s: &str) -> Option<Vec<u32>> {
    let parts: Vec<u32> = s.split('.')
        .map(|p| p.parse::<u32>().unwrap_or(0))
        .collect();
    if parts.is_empty() {
        None
    } else {
        Some(parts)
    }
}

fn get_latest_discord_app_dir(discord_dir: &std::path::Path) -> Option<PathBuf> {
    let entries = fs::read_dir(discord_dir).ok()?;
    let mut latest_dir = None;
    let mut latest_version: Option<Vec<u32>> = None;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("app-") {
                        let version_str = &name[4..];
                        if let Some(version) = parse_version(version_str) {
                            match latest_version {
                                None => {
                                    latest_version = Some(version);
                                    latest_dir = Some(path);
                                }
                                Some(ref lv) => {
                                    if version > *lv {
                                        latest_version = Some(version);
                                        latest_dir = Some(path);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    latest_dir
}

/// Kiểm tra xem một thư mục resources của Discord đã bị Equicord patch hay chưa.
///
/// Equilotl (trình cài Equicord) inject bằng cách:
///   1. Đổi tên `app.asar` gốc thành `_app.asar`.
///   2. Thay `app.asar` bằng một loader nhỏ `require(...equicord.asar)`.
///
/// Một số phiên bản cũ thì tạo thẳng thư mục `resources/app` chứa loader.
/// Hàm này xử lý cả hai trường hợp.
fn is_resources_patched(resources_dir: &std::path::Path) -> bool {
    // Cách inject cũ: tồn tại thư mục resources/app
    let legacy_app = resources_dir.join("app");
    if legacy_app.is_dir() {
        return true;
    }

    // Cách inject hiện tại: app.asar gốc được đổi tên thành _app.asar
    let backup_asar = resources_dir.join("_app.asar");
    let app_asar = resources_dir.join("app.asar");
    if backup_asar.exists() && app_asar.exists() {
        // Xác nhận app.asar là loader stub trỏ tới equicord.asar
        if let Ok(content) = fs::read(&app_asar) {
            // Loader stub rất nhỏ; chỉ đọc/so khớp khi file đủ nhỏ để tránh quét asar lớn
            if content.len() < 4096 {
                let text = String::from_utf8_lossy(&content).to_lowercase();
                if text.contains("equicord.asar") || text.contains("vencord.asar") {
                    return true;
                }
            }
        }
    }

    false
}

#[tauri::command]
async fn check_equicord_installed() -> bool {
    let local_app_data = match std::env::var("LOCALAPPDATA") {
        Ok(p) => p,
        Err(_) => return false,
    };

    let discord_branches = ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"];

    for branch in &discord_branches {
        let discord_dir = PathBuf::from(&local_app_data).join(branch);
        if discord_dir.exists() {
            if let Some(latest_app_dir) = get_latest_discord_app_dir(&discord_dir) {
                let resources_dir = latest_app_dir.join("resources");
                if is_resources_patched(&resources_dir) {
                    return true;
                }
            }
        }
    }

    false
}

#[tauri::command]
async fn install_equicord() -> Result<String, String> {
    use std::io::Write;

    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join("EquilotlCli.exe");

    // Kill Discord first
    let _ = create_silent_command("taskkill")
        .args(&["/F", "/IM", "Discord.exe"])
        .output();
    std::thread::sleep(std::time::Duration::from_millis(1500));

    // Download EquilotlCli
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://github.com/Equicord/Equilotl/releases/latest/download/EquilotlCli.exe")
        .send()
        .await
        .map_err(|e| format!("Lỗi tải installer: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub trả về lỗi: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let mut file = std::fs::File::create(&installer_path)
        .map_err(|e| format!("Không thể tạo file: {}", e))?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    drop(file);

    // Chạy EquilotlCli.exe hoàn toàn ẩn (không hiện terminal).
    //
    // Khi truyền cả `-install` và `-branch auto`, trình cài chạy ở chế độ
    // non-interactive: tự chọn bản Discord và patch ngay, không hỏi gì và
    // không chờ "Press Enter to exit". Vì vậy ta không cần mở cửa sổ CMD.
    let installer_path_owned = installer_path.clone();
    let output = tokio::task::spawn_blocking(move || {
        create_silent_command(&installer_path_owned)
            .args(&["-install", "-branch", "auto"])
            .output()
    })
    .await
    .map_err(|e| format!("Lỗi chạy trình cài đặt: {}", e))?;

    let output = output.map_err(|e| format!("Lỗi khi khởi chạy trình cài đặt: {}", e))?;

    if output.status.success() {
        Ok("Đã cài đặt Equicord thành công! Hãy mở lại Discord để áp dụng.".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Gộp stderr/stdout để lấy thông báo lỗi hữu ích nhất từ trình cài.
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            stdout.trim().to_string()
        };
        if detail.is_empty() {
            Err("Cài đặt Equicord thất bại. Hãy chắc chắn đã đóng Discord rồi thử lại.".to_string())
        } else {
            Err(format!("Cài đặt Equicord thất bại: {}", detail))
        }
    }
}

#[tauri::command]
async fn check_questify_enabled() -> Result<bool, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_path = PathBuf::from(&app_data)
        .join("Equicord")
        .join("settings")
        .join("settings.json");

    if !config_path.exists() {
        return Ok(false);
    }

    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content)
        .unwrap_or(serde_json::json!({}));

    let enabled = json["plugins"]["Questify"]["enabled"]
        .as_bool()
        .unwrap_or(false);
    Ok(enabled)
}

#[tauri::command]
async fn toggle_questify_plugin(enable: bool) -> Result<(), String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_path = PathBuf::from(&app_data)
        .join("Equicord")
        .join("settings")
        .join("settings.json");

    let mut json: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        // Create parent dir if needed
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        serde_json::json!({})
    };

    // Ensure nested structure exists
    if json["plugins"].is_null() {
        json["plugins"] = serde_json::json!({});
    }

    if json["plugins"]["Questify"].is_null() || json["plugins"]["Questify"].as_object().map_or(true, |o| o.is_empty()) {
        // Tránh macro recursion_limit bằng cách parse trực tiếp từ raw string JSON tĩnh
        let default_questify_str = r#"{
            "enabled": true,
            "migrationVersion": 1,
            "disableQuestsEverything": false,
            "questButtonDisplay": "always",
            "disableMembersListPromo": true,
            "disableFriendsListPromo": true,
            "disableRelocationNotices": true,
            "disableSponsoredBanner": false,
            "disableOrbsAndQuestsBadges": false,
            "disableAccountPanelPromo": true,
            "autoCompleteQuestTypes": {
                "PLAY_ON_DESKTOP": true,
                "PLAY_ON_XBOX": false,
                "PLAY_ON_PLAYSTATION": false,
                "PLAY_ACTIVITY": true,
                "WATCH_VIDEO": true,
                "WATCH_VIDEO_ON_MOBILE": true,
                "ACHIEVEMENT_IN_ACTIVITY": false
            },
            "disableAccountPanelQuestProgress": false,
            "isOnQuestsPage": true,
            "newExcludedQuestAlertSound": null,
            "newQuestAlertSound": "discodo",
            "questFetchInterval": 2700,
            "notifyOnNewExcludedQuests": false,
            "notifyOnNewQuests": true,
            "questButtonIndicator": "both",
            "questButtonBadgeCount": 3,
            "questButtonBadgeColor": 2842239,
            "questButtonLeftClickAction": "open-quests",
            "questButtonMiddleClickAction": "plugin-settings",
            "questButtonRightClickAction": "context-menu",
            "ignoredQuestIDs": {
                "questIDs": []
            },
            "questButtonIncludedTypes": {
                "1": true,
                "2": true,
                "3": true,
                "4": true,
                "5": true,
                "WATCH_VIDEO": true,
                "WATCH_VIDEO_ON_MOBILE": true,
                "ACHIEVEMENT_IN_ACTIVITY": true,
                "ACHIEVEMENT_IN_GAME": true,
                "PLAY_ACTIVITY": true,
                "PLAY_ON_DESKTOP": true,
                "PLAY_ON_DESKTOP_V2": true,
                "STREAM_ON_DESKTOP": true,
                "PLAY_ON_PLAYSTATION": true,
                "PLAY_ON_XBOX": true
            },
            "resumeInterruptedQuests": true,
            "rememberQuestPageSort": true,
            "lastQuestPageSort": "questify",
            "rememberQuestPageFilters": true,
            "lastQuestPageFilters": {},
            "makeMobileVideoQuestsDesktopCompatible": true,
            "unclaimedSubsort": "Expiring ASC",
            "claimedSubsort": "Claimed DESC",
            "ignoredSubsort": "Recent DESC",
            "expiredSubsort": "Expiring DESC",
            "questOrder": [
                "UNCLAIMED",
                "CLAIMED",
                "IGNORED",
                "EXPIRED"
            ],
            "questTileUnclaimedColor": {
                "enabled": true,
                "color": 2842239
            },
            "questTileClaimedColor": {
                "enabled": true,
                "color": 6105983
            },
            "questTileIgnoredColor": {
                "enabled": true,
                "color": 8334124
            },
            "questTileExpiredColor": {
                "enabled": true,
                "color": 2368553
            },
            "questTileGradient": "intense",
            "questTilePreload": true,
            "allowChangingDangerousSettings": true,
            "notifyOnQuestComplete": true,
            "questCompletedAlertSound": "bop_message1",
            "questCompletedAlertVolume": 100,
            "newQuestAlertVolume": 100,
            "newExcludedQuestAlertVolume": 100,
            "completeVideoQuestsQuicker": true,
            "autoCompleteQuestsSimultaneously": true,
            "resumeQuestIDs": {}
        }"#;

        let mut default_questify: serde_json::Value = serde_json::from_str(default_questify_str)
            .map_err(|e| format!("Lỗi cấu hình tĩnh: {}", e))?;
        
        default_questify["enabled"] = serde_json::json!(enable);
        json["plugins"]["Questify"] = default_questify;
    } else {
        // Nếu cấu hình đã tồn tại, chỉ cần bật/tắt trường enabled mà vẫn giữ lại toàn bộ tham số khác
        json["plugins"]["Questify"]["enabled"] = serde_json::json!(enable);
    }

    let new_content = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    fs::write(&config_path, new_content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn kill_discord() -> Result<(), String> {
    create_silent_command("taskkill")
        .args(&["/F", "/IM", "Discord.exe"])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn launch_discord() -> Result<(), String> {
    let local_app_data = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let discord_path = PathBuf::from(&local_app_data)
        .join("Discord")
        .join("Update.exe");
    if discord_path.exists() {
        create_silent_command(&discord_path)
            .arg("--processStart")
            .arg("Discord.exe")
            .spawn()
            .map_err(|e| format!("Không thể khởi động Discord: {}", e))?;
        return Ok(());
    }
    // Fallback: try discord:// protocol
    create_silent_command("cmd")
        .args(&["/C", "start", "discord://"])
        .spawn()
        .map_err(|e| format!("Không thể mở Discord: {}", e))?;
    Ok(())
}

use std::sync::Mutex;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

static DISCORD_RPC_CLIENT: OnceLock<Mutex<Option<DiscordIpcClient>>> = OnceLock::new();

fn get_discord_rpc_client() -> &'static Mutex<Option<DiscordIpcClient>> {
    DISCORD_RPC_CLIENT.get_or_init(|| Mutex::new(None))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscordRpcRequest {
    pub client_id: String,
    pub app_name: Option<String>,
    pub details: Option<String>,
    pub state: Option<String>,
    pub large_image: Option<String>,
    pub large_text: Option<String>,
    pub small_image: Option<String>,
    pub small_text: Option<String>,
    pub button_1_label: Option<String>,
    pub button_1_url: Option<String>,
    pub button_2_label: Option<String>,
    pub button_2_url: Option<String>,
    pub show_timestamp: Option<bool>,
    pub party_size: Option<i64>,
    pub party_max: Option<i64>,
}

#[tauri::command]
async fn set_discord_rpc(mut req: DiscordRpcRequest) -> Result<(), String> {
    if !check_discord_running().await {
        return Err("Discord không chạy. Vui lòng mở Discord trước khi kích hoạt RPC!".into());
    }

    let mutex = get_discord_rpc_client();
    let mut client_lock = mutex.lock().map_err(|e| format!("Mutex lock error: {}", e))?;

    // Helper closure to create and connect a new client
    let connect_new = |client_id: &str| -> Result<DiscordIpcClient, String> {
        let mut new_client = DiscordIpcClient::new(client_id)
            .map_err(|e| format!("Không thể khởi tạo Discord RPC Client: {}", e))?;
        new_client.connect()
            .map_err(|e| format!("Không thể kết nối đến Discord (hãy chắc chắn rằng Discord đang mở!): {}", e))?;
        Ok(new_client)
    };

    // If client ID changed, or client is None, connect a new one
    let needs_new = match &*client_lock {
        Some(client) => client.client_id != req.client_id,
        None => true,
    };

    if needs_new {
        if let Some(mut old_client) = client_lock.take() {
            let _ = old_client.close();
        }
        let new_client = connect_new(&req.client_id)?;
        *client_lock = Some(new_client);
    }

    let mut act = activity::Activity::new();

    if let Some(ref details) = req.details {
        if !details.trim().is_empty() {
            act = act.details(details.as_str());
        }
    }

    if let Some(ref state) = req.state {
        if !state.trim().is_empty() {
            act = act.state(state.as_str());
        }
    }

    let mut assets = activity::Assets::new();
    let mut has_assets = false;
    if let Some(ref large_img) = req.large_image {
        if !large_img.trim().is_empty() {
            assets = assets.large_image(large_img.as_str());
            has_assets = true;
            if let Some(ref large_txt) = req.large_text {
                if !large_txt.trim().is_empty() {
                    assets = assets.large_text(large_txt.as_str());
                }
            }
        }
    }
    if let Some(ref small_img) = req.small_image {
        if !small_img.trim().is_empty() {
            assets = assets.small_image(small_img.as_str());
            has_assets = true;
            if let Some(ref small_txt) = req.small_text {
                if !small_txt.trim().is_empty() {
                    assets = assets.small_text(small_txt.as_str());
                }
            }
        }
    }
    if has_assets {
        act = act.assets(assets);
    }

    // Format and rewrite URLs in-place so they own the lifetime of the request parameter
    if let Some(ref mut url) = req.button_1_url {
        if !url.trim().is_empty() && !url.starts_with("http://") && !url.starts_with("https://") {
            *url = format!("https://{}", url);
        }
    }
    if let Some(ref mut url) = req.button_2_url {
        if !url.trim().is_empty() && !url.starts_with("http://") && !url.starts_with("https://") {
            *url = format!("https://{}", url);
        }
    }

    let mut buttons = Vec::new();
    if let (Some(ref b1_label), Some(ref b1_url)) = (&req.button_1_label, &req.button_1_url) {
        if !b1_label.trim().is_empty() && !b1_url.trim().is_empty() {
            buttons.push(activity::Button::new(b1_label.as_str(), b1_url.as_str()));
        }
    }
    if let (Some(ref b2_label), Some(ref b2_url)) = (&req.button_2_label, &req.button_2_url) {
        if !b2_label.trim().is_empty() && !b2_url.trim().is_empty() {
            buttons.push(activity::Button::new(b2_label.as_str(), b2_url.as_str()));
        }
    }
    if !buttons.is_empty() {
        act = act.buttons(buttons);
    }

    if req.show_timestamp.unwrap_or(false) {
        let start = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        act = act.timestamps(activity::Timestamps::new().start(start));
    }

    if let (Some(size), Some(max)) = (req.party_size, req.party_max) {
        if max > 0 {
            act = act.party(activity::Party::new().id("htss").size([size as i32, max as i32]));
        }
    }

    // Try to update activity
    let mut success = false;
    let mut err_msg = String::new();

    if let Some(client) = &mut *client_lock {
        match client.set_activity(act.clone()) {
            Ok(_) => { success = true; }
            Err(e) => {
                err_msg = format!("Lỗi cập nhật RPC lần đầu: {}", e);
                // Discard broken client
                let _ = client.close();
            }
        }
    }

    // If failed (broken pipe/closed connection), recreate client and try once more!
    if !success {
        *client_lock = None;
        let mut new_client = connect_new(&req.client_id)?;
        new_client.set_activity(act)
            .map_err(|e| format!("Không thể cập nhật trạng thái Discord RPC sau khi kết nối lại: {}. (Lỗi ban đầu: {})", e, err_msg))?;
        *client_lock = Some(new_client);
    }

    Ok(())
}

#[tauri::command]
async fn clear_discord_rpc() -> Result<(), String> {
    let mutex = get_discord_rpc_client();
    let mut client_lock = mutex.lock().map_err(|e| format!("Mutex lock error: {}", e))?;
    if let Some(mut client) = client_lock.take() {
        let _ = client.clear_activity();
        let _ = client.close();
    }
    Ok(())
}

#[tauri::command]
async fn save_equicord_custom_rpc(mut req: DiscordRpcRequest) -> Result<(), String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_path = PathBuf::from(&app_data)
        .join("Equicord")
        .join("settings")
        .join("settings.json");

    let mut json: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        serde_json::json!({})
    };

    if json["plugins"].is_null() {
        json["plugins"] = serde_json::json!({});
    }

    // Format URLs
    if let Some(ref mut url) = req.button_1_url {
        if !url.trim().is_empty() && !url.starts_with("http://") && !url.starts_with("https://") {
            *url = format!("https://{}", url);
        }
    }
    if let Some(ref mut url) = req.button_2_url {
        if !url.trim().is_empty() && !url.starts_with("http://") && !url.starts_with("https://") {
            *url = format!("https://{}", url);
        }
    }

    // Build the CustomRPC plugin settings structure
    let custom_rpc_config = serde_json::json!({
        "enabled": true,
        "appID": req.client_id,
        "appName": req.app_name.unwrap_or_else(|| "htss.club".to_string()),
        "details": req.details.unwrap_or_default(),
        "state": req.state.unwrap_or_default(),
        "imageBig": req.large_image.unwrap_or_default(),
        "imageBigTooltip": req.large_text.unwrap_or_default(),
        "imageSmall": req.small_image.unwrap_or_default(),
        "imageSmallTooltip": req.small_text.unwrap_or_default(),
        "buttonOneText": req.button_1_label.unwrap_or_default(),
        "buttonOneURL": req.button_1_url.unwrap_or_default(),
        "buttonTwoText": req.button_2_label.unwrap_or_default(),
        "buttonTwoURL": req.button_2_url.unwrap_or_default(),
        "timestampMode": if req.show_timestamp.unwrap_or(false) { 3 } else { 0 },
        "type": 0,
        "partyMaxSize": req.party_max.unwrap_or(1),
        "partySize": req.party_size.unwrap_or(1),
        "startTime": if req.show_timestamp.unwrap_or(false) { 17690696267000i64 } else { 0 }
    });

    json["plugins"]["CustomRPC"] = custom_rpc_config;

    let pretty_content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Lỗi format JSON: {}", e))?;
    fs::write(&config_path, pretty_content)
        .map_err(|e| format!("Lỗi khi ghi file config: {}", e))?;

    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct DirectRpcResponse {
    pub enabled: bool,
    pub config: Option<DiscordRpcRequest>,
}

#[tauri::command]
async fn save_direct_rpc_config(enabled: bool, config: DiscordRpcRequest) -> Result<(), String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_dir = PathBuf::from(&app_data).join("htssclub");
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    let config_path = config_dir.join("direct_rpc.json");
    
    let json = serde_json::json!({
        "enabled": enabled,
        "config": config
    });
    
    let pretty_content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Lỗi format JSON: {}", e))?;
    fs::write(&config_path, pretty_content)
        .map_err(|e| format!("Lỗi khi ghi file config: {}", e))?;
        
    Ok(())
}

#[tauri::command]
async fn get_direct_rpc_config() -> Result<DirectRpcResponse, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_path = PathBuf::from(&app_data)
        .join("htssclub")
        .join("direct_rpc.json");
        
    if !config_path.exists() {
        return Ok(DirectRpcResponse { enabled: false, config: None });
    }
    
    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content)
        .unwrap_or(serde_json::json!({}));
        
    let enabled = json["enabled"].as_bool().unwrap_or(false);
    let config_val = json["config"].clone();
    
    let config = serde_json::from_value(config_val).ok();
    
    Ok(DirectRpcResponse { enabled, config })
}

#[tauri::command]
async fn clear_equicord_custom_rpc() -> Result<(), String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_path = PathBuf::from(&app_data)
        .join("Equicord")
        .join("settings")
        .join("settings.json");

    if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        let mut json: serde_json::Value = serde_json::from_str(&content)
            .unwrap_or(serde_json::json!({}));

        if !json["plugins"].is_null() && !json["plugins"]["CustomRPC"].is_null() {
            json["plugins"]["CustomRPC"]["enabled"] = serde_json::json!(false);
            
            let pretty_content = serde_json::to_string_pretty(&json)
                .map_err(|e| format!("Lỗi format JSON: {}", e))?;
            fs::write(&config_path, pretty_content)
                .map_err(|e| format!("Lỗi khi ghi file config: {}", e))?;
        }
    }

    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct EquicordRpcResponse {
    pub enabled: bool,
    pub config: Option<DiscordRpcRequest>,
}

#[tauri::command]
async fn get_equicord_custom_rpc() -> Result<EquicordRpcResponse, String> {
    let app_data = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let config_path = PathBuf::from(&app_data)
        .join("Equicord")
        .join("settings")
        .join("settings.json");

    if !config_path.exists() {
        return Ok(EquicordRpcResponse { enabled: false, config: None });
    }

    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content)
        .unwrap_or(serde_json::json!({}));

    let custom_rpc = &json["plugins"]["CustomRPC"];
    if custom_rpc.is_null() || !custom_rpc.is_object() {
        return Ok(EquicordRpcResponse { enabled: false, config: None });
    }

    let enabled = custom_rpc["enabled"].as_bool().unwrap_or(false);

    let client_id = custom_rpc["appID"].as_str().unwrap_or("1495523138816053459").to_string();
    let app_name = custom_rpc["appName"].as_str().map(|s| s.to_string());
    let details = custom_rpc["details"].as_str().map(|s| s.to_string());
    let state = custom_rpc["state"].as_str().map(|s| s.to_string());
    let large_image = custom_rpc["imageBig"].as_str().map(|s| s.to_string());
    let large_text = custom_rpc["imageBigTooltip"].as_str().map(|s| s.to_string());
    let small_image = custom_rpc["imageSmall"].as_str().map(|s| s.to_string());
    let small_text = custom_rpc["imageSmallTooltip"].as_str().map(|s| s.to_string());
    
    let button_1_label = custom_rpc["buttonOneText"].as_str().map(|s| s.to_string());
    let button_1_url = custom_rpc["buttonOneURL"].as_str().map(|s| s.to_string());
    let button_2_label = custom_rpc["buttonTwoText"].as_str().map(|s| s.to_string());
    let button_2_url = custom_rpc["buttonTwoURL"].as_str().map(|s| s.to_string());
    
    let show_timestamp = custom_rpc["timestampMode"].as_i64().map(|v| v != 0);
    
    let party_size = custom_rpc["partySize"].as_i64();
    let party_max = custom_rpc["partyMaxSize"].as_i64();

    Ok(EquicordRpcResponse {
        enabled,
        config: Some(DiscordRpcRequest {
            client_id,
            app_name,
            details,
            state,
            large_image,
            large_text,
            small_image,
            small_text,
            button_1_label,
            button_1_url,
            button_2_label,
            button_2_url,
            show_timestamp,
            party_size,
            party_max,
        }),
    })
}

#[tauri::command]
async fn fetch_short_reels_index(tab_key: String) -> Result<serde_json::Value, String> {
    let client = get_async_http_client();
    let url = format!("https://api.ushort.cloud/freereels/homepage/tab/index?tab_key={}&position_index=10001", tab_key);

    let resp = client.get(&url)
        .header("accept", "*/*")
        .header("accept-language", "en-US,en;q=0.9")
        .header("cache-control", "no-cache")
        .header("origin", "https://ushort.cloud")
        .header("pragma", "no-cache")
        .header("referer", "https://ushort.cloud/")
        .header("sec-ch-ua", "\"Chromium\";v=\"148\", \"Google Chrome\";v=\"148\", \"Not/A)Brand\";v=\"99\"")
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"Windows\"")
        .header("sec-fetch-dest", "empty")
        .header("sec-fetch-mode", "cors")
        .header("sec-fetch-site", "same-site")
        .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Lỗi gửi yêu cầu: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Lỗi API: HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp.json()
        .await
        .map_err(|e| format!("Lỗi đọc kết quả JSON: {}", e))?;

    Ok(data)
}

#[tauri::command]
async fn fetch_short_reels_feed(module_key: String, next: String) -> Result<serde_json::Value, String> {
    let client = get_async_http_client();
    let url = "https://api.ushort.cloud/freereels/homepage/tab/feed";
    
    let payload = serde_json::json!({
        "module_key": module_key,
        "next": next
    });

    let resp = client.post(url)
        .header("accept", "application/json")
        .header("accept-language", "en-US,en;q=0.9")
        .header("cache-control", "no-cache")
        .header("content-type", "application/json")
        .header("origin", "https://ushort.cloud")
        .header("pragma", "no-cache")
        .header("referer", "https://ushort.cloud/")
        .header("sec-ch-ua", "\"Chromium\";v=\"148\", \"Google Chrome\";v=\"148\", \"Not/A)Brand\";v=\"99\"")
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"Windows\"")
        .header("sec-fetch-dest", "empty")
        .header("sec-fetch-mode", "cors")
        .header("sec-fetch-site", "same-site")
        .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Lỗi gửi yêu cầu: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Lỗi API: HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp.json()
        .await
        .map_err(|e| format!("Lỗi đọc kết quả JSON: {}", e))?;

    Ok(data)
}

#[tauri::command]
async fn fetch_short_reels_detail(series_id: String) -> Result<serde_json::Value, String> {
    let client = get_async_http_client();
    let url = format!("https://api.ushort.cloud/freereels/video/info?series_id={}", series_id);

    let resp = client.get(&url)
        .header("accept", "*/*")
        .header("accept-language", "en-US,en;q=0.9")
        .header("cache-control", "no-cache")
        .header("origin", "https://ushort.cloud")
        .header("pragma", "no-cache")
        .header("referer", "https://ushort.cloud/")
        .header("sec-ch-ua", "\"Chromium\";v=\"148\", \"Google Chrome\";v=\"148\", \"Not/A)Brand\";v=\"99\"")
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"Windows\"")
        .header("sec-fetch-dest", "empty")
        .header("sec-fetch-mode", "cors")
        .header("sec-fetch-site", "same-site")
        .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Lỗi gửi yêu cầu: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Lỗi API: HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp.json()
        .await
        .map_err(|e| format!("Lỗi đọc kết quả JSON: {}", e))?;

    Ok(data)
}

#[tauri::command]
async fn search_short_reels(keyword: String, next: String, custom_token: Option<String>) -> Result<serde_json::Value, String> {
    let client = get_async_http_client();
    let url = "https://api.ushort.cloud/freereels/search/drama";
    
    let payload = serde_json::json!({
        "keyword": keyword,
        "next": next
    });

    let token = custom_token.unwrap_or_else(|| "eyJhbGciOiJIUzI1NiIsImtpZCI6ImJMN0I5NCt3dGxTdEQyWDgiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2tybm5seWJxamZkaXNzdmlhZ2NhLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJkMDEwYmI0OC02Y2U5LTQyNTgtOTM5MC05MGQ1ZjE1NmQyN2EiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc5MTMyNzk1LCJpYXQiOjE3NzkxMjkxOTUsImVtYWlsIjoiZGNneHhpZUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIiwiZ29vZ2xlIl19LCJ1c2VyX21ldGFkYXRhIjp7ImF2YXRhcl91cmwiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NMYjhPcUN4NlczM3lmWEFCd0RaYXFnTjR4eVVVSzdMZmxheUNQNWc1VmNmWkZBZ0E9czk2LWMiLCJlbWFpbCI6ImRjZ3h4aWVAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6ImRjZyIsImlzcyI6Imh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbSIsIm5hbWUiOiJkY2ciLCJuaWNrbmFtZSI6ImRjZyIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0xiOE9xQ3g2VzMzeWZYQUJ3RFphcWdONHh5VVVLN0xmbGF5Q1A1ZzVWY2ZaRkFnQT1zOTYtYyIsInByb3ZpZGVyX2lkIjoiMTA0ODUzMjI1ODU3MzgxMDU3MjIwIiwic3ViIjoiMTA0ODUzMjI1ODU3MzgxMDU3MjIwIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoib2F1dGgiLCJ0aW1lc3RhbXAiOjE3NzUzMTQ4OTV9XSwic2Vzc2lvbl9pZCI6IjViYTFiZDJmLWFjOTMtNGEwNi05Y2U5LTYzZTFiMGI0MDMyYiIsImlzX2Fub255bW91cyI6ZmFsc2V9.2BrGn1WkJhPCO3EYgJhRHTyhwHPum6C7Psgj0oW2vPI".to_string());
    let auth_header = format!("Bearer {}", token);

    let resp = client.post(url)
        .header("accept", "application/json")
        .header("accept-language", "en-US,en;q=0.9")
        .header("authorization", &auth_header)
        .header("cache-control", "no-cache")
        .header("content-type", "application/json")
        .header("origin", "https://ushort.cloud")
        .header("pragma", "no-cache")
        .header("referer", "https://ushort.cloud/")
        .header("sec-ch-ua", "\"Chromium\";v=\"148\", \"Google Chrome\";v=\"148\", \"Not/A)Brand\";v=\"99\"")
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"Windows\"")
        .header("sec-fetch-dest", "empty")
        .header("sec-fetch-mode", "cors")
        .header("sec-fetch-site", "same-site")
        .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Lỗi gửi yêu cầu: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Lỗi API: HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp.json()
        .await
        .map_err(|e| format!("Lỗi đọc kết quả JSON: {}", e))?;

    Ok(data)
}

#[tauri::command]
async fn fetch_short_reels_hot_list() -> Result<serde_json::Value, String> {
    let client = get_async_http_client();
    let url = "https://api.ushort.cloud/freereels/search/hot-list";

    let resp = client.post(url)
        .header("accept", "*/*")
        .header("accept-language", "en-US,en;q=0.9")
        .header("cache-control", "no-cache")
        .header("content-length", "0")
        .header("origin", "https://ushort.cloud")
        .header("pragma", "no-cache")
        .header("referer", "https://ushort.cloud/")
        .header("sec-ch-ua", "\"Chromium\";v=\"148\", \"Google Chrome\";v=\"148\", \"Not/A)Brand\";v=\"99\"")
        .header("sec-ch-ua-mobile", "?0")
        .header("sec-ch-ua-platform", "\"Windows\"")
        .header("sec-fetch-dest", "empty")
        .header("sec-fetch-mode", "cors")
        .header("sec-fetch-site", "same-site")
        .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Lỗi gửi yêu cầu: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Lỗi API: HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp.json()
        .await
        .map_err(|e| format!("Lỗi đọc kết quả JSON: {}", e))?;

    Ok(data)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateCheckResponse {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub url: String,
    pub notes: String,
}

#[tauri::command]
async fn check_for_updates() -> Result<UpdateCheckResponse, String> {
    let current_version = env!("CARGO_PKG_VERSION");
    let client = get_async_http_client();
    
    // ==========================================
    // CẤU HÌNH GITHUB REPOSITORY CỦA BẠN TẠI ĐÂY:
    // ==========================================
    let owner = "dxxce";        // Tên tài khoản GitHub của bạn (ví dụ: "deecee-media")
    let repo = "htssclub-launcher";     // Tên kho lưu trữ chứa bộ cài đặt (ví dụ: "htssclub-launcher")
    // ==========================================

    let api_url = format!("https://api.github.com/repos/{}/{}/releases/latest", owner, repo);
    
    let resp = match client.get(&api_url)
        .header("User-Agent", "htssclub-launcher")
        .send()
        .await {
            Ok(r) => r,
            Err(_) => {
                return Ok(UpdateCheckResponse {
                    has_update: false,
                    current_version: current_version.to_string(),
                    latest_version: current_version.to_string(),
                    url: "".to_string(),
                    notes: "".to_string(),
                });
            }
        };

    if !resp.status().is_success() {
        return Ok(UpdateCheckResponse {
            has_update: false,
            current_version: current_version.to_string(),
            latest_version: current_version.to_string(),
            url: "".to_string(),
            notes: "".to_string(),
        });
    }

    let json: serde_json::Value = resp.json().await.unwrap_or(serde_json::json!({}));
    
    // GitHub trả về phiên bản ở trường tag_name (ví dụ: "v0.2.0" hoặc "0.2.0")
    let tag_name = json["tag_name"].as_str().unwrap_or(current_version).to_string();
    
    // Lấy nội dung nhật ký cập nhật dạng Markdown từ GitHub Releases
    let notes = json["body"].as_str().unwrap_or("Không có mô tả cập nhật nào từ GitHub.").to_string();
    
    // Duyệt qua danh sách assets để tìm file bộ cài đặt đuôi .exe (NSIS Installer)
    let mut download_url = "".to_string();
    if let Some(assets) = json["assets"].as_array() {
        for asset in assets {
            if let Some(name) = asset["name"].as_str() {
                if name.ends_with(".exe") {
                    if let Some(url) = asset["browser_download_url"].as_str() {
                        download_url = url.to_string();
                        break;
                    }
                }
            }
        }
    }

    let has_update = is_newer_version(current_version, &tag_name);

    Ok(UpdateCheckResponse {
        has_update,
        current_version: current_version.to_string(),
        latest_version: tag_name,
        url: download_url,
        notes,
    })
}

fn is_newer_version(current: &str, latest: &str) -> bool {
    let curr_parts: Vec<&str> = current.trim_start_matches('v').split('.').collect();
    let late_parts: Vec<&str> = latest.trim_start_matches('v').split('.').collect();
    for i in 0..std::cmp::min(curr_parts.len(), late_parts.len()) {
        if let (Ok(c), Ok(l)) = (curr_parts[i].parse::<i32>(), late_parts[i].parse::<i32>()) {
            if l > c { return true; }
            if c > l { return false; }
        }
    }
    late_parts.len() > curr_parts.len()
}

#[tauri::command]
async fn download_and_install_update(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    use std::io::Write;
    use tauri::Emitter;

    let client = get_async_http_client();
    let mut res = client.get(&url).send().await.map_err(|e| format!("Lỗi tải bản cập nhật: {}", e))?;
    
    if !res.status().is_success() {
        return Err(format!("Lỗi tải bản cập nhật: HTTP {}", res.status()));
    }

    let total_size = res.content_length().unwrap_or(0);
    let temp_dir = std::env::temp_dir();
    let dest_path = temp_dir.join("htssclub_update_setup.exe");

    let mut file = std::fs::File::create(&dest_path).map_err(|e| format!("Không thể tạo tệp installer: {}", e))?;
    let mut downloaded = 0;

    let _ = app_handle.emit("update-progress", 0);

    while let Some(chunk) = res.chunk().await.map_err(|e| format!("Lỗi tải dữ liệu: {}", e))? {
        file.write_all(&chunk).map_err(|e| format!("Lỗi ghi tệp installer: {}", e))?;
        downloaded += chunk.len() as u64;
        
        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64 * 100.0) as u32;
            let _ = app_handle.emit("update-progress", progress);
        }
    }

    drop(file);

    let _ = app_handle.emit("update-progress", 100);
    std::thread::sleep(std::time::Duration::from_millis(500));

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Không thể lấy đường dẫn executable hiện tại: {}", e))?;
    
    let installer_path = dest_path.to_str()
        .ok_or_else(|| "Đường dẫn installer không hợp lệ".to_string())?;
        
    let current_exe_path = current_exe.to_str()
        .ok_or_else(|| "Đường dẫn executable hiện tại không hợp lệ".to_string())?;

    let shell_command = format!(
        "Start-Sleep -Seconds 1; Start-Process -FilePath '{}' -ArgumentList '/S' -Wait; Start-Process -FilePath '{}'",
        installer_path, current_exe_path
    );

    create_silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &shell_command])
        .spawn()
        .map_err(|e| format!("Không thể khởi chạy tiến trình cập nhật ngầm: {}", e))?;

    std::process::exit(0);
}

#[tauri::command]
async fn fetch_steam_sales(
    page: Option<u32>,
    language: Option<String>,
    country: Option<String>,
    specials: Option<u32>,
    maxprice: Option<String>,
    hidef2p: Option<u32>,
    ndl: Option<u32>,
) -> Result<String, String> {
    let page = page.unwrap_or(1);
    let start = (page - 1) * 25;
    let lang = language.unwrap_or_else(|| "english".to_string());
    let cc = country.unwrap_or_else(|| "US".to_string());
    let specials_val = specials.unwrap_or(1);

    let mut url = format!(
        "https://store.steampowered.com/search/results/?query=&start={}&count=25&dynamic_data=&sort_by=_ASC&os=win&specials={}&infinite=1&l={}&cc={}",
        start, specials_val, lang, cc
    );

    if let Some(ref mp) = maxprice {
        if !mp.is_empty() {
            url.push_str(&format!("&maxprice={}", mp));
        }
    }
    if let Some(h) = hidef2p {
        url.push_str(&format!("&hidef2p={}", h));
    }
    if let Some(n) = ndl {
        url.push_str(&format!("&ndl={}", n));
    }

    let client = get_async_http_client();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .header("Accept-Language", "vi,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối Steam: {}", e))?;

    let text = resp.text().await.map_err(|e| format!("Lỗi đọc response Steam: {}", e))?;
    Ok(text)
}

#[tauri::command]
async fn fetch_steam_game_details(
    app_id: String,
    language: Option<String>,
) -> Result<String, String> {
    let lang = language.unwrap_or_else(|| "vietnamese".to_string());
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}&l={}",
        app_id, lang
    );

    let client = get_async_http_client();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .header("Accept-Language", "vi,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("L?i k?t n?i Steam details: {}", e))?;

    let text = resp.text().await.map_err(|e| format!("L?i ??c response Steam details: {}", e))?;
    
    // Scrape store page for countdown
    let mut countdown_text = None;
    let store_url = format!("https://store.steampowered.com/app/{}", app_id);
    if let Ok(store_resp) = client.get(&store_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .header("Cookie", "wants_mature_content=1; birthtime=189302400; lastagecheckage=1-0-1976")
        .send()
        .await {
            if let Ok(html) = store_resp.text().await {
                if let Some(idx) = html.find("class=\"game_purchase_discount_countdown\"") {
                    if let Some(start) = html[idx..].find('>') {
                        if let Some(end) = html[idx + start..].find('<') {
                            let parsed_text = html[idx + start + 1..idx + start + end].trim().to_string();
                            if !parsed_text.is_empty() {
                                countdown_text = Some(parsed_text);
                            }
                        }
                    }
                }
            }
        }

    // Inject countdown text into JSON
    if let Some(countdown) = countdown_text {
        if let Ok(mut json_val) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(price_overview) = json_val.get_mut(&app_id)
                .and_then(|v| v.get_mut("data"))
                .and_then(|v| v.get_mut("price_overview")) {
                    if let Some(price_map) = price_overview.as_object_mut() {
                        price_map.insert("discount_end_date".to_string(), serde_json::Value::String(countdown));
                    }
            }
            if let Ok(new_text) = serde_json::to_string(&json_val) {
                return Ok(new_text);
            }
        }
    }

    Ok(text)
}

fn is_valid_free_game(el: &serde_json::Value) -> bool {
    if let Some(promotions) = el.get("promotions") {
        if promotions.is_null() {
            return false;
        }
        
        // Check active promotional offers
        if let Some(offers_array) = promotions.get("promotionalOffers").and_then(|a| a.as_array()) {
            for group in offers_array {
                if let Some(offers) = group.get("promotionalOffers").and_then(|a| a.as_array()) {
                    for offer in offers {
                        if offer.get("discountSetting")
                            .and_then(|d| d.get("discountPercentage"))
                            .map(|v| v.as_f64() == Some(0.0) || v.as_i64() == Some(0))
                            .unwrap_or(false)
                        {
                            return true;
                        }
                    }
                }
            }
        }
        
        // Check upcoming promotional offers
        if let Some(upcoming_array) = promotions.get("upcomingPromotionalOffers").and_then(|a| a.as_array()) {
            for group in upcoming_array {
                if let Some(offers) = group.get("promotionalOffers").and_then(|a| a.as_array()) {
                    for offer in offers {
                        if offer.get("discountSetting")
                            .and_then(|d| d.get("discountPercentage"))
                            .map(|v| v.as_f64() == Some(0.0) || v.as_i64() == Some(0))
                            .unwrap_or(false)
                        {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

#[tauri::command]
async fn fetch_epic_games() -> Result<String, String> {
    let client = get_async_http_client();
    let resp = client
        .get("https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=vi&country=VN&allowCountries=VN")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối Epic: {}", e))?;

    let text = resp.text().await.map_err(|e| format!("Lá»—i Ä‘á» c response Epic: {}", e))?;
    
    // Filter out non-free games from the JSON elements
    if let Ok(mut data) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(elements) = data.get_mut("data")
            .and_then(|d| d.get_mut("Catalog"))
            .and_then(|c| c.get_mut("searchStore"))
            .and_then(|s| s.get_mut("elements"))
            .and_then(|e| e.as_array_mut())
        {
            elements.retain(|el| is_valid_free_game(el));
        }
        if let Ok(filtered_text) = serde_json::to_string(&data) {
            return Ok(filtered_text);
        }
    }

    Ok(text)
}

// ============================================================================
//  TEXT-TO-SPEECH & VOICE CHANGER
//  Two engines:
//   - Google Translate TTS (simple, for plain language codes like "vi"/"en")
//   - Microsoft Edge Neural TTS via `msedge-tts` (high quality, many voices,
//     supports pitch/rate adjustment → used for the voice changer).
//  Audio is returned as a `data:` URL (base64) so the WebView can fetch+decode
//  it without CORS issues.
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TtsVoice {
    pub id: String,        // Edge voice short name, e.g. "vi-VN-HoaiMyNeural"
    pub label: String,     // Human friendly label
    pub locale: String,    // e.g. "vi-VN"
    pub gender: String,    // "Female" | "Male"
    pub flag: String,      // emoji flag for UI
}

/// Curated multilingual voice list for the voice changer UI.
fn curated_tts_voices() -> Vec<TtsVoice> {
    let v = |id: &str, label: &str, locale: &str, gender: &str, flag: &str| TtsVoice {
        id: id.to_string(),
        label: label.to_string(),
        locale: locale.to_string(),
        gender: gender.to_string(),
        flag: flag.to_string(),
    };
    vec![
        // Vietnamese
        v("vi-VN-HoaiMyNeural", "Hoài My (Nữ)", "vi-VN", "Female", "🇻🇳"),
        v("vi-VN-NamMinhNeural", "Nam Minh (Nam)", "vi-VN", "Male", "🇻🇳"),
        // English (US)
        v("en-US-AriaNeural", "Aria (Nữ)", "en-US", "Female", "🇺🇸"),
        v("en-US-JennyNeural", "Jenny (Nữ)", "en-US", "Female", "🇺🇸"),
        v("en-US-EmmaNeural", "Emma (Nữ)", "en-US", "Female", "🇺🇸"),
        v("en-US-GuyNeural", "Guy (Nam)", "en-US", "Male", "🇺🇸"),
        v("en-US-ChristopherNeural", "Christopher (Nam)", "en-US", "Male", "🇺🇸"),
        // English (UK)
        v("en-GB-SoniaNeural", "Sonia (Nữ - Anh)", "en-GB", "Female", "🇬🇧"),
        v("en-GB-RyanNeural", "Ryan (Nam - Anh)", "en-GB", "Male", "🇬🇧"),
        // Japanese
        v("ja-JP-NanamiNeural", "Nanami (Nữ)", "ja-JP", "Female", "🇯🇵"),
        v("ja-JP-KeitaNeural", "Keita (Nam)", "ja-JP", "Male", "🇯🇵"),
        // Korean
        v("ko-KR-SunHiNeural", "SunHi (Nữ)", "ko-KR", "Female", "🇰🇷"),
        v("ko-KR-InJoonNeural", "InJoon (Nam)", "ko-KR", "Male", "🇰🇷"),
        // Chinese
        v("zh-CN-XiaoxiaoNeural", "Xiaoxiao (Nữ)", "zh-CN", "Female", "🇨🇳"),
        v("zh-CN-YunxiNeural", "Yunxi (Nam)", "zh-CN", "Male", "🇨🇳"),
        // French
        v("fr-FR-DeniseNeural", "Denise (Nữ)", "fr-FR", "Female", "🇫🇷"),
        v("fr-FR-HenriNeural", "Henri (Nam)", "fr-FR", "Male", "🇫🇷"),
        // Spanish
        v("es-ES-ElviraNeural", "Elvira (Nữ)", "es-ES", "Female", "🇪🇸"),
        v("es-ES-AlvaroNeural", "Alvaro (Nam)", "es-ES", "Male", "🇪🇸"),
        // Russian
        v("ru-RU-SvetlanaNeural", "Svetlana (Nữ)", "ru-RU", "Female", "🇷🇺"),
        v("ru-RU-DmitryNeural", "Dmitry (Nam)", "ru-RU", "Male", "🇷🇺"),
    ]
}

/// Lệnh: trả về danh sách giọng nói cho UI voice changer.
#[tauri::command]
fn list_tts_voices() -> Vec<TtsVoice> {
    curated_tts_voices()
}

/// Map a plain language code to a default Edge neural voice.
fn default_edge_voice_for_lang(lang: &str) -> &'static str {
    match lang {
        "vi" => "vi-VN-HoaiMyNeural",
        "en" => "en-US-AriaNeural",
        "ja" => "ja-JP-NanamiNeural",
        "ko" => "ko-KR-SunHiNeural",
        "zh-CN" | "zh" => "zh-CN-XiaoxiaoNeural",
        "fr" => "fr-FR-DeniseNeural",
        "es" => "es-ES-ElviraNeural",
        "ru" => "ru-RU-SvetlanaNeural",
        _ => "en-US-AriaNeural",
    }
}

/// Synthesize text to speech via Microsoft Edge Neural TTS (blocking).
/// `pitch` and `rate` are percentages relative to default (e.g. -20..+20 Hz/%).
fn synthesize_edge_tts(
    text: &str,
    voice_name: &str,
    pitch: i32,
    rate: i32,
) -> Result<Vec<u8>, String> {
    use msedge_tts::tts::{client::connect, SpeechConfig};

    let config = SpeechConfig {
        voice_name: voice_name.to_string(),
        // mp3 so the WebView can decode it directly.
        audio_format: "audio-24khz-48kbitrate-mono-mp3".to_string(),
        pitch,
        rate,
        volume: 0,
    };

    let mut client = connect().map_err(|e| format!("Không kết nối được dịch vụ giọng nói: {}", e))?;
    let audio = client
        .synthesize(text, &config)
        .map_err(|e| format!("Lỗi tổng hợp giọng nói: {}", e))?;

    if audio.audio_bytes.is_empty() {
        return Err("Không nhận được dữ liệu âm thanh".to_string());
    }
    Ok(audio.audio_bytes)
}

/// Fetch Google Translate TTS audio (mp3) for a plain language code.
async fn fetch_google_tts(text: &str, lang: &str) -> Result<Vec<u8>, String> {
    // Google TTS endpoint limits each request to ~200 chars; split if needed.
    let client = get_async_http_client();
    let mut out: Vec<u8> = Vec::new();

    // Simple chunking by characters (keeps it well under the limit).
    let chars: Vec<char> = text.chars().collect();
    let mut start = 0usize;
    while start < chars.len() {
        let end = std::cmp::min(start + 180, chars.len());
        let chunk: String = chars[start..end].iter().collect();
        start = end;

        let q = utf8_percent_encode(chunk.trim(), NON_ALPHANUMERIC).to_string();
        if q.is_empty() {
            continue;
        }
        let url = format!(
            "https://translate.google.com/translate_tts?ie=UTF-8&q={}&tl={}&client=tw-ob&total=1&idx=0&textlen={}",
            q, lang, chunk.chars().count()
        );

        let resp = client
            .get(&url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .header("Referer", "https://translate.google.com/")
            .send()
            .await
            .map_err(|e| format!("Lỗi kết nối Google TTS: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Google TTS lỗi: HTTP {}", resp.status()));
        }
        let bytes = resp.bytes().await.map_err(|e| format!("Lỗi đọc audio: {}", e))?;
        out.extend_from_slice(&bytes);
    }

    if out.is_empty() {
        return Err("Không nhận được dữ liệu âm thanh từ Google".to_string());
    }
    Ok(out)
}

fn mp3_to_data_url(bytes: &[u8]) -> String {
    let b64 = general_purpose::STANDARD.encode(bytes);
    format!("data:audio/mpeg;base64,{}", b64)
}

/// Lệnh chính: lấy audio TTS dạng data URL.
/// `lang` có thể là:
///   - mã ngôn ngữ ("vi", "en", ...) → dùng Edge neural voice mặc định
///   - "edge-<VoiceShortName>" hoặc tên giọng đầy đủ ("vi-VN-HoaiMyNeural")
///   - "google:<lang>" để buộc dùng Google TTS
/// `pitch`/`rate` (tùy chọn) để đổi giọng (voice changer).
#[tauri::command]
async fn get_tts_audio(
    text: String,
    lang: String,
    pitch: Option<i32>,
    rate: Option<i32>,
) -> Result<String, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("Không có nội dung để đọc".to_string());
    }

    let pitch = pitch.unwrap_or(0).clamp(-100, 100);
    let rate = rate.unwrap_or(0).clamp(-100, 100);

    // Determine the voice / engine.
    let lang_l = lang.trim();

    // Force Google TTS path.
    if let Some(g) = lang_l.strip_prefix("google:") {
        let bytes = fetch_google_tts(&text, g).await?;
        return Ok(mp3_to_data_url(&bytes));
    }

    // Resolve an Edge voice name.
    let voice_name: Option<String> = if let Some(v) = lang_l.strip_prefix("edge-") {
        Some(v.to_string())
    } else if lang_l.contains("Neural") {
        // Full voice short name passed directly.
        Some(lang_l.to_string())
    } else if lang_l.len() <= 6 && (lang_l.len() == 2 || lang_l.contains('-')) {
        // Plain language code → default neural voice.
        Some(default_edge_voice_for_lang(lang_l).to_string())
    } else {
        None
    };

    if let Some(voice) = voice_name {
        // Run the blocking synth off the async runtime.
        let text_c = text.clone();
        let res = tokio::task::spawn_blocking(move || {
            synthesize_edge_tts(&text_c, &voice, pitch, rate)
        })
        .await
        .map_err(|e| format!("Lỗi tác vụ TTS: {}", e))?;

        match res {
            Ok(bytes) => return Ok(mp3_to_data_url(&bytes)),
            Err(edge_err) => {
                // Fallback to Google TTS using the locale prefix if Edge fails.
                let fallback_lang = lang_l.split('-').next().unwrap_or("en");
                if let Ok(bytes) = fetch_google_tts(&text, fallback_lang).await {
                    return Ok(mp3_to_data_url(&bytes));
                }
                return Err(edge_err);
            }
        }
    }

    // Default: Google TTS with the given language code.
    let bytes = fetch_google_tts(&text, lang_l).await?;
    Ok(mp3_to_data_url(&bytes))
}

/// Lệnh dành riêng cho voice changer: chọn giọng + chỉnh pitch/rate trực tiếp.
#[tauri::command]
async fn get_voice_tts_audio(
    text: String,
    voice: String,
    pitch: Option<i32>,
    rate: Option<i32>,
) -> Result<String, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("Không có nội dung để đọc".to_string());
    }
    let pitch = pitch.unwrap_or(0).clamp(-100, 100);
    let rate = rate.unwrap_or(0).clamp(-100, 100);
    let voice_c = voice.clone();
    let text_c = text.clone();

    let res = tokio::task::spawn_blocking(move || {
        synthesize_edge_tts(&text_c, &voice_c, pitch, rate)
    })
    .await
    .map_err(|e| format!("Lỗi tác vụ TTS: {}", e))?;

    match res {
        Ok(bytes) => Ok(mp3_to_data_url(&bytes)),
        Err(e) => Err(e),
    }
}

/// Open the VB-Cable virtual audio device download page so the user can install
/// a virtual microphone (used to route TTS into voice chat apps).
#[tauri::command]
async fn install_virtual_mic() -> Result<String, String> {
    let url = "https://vb-audio.com/Cable/";
    #[cfg(target_os = "windows")]
    {
        create_silent_command("cmd")
            .args(["/c", "start", "", url])
            .spawn()
            .map_err(|e| format!("Không thể mở trang tải driver: {}", e))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = url;
    }
    Ok("Đã mở trang tải driver Microphone ảo (VB-Cable). Vui lòng cài đặt rồi khởi động lại máy.".to_string())
}


//  window. The frontend renders the chrome (tabs/address bar) and positions one
//  child webview per tab over a viewport region. The main window is opaque
//  (transparent:false) so the child webview composites/paints correctly on
//  Windows. Renders ANY site (Google, YouTube, ...) like a real browser.
// ============================================================================

fn browser_label(tab_id: &str) -> String {
    format!("htssbrowser-{}", tab_id)
}

fn parse_browser_url(input: &str) -> Url {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Url::parse("https://www.google.com").unwrap();
    }
    if let Ok(u) = Url::parse(trimmed) {
        if u.scheme() == "http" || u.scheme() == "https" {
            return u;
        }
    }
    // Looks like a domain? else treat as a Google search.
    let looks_like_domain = trimmed.contains('.') && !trimmed.contains(' ');
    if looks_like_domain {
        if let Ok(u) = Url::parse(&format!("https://{}", trimmed)) {
            return u;
        }
    }
    let q = utf8_percent_encode(trimmed, NON_ALPHANUMERIC).to_string();
    Url::parse(&format!("https://www.google.com/search?q={}", q)).unwrap()
}

/// Create the embedded browser child webview for `tab_id` at the given bounds.
#[tauri::command]
async fn browser_create(
    app: tauri::AppHandle,
    tab_id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{Manager, WebviewBuilder, WebviewUrl, LogicalPosition, LogicalSize};

    let label = browser_label(&tab_id);

    // Already exists? show + reposition.
    if let Some(existing) = app.get_webview(&label) {
        let _ = existing.show();
        let _ = existing.set_bounds(tauri::Rect {
            position: LogicalPosition::new(x, y).into(),
            size: LogicalSize::new(width.max(1.0), height.max(1.0)).into(),
        });
        return Ok(());
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| "Không tìm thấy cửa sổ chính".to_string())?;

    let target = parse_browser_url(&url);
    let tab_for_load = tab_id.clone();
    let tab_for_title = tab_id.clone();

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(target))
        .on_page_load(move |webview, payload| {
            use tauri::Emitter;
            let phase = match payload.event() {
                tauri::webview::PageLoadEvent::Started => "started",
                tauri::webview::PageLoadEvent::Finished => "finished",
            };
            let _ = webview.emit(
                "browser-nav",
                serde_json::json!({
                    "tabId": tab_for_load,
                    "url": payload.url().to_string(),
                    "phase": phase,
                }),
            );
        })
        .on_document_title_changed(move |webview, title| {
            use tauri::Emitter;
            let _ = webview.emit(
                "browser-title",
                serde_json::json!({ "tabId": tab_for_title, "title": title }),
            );
        });

    window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width.max(1.0), height.max(1.0)),
        )
        .map_err(|e| format!("Không thể tạo trình duyệt: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn browser_navigate(app: tauri::AppHandle, tab_id: String, url: String) -> Result<(), String> {
    use tauri::Manager;
    let label = browser_label(&tab_id);
    for _ in 0..40 {
        if let Some(webview) = app.get_webview(&label) {
            let target = parse_browser_url(&url);
            return webview.navigate(target).map_err(|e| e.to_string());
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    Err("Trình duyệt chưa được khởi tạo".to_string())
}

#[tauri::command]
async fn browser_back(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview(&browser_label(&tab_id)) {
        let _ = webview.eval("window.history.back();");
    }
    Ok(())
}

#[tauri::command]
async fn browser_forward(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview(&browser_label(&tab_id)) {
        let _ = webview.eval("window.history.forward();");
    }
    Ok(())
}

#[tauri::command]
async fn browser_reload(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview(&browser_label(&tab_id)) {
        webview.reload().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_set_bounds(
    app: tauri::AppHandle,
    tab_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::{Manager, LogicalPosition, LogicalSize};
    if let Some(webview) = app.get_webview(&browser_label(&tab_id)) {
        webview
            .set_bounds(tauri::Rect {
                position: LogicalPosition::new(x, y).into(),
                size: LogicalSize::new(width.max(1.0), height.max(1.0)).into(),
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_show(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview(&browser_label(&tab_id)) {
        webview.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_hide(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview(&browser_label(&tab_id)) {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_close(app: tauri::AppHandle, tab_id: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview(&browser_label(&tab_id)) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Hide every embedded browser webview (used when leaving the Browser tab).
#[tauri::command]
async fn browser_hide_all(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    for (label, webview) in app.webviews() {
        if label.starts_with("htssbrowser-") {
            let _ = webview.hide();
        }
    }
    Ok(())
}

/// Close every embedded browser webview (used on unmount).
#[tauri::command]
async fn browser_close_all(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    for (label, webview) in app.webviews() {
        if label.starts_with("htssbrowser-") {
            let _ = webview.close();
        }
    }
    Ok(())
}

#[tauri::command]
async fn open_in_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        create_silent_command("cmd")
            .args(["/c", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Không thể mở trình duyệt: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Không thể mở trình duyệt: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Không thể mở trình duyệt: {}", e))?;
    }
    Ok(())
}

/// Lấy thông tin xem trước (Open Graph) của một URL để hiển thị thẻ link
/// trong tin nhắn. Trả về JSON { url, title, description, image, siteName }.
/// Đọc trong webview bị chặn CORS nên fetch ở phía Rust.
#[derive(serde::Serialize)]
struct LinkPreview {
    url: String,
    title: Option<String>,
    description: Option<String>,
    image: Option<String>,
    site_name: Option<String>,
}

#[tauri::command]
async fn fetch_link_preview(url: String) -> Result<LinkPreview, String> {
    // Chỉ cho phép http/https.
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL không hợp lệ".into());
    }

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        )
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Accept-Language", "vi,en;q=0.9")
        .header("Accept-Encoding", "identity")
        .send()
        .await
        .map_err(|e| format!("Không tải được trang: {}", e))?;

    // Chỉ phân tích HTML.
    let ct = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !ct.contains("text/html") && !ct.is_empty() {
        return Err("Không phải trang HTML".into());
    }

    // Lấy tối đa ~400KB phần đầu (đủ chứa <head>).
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let html = String::from_utf8_lossy(&bytes);
    let head = if html.len() > 400_000 { &html[..400_000] } else { &html };

    let get_meta = |prop_keys: &[&str]| -> Option<String> {
        // tìm thẻ <meta ... content="...">  với property/name khớp 1 trong prop_keys
        let lower = head.to_lowercase();
        for key in prop_keys {
            let needle = key.to_lowercase();
            let mut search_from = 0usize;
            while let Some(rel) = lower[search_from..].find("<meta") {
                let start = search_from + rel;
                let end = lower[start..].find('>').map(|e| start + e + 1).unwrap_or(head.len());
                let tag = &head[start..end];
                let tag_lower = &lower[start..end];
                // tag phải chứa property/name = key
                if tag_lower.contains(&needle) {
                    // bóc content="..."
                    if let Some(c) = extract_attr(tag, "content") {
                        if !c.trim().is_empty() {
                            return Some(decode_html_entities(c.trim()));
                        }
                    }
                }
                search_from = end;
            }
        }
        None
    };

    let title = get_meta(&["property=\"og:title\"", "name=\"twitter:title\""]).or_else(|| {
        // fallback <title>
        let lower = head.to_lowercase();
        if let Some(s) = lower.find("<title") {
            if let Some(gt) = lower[s..].find('>') {
                let cstart = s + gt + 1;
                if let Some(e) = lower[cstart..].find("</title>") {
                    return Some(decode_html_entities(head[cstart..cstart + e].trim()));
                }
            }
        }
        None
    });

    let description = get_meta(&[
        "property=\"og:description\"",
        "name=\"twitter:description\"",
        "name=\"description\"",
    ]);
    let mut image = get_meta(&["property=\"og:image\"", "name=\"twitter:image\""]);
    let site_name = get_meta(&["property=\"og:site_name\""]);

    // Chuẩn hoá ảnh tương đối → tuyệt đối.
    if let Some(img) = image.clone() {
        if img.starts_with("//") {
            let scheme = if url.starts_with("https") { "https:" } else { "http:" };
            image = Some(format!("{}{}", scheme, img));
        } else if img.starts_with('/') {
            if let Ok(base) = reqwest::Url::parse(&url) {
                if let Some(host) = base.host_str() {
                    let scheme = base.scheme();
                    let port = base.port().map(|p| format!(":{}", p)).unwrap_or_default();
                    image = Some(format!("{}://{}{}{}", scheme, host, port, img));
                }
            }
        }
    }

    Ok(LinkPreview {
        url,
        title,
        description,
        image,
        site_name,
    })
}

/// Bóc giá trị thuộc tính (content="..." hoặc content='...') từ một thẻ meta.
fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    let key = format!("{}=", attr.to_lowercase());
    let pos = lower.find(&key)? + key.len();
    let rest = &tag[pos..];
    let bytes = rest.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    let quote = bytes[0] as char;
    if quote == '"' || quote == '\'' {
        let after = &rest[1..];
        let endrel = after.find(quote)?;
        Some(after[..endrel].to_string())
    } else {
        // không có dấu nháy: lấy tới khoảng trắng hoặc >
        let endrel = rest.find(|c: char| c.is_whitespace() || c == '>').unwrap_or(rest.len());
        Some(rest[..endrel].to_string())
    }
}

/// Giải mã một số HTML entity phổ biến.
fn decode_html_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

/// Inline splash HTML shown by a native window the instant the app launches,
/// independent of the web app / dev server so there is never a transparent
/// empty frame while the UI compiles or loads.
const SPLASH_HTML: &str = r##"<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{height:100%;overflow:hidden;background:transparent;}
  .card{
    position:fixed;inset:0;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:'Segoe UI Variable','Segoe UI',system-ui,sans-serif;user-select:none;
    border-radius:16px;overflow:hidden;
    background:
      radial-gradient(90% 70% at 50% 0%, rgba(34,211,238,.10) 0%, transparent 55%),
      radial-gradient(80% 80% at 80% 100%, rgba(59,130,246,.10) 0%, transparent 60%),
      linear-gradient(160deg,#0b0b12 0%,#070710 55%,#040409 100%);
    border:1px solid rgba(255,255,255,.07);
  }
  /* subtle moving sheen across the whole card */
  .card::after{
    content:"";position:absolute;top:0;left:-60%;width:55%;height:100%;
    background:linear-gradient(100deg,transparent,rgba(255,255,255,.045),transparent);
    transform:skewX(-18deg);animation:sheen 3.4s ease-in-out infinite;
  }
  .top-bar{position:absolute;top:0;left:0;right:0;height:2px;overflow:hidden;}
  .top-bar i{position:absolute;inset:0;width:40%;border-radius:2px;
    background:linear-gradient(90deg,#22d3ee,#3b82f6,#8b5cf6);animation:slide 1.5s ease-in-out infinite;}
  .logo{position:relative;width:92px;height:92px;display:flex;align-items:center;justify-content:center;margin-bottom:26px;}
  .ring{position:absolute;inset:0;border-radius:50%;}
  .ring.track{border:2px solid rgba(255,255,255,.05);}
  .ring.spin{border:2px solid transparent;border-top-color:#22d3ee;border-right-color:#3b82f6;animation:rot 1s linear infinite;
    filter:drop-shadow(0 0 6px rgba(34,211,238,.4));}
  .badge{position:relative;width:60px;height:60px;border-radius:18px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(150deg,rgba(34,211,238,.16),rgba(59,130,246,.06));
    border:1px solid rgba(34,211,238,.25);box-shadow:0 0 24px rgba(34,211,238,.18),inset 0 0 14px rgba(34,211,238,.06);
    animation:pulse 2.6s ease-in-out infinite;}
  .badge svg{width:32px;height:32px;}
  .name{display:flex;align-items:baseline;font-weight:800;font-size:25px;letter-spacing:-.02em;}
  .name .a{color:#f3f5f8;}
  .name .b{background:linear-gradient(90deg,#22d3ee,#60a5fa);-webkit-background-clip:text;background-clip:text;color:transparent;}
  .tag{margin-top:7px;color:#7c8696;font-size:10px;font-weight:700;letter-spacing:.42em;text-transform:uppercase;padding-left:.42em;}
  .dots{display:flex;gap:7px;margin-top:30px;}
  .dots i{width:7px;height:7px;border-radius:50%;background:#1f2733;animation:blink 1.4s ease-in-out infinite;}
  .dots i:nth-child(2){animation-delay:.2s;}
  .dots i:nth-child(3){animation-delay:.4s;}
  .ver{position:absolute;bottom:14px;left:0;right:0;text-align:center;color:#3a4252;font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;}
  @keyframes rot{to{transform:rotate(360deg);}}
  @keyframes pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.05);}}
  @keyframes blink{0%,100%{background:#1f2733;transform:scale(1);}50%{background:#22d3ee;transform:scale(1.25);}}
  @keyframes slide{0%{left:-40%;}100%{left:100%;}}
  @keyframes sheen{0%{left:-60%;}55%,100%{left:130%;}}
</style></head>
<body>
  <div class="card">
    <div class="top-bar"><i></i></div>
    <div class="logo">
      <div class="ring track"></div>
      <div class="ring spin"></div>
      <div class="badge">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 1.6l2.7 7.1 7.3 .3-5.7 4.6 2 7.1L12 17.9 5.4 22.8l2-7.1L1.7 9l7.3-.3L12 1.6z" fill="url(#g)"/>
          <defs><linearGradient id="g" x1="2" y1="2" x2="22" y2="22"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
        </svg>
      </div>
    </div>
    <div class="name"><span class="a">htss</span><span class="b">.club</span></div>
    <div class="tag">Launcher</div>
    <div class="dots"><i></i><i></i><i></i></div>
    <div class="ver">Đang khởi động</div>
  </div>
</body></html>"##;

/// Reveal the main window and close the splash. Called by the frontend once the
/// app UI has mounted.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
}

/// Đóng ứng dụng. Dùng cho nút đóng tùy chỉnh trên thanh tiêu đề.
/// Ẩn cửa sổ ngay để phản hồi tức thì, đóng cửa sổ trình duyệt phụ (nếu mở),
/// rồi nhường cho event loop huỷ webview xong mới thoát tiến trình. Việc chờ
/// ngắn này tránh lỗi "Failed to unregister class Chrome_WidgetWin_0".
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    use tauri::Manager;

    // Đóng cửa sổ chính ngay để người dùng thấy app đóng tức thì.
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }

    // Đóng các child webview của trình duyệt nhúng (gửi lệnh huỷ vào event loop).
    for (label, webview) in app.webviews() {
        if label.starts_with("htssbrowser-") {
            let _ = webview.close();
        }
    }

    // Thoát sau một khoảng ngắn từ luồng riêng, để event loop kịp xử lý việc
    // huỷ cửa sổ con WebView2 trước khi tiến trình kết thúc.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        app.cleanup_before_exit();
        std::process::exit(0);
    });
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Instant splash served entirely from Rust (no dev server needed), so it
    // paints the moment the splash window is created — before the heavy web
    // app/dev-server compile finishes.
    .register_uri_scheme_protocol("splash", |_app, _request| {
        let html = SPLASH_HTML.as_bytes().to_vec();
        Response::builder()
            .status(200)
            .header("Content-Type", "text/html; charset=utf-8")
            .body(html)
            .unwrap()
    })
    .register_asynchronous_uri_scheme_protocol("vstream", move |_app, request, responder| {
        let uri = request.uri();
        let query = uri.query().unwrap_or("").to_string();
        
        let range_header = request.headers().get("range")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        tauri::async_runtime::spawn(async move {
            let mut target_url = None;
            for pair in query.split('&') {
                let mut parts = pair.splitn(2, '=');
                if let (Some(key), Some(val)) = (parts.next(), parts.next()) {
                    if key == "url" {
                        if let Ok(decoded) = percent_decode_str(val).decode_utf8() {
                            target_url = Some(decoded.into_owned());
                            break;
                        }
                    }
                }
            }
            
            let target_url = match target_url {
                Some(u) => u,
                None => {
                    let resp = Response::builder()
                        .status(400)
                        .header("Content-Type", "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body("{\"error\":\"Missing URL parameter\"}".as_bytes().to_vec())
                        .unwrap();
                    responder.respond(resp);
                    return;
                }
            };
            
            let client = get_async_http_client();
            let mut fetch_builder = client.get(&target_url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")
                .header("Referer", "https://anime47.best/")
                .header("Origin", "https://anime47.best")
                .header("Accept", "*/*");
                
            if let Some(ref range_str) = range_header {
                fetch_builder = fetch_builder.header("Range", range_str);
            }
            
            let response = match fetch_builder.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    let resp = Response::builder()
                        .status(500)
                        .header("Content-Type", "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(format!("{{\"error\":\"Fetch failed: {}\"}}", e).as_bytes().to_vec())
                        .unwrap();
                    responder.respond(resp);
                    return;
                }
            };
            
            let status = response.status().as_u16();
            let content_type = response.headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
                
            let content_range = response.headers()
                .get("content-range")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
                
            let is_manifest = target_url.contains(".m3u8") 
                || content_type.contains("mpegurl") 
                || content_type.contains("application/x-mpegURL");
                
            if is_manifest {
                let text = response.text().await.unwrap_or_default();
                let rewritten_manifest = rewrite_manifest(&text, &target_url);
                
                let resp = Response::builder()
                    .status(status)
                    .header("Content-Type", "application/vnd.apple.mpegurl")
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "no-cache")
                    .body(rewritten_manifest.into_bytes())
                    .unwrap();
                responder.respond(resp);
            } else {
                let bytes = match response.bytes().await {
                    Ok(b) => b.to_vec(),
                    Err(_) => Vec::new(),
                };
                
                // Pass through all binary segments unchanged.
                // TS sync byte scanning was causing fragParsingError for non-standard segments.
                // However, for anime TS segments, we still need to find the sync byte offset
                // to strip HTTP/CDN preamble that some servers prepend.
                let processed_data = {
                    let target_url_lower = target_url.to_lowercase();
                    let content_type_lower = content_type.to_lowercase();
                    let is_mp4 = target_url_lower.contains(".mp4") || target_url_lower.contains(".m4s") || content_type_lower.contains("mp4");
                    if target_url_lower.contains(".vtt") || content_type_lower.contains("text/vtt") || is_mp4 {
                        bytes
                    } else {
                        let mut video_offset = None;
                        let search_limit = std::cmp::min(bytes.len().saturating_sub(188 * 3), 8000);
                        
                        for i in 0..search_limit {
                            if bytes.len() > i + 376 && bytes[i] == 0x47 && bytes[i + 188] == 0x47 && bytes[i + 376] == 0x47 {
                                video_offset = Some(i);
                                break;
                            }
                        }
                        
                        match video_offset {
                            Some(offset) if offset > 0 => bytes[offset..].to_vec(),
                            _ => bytes,
                        }
                    }
                };
                
                let mut builder = Response::builder()
                    .status(status)
                    .header("Content-Type", content_type)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Accept-Ranges", "bytes");
                    
                if status == 206 {
                    builder = builder.header("Content-Length", processed_data.len().to_string());
                    if let Some(r) = content_range {
                        builder = builder.header("Content-Range", r);
                    }
                }
                
                let resp = builder.body(processed_data).unwrap();
                responder.respond(resp);
            }
        });
    })
    .register_asynchronous_uri_scheme_protocol("proxy", move |_app, request, responder| {
        let uri = request.uri();
        let query = uri.query().unwrap_or("").to_string();
        let path = uri.path().to_string();
        let referer_header = request.headers().get("referer")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        tauri::async_runtime::spawn(async move {
            // Parse ?url= from query
            let mut target_url_opt = None;
            for pair in query.split('&') {
                let mut parts = pair.splitn(2, '=');
                if let (Some(key), Some(val)) = (parts.next(), parts.next()) {
                    if key == "url" {
                        if let Ok(decoded) = percent_decode_str(val).decode_utf8() {
                            target_url_opt = Some(decoded.into_owned());
                            break;
                        }
                    }
                }
            }

            // If no ?url= param, try to resolve from referer + path
            let target_url = if let Some(u) = target_url_opt {
                u
            } else if let Some(ref referer) = referer_header {
                // Extract base URL from referer: proxy://localhost/?url=https://example.com/...
                let base_from_referer = {
                    let mut base = None;
                    for pair in referer.split('?').nth(1).unwrap_or("").split('&') {
                        let mut parts = pair.splitn(2, '=');
                        if let (Some(key), Some(val)) = (parts.next(), parts.next()) {
                            if key == "url" {
                                if let Ok(decoded) = percent_decode_str(val).decode_utf8() {
                                    base = Some(decoded.into_owned());
                                    break;
                                }
                            }
                        }
                    }
                    base
                };
                if let Some(base_url_str) = base_from_referer {
                    if let Ok(base_url) = Url::parse(&base_url_str) {
                        if let Ok(resolved) = base_url.join(&path) {
                            resolved.to_string()
                        } else {
                            let resp = Response::builder().status(400).body(b"Bad request".to_vec()).unwrap();
                            responder.respond(resp);
                            return;
                        }
                    } else {
                        let resp = Response::builder().status(400).body(b"Bad referer".to_vec()).unwrap();
                        responder.respond(resp);
                        return;
                    }
                } else {
                    let resp = Response::builder().status(400).body(b"Missing URL".to_vec()).unwrap();
                    responder.respond(resp);
                    return;
                }
            } else {
                let resp = Response::builder().status(400).body(b"Missing URL".to_vec()).unwrap();
                responder.respond(resp);
                return;
            };

            let client = get_async_http_client();
            let response = match client.get(&target_url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
                .header("Accept-Language", "vi,en-US;q=0.9,en;q=0.8")
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    let body = format!("<html><body style='background:#111;color:#f87171;font-family:sans-serif;padding:2rem'><h2>Lỗi kết nối</h2><p>{}</p></body></html>", e);
                    let resp = Response::builder().status(502)
                        .header("Content-Type", "text/html; charset=utf-8")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(body.into_bytes())
                        .unwrap();
                    responder.respond(resp);
                    return;
                }
            };

            let status = response.status().as_u16();
            let content_type = response.headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("application/octet-stream")
                .to_string();

            // For HTML content, inject navigation script
            if content_type.contains("text/html") {
                let html = response.text().await.unwrap_or_default();
                let encoded_target = utf8_percent_encode(&target_url, NON_ALPHANUMERIC).to_string();
                let inject_script = format!(r#"<script>
(function() {{
  var BASE_URL = decodeURIComponent("{encoded_target}");
  function toProxy(url) {{
    try {{
      var abs = new URL(url, BASE_URL).href;
      return 'http://proxy.localhost/?url=' + encodeURIComponent(abs);
    }} catch(e) {{ return url; }}
  }}
  document.addEventListener('click', function(e) {{
    var el = e.target.closest('a');
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
    e.preventDefault();
    var proxied = toProxy(href);
    window.parent.postMessage({{ type: 'proxy-navigate', url: proxied, originalUrl: new URL(href, BASE_URL).href }}, '*');
    window.location.href = proxied;
  }}, true);
  document.addEventListener('submit', function(e) {{
    var form = e.target;
    if (form.method && form.method.toLowerCase() === 'get') {{
      e.preventDefault();
      var action = form.getAttribute('action') || BASE_URL;
      var params = new URLSearchParams(new FormData(form));
      var fullUrl = new URL(action, BASE_URL).href + '?' + params.toString();
      var proxied = toProxy(fullUrl);
      window.parent.postMessage({{ type: 'proxy-navigate', url: proxied, originalUrl: fullUrl }}, '*');
      window.location.href = proxied;
    }}
  }}, true);
  window.addEventListener('load', function() {{
    window.parent.postMessage({{ type: 'proxy-navigated', url: BASE_URL }}, '*');
  }});
}})();
</script>"#);
                let final_html = if let Some(head_end) = html.find("</head>") {
                    format!("{}{}{}", &html[..head_end], inject_script, &html[head_end..])
                } else {
                    format!("{}{}", inject_script, html)
                };
                let resp = Response::builder()
                    .status(status)
                    .header("Content-Type", "text/html; charset=utf-8")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(final_html.into_bytes())
                    .unwrap();
                responder.respond(resp);
            } else {
                let bytes = response.bytes().await.unwrap_or_default().to_vec();
                let resp = Response::builder()
                    .status(status)
                    .header("Content-Type", &content_type)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap();
                responder.respond(resp);
            }
        });
    })
    .invoke_handler(tauri::generate_handler![
        create_pip_window,
        get_riot_credentials, 
        fetch_valorant_storefront, 
        fetch_valorant_mmr, 
        fetch_valorant_match_history, 
        fetch_valorant_contracts, 
        open_riot_client,
        check_discord_running,
        check_equicord_installed,
        install_equicord,
        check_questify_enabled,
        toggle_questify_plugin,
        kill_discord,
        launch_discord,
        set_discord_rpc,
        clear_discord_rpc,
        save_equicord_custom_rpc,
        clear_equicord_custom_rpc,
        get_equicord_custom_rpc,
        save_direct_rpc_config,
        get_direct_rpc_config,
        add_valorant_account_credentials,
        add_valorant_account_browser,
        add_valorant_account_client,
        get_valorant_accounts,
        delete_valorant_account,
        set_active_valorant_account,
        get_active_valorant_account,
        get_active_credentials,
        refresh_valorant_account,
        logout_riot_client_keep_session,
        get_steam_accounts,
        get_steam_avatar,
        get_active_steam_account,
        switch_steam_account,
        remove_steam_account,
        remove_steam_from_vdf,
        launch_steam,
        add_steam_account,
        logout_steam_account,
        open_steam_userdata,
        check_for_updates,
        download_and_install_update,
        fetch_short_reels_index,
        fetch_short_reels_feed,
        fetch_short_reels_detail,
        search_short_reels,
        fetch_short_reels_hot_list,
        fetch_steam_sales,
        fetch_steam_game_details,
        fetch_epic_games,
        get_tts_audio,
        get_voice_tts_audio,
        list_tts_voices,
        install_virtual_mic,
        open_in_browser,
        fetch_link_preview,
        quit_app,
        show_main_window,
        browser_create,
        browser_navigate,
        browser_back,
        browser_forward,
        browser_reload,
        browser_set_bounds,
        browser_show,
        browser_hide,
        browser_close,
        browser_hide_all,
        browser_close_all
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      use tauri::Manager;

      // Create the native splash window immediately. It loads inline HTML via
      // the custom `splash://` scheme, so it appears instantly while the main
      // web UI compiles/loads. The main window stays hidden (visible:false in
      // config) until the frontend calls `show_main_window`.
      let _ = tauri::WebviewWindowBuilder::new(
        app,
        "splash",
        tauri::WebviewUrl::CustomProtocol("splash://localhost/".parse().unwrap()),
      )
      .title("HTSS Club")
      .inner_size(440.0, 360.0)
      .decorations(false)
      .transparent(true)
      .resizable(false)
      .center()
      .skip_taskbar(true)
      .shadow(false)
      .build();

      // Safety net: if the frontend never signals ready (e.g. a load error),
      // reveal the main window anyway after a timeout so the app isn't stuck
      // on the splash.
      let handle_ready = app.handle().clone();
      std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(20));
        if let Some(main) = handle_ready.get_webview_window("main") {
          if !main.is_visible().unwrap_or(true) {
            let _ = main.show();
            let _ = main.set_focus();
            if let Some(splash) = handle_ready.get_webview_window("splash") {
              let _ = splash.close();
            }
          }
        }
      });

      // Graceful shutdown when the OS / Alt+F4 closes the window: intercept the
      // close, tear down the embedded browser child webviews, then exit after a
      // short delay so WebView2 can destroy its child windows first. Exiting
      // while those still exist causes the
      // "Failed to unregister class Chrome_WidgetWin_0" error.
      if let Some(main) = app.get_webview_window("main") {
        let handle = app.handle().clone();
        main.on_window_event(move |event| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Some(win) = handle.get_webview_window("main") {
              let _ = win.hide();
            }
            for (label, webview) in handle.webviews() {
              if label.starts_with("htssbrowser-") {
                let _ = webview.close();
              }
            }
            let h = handle.clone();
            std::thread::spawn(move || {
              std::thread::sleep(std::time::Duration::from_millis(120));
              h.cleanup_before_exit();
              std::process::exit(0);
            });
          }
        });
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app_handle, _event| {});

}
