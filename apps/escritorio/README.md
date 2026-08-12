# TOTALplayer para Windows

La quinta caja alrededor de la misma cosa: `/tv`, la aplicación de televisión
que ya funciona en el navegador. Vale lo mismo que se dice de las de
televisor —**lo que se arregla en la web queda arreglado aquí esa misma
noche**, sin repartir una versión nueva—, y por la misma razón: dentro no hay
lógica de reproductor, hay una ventana.

## Qué hace, exactamente

- Abre `https://totalplayer.app/tv?app=1` **a pantalla completa**, sin barra
  de direcciones ni pestañas. Es la interfaz de televisión, no la web con
  ratón: la que está pensada para verse de lejos y manejarse con las flechas,
  que es como se usa un portátil enchufado al televisor del salón.
- **Pregunta antes de abrir.** Si no hay respuesta, en vez de una ventana en
  blanco sale una pantalla que lo explica y un botón de reintentar. Un
  ordenador tarda en levantar la wifi después de encenderse, y una ventana en
  blanco no distingue eso de una avería.
- Debajo de ese botón, y en pequeño, **se puede escribir otra dirección**. Un
  cliente no tiene que tocarlo nunca; está para el proveedor que tiene su
  propio dominio y para probar contra otra instalación sin recompilar. Se
  guarda en `%APPDATA%\app.totalplayer.escritorio\direccion.txt`.
- Para cerrar: **Alt + F4**, como cualquier aplicación de Windows a pantalla
  completa.

## Por qué Tauri y no Electron

Electron mete un Chrome entero dentro: el instalador se va a 80 MB y cada
ventana abierta son 200 MB de memoria. Tauri usa el WebView2 que Windows ya
trae instalado desde Windows 10, así que el instalador ronda los 5 MB y
arranca en un segundo. Para una ventana alrededor de una web, meter un
navegador propio no compra nada.

## Compilarlo

Hace falta [Rust](https://rustup.rs) y, en Windows, las herramientas de
compilación de Visual Studio (el instalador de Rust las ofrece).

```bash
pip install pillow                              # solo para el icono
python apps/escritorio/preparar-icono.py        # se regenera, no se guarda
cargo install tauri-cli --version "^2.0"        # una vez
cd apps/escritorio && cargo tauri build
```

Sale en `src-tauri/target/release/bundle/`: el instalador en `nsis/` y el
`.msi` en `msi/`.

Para trabajar en la pantalla de emergencia sin esperar a cada compilación,
`cargo tauri dev` y desenchufa la red.

## Publicarlo

No hace falta hacer nada a mano: el trabajo
[`publicar-exe.yml`](../../.github/workflows/publicar-exe.yml) compila en un
Windows de GitHub en cada cambio de esta carpeta y deja el instalador en una
descarga de dirección fija.

## Lo que falta antes de venderlo

- **Firmarlo.** Sin certificado, Windows enseña «Windows protegió tu PC» la
  primera vez y hay que darle a *Más información → Ejecutar de todas formas*.
  Un certificado de firma de código son 200–400 €/año y quita el aviso.
- **La tienda de Microsoft**, si se quiere. Acepta paquetes `.msix`; Tauri
  sabe generarlo, pero pide cuenta de desarrollador y revisión.

## La dirección

Está escrita en `src-tauri/src/main.rs` y se cambia junto con las de las
tres aplicaciones de televisor:

```bash
bash apps/poner-dominio.sh https://tudominio.com
```
