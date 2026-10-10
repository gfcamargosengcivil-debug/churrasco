import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './estilos.css';
import { App } from './App';
import { ProvedorAuth } from './lib/auth';
import { ProvedorFiltros } from './lib/filtros';

try {
  const tema = localStorage.getItem('radar.tema');
  if (tema === 'light' || tema === 'dark') document.documentElement.dataset.theme = tema;
} catch {
  /* sem armazenamento local: segue o tema do sistema */
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorAuth>
        <ProvedorFiltros>
          <App />
        </ProvedorFiltros>
      </ProvedorAuth>
    </BrowserRouter>
  </StrictMode>,
);
