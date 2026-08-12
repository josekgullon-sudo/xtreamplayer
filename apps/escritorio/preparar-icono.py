#!/usr/bin/env python3
"""El icono de la aplicación de escritorio, dibujado aquí.

Mismo criterio que en el resto de las aplicaciones: los gráficos no se
guardan en el repositorio —se regeneran en un segundo y cada proveedor los
cambia por los suyos—, así que esto lo llama tanto el que compila en su
máquina como el trabajo de GitHub antes de empaquetar.

Se dibuja con polígonos y no con una letra a propósito: una tipografía que
esté en Linux no está en el runner de Windows, y un icono que cambia según
dónde se compile es la clase de detalle que nadie mira hasta que ya está
publicado.

    python3 apps/escritorio/preparar-icono.py "#E5192B" "#101012"

Windows pide un .ico con todos los tamaños dentro: si falta el de 16, el
icono de la barra de tareas sale borroso.
"""

import os
import sys

from PIL import Image, ImageDraw

ROJO = sys.argv[1] if len(sys.argv) > 1 else "#E5192B"
FONDO = sys.argv[2] if len(sys.argv) > 2 else "#101012"

AQUI = os.path.dirname(os.path.abspath(__file__))
ICONOS = os.path.join(AQUI, "src-tauri", "icons")
LADO = 1024  # se dibuja grande una vez y se reduce: los bordes salen limpios


def dibujar(lado):
    """Un cuadrado redondeado oscuro con el triángulo de reproducir en rojo."""
    img = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    lapiz = ImageDraw.Draw(img)

    margen = lado * 6 // 100
    lapiz.rounded_rectangle(
        [margen, margen, lado - margen, lado - margen],
        radius=lado * 22 // 100,
        fill=FONDO,
    )

    # El triángulo, centrado de verdad: el centro de masas de un triángulo
    # está a un tercio de la base, así que centrar la caja lo deja torcido
    ancho = lado * 30 // 100
    alto = lado * 34 // 100
    x = (lado - ancho) // 2 + lado * 3 // 100
    y = (lado - alto) // 2
    lapiz.polygon([(x, y), (x, y + alto), (x + ancho, y + alto // 2)], fill=ROJO)

    return img


def main():
    os.makedirs(ICONOS, exist_ok=True)
    grande = dibujar(LADO)

    grande.resize((512, 512), Image.LANCZOS).save(os.path.join(ICONOS, "icon.png"))
    # Tauri los pide con estos nombres para las demás plataformas
    for lado in (32, 128):
        nombre = "32x32.png" if lado == 32 else "128x128.png"
        grande.resize((lado, lado), Image.LANCZOS).save(os.path.join(ICONOS, nombre))
    grande.resize((256, 256), Image.LANCZOS).save(
        os.path.join(ICONOS, "128x128@2x.png")
    )

    grande.resize((256, 256), Image.LANCZOS).save(
        os.path.join(ICONOS, "icon.ico"),
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("Iconos escritos en", ICONOS)


if __name__ == "__main__":
    main()
