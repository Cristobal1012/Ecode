import { useId, useState } from 'react';
import clienteAxios from './auth/axiosConfig';

export default function GaleriaImagenes({
  productoId,
  imagenes = [],
  archivosGestionados = [],
  onImagenesChange,
  onArchivosChange
}) {
  const idInput = useId();

  const [archivosSeleccionados, setArchivosSeleccionados] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [eliminando, setEliminando] = useState(null);
  const [error, setError] = useState('');

  const manejarArchivos = (archivos) => {
    const nuevosArchivos = Array.from(archivos);

    const imagenesValidas = nuevosArchivos.filter((archivo) =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)
    );

    if (imagenesValidas.length !== nuevosArchivos.length) {
      setError('Solo se permiten imágenes JPG, PNG o WebP.');
    } else {
      setError('');
    }

    setArchivosSeleccionados((prev) => [...prev, ...imagenesValidas]);
  };

  const handleInputChange = (e) => {
    manejarArchivos(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    manejarArchivos(e.dataTransfer.files);
  };

  const eliminarSeleccionada = (index) => {
    setArchivosSeleccionados((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  /*
   * Obtiene el ID de una imagen.
   *
   * Primero intenta encontrarlo en archivosGestionados.
   * Si no existe, intenta obtenerlo desde el nombre de archivo
   * de la URL de la imagen.
   */
  const obtenerImagenId = (url, index) => {
    const archivoGestionado = archivosGestionados[index];

    if (archivoGestionado) {
      if (typeof archivoGestionado === 'object') {
        return (
          archivoGestionado.id ||
          archivoGestionado.imagen_id ||
          archivoGestionado.image_id
        );
      }

      if (typeof archivoGestionado === 'string') {
        const partes = archivoGestionado.split('/');
        const nombre = partes[partes.length - 1];
        return nombre.split('.')[0];
      }
    }

    try {
      const urlObj = new URL(url, window.location.origin);
      const partes = urlObj.pathname.split('/').filter(Boolean);
      const nombreArchivo = partes[partes.length - 1];

      return nombreArchivo.split('.')[0];
    } catch (error) {
      console.error('No se pudo obtener el ID de la imagen:', error);
      return null;
    }
  };

  const eliminarImagenExistente = async (url, index) => {
    if (!productoId) {
      setError('No se encontró el producto.');
      return;
    }

    const imagenId = obtenerImagenId(url, index);

    if (!imagenId) {
      setError('No se pudo identificar la imagen que deseas eliminar.');
      return;
    }

    const confirmar = window.confirm(
      '¿Estás seguro de que deseas eliminar esta imagen?'
    );

    if (!confirmar) {
      return;
    }

    setEliminando(index);
    setError('');

    try {
      await clienteAxios.delete(
        `catalogo/productos/${productoId}/imagenes/${imagenId}/`
      );

      // Actualizar las imágenes mostradas
      const nuevasImagenes = imagenes.filter((_, i) => i !== index);

      onImagenesChange(nuevasImagenes);

      // Actualizar archivos gestionados si el padre los utiliza
      if (onArchivosChange) {
        const nuevosArchivos = archivosGestionados.filter(
          (_, i) => i !== index
        );

        onArchivosChange(nuevosArchivos);
      }
    } catch (err) {
      console.error(
        'Error al eliminar imagen:',
        err.response?.data || err.message
      );

      setError(
        err.response?.data?.detail ||
        'No se pudo eliminar la imagen.'
      );
    } finally {
      setEliminando(null);
    }
  };

  const subirImagenes = async () => {
    if (!productoId) {
      setError('Primero debes guardar el producto.');
      return;
    }

    if (archivosSeleccionados.length === 0) {
      return;
    }

    setSubiendo(true);
    setError('');

    try {
      const formData = new FormData();

      archivosSeleccionados.forEach((archivo) => {
        formData.append('imagenes', archivo);
      });

      const { data } = await clienteAxios.post(
        `catalogo/productos/${productoId}/imagenes/`,
        formData,
        {
          headers: {
            'Content-Type': undefined
          }
        }
      );

      onImagenesChange(data.imagenes || []);
      onArchivosChange(data.archivos || []);

      setArchivosSeleccionados([]);
    } catch (err) {
      console.error(
        'Error al subir imágenes:',
        err.response?.data || err.message
      );

      setError(
        err.response?.data?.detail ||
        'Ocurrió un error al subir las imágenes.'
      );
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div
      style={{
        marginTop: '20px',
        padding: '20px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px'
      }}
    >
      <h4>Galería de imágenes</h4>

      {/* Zona para subir imágenes: es la etiqueta del input, así un clic abre el selector una sola vez (antes el
          input estaba dentro de la zona y su clic volvía a ella, abriendo el selector en bucle). El input va antes y
          oculto solo a la vista, para que reciba el foco del teclado; el foco se dibuja en la zona (Admin.css). */}
      <input
        id={idInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleInputChange}
        className="visualmente-oculto galeria-input"
        aria-label="Seleccionar imágenes para la galería"
        aria-describedby={`${idInput}-formatos`}
      />
      <label
        htmlFor={idInput}
        className="galeria-zona"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          display: 'block',
          border: '2px dashed var(--color-primary)',
          borderRadius: '8px',
          padding: '30px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: 'var(--color-secondary)'
        }}
      >
        <p style={{ margin: 0, fontWeight: 'bold' }}>
          Arrastra tus imágenes aquí
        </p>

        <p style={{ color: 'var(--color-muted)' }}>
          o haz clic para seleccionarlas
        </p>

        <small id={`${idInput}-formatos`}>
          Formatos permitidos: JPG, PNG y WebP
        </small>
      </label>

      {/* Mensaje de error */}
      {error && (
        <p
          style={{
            color: '#b91c1c',
            backgroundColor: '#fee2e2',
            padding: '10px',
            borderRadius: '4px',
            marginTop: '10px'
          }}
        >
          {error}
        </p>
      )}

      {/* Imágenes seleccionadas todavía no subidas */}
      {archivosSeleccionados.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h5>Imágenes seleccionadas</h5>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '10px'
            }}
          >
            {archivosSeleccionados.map((archivo, index) => (
              <div key={index}>
                <img
                  src={URL.createObjectURL(archivo)}
                  alt={archivo.name}
                  style={{
                    width: '100%',
                    height: '100px',
                    objectFit: 'cover',
                    borderRadius: '6px'
                  }}
                />

                <button
                  type="button"
                  onClick={() => eliminarSeleccionada(index)}
                  style={{
                    width: '100%',
                    marginTop: '5px',
                    backgroundColor: '#b91c1c',
                    color: '#fff',
                    border: 'none',
                    padding: '5px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={subirImagenes}
            disabled={subiendo}
            style={{
              width: '100%',
              marginTop: '15px',
              padding: '12px',
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: '4px',
              cursor: subiendo ? 'not-allowed' : 'pointer'
            }}
          >
            {subiendo ? 'Subiendo imágenes...' : 'Subir imágenes'}
          </button>
        </div>
      )}

      {/* Imágenes que ya están almacenadas */}
      {imagenes.length > 0 && (
        <div style={{ marginTop: '25px' }}>
          <h5>Imágenes de la galería</h5>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '10px'
            }}
          >
            {imagenes.map((url, index) => (
              <div
                key={url || index}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '5px'
                }}
              >
                <img
                  src={url}
                  alt={`Producto ${index + 1}`}
                  style={{
                    width: '100%',
                    height: '100px',
                    objectFit: 'cover',
                    borderRadius: '6px'
                  }}
                />

                {index === 0 && (
                  <small
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      marginTop: '5px',
                      fontWeight: 'bold'
                    }}
                  >
                    Portada
                  </small>
                )}

                <button
                  type="button"
                  onClick={() =>
                    eliminarImagenExistente(url, index)
                  }
                  disabled={eliminando === index}
                  style={{
                    width: '100%',
                    marginTop: '6px',
                    backgroundColor:
                      eliminando === index
                        ? '#9ca3af'
                        : '#b91c1c',
                    color: '#fff',
                    border: 'none',
                    padding: '6px',
                    borderRadius: '4px',
                    cursor:
                      eliminando === index
                        ? 'not-allowed'
                        : 'pointer'
                  }}
                >
                  {eliminando === index
                    ? 'Eliminando...'
                    : 'Eliminar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}