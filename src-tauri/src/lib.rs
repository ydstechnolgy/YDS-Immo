// Le logiciel est la même page web que sur iPhone et Mac, affichée dans une fenêtre Windows.
// Le plugin "opener" ouvre les liens (WhatsApp, cartes) dans le navigateur de l'ordinateur.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("erreur au démarrage de YDS Immo");
}
