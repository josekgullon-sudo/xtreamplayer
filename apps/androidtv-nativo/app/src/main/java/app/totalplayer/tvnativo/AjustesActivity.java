package app.totalplayer.tvnativo;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.List;

/**
 * Ajustes.
 *
 * Lo mismo que el cuadro de ajustes de la web —`components/player/Ajustes.tsx`—
 * y por la misma razón: son tres cosas que hoy acaban en una llamada al
 * proveedor y que el cliente puede arreglar solo en diez segundos.
 *
 * - El idioma que se eligió mal y se quedó puesto para siempre.
 * - Los aparatos que ocupan el cupo. La llamada más frecuente que recibe un
 *   proveedor, y casi siempre por una tele del propio cliente.
 * - Quién falla cuando algo no se ve. El servidor sabe si el proveedor le
 *   contesta; el aparato, no.
 */
public class AjustesActivity extends Activity {

    private LinearLayout listaAparatos;
    private TextView idiomaAhora, veredicto, botonProbar, pieAparatos;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        Tipos.poner(this);
        setContentView(R.layout.ajustes);
        if (!Guardia.haySesion(this)) return;

        listaAparatos = findViewById(R.id.listaAparatos);
        idiomaAhora = findViewById(R.id.idiomaAhora);
        veredicto = findViewById(R.id.veredicto);
        botonProbar = findViewById(R.id.botonProbar);
        pieAparatos = findViewById(R.id.pieAparatos);

        /* En la tele hay que dejar aire a los lados: lo que en un teléfono es
           el borde de la pantalla, en un televisor se lo come el marco */
        if (!Pantalla.esMovil(this)) {
            View scroll = findViewById(R.id.scrollAjustes);
            scroll.setPadding(dp(56), dp(24), dp(56), dp(28));
        }

        TextView version = findViewById(R.id.versionAjustes);
        try {
            version.setText("Versión " + getPackageManager().getPackageInfo(getPackageName(), 0).versionName);
        } catch (Exception niIdea) {
            /* Si el sistema no sabe decir su propia versión, mejor callarse */
        }

