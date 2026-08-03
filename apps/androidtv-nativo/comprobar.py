#!/usr/bin/env python3
"""
Lo que se puede comprobar sin un Android SDK delante.

Existe porque aquí no hay compilador: el único que compila esto es el de
GitHub, y entre empujar y saber si va bien pasan cinco minutos. Tres veces
seguidas se publicó «ya está» sobre compilaciones que habían fallado, y la
tercera fue por una etiqueta de cierre que faltaba en un XML.

Esto no sustituye a compilar. Coge las tres clases de error que aquí no
avisan y allí tumban la compilación entera:

  1. Un XML mal formado.
  2. Un @drawable, @color, @layout o @raw que no existe.
  3. Un R.id.loQueSea que no está en ningún layout, o una Activity del
     manifiesto sin su clase.
  4. Un identificador que está en la pantalla de tele y falta en la de
     teléfono, o al revés. Eso compila igual y revienta solo en uno de los
     dos aparatos, que es la peor clase de fallo: el que no se ve.

    python3 apps/androidtv-nativo/comprobar.py
"""
import glob
import os
import re
import sys
import xml.dom.minidom

AQUI = os.path.dirname(os.path.abspath(__file__))
MAIN = os.path.join(AQUI, "app", "src", "main")
RES = os.path.join(MAIN, "res")
JAVA = os.path.join(MAIN, "java", "app", "totalplayer", "tvnativo")
MANIFIESTO = os.path.join(MAIN, "AndroidManifest.xml")

fallos = []


def los_dos_juegos_casan():
    """Tele y teléfono tienen que definir los mismos identificadores."""
    tele = os.path.join(RES, "layout-sw540dp")
    movil = os.path.join(RES, "layout")
    if not os.path.isdir(tele):
        return
    for nombre in sorted(os.listdir(tele)):
        gemelo = os.path.join(movil, nombre)
        if not os.path.isfile(gemelo):
            fallos.append("layout-sw540dp/%s no tiene su versión de teléfono" % nombre)
            continue
        ids_tele = set(re.findall(r"@\+id/([A-Za-z_0-9]+)",
                                  open(os.path.join(tele, nombre), encoding="utf-8").read()))
        ids_movil = set(re.findall(r"@\+id/([A-Za-z_0-9]+)",
                                   open(gemelo, encoding="utf-8").read()))
        for i in sorted(ids_tele - ids_movil):
            fallos.append("%s: la tele tiene «%s» y el teléfono no" % (nombre, i))
        for i in sorted(ids_movil - ids_tele):
            fallos.append("%s: el teléfono tiene «%s» y la tele no" % (nombre, i))


def xml_bien_formado():
    for f in sorted(glob.glob(os.path.join(RES, "**", "*.xml"), recursive=True)) + [MANIFIESTO]:
        try:
            xml.dom.minidom.parse(f)
        except Exception as e:
            fallos.append("XML roto · %s\n    %s" % (os.path.relpath(f, AQUI), e))


def recursos_que_existen():
    hay = set()
    for carpeta in ("drawable", "layout", "layout-sw540dp", "raw", "mipmap-xhdpi"):
        ruta = os.path.join(RES, carpeta)
        if not os.path.isdir(ruta):
            continue
        clase = "mipmap" if carpeta.startswith("mipmap") else carpeta.split("-")[0]
        for f in os.listdir(ruta):
            hay.add("@%s/%s" % (clase, f.rsplit(".", 1)[0]))
    for linea in open(os.path.join(RES, "values", "colors.xml"), encoding="utf-8"):
        m = re.search(r'name="([a-z_0-9]+)"', linea)
        if m:
            hay.add("@color/" + m.group(1))

    ficheros = glob.glob(os.path.join(RES, "layout*", "*.xml")) \
        + glob.glob(os.path.join(RES, "drawable", "*.xml")) + [MANIFIESTO]
    for f in ficheros:
        texto = open(f, encoding="utf-8").read()
        for ref in re.findall(r'"(@(?:drawable|layout|color|raw|mipmap)/[a-z_0-9]+)"', texto):
            if ref not in hay:
                fallos.append("No existe %s · %s" % (ref, os.path.relpath(f, AQUI)))


def ids_que_existen():
    ids = set()
    for f in glob.glob(os.path.join(RES, "layout*", "*.xml")):
        ids |= set(re.findall(r"@\+id/([A-Za-z_0-9]+)", open(f, encoding="utf-8").read()))

    hay = {"drawable": set(), "layout": set(), "raw": set()}
    for carpeta in hay:
        for ruta in glob.glob(os.path.join(RES, carpeta + "*")):
            if os.path.isdir(ruta):
                hay[carpeta] |= {f.rsplit(".", 1)[0] for f in os.listdir(ruta)}

    for f in glob.glob(os.path.join(JAVA, "*.java")):
        texto = open(f, encoding="utf-8").read()
        corto = os.path.basename(f)
        for i in re.findall(r"R\.id\.([A-Za-z_0-9]+)", texto):
            if i not in ids:
                fallos.append("R.id.%s no está en ningún layout · %s" % (i, corto))
        for clase in hay:
            for i in re.findall(r"R\.%s\.([A-Za-z_0-9]+)" % clase, texto):
                if i not in hay[clase]:
                    fallos.append("R.%s.%s no existe · %s" % (clase, i, corto))


def clases_del_manifiesto():
    clases = {os.path.basename(f)[:-5] for f in glob.glob(os.path.join(JAVA, "*.java"))}
    nombradas = set(re.findall(r'android:name="\.([A-Za-z_0-9]+)"',
                               open(MANIFIESTO, encoding="utf-8").read()))
    for c in sorted(nombradas - clases):
        fallos.append("El manifiesto nombra .%s y esa clase no existe" % c)


xml_bien_formado()
los_dos_juegos_casan()
recursos_que_existen()
ids_que_existen()
clases_del_manifiesto()

if fallos:
    print("\n".join("❌ " + f for f in fallos))
    print("\n%d problema(s). Esto no compilaría." % len(fallos))
    sys.exit(1)

print("✅ XML bien formado, recursos e identificadores en su sitio,")
print("   y las pantallas de tele y de teléfono definen lo mismo.")
