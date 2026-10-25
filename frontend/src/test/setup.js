import '@testing-library/jest-dom/vitest';

// JSDOM no implementa el diálogo modal. Su comportamiento de foco y teclado
// se comprueba con el navegador real; aquí solo se representa su apertura.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
}
