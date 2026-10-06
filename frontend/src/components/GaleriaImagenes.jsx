import React, { useRef, useState } from 'react';
import clienteAxios from './auth/axiosConfig';

export default function GaleriaImagenes({
  productoId,
  imagenes = [],
  archivosGestionados = [],
  onImagenesChange,
  onArchivosChange
}) {
  const inputRef = useRef(null);

  const [archivosSeleccionados, setArchivosSeleccionados] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
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
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px'
      }}
    >
      <h4>Galería de imágenes</h4>

      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: '2px dashed var(--color-primary)',
          borderRadius: '8px',
          padding: '30px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: '#f9fafb'
        }}
      >
        <p style={{ margin: 0, fontWeight: 'bold' }}>
          Arrastra tus imágenes aquí
        </p>

        <p style={{ color: '#6b7280' }}>
          o haz clic para seleccionarlas
        </p>

        <small>
          Formatos permitidos: JPG, PNG y WebP
        </small>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <p
          style={{
            color: '#ef4444',
            backgroundColor: '#fee2e2',
            padding: '10px',
            borderRadius: '4px',
            marginTop: '10px'
          }}
        >
          {error}
        </p>
      )}

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
                    backgroundColor: '#ef4444',
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
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: subiendo ? 'not-allowed' : 'pointer'
            }}
          >
            {subiendo ? 'Subiendo imágenes...' : 'Subir imágenes'}
          </button>
        </div>
      )}

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
              <div key={url || index}>
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}