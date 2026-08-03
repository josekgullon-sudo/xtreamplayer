package app.totalplayer.tvnativo;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * «¿Quién está viendo?»: la misma puerta que en la web.
 *
 * Cada perfil guarda sus favoritos y su historial. Aquí se elige, y con la
 * casilla de abajo se puede dejar fijado para no volver a preguntar en esta
 * tele —que es lo que quiere quien vive solo—.
 */
public class PerfilesActivity extends Activity {

    private LinearLayout fila;
    private TextView aviso;
    private ProgressBar girando;
    private View casilla;
    private boolean siempre = false;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        setContentView(R.layout.perfiles);

        fila = findViewById(R.id.fila);
        aviso = findViewById(R.id.aviso);
        girando = findViewById(R.id.girando);
        casilla = findViewById(R.id.casilla);

        findViewById(R.id.siempre).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                siempre = !siempre;
                casilla.setActivated(siempre);
            }
        });

        cargar();
    }

    private void cargar() {
        girando.setVisibility(View.VISIBLE);
        Hilos.fuera(new Hilos.Trabajo<Perfiles.Lista>() {
            @Override public Perfiles.Lista hacer() throws Exception {
                return Perfiles.listar(Sesion.actual().galleta);
            }
        }, new Hilos.Luego<Perfiles.Lista>() {
            @Override public void listo(Perfiles.Lista lista) {
                girando.setVisibility(View.GONE);
                pintar(lista);
                /*
                 * Si en esta tele ya se dijo «entra siempre con este», no se
                 * vuelve a preguntar: encender la tele y tener que elegir
                 * perfil cada vez es un paso de más para quien vive solo.
                 */
                int fijado = Sesion.perfilFijado(PerfilesActivity.this);
                for (Perfiles.Perfil p : lista.perfiles) {
                    if (p.id == fijado) { entrar(p); return; }
                }
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                /* Si los perfiles no cargan, el reproductor sigue estando:
                   quedarse fuera por no poder leer una lista de nombres
                   sería el peor final posible */
                seguirSinPerfil();
            }
        });
    }

    private void pintar(Perfiles.Lista lista) {
        fila.removeAllViews();
        LayoutInflater de = LayoutInflater.from(this);

        for (final Perfiles.Perfil p : lista.perfiles) {
            View v = de.inflate(R.layout.pieza_perfil, fila, false);
            ((TextView) v.findViewById(R.id.inicial)).setText(p.inicial());
            ((TextView) v.findViewById(R.id.nombre)).setText(p.nombre);
            Foco.agrandar(v, 1.07f);
            v.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View x) { entrar(p); }
            });
            fila.addView(v);
        }

        if (lista.cabenMas) {
            View v = de.inflate(R.layout.pieza_perfil, fila, false);
            v.findViewById(R.id.cuadro).setBackgroundResource(R.drawable.perfil_nuevo);
            v.findViewById(R.id.inicial).setVisibility(View.GONE);
            v.findViewById(R.id.mas).setVisibility(View.VISIBLE);
            ((TextView) v.findViewById(R.id.nombre)).setText("Añadir perfil");
            Foco.agrandar(v, 1.07f);
            v.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View x) { preguntarNombre(); }
            });
            fila.addView(v);
        }

        if (fila.getChildCount() > 0) fila.getChildAt(0).requestFocus();
        else seguirSinPerfil();
    }

    /** Crear un perfil con el teclado de la tele. */
    private void preguntarNombre() {
        final EditText campo = new EditText(this);
        campo.setHint("Nombre del perfil");
        campo.setSingleLine(true);
        campo.setTextColor(getResources().getColor(R.color.texto));
        campo.setHintTextColor(getResources().getColor(R.color.tenue));

        new AlertDialog.Builder(this)
                .setTitle("Añadir perfil")
                .setView(campo)
                .setPositiveButton("Crear", (dialogo, cual) -> crear(campo.getText().toString().trim()))
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void crear(final String nombre) {
        if (nombre.isEmpty()) return;
        girando.setVisibility(View.VISIBLE);
        Hilos.fuera(new Hilos.Trabajo<Perfiles.Perfil>() {
            @Override public Perfiles.Perfil hacer() throws Exception {
                return Perfiles.crear(Sesion.actual().galleta, nombre);
            }
        }, new Hilos.Luego<Perfiles.Perfil>() {
            @Override public void listo(Perfiles.Perfil p) {
                girando.setVisibility(View.GONE);
                cargar();
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                // El panel dice el motivo —el cupo del proveedor, casi siempre—
                aviso.setText(Hilos.enCristiano(e));
                aviso.setVisibility(View.VISIBLE);
            }
        });
    }

    private void entrar(Perfiles.Perfil p) {
        Sesion s = Sesion.actual();
        s.perfil = p.nombre;
        s.perfilId = p.id;
        s.fijarPerfil(this, siempre);
        seguir();
    }

    private void seguirSinPerfil() {
        Sesion.actual().perfil = Sesion.actual().entradaUsuario;
        seguir();
    }

    private void seguir() {
        startActivity(new Intent(this, InicioActivity.class));
        overridePendingTransition(0, 0);
        finish();
    }

    /** Atrás desde aquí es salir: no hay pantalla anterior a la que volver. */
    @Override public void onBackPressed() {
        finish();
    }
}
