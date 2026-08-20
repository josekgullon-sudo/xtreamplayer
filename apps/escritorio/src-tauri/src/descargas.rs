/*!
 * Guardar películas y episodios en el disco, para verlos sin conexión.
 *
 * La interfaz de este programa es la misma web que en el televisor, y una web
 * no puede guardar dos gigas: lo que hay en un navegador es almacenamiento
 * del sitio, que el sistema borra cuando le hace falta espacio. Aquí sí se
 * puede, así que la web pregunta —«¿hay alguien que sepa descargar?»— y esto
 * es lo que contesta que sí.
 *
 * El contrato con la web son tres funciones que reciben y devuelven texto, y
 * es igual de simple en la aplicación de Android por una razón que manda: el
 * puente de Android no sabe pasar objetos. Está escrito en
 * `components/tv/descargas.ts`, y la parte de Android en
 * `apps/comun/java/app/totalplayer/comun/Descargas.java`.
 *
 * Lo que sí cambia aquí es la forma de llamar: en Android la web llama a un
 * objeto de Java directamente y la respuesta es inmediata; en Tauri todo pasa
 * por `invoke`, que devuelve una promesa. Para que el contrato siga siendo el
 * mismo, el JavaScript que se inyecta guarda la última respuesta y `lista()`
 * devuelve esa. Se adapta el envoltorio al contrato, no al revés.
 */

use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Una cosa guardada, o guardándose.
#[derive(Clone, Serialize, Deserialize)]
pub struct Fila {
    pub id: String,
    pub nombre: String,
    pub cartel: String,
    /// «bajando», «lista» o «fallo»
    pub estado: String,
    pub parte: u8,
    pub bytes: u64,
    /// De dónde se está bajando. No se le manda a la web: no tiene nada que
    /// hacer con ella y es una dirección con la sesión del proveedor dentro.
    #[serde(default)]
    pub origen: String,
}

/// Lo que se le manda a la web: lo de arriba, con `url` y sin `origen`.
#[derive(Serialize)]
struct Vista {
    id: String,
    nombre: String,
    cartel: String,
    estado: String,
    parte: u8,
    bytes: u64,
    url: String,
}

#[derive(Deserialize)]
struct Encargo {
    id: String,
    #[serde(default)]
    nombre: String,
    #[serde(default)]
    cartel: String,
    url: String,
}

fn cuaderno() -> &'static Mutex<Vec<Fila>> {
    static C: OnceLock<Mutex<Vec<Fila>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(Vec::new()))
}

/// Lo que se ha mandado parar mientras bajaba.
fn cancelados() -> &'static Mutex<HashSet<String>> {
    static C: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashSet::new()))
}

/// El puerto del servidor local. Cero mientras no esté abierto.
static PUERTO: AtomicU16 = AtomicU16::new(0);

fn carpeta(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let c = base.join("descargas");
    let _ = fs::create_dir_all(&c);
    c
}

