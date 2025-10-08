use crate::{HyprAppIcon, TrayPluginExt};

#[tauri::command]
#[specta::specta]
pub async fn set_app_icon(
    app: tauri::AppHandle<tauri::Wry>,
    icon: HyprAppIcon,
) -> Result<(), String> {
    app.set_app_icon(icon).map_err(|e| e.to_string())
}
