export default function AdminTopbar() {
  return (
    <header
      style={{
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f3f4f6'
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: '1.1rem',
            color: '#374151',
            fontWeight: '600'
          }}
        >
          Hola, Administrador
        </h2>

        <p
          style={{
            margin: '3px 0 0',
            fontSize: '0.8rem',
            color: '#9ca3af'
          }}
        >
          Gestiona tu tienda desde aquí
        </p>
      </div>
    </header>
  );
}