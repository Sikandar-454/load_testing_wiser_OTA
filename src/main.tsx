import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';

const theme = createTheme({
  palette: { primary: { main: '#087f8c' }, secondary: { main: '#e66a32' }, background: { default: '#f4f7f6', paper: '#ffffff' } },
  shape: { borderRadius: 7 },
  typography: { fontFamily: '"DM Sans", "Segoe UI", sans-serif', h4: { fontWeight: 700 } }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={new QueryClient()}><ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider></QueryClientProvider></React.StrictMode>
);