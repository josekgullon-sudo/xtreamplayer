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
    /** Ha venido a elegir a propósito: esta pantalla no se salta. */
    private boolean vieneAElegir = false;

    @Override protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        Pantalla.colocar(this);
        setContentView(R.layout.perfiles);
        if (!Guardia.haySesion(this)) return;

        fila = findViewById(R.id.fila);
        aviso = findViewById(R.id.aviso);
        girando = findViewById(R.id.girando);
        casilla = findViewById(R.id.casilla);

        vieneAElegir = getIntent().getBooleanExtra("elegir", false);

        findViewById(R.id.cerrar).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Sesion.olvidar(PerfilesActivity.this);
                Intent i = new Intent(PerfilesActivity.this, AccesoActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                finish();
            }
        });

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
                /* El perfil fijado entra solo, salvo que se haya venido
                   aquí justamente a cambiarlo */
                if (vieneAElegir) return;
                int fijado = Sesion.perfilFijado(PerfilesActivity.this);
                for (Perfiles.Perfil p : lista.perfiles) {
                    if (p.id == fijado) { entrar(p); return; }
                }
            }
            @Override public void falla(Exception e) {
                girando.setVisibility(View.GONE);
                /*
                 * Si los perfiles no cargan, el reproductor sigue estando:
                 * quedarse fuera por no poder leer una lista de nombres sería
                 * el peor final posible. Pero solo al entrar. Si se ha venido
                 * aquí a cambiar de perfil, seguir de largo devuelve al menú
                 * con la misma sesión —que es lo que hacía imposible salir—,
                 * así que se queda con el aviso y el botón de salir.
                 */
                if (vieneAElegir) {
                    aviso.setText("No hemos podido cargar los perfiles.");
                    aviso.setVisibility(View.VISIBLE);
                    findViewById(R.id.cerrar).requestFocus();
                    return;
                }
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

        if (fila.getChildCount() > 0) {
            fila.getChildAt(0).requestFocus();
        } else if (vieneAElegir) {
            aviso.setText("Tu proveedor no te ha dado perfiles que elegir.");
            aviso.setVisibility(View.VISIBLE);
            findViewById(R.id.cerrar).requestFocus();
        } else {
            seguirSinPerfil();
        }
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

    /**
     * Atrás: si se vino a cambiar de perfil, se vuelve al menú con el que
     * había. Si es la entrada, no hay pantalla anterior y se sale.
     */
    @Override public void onBackPressed() {
        if (vieneAElegir && !Sesion.actual().perfil.isEmpty()) {
            seguir();
            return;
        }
        finish();
    }
}
