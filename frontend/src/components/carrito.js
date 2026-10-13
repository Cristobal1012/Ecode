import clienteAxios from './auth/axiosConfig';

// RN-03: compara el carrito con el stock y los precios vigentes. No reserva nada:
// el backend vuelve a validar al crear la orden y al confirmar el pago.
export const validarCarrito = async (items) => {
  const { data } = await clienteAxios.post('ventas/carrito/validar/', {
    items: items.map(item => ({ producto_mongo_id: item.id, variante_sku: item.sku, cantidad: item.cantidad }))
  });
  return data;
};

// Guarda el carrito en el navegador, avisa al mini-carrito y, con sesión, lo sincroniza con la cuenta
export const guardarCarrito = async (items) => {
  localStorage.setItem('carrito_local', JSON.stringify(items));
  window.dispatchEvent(new Event('carritoActualizado'));
  if (localStorage.getItem('access_token')) {
    try {
      await clienteAxios.post('ventas/carrito/', { items });
    } catch (error) {
      console.error('No se pudo sincronizar el carrito con la base de datos:', error);
    }
  }
};

// Ajusta el carrito a lo que se puede comprar ahora: quita lo agotado, baja cantidades y
// actualiza precios. Devuelve el carrito ajustado y un aviso por cada cambio.
export const ajustarCarrito = (items, revision) => {
  const lineas = new Map(revision.items.map(linea => [`${linea.producto_mongo_id}|${linea.variante_sku}`, linea]));
  const avisos = [];
  const ajustado = [];
  items.forEach(item => {
    const linea = lineas.get(`${item.id}|${item.sku}`);
    if (!linea) {
      ajustado.push(item);
      return;
    }
    if (linea.problema === 'NO_DISPONIBLE' || linea.problema === 'SIN_STOCK') {
      avisos.push(`${linea.mensaje} Lo quitamos de tu carrito.`);
      return;
    }
    let actualizado = item;
    if (linea.problema === 'STOCK_INSUFICIENTE') {
      avisos.push(`${linea.mensaje} Ajustamos la cantidad.`);
      actualizado = { ...actualizado, cantidad: linea.disponible };
    }
    if (linea.precio !== null && Number(linea.precio) !== Number(item.precio)) {
      avisos.push(`El precio de ${linea.nombre} cambió a $${Number(linea.precio).toLocaleString('es-CL')}.`);
      actualizado = { ...actualizado, precio: linea.precio };
    }
    ajustado.push(actualizado);
  });
  return { items: ajustado, avisos };
};
