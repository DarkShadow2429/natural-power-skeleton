// config.js - Configuración centralizada del API
// Detecta automáticamente el origen (host:puerto) y cae a 127.0.0.1:8004 si no está disponible
const API_BASE_URL = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http'))
    ? window.location.origin
    : 'http://127.0.0.1:8004';

// Función para hacer peticiones al API con manejo de errores automático
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        // Añadir token si existe
        const token = localStorage.getItem('auth_token');
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.body?.error || `Error ${response.status}`);
        }

        return data.body;
    } catch (error) {
        console.error(`Error en API ${endpoint}:`, error);
        throw error;
    }
}