/// Un nombre de fichero que no dependa de cómo se llame la película.
fn limpio(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

fn fichero(app: &AppHandle, id: &str) -> PathBuf {
    carpeta(app).join(format!("{}.dat", limpio(id)))
}

fn a_medias(app: &AppHandle, id: &str) -> PathBuf {
    carpeta(app).join(format!("{}.medias", limpio(id)))
}

fn indice(app: &AppHandle) -> PathBuf {
    carpeta(app).join("indice.json")
}

/// Se lee del disco una vez, al arrancar.
///
/// Lo que quedara a medio bajar de la vez anterior queda como fallido: la cola
/// de descargas no sobrevive a cerrar el programa, así que algo apuntado como
/// «bajando» al arrancar no va a avanzar solo. Decirlo es lo honesto — se ve,
/// se sabe que ocupa disco, y se puede quitar o volver a pedir.
pub fn al_arrancar(app: &AppHandle) {
    let leido: Vec<Fila> = fs::read_to_string(indice(app))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    let repasado = leido
        .into_iter()
        .map(|mut f| {
            if f.estado == "bajando" {
                f.estado = "fallo".into();
            }
            f
        })
        .collect();
    if let Ok(mut c) = cuaderno().lock() {
        *c = repasado;
    }
    guardar(app);
}

fn guardar(app: &AppHandle) {
    let copia = match cuaderno().lock() {
        Ok(c) => c.clone(),
        Err(_) => return,
    };
    if let Ok(texto) = serde_json::to_string(&copia) {
        let _ = fs::write(indice(app), texto);
    }
}

fn cambiar(app: &AppHandle, id: &str, estado: Option<&str>, parte: Option<u8>, bytes: Option<u64>) {
    if let Ok(mut c) = cuaderno().lock() {
        if let Some(f) = c.iter_mut().find(|f| f.id == id) {
            if let Some(e) = estado {
                f.estado = e.to_string();
            }
            if let Some(p) = parte {
                f.parte = p;
            }
            if let Some(b) = bytes {
                f.bytes = b;
            }
        }
    }
    guardar(app);
}

fn cancelado(id: &str) -> bool {
    cancelados().lock().map(|c| c.contains(id)).unwrap_or(false)
}

/* ---------- Lo que ve la web ---------- */

#[tauri::command]
pub fn tp_bajar(app: AppHandle, encargo: String) {
    let e: Encargo = match serde_json::from_str(&encargo) {
        Ok(e) => e,
        Err(_) => return,
    };
    if e.id.is_empty() || e.url.is_empty() {
        return;
    }
    {
        let mut c = match cuaderno().lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        if c.iter().any(|f| f.id == e.id) {
            return; // ya está, o ya está bajando
        }
        // Lo último encargado, arriba
        c.insert(
            0,
            Fila {
                id: e.id.clone(),
                nombre: e.nombre.clone(),
                cartel: e.cartel.clone(),
                estado: "bajando".into(),
                parte: 0,
                bytes: 0,
                origen: e.url.clone(),
            },
        );
    }
    if let Ok(mut x) = cancelados().lock() {
        x.remove(&e.id);
    }
    guardar(&app);

    let hilo = app.clone();
    std::thread::spawn(move || traer(hilo, e.id, e.url));
}

#[tauri::command]
pub fn tp_quitar(app: AppHandle, id: String) {
    if let Ok(mut x) = cancelados().lock() {
        x.insert(id.clone());
    }
    if let Ok(mut c) = cuaderno().lock() {
        c.retain(|f| f.id != id);
    }
    let _ = fs::remove_file(fichero(&app, &id));
    let _ = fs::remove_file(a_medias(&app, &id));
    guardar(&app);
}

#[tauri::command]
pub fn tp_descargas(app: AppHandle) -> String {
    let puerto = servidor(&app);
    let c = match cuaderno().lock() {
        Ok(c) => c.clone(),
        Err(_) => return "[]".into(),
    };
    let fuera: Vec<Vista> = c
        .into_iter()
        .map(|f| {
            // La dirección solo tiene sentido cuando el fichero está entero:
            // media película se ve como un vídeo roto
            let url = if f.estado == "lista" && puerto > 0 {
                format!("http://127.0.0.1:{}/d/{}", puerto, f.id)
            } else {
                String::new()
            };
            Vista {
                id: f.id,
                nombre: f.nombre,
                cartel: f.cartel,
                estado: f.estado,
                parte: f.parte,
                bytes: f.bytes,
                url,
            }
        })
        .collect();
    serde_json::to_string(&fuera).unwrap_or_else(|_| "[]".into())
}

/* ---------- Bajarlo ---------- */

/// Se escribe en un `.medias` y solo al final se renombra: así, un corte de
/// luz deja basura reconocible y no una película que parece entera y está
/// partida por la mitad.
fn traer(app: AppHandle, id: String, origen: String) {
    let temporal = a_medias(&app, &id);
    let resultado = (|| -> Result<u64, String> {
        let res = ureq::AgentBuilder::new()
            .timeout_connect(std::time::Duration::from_secs(20))
            .build()
            .get(&origen)
            // Algunos paneles miran quién pide y contestan 403 a lo que no
            // parece un reproductor
            .set("User-Agent", "TOTALplayer")
            .call()
            .map_err(|e| e.to_string())?;
        let total: u64 = res
            .header("Content-Length")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let mut entra = res.into_reader();
        let mut sale = fs::File::create(&temporal).map_err(|e| e.to_string())?;
        let mut trozo = vec![0u8; 64 * 1024];
        let mut llevamos: u64 = 0;
        let mut ultimo: i32 = -1;
        loop {
            if cancelado(&id) {
                return Err("cancelada".into());
            }
            let leidos = entra.read(&mut trozo).map_err(|e| e.to_string())?;
            if leidos == 0 {
                break;
            }
            sale.write_all(&trozo[..leidos]).map_err(|e| e.to_string())?;
            llevamos += leidos as u64;
            let parte = if total > 0 { (llevamos * 100 / total) as i32 } else { 0 };
            // Se apunta cada punto porcentual y no cada trozo: escribir el
            // índice sesenta veces por segundo es tocar el disco sin motivo
            if parte != ultimo {
                ultimo = parte;
                cambiar(&app, &id, None, Some(parte.clamp(0, 100) as u8), Some(llevamos));
            }
        }
        sale.flush().map_err(|e| e.to_string())?;
        drop(sale);
        let entero = fichero(&app, &id);
        let _ = fs::remove_file(&entero);
        fs::rename(&temporal, &entero).map_err(|e| e.to_string())?;
        Ok(fs::metadata(&entero).map(|m| m.len()).unwrap_or(llevamos))
    })();

    match resultado {
        Ok(bytes) => cambiar(&app, &id, Some("lista"), Some(100), Some(bytes)),
        Err(_) => {
            let _ = fs::remove_file(&temporal);
            if !cancelado(&id) {
                cambiar(&app, &id, Some("fallo"), None, None);
            }
        }
    }
}

/* ---------- Servirlo ---------- */

/**
 * Un servidor de tres líneas para servirle a la ventana lo que ya está en
 * disco.
 *
 * Suena a exageración y no lo es: la interfaz es una página en `https://`, y
 * desde una página así un `<video src="file:///...">` no carga —el navegador
 * lo bloquea, y hace bien—. Por `http://127.0.0.1` sí, porque el navegador lo
 * trata como sitio de confianza, y además entiende de rangos, que es lo que
 * permite avanzar y retroceder dentro de una película.
 *
 * No sale del equipo: escucha solo en la dirección de bucle local. Y solo
 * sirve lo que hay en la carpeta de descargas, porque lo que se pide no es
 * una ruta sino un identificador.
 */
fn servidor(app: &AppHandle) -> u16 {
    let ya = PUERTO.load(Ordering::Relaxed);
    if ya > 0 {
        return ya;
    }
    let puerta = match TcpListener::bind((Ipv4Addr::LOCALHOST, 0)) {
        Ok(p) => p,
        Err(_) => return 0,
    };
    let puerto = puerta.local_addr().map(|a| a.port()).unwrap_or(0);
    if puerto == 0 {
        return 0;
    }
    PUERTO.store(puerto, Ordering::Relaxed);
    let mio = app.clone();
    std::thread::spawn(move || {
        for quien in puerta.incoming() {
            let Ok(quien) = quien else { continue };
            let suyo = mio.clone();
            std::thread::spawn(move || {
                let _ = atender(&suyo, quien);
            });
        }
    });
    puerto
}

fn atender(app: &AppHandle, mut quien: TcpStream) -> std::io::Result<()> {
    let mut lineas = BufReader::new(quien.try_clone()?);
    let mut peticion = String::new();
    lineas.read_line(&mut peticion)?;
    let mut trozos = peticion.split_whitespace();
    let metodo = trozos.next().unwrap_or("");
    let camino = trozos.next().unwrap_or("").to_string();
    if metodo != "GET" {
        return seco(&mut quien, 405, "Method Not Allowed");
    }

    let mut desde: u64 = 0;
    let mut hasta: Option<u64> = None;
    loop {
        let mut linea = String::new();
        if lineas.read_line(&mut linea)? == 0 {
            break;
        }
        let linea = linea.trim_end().to_string();
        if linea.is_empty() {
            break;
        }
        let bajo = linea.to_ascii_lowercase();
        if let Some(rango) = bajo.strip_prefix("range:") {
            if let Some(bytes) = rango.trim().strip_prefix("bytes=") {
                let mut extremos = bytes.split('-');
                if let Some(a) = extremos.next() {
                    if let Ok(n) = a.trim().parse() {
                        desde = n;
                    }
                }
                if let Some(b) = extremos.next() {
                    if let Ok(n) = b.trim().parse() {
                        hasta = Some(n);
                    }
                }
            }
        }
    }

    let Some(id) = camino.strip_prefix("/d/") else {
        return seco(&mut quien, 404, "Not Found");
    };
    let ruta = fichero(app, id);
    if !ruta.exists() {
        return seco(&mut quien, 404, "Not Found");
    }
    let tamano = fs::metadata(&ruta)?.len();
    let hasta = hasta.filter(|h| *h < tamano).unwrap_or(tamano.saturating_sub(1));
    if desde >= tamano {
        return seco(&mut quien, 416, "Requested Range Not Satisfiable");
    }
    let cuanto = hasta - desde + 1;
    let por_trozos = desde > 0 || cuanto < tamano;

    let mut cabecera = String::new();
    cabecera.push_str(if por_trozos {
        "HTTP/1.1 206 Partial Content\r\n"
    } else {
        "HTTP/1.1 200 OK\r\n"
    });
    // El tipo se deja en genérico a propósito: lo que baja de un panel puede
    // ser mp4, mkv o ts, y el reproductor lo averigua mirando dentro mejor de
    // lo que lo adivinaríamos por la extensión
    cabecera.push_str("Content-Type: video/mp4\r\n");
    cabecera.push_str("Accept-Ranges: bytes\r\n");
    cabecera.push_str(&format!("Content-Length: {}\r\n", cuanto));
    if por_trozos {
        cabecera.push_str(&format!("Content-Range: bytes {}-{}/{}\r\n", desde, hasta, tamano));
    }
    // La página que lo pide está en otro origen —es la web, en https— así que
    // sin esto el navegador no la deja leerlo
    cabecera.push_str("Access-Control-Allow-Origin: *\r\n");
    cabecera.push_str("Connection: close\r\n\r\n");
    quien.write_all(cabecera.as_bytes())?;

    let mut lector = fs::File::open(&ruta)?;
    lector.seek(SeekFrom::Start(desde))?;
    let mut trozo = vec![0u8; 64 * 1024];
    let mut quedan = cuanto;
    while quedan > 0 {
        let piden = std::cmp::min(trozo.len() as u64, quedan) as usize;
        let leidos = lector.read(&mut trozo[..piden])?;
        if leidos == 0 {
            break;
        }
        // El reproductor corta la conexión en cuanto salta a otro punto del
        // vídeo: eso no es un error, es lo normal
        if quien.write_all(&trozo[..leidos]).is_err() {
            return Ok(());
        }
        quedan -= leidos as u64;
    }
    quien.flush()
}

fn seco(quien: &mut TcpStream, codigo: u16, texto: &str) -> std::io::Result<()> {
    let r = format!(
        "HTTP/1.1 {} {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        codigo, texto
    );
    quien.write_all(r.as_bytes())
}

/**
 * El puente, tal y como lo espera la web.
 *
 * Se inyecta en la página igual que el atajo de recargar: es JavaScript a
 * secas que habla con el programa por `invoke`. Como el contrato es síncrono
 * —lo es porque el puente de Android no puede ser de otra manera—, aquí se
 * guarda la última respuesta y `lista()` devuelve esa; se pide la siguiente en
 * cuanto alguien pregunta, así que como mucho va un tirón por detrás. La web
 * pregunta cada segundo y medio mientras algo baja.
 */
pub const PUENTE: &str = r#"
(function () {
  function llamar(que, con) {
    try {
      return window.__TAURI_INTERNALS__.invoke(que, con || {});
    } catch (niIdea) {
      return Promise.reject(niIdea);
    }
  }
  var ultima = '[]';
  function refrescar() {
    llamar('tp_descargas').then(function (t) { ultima = t || '[]'; }).catch(function () {});
  }
  refrescar();
  window.TPDescargas = {
    bajar: function (encargo) { llamar('tp_bajar', { encargo: encargo }).then(refrescar, refrescar); },
    quitar: function (id) { llamar('tp_quitar', { id: id }).then(refrescar, refrescar); },
    lista: function () { refrescar(); return ultima; }
  };
})();
"#;
