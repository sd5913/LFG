import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { PoseShadowDemo } from './pose-shadow-demo.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PoseShadowDemo />
  </StrictMode>,
);
