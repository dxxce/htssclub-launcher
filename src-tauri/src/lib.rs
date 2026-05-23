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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActiveAccountConfig {
    pub puuid: Option<String>,
}

async fn riot_login(username: &str, password: &str) -> Result<(String, String, String), String> {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    // Step 1: Khởi tạo session để lấy Cookies
    let init_url = "https://auth.riotgames.com/api/v1/authorization";
    let init_body = serde_json::json!({
        "client_id": "play-valorant-web-prod",
        "nonce": "1",
        "redirect_uri": "https://playvalorant.com/opt_in",
        "response_type": "token id_token",
        "scope": "openid acls email link"
    });

    let init_resp = client.post(init_url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
        .json(&init_body)
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối Riot Auth (Khởi tạo): {}", e))?;

    // Trích xuất cookie từ Set-Cookie
    let mut cookies = Vec::new();
    for cookie in init_resp.headers().get_all("set-cookie") {
        if let Ok(cookie_str) = cookie.to_str() {
            if let Some(cookie_val) = cookie_str.split(';').next() {
                cookies.push(cookie_val.to_string());
            }
        }
    }
    
    let cookie_header = cookies.join("; ");

    // Step 2: Gửi tài khoản và mật khẩu
    let auth_body = serde_json::json!({
        "type": "auth",
        "username": username,
        "password": password,
        "remember": true
    });

    let auth_resp = client.put(init_url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "ShooterGame/11 Windows/10.0.19042.1.256.64bit")
        .header("Cookie", &cookie_header)
        .json(&auth_body)
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối Riot Auth (Đăng nhập): {}", e))?;

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

    Ok((access_token, entitlement_token, puuid))
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
    let (auth_token, entitlement_token, puuid) = riot_login(&username, &password).await?;
    
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
    
    // Nếu chuyển sang tài khoản đã sao lưu, khôi phục session tệp RiotGamesPrivateSettings.yaml
    if puuid != "running_client" {
        let _ = restore_riot_session(&puuid);
        // Tự động mở lại Riot Client sau khi khôi phục session thành công
        let _ = open_riot_client();
    } else {
        // Khôi phục lại session mặc định gốc của máy tính
        let _ = restore_riot_session("original_session");
        // Tự động mở lại Riot Client mặc định
        let _ = open_riot_client();
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

#[tauri::command]
async fn check_equicord_installed() -> bool {
    // 1. Kiểm tra thư mục cấu hình Roaming AppData của Equicord
    if let Ok(app_data) = std::env::var("APPDATA") {
        let equicord_dir = PathBuf::from(&app_data).join("Equicord");
        if equicord_dir.exists() {
            return true;
        }
    }

    // 2. Quét thư mục Local AppData Discord xem có bản vá app hay chưa
    let local_app_data = match std::env::var("LOCALAPPDATA") {
        Ok(p) => p,
        Err(_) => return false,
    };
    let discord_dir = PathBuf::from(&local_app_data).join("Discord");
    if discord_dir.exists() {
        if let Ok(entries) = fs::read_dir(&discord_dir) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if path.is_dir() {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            if name.starts_with("app-") {
                                // Kiểm tra nếu tồn tại resources/app (bản vá Electron)
                                let patch_path = path.join("resources").join("app");
                                if patch_path.exists() {
                                    return true;
                                }
                            }
                        }
                    }
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

    // Mở EquilotlCli.exe trong một cửa sổ Command Prompt mới với tham số -install để hiện thẳng màn hình chọn đường dẫn Discord
    let status = create_silent_command("cmd")
        .args(&["/C", "start", "cmd.exe", "/C", installer_path.to_str().unwrap(), "-install"])
        .status();

    match status {
        Ok(s) if s.success() => Ok("Đã mở cửa sổ cài đặt Equicord dưới dạng CMD! Bạn chỉ cần nhấn Enter tại cửa sổ đen vừa xuất hiện để xác nhận cài đặt.".to_string()),
        Ok(_) => Err("Không thể mở cửa sổ CMD cài đặt.".to_string()),
        Err(e) => Err(format!("Lỗi khi khởi chạy trình cài đặt: {}", e)),
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



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
        add_valorant_account_client,
        get_valorant_accounts,
        delete_valorant_account,
        set_active_valorant_account,
        get_active_valorant_account,
        logout_riot_client_keep_session,
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
        open_in_browser
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app_handle, _event| {});

}
