// Sin consola detrás de la ventana: en Windows, un programa compilado sin
// esto abre un cuadro negro que se queda ahí toda la sesión
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

mod descargas;

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
        .invoke_handler(tauri::generate_handler![
            guardar_direccion,
            alternar_pantalla_completa,
            descargas::tp_bajar,
            descargas::tp_quitar,
            descargas::tp_descargas
        ])
        .setup(|app| {
            // Lo que hubiera guardado de la vez anterior, y lo que quedara a
            // medias, que al arrancar de nuevo ya no va a avanzar solo
            descargas::al_arrancar(app.handle());
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

/**
 * La ventana de verdad: la web, ocupando la pantalla pero con su marco.
 *
 * Antes abría a pantalla completa y sin marco, que se ve muy bien y tiene un
 * defecto que no es pequeño: no hay aspa, ni barra de tareas, ni menú. Quien
 * no se sepa el Alt+F4 se queda dentro del programa sin manera de salir, y
 * eso es exactamente lo que pasó. Maximizada con marco se ve prácticamente
 * igual —una barra de título de treinta píxeles— y siempre hay por dónde
 * cerrar. Para ver una película a pantalla completa está F11, que es la
 * tecla de toda la vida y aquí funciona en los dos sentidos.
 */
fn abrir_tele(app: &AppHandle, base: &str) -> tauri::Result<()> {
    let url = tauri::Url::parse(&destino(base))
        .map_err(|_| tauri::Error::UnknownPath)?;
    WebviewWindowBuilder::new(app, "tele", WebviewUrl::External(url))
        .title("TOTALplayer")
        .maximized(true)
        .decorations(true)
        .resizable(true)
        .initialization_script(RECARGAR)
        /* Y el puente de descargas: en Windows sí hay disco donde guardar una
           película, así que la web enseña el botón y su sección. En un
           navegador no lo enseña, porque allí no se puede. Ver descargas.rs */
        .initialization_script(descargas::PUENTE)
        .build()?;
    Ok(())
}

/**
 * F5 y Ctrl+R, que dentro de una ventana así no existen.
 *
 * Un navegador trae esas teclas de fábrica; una ventana de aplicación, no.
 * Y hacen falta: la primera vez que se despliega una versión nueva de la web,
 * la que está abierta sigue siendo la vieja hasta que alguien recargue —y sin
 * barra de direcciones no había manera—. Es JavaScript a secas, no habla con
 * el programa: se inyecta en cada página que se abra, también en la web.
 */
const RECARGAR: &str = r#"
window.addEventListener('keydown', function (e) {
  if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
    e.preventDefault();
    location.reload();
    return;
  }
  /*
   * F11: pantalla completa, y volver.
   *
   * La ventana arranca maximizada y con marco —para que siempre haya un
   * aspa—, así que F11 es lo que se pulsa para ver una película sin barra
   * de título, y se vuelve a pulsar para recuperarla.
   *
   * No se usa ESCAPE a propósito: dentro de la aplicación, ESCAPE es
   * «atrás», y robárselo dejaría la navegación coja.
   */
  if (e.key === 'F11') {
    e.preventDefault();
    try {
      window.__TAURI_INTERNALS__.invoke('alternar_pantalla_completa');
    } catch (niIdea) {
      /* Fuera del programa esto no existe y no pasa nada */
    }
  }
});
"#;

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

/**
 * Salir de pantalla completa —y volver— desde la propia página.
 *
 * Una ventana a pantalla completa y sin marco no tiene aspa ni barra de
 * tareas: quien no se sepa el Alt+F4 se queda dentro. Con marco, cerrar es
 * lo de siempre.
 */
#[tauri::command]
fn alternar_pantalla_completa(app: AppHandle) -> Result<(), String> {
    let v = app.get_webview_window("tele").ok_or("sin ventana")?;
    let completa = v.is_fullscreen().map_err(|e| e.to_string())?;
    v.set_fullscreen(!completa).map_err(|e| e.to_string())?;
    // Sin pantalla completa, el marco: es lo que trae el aspa de cerrar
    v.set_decorations(completa).map_err(|e| e.to_string())?;
    Ok(())
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
