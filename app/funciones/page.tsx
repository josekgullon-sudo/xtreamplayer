import Link from "next/link";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Icon, { IconName } from "@/components/Icon";
import Aparece from "@/components/Aparece";

export const metadata: Metadata = {
  title: "Funciones — todo lo que hace TOTALplayer",
  description:
    "Directo con guía y catch-up, cine y series con fichas de TMDB, perfiles, descargas para ver sin conexión, favoritos, buscador y apps para televisor, móvil y ordenador.",
  alternates: { canonical: "/funciones" },
};

/**
 * Todo lo que hace, en una página.
 *
 * Estaba repartido: algo en Precios, algo en Para proveedores, algo en la
 * portada y bastante en ningún sitio. Quien compara dos reproductores lo hace
 * por esta lista, y si no existe da igual lo bueno que sea lo de dentro.
 *
 * Solo se lista lo que está hecho y se puede usar hoy. Un catálogo de
 * funciones es una promesa, y una promesa que no se cumple al abrir la
 * aplicación cuesta más que la función que faltaba: por eso lo que está a
 * medias va en su propio apartado y dicho con esas palabras.
 */

interface Funcion {
  icono: IconName;
  titulo: string;
  pie: string;
}

const VER: Funcion[] = [
  { icono: "tv", titulo: "TV en directo", pie: "Los canales de tu lista, con su número y su logotipo, ordenados por las carpetas de tu proveedor." },
  { icono: "list", titulo: "Guía de programación", pie: "Qué dan ahora, cuánto le queda y qué viene después, canal por canal. Sale de la guía que manda tu proveedor." },
  { icono: "back", titulo: "Volver a lo ya emitido", pie: "En los canales que lo guardan, se puede empezar un programa que ya ha empezado o ver el de ayer." },
  { icono: "film", titulo: "Cine", pie: "Las películas de tu lista en carátulas, con su ficha: sinopsis, año, duración, reparto y género." },
  { icono: "series", titulo: "Series", pie: "Con sus temporadas y episodios, cada uno con su fotograma, su duración y de qué va." },
  { icono: "search", titulo: "Buscador", pie: "Escribe una vez y busca a la vez en canales, películas y series. Sin elegir antes dónde buscar." },
];

const TUYO: Funcion[] = [
  { icono: "users", titulo: "Perfiles", pie: "Uno para cada miembro de la casa, con su lista y lo que dejó a medias. Se pregunta al encender la tele." },
  { icono: "star", titulo: "Favoritos y Mi lista", pie: "Los canales que pones siempre, arriba; y lo que quieres ver otro día, guardado para no volver a buscarlo." },
  { icono: "play", titulo: "Seguir viendo", pie: "Vuelve a lo último que estabas viendo con un solo botón, esté donde esté." },
  { icono: "bajar", titulo: "Descargas sin conexión", pie: "Guarda una película o un episodio en el aparato y míralo sin internet. En el programa de Windows y en la aplicación de Fire TV y Android." },
  { icono: "device", titulo: "Varios aparatos a la vez", pie: "La misma cuenta en la tele, el móvil y el ordenador. Tu proveedor decide cuántos." },
  { icono: "shield", titulo: "Perfil infantil", pie: "Un perfil marcado como infantil, para que lo de los mayores no aparezca donde no toca." },
];

const DONDE: Funcion[] = [
  { icono: "tv", titulo: "Android TV y Fire TV", pie: "Aplicación propia con su icono en la tele, hecha para el mando y con el vídeo por el decodificador del aparato." },
  { icono: "device", titulo: "Móvil y tableta", pie: "Android, iPhone y iPad. Se instala desde el navegador y se abre como una aplicación más." },
  { icono: "building", titulo: "Windows", pie: "Un programa que se instala, con su ventana y su acceso directo." },
  { icono: "globe", titulo: "Samsung, LG y otras teles", pie: "Desde el navegador del televisor, sin instalar nada." },
  { icono: "list", titulo: "Listas M3U y Xtream", pie: "Pega la dirección de tu lista o el usuario y la contraseña que te dio tu proveedor." },
  { icono: "lock", titulo: "Tu lista no se enseña", pie: "La dirección de tu proveedor no sale del servidor: ni en la pestaña de red ni en el código de la página." },
];

const PROVEEDOR: Funcion[] = [
  { icono: "sparkle", titulo: "Aplicaciones con tu marca", pie: "Tu nombre, tu color, tu logotipo y tu fondo. Tus clientes no ven el nuestro por ningún sitio." },
  { icono: "users", titulo: "Gestión de clientes", pie: "Altas, bajas, caducidades y cuántos aparatos puede usar cada uno, desde un panel." },
  { icono: "handshake", titulo: "Revendedores", pie: "Con sus permisos y sus propios clientes, sin que se pisen entre ellos." },
  { icono: "upload", titulo: "Tráete tus clientes", pie: "Importación desde XUI en bloque, sin darlos de alta uno a uno." },
  { icono: "card", titulo: "Facturas y API", pie: "Facturación con tus datos fiscales, y una API para engancharlo a lo que ya tengas." },
  { icono: "chart", titulo: "Menos incidencias", pie: "Ves qué aparatos tiene cada cliente y puedes liberarlos sin pedirle nada." },
];

function Rejilla({ que }: { que: Funcion[] }) {
  return (
    <div className="funcs-grid">
      {que.map((f, i) => (
        <Aparece key={f.titulo} className="func-card" retraso={i * 40}>
          <span className="func-icono">
            <Icon name={f.icono} size={22} />
          </span>
          <h3>{f.titulo}</h3>
          <p>{f.pie}</p>
        </Aparece>
      ))}
    </div>
  );
}

export default function FuncionesPage() {
  return (
    <>
      <SiteHeader />
      <main className="section pagina">
        <div className="container">
          <h1 className="section-title">Todo lo que hace</h1>
          {/*
            Todo lo de esta página está hecho y se puede usar. Hubo un
            apartado de «en camino» —VPN, multiview, ventana flotante,
            AirPlay— y se ha quitado: no hay nadie trabajando en ninguna de
            ellas ni fecha para hacerlo, así que no era una hoja de ruta sino
            una lista de deseos, y puesta en la página de funciones se lee
            como una promesa. Cuando algo se empiece de verdad, vuelve.
          */}
          <p className="section-sub">
            Todo lo que hay aquí se puede usar hoy. No prometemos nada que no esté
            hecho.
          </p>

          <h2 className="funcs-t">Ver</h2>
          <Rejilla que={VER} />

          <h2 className="funcs-t">Tuyo</h2>
          <Rejilla que={TUYO} />

          <h2 className="funcs-t">Dónde</h2>
          <Rejilla que={DONDE} />

          <h2 className="funcs-t">Si eres proveedor</h2>
          <Rejilla que={PROVEEDOR} />

          <p className="funcs-cta">
            <Link className="btn btn-primary" href="/player">Probarlo ahora</Link>
            <Link className="btn btn-ghost" href="/precios">Ver precios</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
