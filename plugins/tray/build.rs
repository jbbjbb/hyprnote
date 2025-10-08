const COMMANDS: &[&str] = &["set_app_icon"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
