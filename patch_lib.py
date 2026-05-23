import re

with open('f:/project/htssclub/src-tauri/src/lib.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports and statics
header = '''
use std::sync::Mutex;
use once_cell::sync::OnceCell;
use std::process::Command;
use std::io::{BufReader, BufRead};
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

static TUNNEL_URL: OnceCell<Mutex<Option<String>>> = OnceCell::new();
static TUNNEL_CHILD: OnceCell<Mutex<Option<std::process::Child>>> = OnceCell::new();
static LOCAL_PORT: OnceCell<u16> = OnceCell::new();

#[tauri::command]
fn get_cloudflare_tunnel_url() -> Option<String> {
    if let Some(url_mutex) = TUNNEL_URL.get() {
        if let Ok(guard) = url_mutex.lock() {
            return guard.clone();
        }
    }
    None
}

fn kill_zombie_processes() {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(&["/F", "/IM", "cloudflared.exe"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
    }
}

fn start_cloudflare_tunnel() {
    let _ = std::thread::spawn(|| {
        let mut port = 3066;
        for _ in 0..100 {
            if let Some(&p) = LOCAL_PORT.get() {
                port = p;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let local_addr = format!("http://127.0.0.1:{}", port);
        let host_header = format!("127.0.0.1:{}", port);

        #[cfg(target_os = "windows")]
        let mut cmd = {
            use std::os::windows::process::CommandExt;
            let mut c = std::process::Command::new("cloudflared.exe");
            c.creation_flags(0x08000000); // CREATE_NO_WINDOW
            c
        };
        #[cfg(not(target_os = "windows"))]
        let mut cmd = std::process::Command::new("cloudflared");

        cmd.args(["tunnel", "--url", &local_addr, "--http-host-header", &host_header])
           .stdout(std::process::Stdio::piped())
           .stderr(std::process::Stdio::piped());

        if let Ok(mut child) = cmd.spawn() {
            if let Some(stderr) = child.stderr.take() {
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            if l.contains("trycloudflare.com") {
                                if let Some(start_idx) = l.find("https://") {
                                    let sub = &l[start_idx..];
                                    let len = sub.chars().take_while(|c| !c.is_whitespace()).count();
                                    let url = sub[..len].trim().to_string();
                                    if let Some(url_mutex) = TUNNEL_URL.get() {
                                        if let Ok(mut guard) = url_mutex.lock() {
                                            *guard = Some(url.clone());
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }
            if let Some(child_mutex) = TUNNEL_CHILD.get() {
                if let Ok(mut guard) = child_mutex.lock() {
                    *guard = Some(child);
                }
            }
        }
    });
}

async fn start_production_local_server(app_handle: tauri::AppHandle) {
    let mut port = 3066;
    let listener = loop {
        match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
            Ok(l) => break l,
            Err(_) => {
                port += 1;
                if port > 3100 { return; }
            }
        }
    };
    let _ = LOCAL_PORT.set(port);

    loop {
        if let Ok((mut socket, _)) = listener.accept().await {
            tauri::async_runtime::spawn(async move {
                let mut buf = [0; 4096];
                if let Ok(n) = socket.read(&mut buf).await {
                    if n == 0 { return; }
                    let req_str = String::from_utf8_lossy(&buf[..n]);
                    let mut lines = req_str.lines();
                    if let Some(first_line) = lines.next() {
                        let parts: Vec<&str> = first_line.split_whitespace().collect();
                        if parts.len() >= 2 {
                            let path_and_query = parts[1];
                            let mut path_parts = path_and_query.splitn(2, '?');
                            let path = path_parts.next().unwrap_or("/");
                            let query = path_parts.next();

                            if path == "/api/v-stream" {
                                let mut target_url = None;
                                if let Some(q) = query {
                                    for pair in q.split('&') {
                                        let mut kv = pair.splitn(2, '=');
                                        if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
                                            if k == "url" {
                                                if let Ok(decoded) = percent_encoding::percent_decode_str(v).decode_utf8() {
                                                    target_url = Some(decoded.into_owned());
                                                }
                                            }
                                        }
                                    }
                                }

                                if let Some(url) = target_url {
                                    let mut range_val = None;
                                    for line in req_str.lines() {
                                        if line.to_lowercase().starts_with("range:") {
                                            range_val = Some(line["range:".len()..].trim().to_string());
                                            break;
                                        }
                                    }

                                    let client = reqwest::Client::builder().danger_accept_invalid_certs(true).build().unwrap_or_default();
                                    let mut builder = client.get(&url)
                                        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                                        .header("Referer", "https://anime47.best/")
                                        .header("Origin", "https://anime47.best");
                                        
                                    if let Some(r) = range_val {
                                        builder = builder.header("Range", r);
                                    }

                                    if let Ok(resp) = builder.send().await {
                                        let status = resp.status().as_u16();
                                        let ctype = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                                        let crange = resp.headers().get("content-range").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
                                        
                                        // Handle m3u8 manifests for /api/v-stream 
                                        let is_manifest = url.contains(".m3u8") || ctype.contains("mpegurl");
                                        if is_manifest {
                                            if let Ok(text) = resp.text().await {
                                                // rewrite logic: just a simple rewrite or returning original
                                                let mut rewritten = text;
                                                let head = format!("HTTP/1.1 {}\\r\\nContent-Type: application/vnd.apple.mpegurl\\r\\nContent-Length: {}\\r\\nAccess-Control-Allow-Origin: *\\r\\n\\r\\n", status, rewritten.len());
                                                let _ = socket.write_all(head.as_bytes()).await;
                                                let _ = socket.write_all(rewritten.as_bytes()).await;
                                                return;
                                            }
                                        }

                                        if let Ok(bytes) = resp.bytes().await {
                                            let mut processed = bytes.to_vec();
                                            let is_mp4 = url.contains(".mp4") || url.contains(".m4s") || ctype.contains("mp4");
                                            if !url.contains(".vtt") && !ctype.contains("text/vtt") && !is_mp4 {
                                                let mut offset = None;
                                                let limit = std::cmp::min(processed.len().saturating_sub(188*3), 512000);
                                                for i in 0..limit {
                                                    if processed[i] == 0x47 && processed[i+188] == 0x47 && processed[i+376] == 0x47 {
                                                        offset = Some(i); break;
                                                    }
                                                }
                                                if let Some(o) = offset { processed = processed[o..].to_vec(); }
                                            }
                                            
                                            let mut head = format!("HTTP/1.1 {}\\r\\nContent-Type: {}\\r\\nContent-Length: {}\\r\\nAccess-Control-Allow-Origin: *\\r\\nAccept-Ranges: bytes\\r\\n", status, ctype, processed.len());
                                            if let Some(r) = crange { head.push_str(&format!("Content-Range: {}\\r\\n", r)); }
                                            head.push_str("\\r\\n");
                                            let _ = socket.write_all(head.as_bytes()).await;
                                            let _ = socket.write_all(&processed).await;
                                            return;
                                        }
                                    }
                                }
                                let _ = socket.write_all(b"HTTP/1.1 500 ERROR\\r\\n\\r\\n").await;
                            } else {
                                // Proxy static to nextjs (port 3000)
                                let clean = path.trim_start_matches('/');
                                let dev_url = if let Some(q) = query { format!("http://127.0.0.1:3000/{}?{}", clean, q) } else { format!("http://127.0.0.1:3000/{}", clean) };
                                let client = reqwest::Client::new();
                                if let Ok(resp) = client.get(&dev_url).send().await {
                                    let status = resp.status().as_u16();
                                    let ctype = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                                    if let Ok(bytes) = resp.bytes().await {
                                        let head = format!("HTTP/1.1 {}\\r\\nContent-Type: {}\\r\\nContent-Length: {}\\r\\nAccess-Control-Allow-Origin: *\\r\\n\\r\\n", status, ctype, bytes.len());
                                        let _ = socket.write_all(head.as_bytes()).await;
                                        let _ = socket.write_all(&bytes).await;
                                    }
                                }
                            }
                        }
                    }
                }
            });
        }
    }
}
'''

content = content.replace('#[cfg_attr(mobile, tauri::mobile_entry_point)]', header + '\n#[cfg_attr(mobile, tauri::mobile_entry_point)]')

content = content.replace('pub fn run() {\n', 'pub fn run() {\n    kill_zombie_processes();\n')

setup_block = '''
      let _ = TUNNEL_URL.set(Mutex::new(None));
      let _ = TUNNEL_CHILD.set(Mutex::new(None));
      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
          start_production_local_server(app_handle).await;
      });
      start_cloudflare_tunnel();
'''

content = content.replace('.setup(|app| {', '.setup(|app| {' + setup_block)

content = content.replace('fetch_epic_games\n    ])', 'fetch_epic_games,\n        get_cloudflare_tunnel_url\n    ])')

run_block = '''
    .on_window_event(|_window, event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Some(child_mutex) = TUNNEL_CHILD.get() {
                if let Ok(mut guard) = child_mutex.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(child_mutex) = TUNNEL_CHILD.get() {
                if let Ok(mut guard) = child_mutex.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
'''

content = re.sub(r'\.run\(tauri::generate_context!\(\)\)\n\s*\.expect\("error while running tauri application"\);', run_block, content)

with open('f:/project/htssclub/src-tauri/src/lib.rs', 'w', encoding='utf-8') as f:
    f.write(content)
print('Patched successfully!')
