// Prevents a console window from appearing on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod keychain;

use tauri::Emitter;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Register the spectrus:// URI-scheme handler.
            // When the OS activates the scheme (because the app is already running),
            // this callback fires and we forward the URL to the webview as a Tauri
            // event so the React router can navigate without a full restart.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        handle
                            .emit("spectrus://deep-link", url.to_string())
                            .unwrap_or_else(|e| {
                                eprintln!("deep-link emit error: {e}");
                            });
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spectrus");
}
