// config.js
const API_BASE = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) 
  ? `${window.location.origin}/api` 
  : 'http://localhost:5000/api';