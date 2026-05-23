              responder.respond(resp);
            }
        });
    })
    .invoke_handler(tauri::generate_handler![
        fetch_short_reels_feed,
        fetch_short_reels_detail,
        search_short_reels,
        fetch_short_reels_hot_list
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
