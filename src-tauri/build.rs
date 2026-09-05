fn main() {
    // Supabase credentials are baked in at compile time from the same env var
    // names the Electron build used, so existing CI secrets keep working.
    println!("cargo:rerun-if-env-changed=VITE_SUPABASE_URL");
    println!("cargo:rerun-if-env-changed=VITE_SUPABASE_ANON_KEY");

    tauri_build::build()
}
