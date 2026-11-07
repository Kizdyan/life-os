import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

class RootErrorBoundary extends React.Component<{children: React.ReactNode}, {message: string|null}> {
  state: {message: string|null} = {message: null};
  static getDerivedStateFromError(error: unknown) {
    return {message: error instanceof Error ? error.message : String(error)};
  }
  componentDidCatch(error: Error) {
    console.error('Life OS / Persona render failure:', error);
  }
  render() {
    if (this.state.message) {
      return <main style={{padding:24,maxWidth:620,margin:'50px auto',fontFamily:'system-ui'}}>
        <h1>Не удалось открыть Persona</h1>
        <p>Возникла ошибка приложения. Данные этого устройства не удалены.</p>
        <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',background:'#f2f2f2',padding:14,borderRadius:12}}>
          {this.state.message}
        </pre>
        <button onClick={()=>location.reload()} style={{padding:'12px 18px',border:0,borderRadius:12}}>Перезагрузить</button>
      </main>;
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode><RootErrorBoundary><App/></RootErrorBoundary></React.StrictMode>
  );
}
// No service worker registration in the isolated preview. A previously
// registered worker is retired by the pre-bootstrap diagnostic in index.html.
