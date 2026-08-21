/**
 * El dinero, escrito como se escribe aquí.
 *
 * Con coma y con el símbolo detrás: «0,20 €», no «0.20€». Un precio con
 * punto decimal en medio de una pantalla en castellano se lee como un
 * descuido —y en una pantalla de precios, un descuido en los precios es lo
 * peor que se puede tener—. Lo hacían ya la factura en PDF y el panel de
 * administración, cada uno por su lado; esto es lo mismo en un solo sitio.
 */
export function euros(importe: number, decimales = 2): string {
  return importe.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}
