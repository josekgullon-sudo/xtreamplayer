package app.totalplayer.tvnativo;

import android.content.Context;

import androidx.media3.common.PlaybackException;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;

/**
 * Cómo se construye el reproductor, en un solo sitio.
 *
 * Las dos razones por las que un canal se queda en negro:
 *
 * - El servidor contesta con una redirección, a veces de http a https, y
 *   ExoPlayer no las sigue entre protocolos si no se le dice. En IPTV
 *   redirigir es la norma, no la excepción.
 * - El servidor mira quién pide y cuelga a los desconocidos.
 */
public final class Reproduccion {

    private Reproduccion() {}

    public static ExoPlayer nuevo(Context c) {
        DefaultHttpDataSource.Factory red = new DefaultHttpDataSource.Factory()
                .setUserAgent(Web.QUIEN_SOY)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(20000);

        /*
         * Si el descodificador del aparato no puede, que lo intente otro.
         *
         * Sin esto, un canal que el chip no traga se queda en la primera
         * elección y devuelve imagen rota o nada. Media lista de proveedor
         * viene en H.265 y con audio AC3, y ahí cada teléfono lleva lo suyo:
         * el que falla por hardware suele salir adelante por software.
         */
        DefaultRenderersFactory motores = new DefaultRenderersFactory(c)
                .setEnableDecoderFallback(true);

        /*
         * Menos cola de la que trae de serie.
         *
         * De fábrica ExoPlayer guarda hasta cincuenta segundos por delante,
         * que está pensado para una película. Un canal en directo con medio
         * minuto de cola va medio minuto tarde, y cuando el servidor tose,
         * el reproductor se come esa cola entera antes de enterarse.
         */
        DefaultLoadControl cola = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(15000, 30000, 2000, 4000)
                .build();

        return new ExoPlayer.Builder(c, motores)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(red))
                .setLoadControl(cola)
                .build();
    }

    /**
     * Por qué no ha arrancado, en cristiano.
     *
     * Una pantalla negra y muda es indistinguible de un aparato colgado, y
     * «ERROR_CODE_IO_BAD_HTTP_STATUS» tampoco le dice nada a nadie.
     */
    public static String porQue(PlaybackException error) {
        switch (error.errorCode) {
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED:
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT:
                return "No hemos podido conectar con el servidor de tu proveedor.\nComprueba la conexión de la tele.";
            case PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS:
                return "Tu proveedor ha rechazado este canal.\nSuele pasar cuando hay más aparatos viendo de los contratados.";
            case PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND:
                return "Este canal ya no existe en tu lista.";
            case PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED:
            case PlaybackException.ERROR_CODE_DECODER_INIT_FAILED:
                return "Esta tele no sabe descodificar este canal.";
            default:
                return "Este canal no ha arrancado. Prueba con otro.";
        }
    }
}
