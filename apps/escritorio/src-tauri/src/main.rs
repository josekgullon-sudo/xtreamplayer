// Sin consola detrás de la ventana: en Windows, un programa compilado sin
// esto abre un cuadro negro que se queda ahí toda la sesión
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// La dirección de siempre. Se cambia de una vez con
/// `bash apps/poner-dominio.sh https://tudominio.com`, igual que en las
/// aplicaciones de televisor.
const CASA: &str = "https://totalplayer.app";

/// Lo que se abre: la interfaz de televisión, que es la que está pensada
/// para verse de lejos y manejarse con las flechas. `app=1` le dice a la web
/// que va dentro de una aplicación y no en una pestaña del navegador.
fn destino(base: &str) -> String {
    format!("{base}/tv?app=1")
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![guardar_direccion])
        .setup(|app| {
            let base = leer(app.handle());
            /*
             * Se pregunta antes de abrir, no después.
             *
             * Una ventana que carga una dirección muerta se queda en blanco
             * y no dice nada: ni «no hay internet» ni «esa dirección no
             * existe». Preguntando primero se sabe cuál de las dos cosas
             * enseñar. Son unos milisegundos cuando todo va bien, que es
             * casi siempre.
             */
            if alcanzable(&destino(&base)) {
                abrir_tele(app.handle(), &base)?;
            } else {
                abrir_arranque(app.handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("no se ha podido arrancar TOTALplayer");
}

/// La ventana de verdad: la web, a pantalla completa y sin marco.
fn abrir_tele(app: &AppHandle, base: &str) -> tauri::Result<()> {
    let url = tauri::Url::parse(&destino(base))
        .map_err(|_| tauri::Error::UnknownPath)?;
    WebviewWindowBuilder::new(app, "tele", WebviewUrl::External(url))
        .title("TOTALplayer")
        .fullscreen(true)
        .resizable(true)
        .build()?;
    Ok(())
}

/// La pantalla de emergencia: solo se ve si no se ha podido conectar.
fn abrir_arranque(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, "arranque", WebviewUrl::App("index.html".into()))
        .title("TOTALplayer")
        .inner_size(760.0, 560.0)
        .center()
        .resizable(false)
        .build()?;
    Ok(())
}

/// Comprueba que al otro lado hay un servidor.
///
/// Un 404 o un 500 también valen: significan que la dirección existe y que
/// contesta alguien. Lo que descarta es no llegar —sin red, dominio que no
/// resuelve, o el servidor apagado—, que es lo único que no tiene arreglo
/// desde dentro de la aplicación.
fn alcanzable(url: &str) -> bool {
    let agente = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(4))
        .timeout_read(Duration::from_secs(5))
        .build();
    match agente.get(url).call() {
        Ok(_) => true,
        Err(ureq::Error::Status(_, _)) => true,
        Err(_) => false,
    }
}

/// Dónde se guarda la dirección que haya escrito el cliente.
fn fichero(app: &AppHandle) -> Option<PathBuf> {
    let carpeta = app.path().app_config_dir().ok()?;
    fs::create_dir_all(&carpeta).ok()?;
    Some(carpeta.join("direccion.txt"))
}

fn leer(app: &AppHandle) -> String {
    fichero(app)
        .and_then(|f| fs::read_to_string(f).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| CASA.to_string())
}

/**
 * Deja la dirección escrita como toca.
 *
 * Lo que teclea alguien en un campo es «totalplayer.app», «totalplayer.app/»
 * o «http://totalplayer.app/tv». Las tres tienen que acabar igual, porque
 * luego se les pega «/tv?app=1» detrás y dos barras seguidas son un 404.
 */
fn normalizar(escrito: &str) -> String {
    let mut s = escrito.trim().to_string();
    if !s.starts_with("http://") && !s.starts_with("https://") {
        s = format!("https://{s}");
    }
    // Se queda solo con esquema y servidor: el resto lo pone `destino`
    if let Ok(u) = tauri::Url::parse(&s) {
        if let Some(host) = u.host_str() {
            let puerto = u.port().map(|p| format!(":{p}")).unwrap_or_default();
            return format!("{}://{}{}", u.scheme(), host, puerto);
        }
    }
    s.trim_end_matches('/').to_string()
}

#[tauri::command]
fn guardar_direccion(app: AppHandle, direccion: String) -> Result<(), String> {
    let base = normalizar(&direccion);
    if !alcanzable(&destino(&base)) {
        return Err(format!("No hay respuesta en {}", destino(&base)));
    }
    if let Some(f) = fichero(&app) {
        fs::write(f, &base).map_err(|e| e.to_string())?;
    }
    abrir_tele(&app, &base).map_err(|e| e.to_string())?;
    if let Some(v) = app.get_webview_window("arranque") {
        let _ = v.close();
    }
    Ok(())
}
