import fs from "fs";
import path from "path";
import { getDb } from "./db";

/**
 * Copias de seguridad de la base de datos.
 *
 * Todo —proveedores, clientes, contraseñas cifradas, facturas emitidas— vive
 * en un solo archivo SQLite dentro del volumen. Sin copia, un disco que falla
 * o un borrado accidental se lo lleva entero y no hay vuelta atrás: los
 * clientes de cada proveedor habría que darlos de alta uno a uno, y las
 * facturas ya emitidas simplemente no existirían.
 *
 * Se usa el respaldo en caliente de SQLite y no una copia del fichero: con el
 * diario en modo WAL, copiar el archivo mientras alguien escribe da una copia
 * a medias que parece buena hasta el día que hace falta.
 */

const CADA_DIA = 24 * 60 * 60 * 1000;
/** Dos semanas: suficiente para notar un borrado del que nadie avisó el día 1 */
const CUANTAS_GUARDAR = 14;

function dirDatos(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

export function dirCopias(): string {
  const dir = path.join(dirDatos(), "copias");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface Copia {
  nombre: string;
  bytes: number;
  cuando: number;
}

/** Solo lo que hemos escrito nosotros: nada de rutas que vengan de fuera */
const ES_COPIA = /^copia-\d{8}-\d{4}(-\d+)?\.db$/;

export function listarCopias(): Copia[] {
  const dir = dirCopias();
  return fs
    .readdirSync(dir)
    .filter((f) => ES_COPIA.test(f))
    .map((nombre) => {
      const st = fs.statSync(path.join(dir, nombre));
      return { nombre, bytes: st.size, cuando: st.mtimeMs };
    })
    .sort((a, b) => b.cuando - a.cuando);
}

/** La ruta de una copia, o null si el nombre no es uno de los nuestros */
export function rutaCopia(nombre: string): string | null {
  if (!ES_COPIA.test(nombre)) return null;
  const ruta = path.join(dirCopias(), nombre);
  // Cinturón y tirantes: que el resultado siga dentro de su carpeta
  if (!ruta.startsWith(dirCopias() + path.sep)) return null;
  return fs.existsSync(ruta) ? ruta : null;
}

function nombreDeAhora(ahora = new Date()): string {
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `copia-${ahora.getFullYear()}${p(ahora.getMonth() + 1)}${p(ahora.getDate())}-${p(ahora.getHours())}${p(ahora.getMinutes())}.db`;
}

/**
 * Hace una copia ahora. Devuelve la que ha creado.
 *
 * `db.backup()` es el respaldo en caliente de SQLite: coge una foto
 * consistente aunque haya alguien escribiendo, que es lo que no da un `cp`.
 */
export async function hacerCopia(): Promise<Copia> {
  const dir = dirCopias();
  let nombre = nombreDeAhora();
  // Dos copias en el mismo minuto —a mano, después de una automática— no se pisan
  let n = 1;
  while (fs.existsSync(path.join(dir, nombre))) {
    nombre = nombreDeAhora().replace(/\.db$/, `-${n++}.db`);
  }

  const destino = path.join(dir, nombre);
  await getDb().backup(destino);
  podar();

  const st = fs.statSync(destino);
  return { nombre, bytes: st.size, cuando: st.mtimeMs };
}

/** Las viejas se van: un volumen lleno tira la aplicación entera */
export function podar(cuantas = CUANTAS_GUARDAR): number {
  const sobrantes = listarCopias().slice(cuantas);
  for (const c of sobrantes) {
    try {
      fs.unlinkSync(path.join(dirCopias(), c.nombre));
    } catch {
      /* si no se puede borrar, no es motivo para romper nada */
    }
  }
  return sobrantes.length;
}

/**
 * Arranca las copias automáticas.
 *
 * Una al arrancar —así hay copia desde el primer minuto— y otra cada día.
 * Sin esto habría que acordarse de pulsar un botón, y de eso nadie se acuerda
 * hasta el día que hace falta la copia que no existe.
 */
let programado = false;

export function programarCopias(): void {
  if (programado || process.env.BACKUPS !== "1") return;
  programado = true;

  const hacer = () => {
    hacerCopia()
      .then((c) => console.log(`[copias] ${c.nombre} · ${(c.bytes / 1024).toFixed(0)} kB`))
      .catch((e) => console.error("[copias]", String(e).slice(0, 200)));
  };

  // Un poco después de arrancar: primero que la aplicación empiece a atender
  setTimeout(hacer, 30_000).unref?.();
  setInterval(hacer, CADA_DIA).unref?.();
}
