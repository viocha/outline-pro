import '@fontsource-variable/geist';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/assets/main.css';
import SidePanel from './SidePanel';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
);
