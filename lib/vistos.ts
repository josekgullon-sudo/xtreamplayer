import { getDb } from "./db";
import type { ProfileOwner } from "./profiles";

/**
 * Por dónde iba cada uno.
 *
 * Es lo que decide si alguien vuelve mañana: abrir la aplicación y que te
 * diga «Serie X · T2 E5 · te quedan 23 min» con el botón grande, en vez de
 * tener que acordarte de por dónde ibas y buscarlo.
 *
 * Se guarda en la cuenta y no en el aparato. La tele del salón y el móvil
 * son el mismo cliente, y una serie se empieza en uno y se sigue en el
 * otro; guardándolo en cada aparato salen dos historiales que no se hablan,
 * que es peor que no tener ninguno porque parece que se ha perdido.
 */

/** Qué se guarda de cada cosa vista. Lo escribe el reproductor. */
export interface Visto {
  /** La llave del catálogo del proveedor: «vod:1234», «serie:88:t1:e3». */
  llave: string;
  titulo: string;
  cartel?: string;
  /** Para volver a abrirlo sin buscarlo: qué pedirle al panel. */
  clase?: string;
  idStream?: string;
  extension?: string;
  serieId?: string;
  temporada?: number;
  episodio?: number;
  segundo: number;
  duracion: number;
}

export interface VistoGuardado extends Visto {
  cartel: string;
  clase: string;
  idStream: string;
  extension: string;
  serieId: string;
  temporada: number;
  episodio: number;
  acabado: boolean;
  vistoEn: number;
}

/**
 * Cuántos se guardan por perfil.
 *
 * Cincuenta es mucho más de lo que nadie tiene a medias, y pone un techo a
 * lo que puede crecer la tabla con un cliente que zapea mucho. Al pasarse,
 * se tiran los más viejos: lo que se dejó a medias hace tres meses ya no se
 * va a retomar.
 */
const CUANTOS = 50;

/**
 * Cuándo cuenta como «a medias».
 *
 * Antes del 3% no se guarda: poner algo diez segundos para ver qué es no
 * es haberlo empezado, y llenar «seguir viendo» de cosas que solo se
 * rozaron lo convierte en un cajón. Pasado el 92% se da por terminado —lo
 * que queda son los créditos— y sale de la fila, aunque el dato se conserva
 * para saber que ya se vio.
 */
export const EMPEZADO = 0.03;
export const TERMINADO = 0.92;

function deQuien(owner: ProfileOwner) {
  return {
    customerId: owner.kind === "customer" ? owner.customer.id : 0,
    userId: owner.kind === "user" ? owner.user.id : 0,
  };
}

/** Apuntar por dónde va. Devuelve `false` si es demasiado pronto para contarlo. */
export function apuntar(owner: ProfileOwner, profileId: number, v: Visto): boolean {
  if (!v.llave || v.duracion <= 0 || v.segundo < 0) return false;
  const parte = v.segundo / v.duracion;
  if (parte < EMPEZADO) return false;

  const { customerId, userId } = deQuien(owner);
  const db = getDb();
  db.prepare(
    `INSERT INTO vistos
       (customer_id, user_id, profile_id, llave, titulo, cartel, clase, id_stream, extension,
        serie_id, temporada, episodio, segundo, duracion, acabado, visto_en)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(customer_id, user_id, profile_id, llave) DO UPDATE SET
       titulo = excluded.titulo,
       cartel = excluded.cartel,
       clase = excluded.clase,
       id_stream = excluded.id_stream,
       extension = excluded.extension,
       serie_id = excluded.serie_id,
       temporada = excluded.temporada,
       episodio = excluded.episodio,
       segundo = excluded.segundo,
       duracion = excluded.duracion,
       acabado = excluded.acabado,
       visto_en = excluded.visto_en`
  ).run(
    customerId,
    userId,
    profileId,
    v.llave,
    v.titulo || "",
    v.cartel || "",
    v.clase || "",
    v.idStream || "",
    v.extension || "",
    v.serieId || "",
    v.temporada || 0,
    v.episodio || 0,
    Math.round(v.segundo),
    Math.round(v.duracion),
    parte >= TERMINADO ? 1 : 0,
    Date.now()
  );

  /* Y se tiran los más viejos del perfil. Se cuenta primero para no lanzar
     un DELETE con subconsulta en cada guardado, que es cada quince segundos */
  const cuantos = db
    .prepare(
      "SELECT COUNT(*) AS n FROM vistos WHERE customer_id = ? AND user_id = ? AND profile_id = ?"
    )
    .get(customerId, userId, profileId) as { n: number };
  if (cuantos.n > CUANTOS) {
    db.prepare(
      `DELETE FROM vistos
        WHERE customer_id = ? AND user_id = ? AND profile_id = ?
          AND llave NOT IN (
            SELECT llave FROM vistos
             WHERE customer_id = ? AND user_id = ? AND profile_id = ?
             ORDER BY visto_en DESC LIMIT ?
          )`
    ).run(customerId, userId, profileId, customerId, userId, profileId, CUANTOS);
  }
  return true;
}

function aVisto(r: Record<string, unknown>): VistoGuardado {
  return {
    llave: String(r.llave),
    titulo: String(r.titulo),
    cartel: String(r.cartel),
    clase: String(r.clase),
    idStream: String(r.id_stream),
    extension: String(r.extension),
    serieId: String(r.serie_id),
    temporada: Number(r.temporada),
    episodio: Number(r.episodio),
    segundo: Number(r.segundo),
    duracion: Number(r.duracion),
    acabado: Number(r.acabado) === 1,
    vistoEn: Number(r.visto_en),
  };
}

/**
 * Lo que este perfil tiene a medias, lo último primero.
 *
 * Sin lo terminado: «seguir viendo» es para lo que se dejó a medias, y una
 * fila llena de películas ya vistas no invita a nada.
 */
export function aMedias(owner: ProfileOwner, profileId: number, tope = 20): VistoGuardado[] {
  const { customerId, userId } = deQuien(owner);
  return (
    getDb()
      .prepare(
        `SELECT * FROM vistos
          WHERE customer_id = ? AND user_id = ? AND profile_id = ? AND acabado = 0
          ORDER BY visto_en DESC LIMIT ?`
      )
      .all(customerId, userId, profileId, tope) as Record<string, unknown>[]
  ).map(aVisto);
}

/**
 * Todo lo apuntado de este perfil, terminado incluido.
 *
 * Lo pide el reproductor al arrancar, para saber por dónde retomar cada
 * cosa y para pintar la barra de avance sobre las carátulas de todas las
 * listas —también las de las que ya se vieron, que ahí la barra llena es la
 * información—. En una sola petición: preguntar por título sería una
 * petición por carátula.
 */
export function todos(owner: ProfileOwner, profileId: number): VistoGuardado[] {
  const { customerId, userId } = deQuien(owner);
  return (
    getDb()
      .prepare(
        `SELECT * FROM vistos
          WHERE customer_id = ? AND user_id = ? AND profile_id = ?
          ORDER BY visto_en DESC`
      )
      .all(customerId, userId, profileId) as Record<string, unknown>[]
  ).map(aVisto);
}

/** Quitar algo de «seguir viendo»: se ha visto ya, o no interesa. */
export function olvidar(owner: ProfileOwner, profileId: number, llave: string) {
  const { customerId, userId } = deQuien(owner);
  getDb()
    .prepare(
      "DELETE FROM vistos WHERE customer_id = ? AND user_id = ? AND profile_id = ? AND llave = ?"
    )
    .run(customerId, userId, profileId, llave);
}
