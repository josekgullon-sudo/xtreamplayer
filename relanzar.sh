#!/usr/bin/env bash
# Vuelve a montar el escenario de pruebas (servidores simulados + la app
# compilada en dos puertos) sin lanzar las 39 suites. Es lo que hace la
# primera mitad de qa/todo.sh; se pierde cada vez que el contenedor se
# reinicia, así que vive aquí para no reescribirlo a mano.
bash qa/todo.sh episodios
