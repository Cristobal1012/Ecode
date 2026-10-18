import { useState } from 'react';
import { Link } from 'react-router-dom';
import { obtenerDatosPrecioYStock } from '../utils/precios';
import './TarjetaProducto.css';

// Tarjeta de producto del estilo editorial: foto vertical, categoría, nombre y precio (con oferta tachada).
// La usan las secciones de la landing; toda la tarjeta es un enlace a la ficha del producto.
export default function TarjetaProducto({ producto, etiqueta }) {
  const id = producto.id || producto._id;
  const imagen = producto.imagenes?.[0];
  const [imagenRota, setImagenRota] = useState(false);
  const { agotado, textoPrecio, precioTachado, tieneOferta } = obtenerDatosPrecioYStock(producto.variantes);
  // Una sola etiqueta: "Agotado" manda sobre "Oferta" y sobre la de la sección
  const textoEtiqueta = agotado ? 'Agotado' : tieneOferta ? 'Oferta' : etiqueta;

  return (
    <Link to={`/catalogo/producto/${id}`} className="tarjeta-producto">
      <div className="tarjeta-producto-imagen">
        {imagen && !imagenRota ? (
          // El nombre ya está en la tarjeta: la foto es decorativa para el lector de pantalla
          <img src={imagen} alt="" loading="lazy" onError={() => setImagenRota(true)} />
        ) : (
          <span className="tarjeta-producto-sin-imagen" aria-hidden="true">{producto.nombre?.charAt(0)}</span>
        )}
        {textoEtiqueta && (
          <span className={`tarjeta-producto-etiqueta${agotado ? ' tarjeta-producto-etiqueta--agotado' : ''}`}>
            {textoEtiqueta}
          </span>
        )}
      </div>

      {producto.categoria && <span className="tarjeta-producto-categoria">{producto.categoria}</span>}
      <h3 className="tarjeta-producto-nombre">{producto.nombre}</h3>

      <p className="tarjeta-producto-precio">
        {agotado ? (
          <span className="texto-secundario">Sin stock</span>
        ) : (
          <>
            <span>{textoPrecio}</span>
            {tieneOferta && (
              <span className="tarjeta-producto-precio-anterior">
                <span className="visualmente-oculto">Precio anterior: </span>{precioTachado}
              </span>
            )}
          </>
        )}
      </p>
    </Link>
  );
}
