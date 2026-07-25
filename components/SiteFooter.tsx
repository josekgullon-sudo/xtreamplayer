import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-col" style={{ maxWidth: 300 }}>
            <div className="logo" style={{ marginBottom: 12 }}>
              <span className="logo-mark">▶</span> TOTALplayer
            </div>
            <p style={{ fontSize: 13.5, color: "var(--text-faint)" }}>
              El reproductor IPTV web más rápido para Xtream Codes y listas M3U. Sin instalaciones, sin
              complicaciones.
            </p>
          </div>
          <div className="footer-col">
            <h4>Producto</h4>
            <Link href="/player">Reproductor web</Link>
            <Link href="/precios">Planes y precios</Link>
            <Link href="/faq">Preguntas frecuentes</Link>
          </div>
          <div className="footer-col">
            <h4>Cuenta</h4>
            <Link href="/registro">Crear cuenta gratis</Link>
            <Link href="/login">Iniciar sesión</Link>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <Link href="/legal/terminos">Términos de uso</Link>
            <Link href="/legal/privacidad">Privacidad</Link>
          </div>
        </div>
        <p className="footer-note">
          TOTALplayer es únicamente un reproductor multimedia. No proporcionamos, alojamos ni distribuimos ningún
          contenido, canal ni lista de reproducción. Los usuarios son responsables del contenido al que acceden con
          sus propias listas y de contar con los derechos necesarios. © {new Date().getFullYear()} TOTALplayer.
        </p>
      </div>
    </footer>
  );
}
