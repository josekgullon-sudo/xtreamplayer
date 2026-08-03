/*
 * De dónde sale Playwright y qué Chromium se abre.
 *
 * Cada suite traía escritas a mano dos rutas de esta máquina:
 * «/opt/node22/lib/node_modules/playwright» y «/opt/pw-browsers/chromium».
 * Funcionan aquí y en ningún otro sitio, así que las pruebas no se podían
 * lanzar ni en el portátil de nadie ni en un CI — que es justo donde más
 * falta hacen, porque es donde se ejecutan solas.
 *
 * Aquí se busca por orden: lo que esté instalado en el proyecto, y si no,
 * lo del contenedor. Con el navegador igual: si hay uno puesto a mano se
 * usa, y si no, el que Playwright se haya bajado él solo.
 */
const fs = require("node:fs");

function cargarPlaywright() {
  const sitios = ["playwright", "@playwright/test", "/opt/node22/lib/node_modules/playwright"];
  for (const sitio of sitios) {
    try {
      return require(sitio);
    } catch {
      /* el siguiente */
    }
  }
  throw new Error(
    "No encuentro Playwright. Instálalo con «npm i -D playwright» o pon la ruta en QA_PLAYWRIGHT."
  );
}

const pw = process.env.QA_PLAYWRIGHT ? require(process.env.QA_PLAYWRIGHT) : cargarPlaywright();

/* Un objeto que se esparce dentro de las opciones de launch: lleva la ruta
   del navegador cuando hay una, y nada cuando Playwright ya sabe cuál abrir */
const RUTA = process.env.QA_CHROMIUM || "/opt/pw-browsers/chromium";
const ejecutable = fs.existsSync(RUTA) ? { executablePath: RUTA } : {};

module.exports = { chromium: pw.chromium, devices: pw.devices, ejecutable };
