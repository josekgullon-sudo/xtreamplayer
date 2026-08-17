#!/usr/bin/env python3
"""
Que las variantes de un layout no se queden atrás.

Android elige el layout por el tamaño de pantalla: `layout/` para lo normal
y `layout-sw540dp/` para lo grande, que es lo que usa CUALQUIER televisor.
Son dos archivos distintos con los mismos identificadores dentro.

Y ahí está la trampa: `R.id.loQueSea` existe en cuanto lo declare UNA
variante, así que cambiar solo una compila igual de verde. El fallo aparece
al ejecutar y solo en los aparatos que usan la otra: `findViewById` devuelve
null y la pantalla se cae al tocarla.

Pasó exactamente eso —la guía del directo se cambió en `layout/` y no en
`layout-sw540dp/`, y la aplicación se caía al abrir un canal en un Fire TV
mientras la compilación decía que todo bien—. Esto lo caza antes.
"""

import glob
import os
import re
import sys

RAIZ = os.path.join(os.path.dirname(__file__), "..")


def identificadores(ruta):
    with open(ruta, encoding="utf-8") as f:
        return set(re.findall(r"@\+id/(\w+)", f.read()))


def usados_por_el_codigo(app):
    usados = set()
    for f in glob.glob(os.path.join(app, "**", "*.java"), recursive=True):
        with open(f, encoding="utf-8") as fh:
            usados |= set(re.findall(r"R\.id\.(\w+)", fh.read()))
    return usados


def revisar(app):
    res = os.path.join(app, "app", "src", "main", "res")
    if not os.path.isdir(res):
        return []
    usados = usados_por_el_codigo(app)
    fallos = []
    for base in sorted(glob.glob(os.path.join(res, "layout", "*.xml"))):
        nombre = os.path.basename(base)
        for carpeta in sorted(glob.glob(os.path.join(res, "layout-*"))):
            variante = os.path.join(carpeta, nombre)
            if not os.path.exists(variante):
                # Sin variante, Android usa la base: no hay nada que cuadrar
                continue
            ids_base = identificadores(base)
            ids_var = identificadores(variante)
            # Solo importan los que el código busca: los demás son decoración
            faltan = sorted((ids_base - ids_var) & usados)
            sobran = sorted((ids_var - ids_base) & usados)
            etiqueta = os.path.basename(carpeta)
            for i in faltan:
                fallos.append(f"{nombre}: «{i}» está en layout/ y no en {etiqueta}/")
            for i in sobran:
                fallos.append(f"{nombre}: «{i}» está en {etiqueta}/ y no en layout/")
    return fallos


def main():
    apps = [
        os.path.join(RAIZ, "apps", "androidtv-nativo"),
        os.path.join(RAIZ, "apps", "androidtv"),
        os.path.join(RAIZ, "apps", "android"),
    ]
    todos = []
    for app in apps:
        if os.path.isdir(app):
            todos += [f"{os.path.basename(app)} · {f}" for f in revisar(app)]
    if todos:
        print("Identificadores que no cuadran entre variantes de layout:")
        for f in todos:
            print(f"  ❌ {f}")
        print("\nEl aparato que use la variante incompleta se caerá al abrir esa")
        print("pantalla, y la compilación no lo va a decir.")
        return 1
    print("✅ Las variantes de layout tienen los mismos identificadores")
    return 0


if __name__ == "__main__":
    sys.exit(main())
