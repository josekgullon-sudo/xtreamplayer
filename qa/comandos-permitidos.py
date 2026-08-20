#!/usr/bin/env python3
"""
Que ningún comando del programa de Windows se quede fuera del ACL.

El programa de escritorio abre la web del proveedor dentro de una ventana, y
esa página es «remota» para Tauri: no vive dentro del ejecutable. Tauri 2 no
deja que una página remota llame a los comandos del programa salvo que estén
nombrados uno a uno, y hace bien —una web cualquiera dentro de una ventana no
debería poder tocar el disco de nadie—.

Y ahí está la trampa, que ya costó cuatro intentos: un comando registrado en
`generate_handler!` pero no nombrado en los permisos **compila igual de
verde**. El fallo solo aparece al usarlo, en el aparato de alguien, y con un
mensaje que no llega a ninguna pantalla: «Command tp_bajar not allowed by
ACL». Desde fuera, el botón no hace nada y nadie sabe por qué.

Esto compara las dos listas y avisa antes.
"""
import re
import sys
from pathlib import Path

# La consola de Windows habla cp1252 y no sabe escribir «✅»: sin esto, la
# comprobación pasaba y el guardián se caía al IMPRIMIR que había pasado,
# tirando de paso el resto del trabajo. Este script corre en los dos sitios,
# así que la salida se fuerza a UTF-8 en los dos.
for _salida in (sys.stdout, sys.stderr):
    try:
        _salida.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:  # pragma: sin cobertura — Python muy viejo
        pass

RAIZ = Path(__file__).resolve().parent.parent
MAIN = RAIZ / "apps/escritorio/src-tauri/src/main.rs"
PERMISOS = RAIZ / "apps/escritorio/src-tauri/permissions"


def registrados() -> set[str]:
    """Los que el programa expone, de `generate_handler![...]`."""
    texto = MAIN.read_text(encoding="utf-8")
    m = re.search(r"generate_handler!\s*\[(.*?)\]", texto, re.S)
    if not m:
        return set()
    return {
        # `descargas::tp_bajar` se declara como `tp_bajar`
        pieza.strip().split("::")[-1]
        for pieza in m.group(1).split(",")
        if pieza.strip()
    }


def permitidos() -> set[str]:
    """Los que el ACL deja llamar, de `permissions/*.toml`."""
    fuera = set()
    if not PERMISOS.is_dir():
        return fuera
    for f in PERMISOS.glob("*.toml"):
        texto = f.read_text(encoding="utf-8")
        for bloque in re.findall(r"commands\.allow\s*=\s*\[(.*?)\]", texto, re.S):
            fuera |= {x.strip().strip('"').strip("'") for x in bloque.split(",") if x.strip()}
    return fuera


def main() -> int:
    if not MAIN.exists():
        print("⚠  No está el programa de escritorio, no hay nada que comprobar")
        return 0
    hay = registrados()
    deja = permitidos()
    if not hay:
        print("❌ No se ha podido leer la lista de comandos de main.rs")
        return 1

    sueltos = sorted(hay - deja)
    sobran = sorted(deja - hay)
    if sueltos:
        print("❌ Comandos que el programa expone y el ACL no deja llamar:")
        for c in sueltos:
            print(f"     · {c}")
        print()
        print("La página del proveedor los llamará y Tauri contestará «not allowed")
        print("by ACL», que no llega a ninguna pantalla: el botón no hará nada y")
        print("no habrá manera de saber por qué. Añádelos a")
        print("apps/escritorio/src-tauri/permissions/puente.toml")
        return 1
    if sobran:
        print("❌ Permisos para comandos que ya no existen:")
        for c in sobran:
            print(f"     · {c}")
        print()
        print("No rompe nada, pero deja el permiso abierto a algo que no está y")
        print("miente sobre lo que el programa puede hacer.")
        return 1

    print(f"✅ Los {len(hay)} comandos del programa están todos en el ACL")
    return 0


if __name__ == "__main__":
    sys.exit(main())