        pintarIdioma();
        findViewById(R.id.botonOlvidarIdioma).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Idiomas.recordar(AjustesActivity.this, false, "");
                Idiomas.recordar(AjustesActivity.this, true, "");
                pintarIdioma();
            }
        });

        botonProbar.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { probar(); }
        });

        botonProbar.requestFocus();
        pedirAparatos();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void pintarIdioma() {
        String audio = Idiomas.guardado(this, false);
        String subs = Idiomas.guardado(this, true);
        View olvidar = findViewById(R.id.botonOlvidarIdioma);

        if (audio.isEmpty() && subs.isEmpty()) {
            idiomaAhora.setText("Todavía no has elegido idioma en ningún vídeo. Cuando lo hagas, el resto se pondrá igual.");
            olvidar.setVisibility(View.GONE);
            return;
        }
        StringBuilder dice = new StringBuilder();
        if (!audio.isEmpty()) dice.append("Audio: ").append(comoSeLee(audio));
        if (!subs.isEmpty()) {
            if (dice.length() > 0) dice.append("     ");
            dice.append("Subtítulos: ").append(comoSeLee(subs));
        }
        dice.append("\nCada vídeo se pone solo en lo último que elegiste.");
        idiomaAhora.setText(dice.toString());
        olvidar.setVisibility(View.VISIBLE);
    }

    /** El código que se guardó, dicho como se dice. Ver `Idiomas`. */
    private String comoSeLee(String codigo) {
        if (Idiomas.SIN_SUBS.equals(codigo)) return "ninguno";
        return Idiomas.nombreDe(codigo);
    }

    /**
     * Los aparatos de la cuenta.
     *
     * Solo los tiene quien entró con un proveedor: quien se pegó su propia
     * lista no tiene cuenta ninguna, y ahí no hay cupo que enseñar.
     */
    private void pedirAparatos() {
        if (!Sesion.actual().gestionada) {
            pieAparatos.setText("Esta lista la llevas tú, así que no hay cupo de aparatos que repartir.");
            return;
        }
        Hilos.fuera(new Hilos.Trabajo<List<Cuenta.Aparato>>() {
            @Override public List<Cuenta.Aparato> hacer() throws Exception { return Cuenta.aparatos(); }
        }, new Hilos.Luego<List<Cuenta.Aparato>>() {
            @Override public void listo(List<Cuenta.Aparato> cuales) { pintarAparatos(cuales); }
            @Override public void falla(Exception e) {
                pieAparatos.setText(Hilos.enCristiano(e));
            }
        });
    }

    private void pintarAparatos(List<Cuenta.Aparato> cuales) {
        listaAparatos.removeAllViews();
        if (cuales.isEmpty()) {
            pieAparatos.setText("No hay ninguno abierto ahora mismo.");
            return;
        }
        for (final Cuenta.Aparato a : cuales) listaAparatos.addView(filaDe(a));
    }

    /** Un aparato: qué es, cuándo se vio, y un botón para cerrarlo. */
    private View filaDe(final Cuenta.Aparato a) {
        LinearLayout fila = new LinearLayout(this);
        fila.setOrientation(LinearLayout.HORIZONTAL);
        fila.setGravity(Gravity.CENTER_VERTICAL);
        fila.setPadding(0, dp(8), 0, dp(8));

        TextView que = new TextView(this);
        que.setText(a.comoSeLlama() + "\n" + a.haceCuanto());
        que.setTextSize(15);
        que.setLineSpacing(dp(2), 1f);
        que.setTextColor(getResources().getColor(R.color.texto));
        LinearLayout.LayoutParams ancho = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        que.setLayoutParams(ancho);
        Tipos.aplicar(que);
        fila.addView(que);

        final TextView cerrar = new TextView(this);
        cerrar.setText("Cerrar");
        cerrar.setTextSize(15);
        cerrar.setGravity(Gravity.CENTER);
        cerrar.setTextColor(getResources().getColor(R.color.texto));
        cerrar.setBackgroundResource(R.drawable.tecla);
        cerrar.setPadding(dp(20), 0, dp(20), 0);
        cerrar.setFocusable(true);
        cerrar.setClickable(true);
        cerrar.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(46)));
        Tipos.aplicar(cerrar);
        cerrar.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                cerrar.setText("Cerrando…");
                cerrar.setEnabled(false);
                Hilos.fuera(new Hilos.Trabajo<Boolean>() {
                    @Override public Boolean hacer() throws Exception {
                        Cuenta.cerrar(a.llave);
                        return true;
                    }
                }, new Hilos.Luego<Boolean>() {
                    @Override public void listo(Boolean hecho) { pedirAparatos(); }
                    @Override public void falla(Exception e) {
                        cerrar.setText("Cerrar");
                        cerrar.setEnabled(true);
                        pieAparatos.setText(Hilos.enCristiano(e));
                    }
                });
            }
        });
        fila.addView(cerrar);
        return fila;
    }

    /**
     * Quién falla.
     *
     * La frase viene del servidor entera y no se toca: es él quien sabe si
     * el proveedor le contesta, y es él quien tiene que contarlo sin decir
     * la dirección de nadie.
     */
    private void probar() {
        botonProbar.setEnabled(false);
        botonProbar.setText("Comprobando…");
        veredicto.setVisibility(View.GONE);
        Hilos.fuera(new Hilos.Trabajo<String>() {
            @Override public String hacer() throws Exception { return Cuenta.veredicto(); }
        }, new Hilos.Luego<String>() {
            @Override public void listo(String dice) { decir(dice); }
            @Override public void falla(Exception e) { decir(Hilos.enCristiano(e)); }
        });
    }

    private void decir(String dice) {
        botonProbar.setEnabled(true);
        botonProbar.setText("Comprobar mi conexión");
        veredicto.setText(dice);
        veredicto.setVisibility(View.VISIBLE);
    }
}
