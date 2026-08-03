/**
 * Lo que ha fallado, dicho como se lo dirías a alguien.
 *
 * Por todo el reproductor se enseñaba el mensaje de la excepción tal cual, y
 * cuando el que falla es el navegador —sin cobertura, wifi caído, el móvil en
 * el ascensor, la tele que pierde la red a media película— ese mensaje es
 * «Failed to fetch». El cliente se queda mirando dos palabras en inglés que
 * no dicen ni qué ha pasado ni qué hacer, y encima parece que la lista que
 * acaba de poner está mal.
 *
 * Los mensajes que escribimos nosotros —«Usuario o contraseña incorrectos
 * según el servidor IPTV»— pasan tal cual: esos ya están en cristiano y
 * dicen más que cualquier cosa genérica.
 */
export function enCristiano(err: unknown, porDefecto = "Algo salió mal"): string {
  const crudo = err instanceof Error ? err.message : String(err ?? "");

  /* Cada navegador lo dice a su manera: Chrome «Failed to fetch», Firefox
     «NetworkError when attempting to fetch resource», Safari «Load failed»,
     y los WebView de las teles añaden los suyos */
  if (/failed to fetch|networkerror|load failed|network request failed|net::err/i.test(crudo)) {
    return "No hemos podido conectar. Comprueba tu conexión y vuelve a intentarlo.";
  }
  if (/abort|timeout|timed out/i.test(crudo)) {
    return "El servidor ha tardado demasiado en contestar. Vuelve a intentarlo.";
  }
  return crudo || porDefecto;
}
