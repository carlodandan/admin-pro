// Release builds must not pop a console window behind the app on Windows,
// which is what Electron's packaged binary did too.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    admin_pro_lib::run()
}
