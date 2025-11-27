/**
 * auth.js - Módulo de autenticación para Natural Power
 * Maneja login, registro, tokens JWT y rastreo de sesión
 */

// API_BASE_URL se define en config.js

// ============================================
// 🔐 FUNCIONES MANEJADORES DE FORMULARIOS
// ============================================

/**
 * Manejador para formulario de login
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const form = event.target;
    const email = form.elements['email'].value;
    const contrasena = form.elements['contrasena'].value;
    
    const result = await login(email, contrasena);
    if (result) {
        // Cerrar modal
        const modalElement = document.getElementById('loginModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
            modal.hide();
        }
        form.reset();
    }
}

/**
 * Manejador para formulario de registro
 */
async function handleRegister(event) {
    event.preventDefault();
    
    const form = event.target;
    const nombre = form.elements['nombre'].value;
    const email = form.elements['email'].value;
    const contrasena = form.elements['contrasena'].value;
    const direccion = form.elements['direccion'].value;
    
    const result = await registrar(nombre, email, contrasena, direccion);
    if (result) {
        // Cerrar modal
        const modalElement = document.getElementById('registerModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
            modal.hide();
        }
        form.reset();
    }
}

// ============================================
// 🔐 FUNCIONES DE AUTENTICACIÓN
// ============================================

/**
 * Registrar nuevo usuario
 */
async function registrar(nombre, email, contrasena, direccion) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/usuarios/registrar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                nombre: nombre,
                email: email,
                contrasena: contrasena,
                direccion: direccion
            })
        });

        const data = await response.json();
        
        // Verificar si hay error en la respuesta
        if (response.ok && !data.error && !data.body?.error) {
            console.log("✓ Registro exitoso:", data.body);
            mostrarNotificacion("¡Registro exitoso! Ya puedes iniciar sesión.", "success");
            return data.body;
        } else {
            const errorMsg = data.error || data.body?.error || "Error al registrar usuario";
            console.error("✗ Error en registro:", errorMsg);
            mostrarNotificacion(errorMsg, "error");
            return null;
        }
    } catch (error) {
        console.error("Error en registrar():", error);
        mostrarNotificacion("Error al registrar usuario", "error");
        return null;
    }
}

/**
 * Login del usuario
 */
async function login(email, contrasena) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                contrasena: contrasena
            })
        });

        const data = await response.json();
        
        // Verificar si hay error en la respuesta
        if (response.ok && data.body?.token && !data.error && !data.body?.error) {
            // Guardar token en localStorage
            localStorage.setItem("auth_token", data.body.token);
            localStorage.setItem("user_email", data.body.usuario.email);
            localStorage.setItem("user_nombre", data.body.usuario.nombre);
            
            console.log("✓ Login exitoso. Token guardado.");
            mostrarNotificacion(`¡Bienvenido, ${data.body.usuario.nombre}!`, "success");
            
            // Actualizar UI después del login
            actualizarUIPostLogin(data.body.usuario);
            
            return data.body;
        } else {
            const errorMsg = data.error || data.body?.error || "Credenciales incorrectas";
            console.error("✗ Error en login:", errorMsg);
            mostrarNotificacion(errorMsg, "error");
            return null;
        }
    } catch (error) {
        console.error("Error en login():", error);
        mostrarNotificacion("Error al iniciar sesión", "error");
        return null;
    }
}

/**
 * Obtener datos del usuario autenticado
 */
async function obtenerDatosUsuario() {
    const token = localStorage.getItem("auth_token");
    
    if (!token) {
        console.warn("No hay token guardado");
        return null;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/usuarios/me`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log("✓ Datos del usuario:", data.body);
            return data.body;
        } else {
            console.error("✗ Error al obtener datos:", data.body.error);
            return null;
        }
    } catch (error) {
        console.error("Error en obtenerDatosUsuario():", error);
        return null;
    }
}

/**
 * Obtener historial de actividades del usuario
 */
async function obtenerActividades(limite = 10) {
    const token = localStorage.getItem("auth_token");
    
    if (!token) {
        console.warn("No hay token guardado");
        return null;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/usuarios/me/actividad?limite=${limite}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log("✓ Actividades del usuario:", data.body.actividades);
            return data.body.actividades;
        } else {
            console.error("✗ Error al obtener actividades:", data.body.error);
            return null;
        }
    } catch (error) {
        console.error("Error en obtenerActividades():", error);
        return null;
    }
}

/**
 * Obtener sesiones activas
 */
async function obtenerSesiones() {
    const token = localStorage.getItem("auth_token");
    
    if (!token) {
        console.warn("No hay token guardado");
        return null;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/usuarios/me/sesiones`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log("✓ Sesiones activas:", data.body.sesiones);
            return data.body.sesiones;
        } else {
            console.error("✗ Error al obtener sesiones:", data.body.error);
            return null;
        }
    } catch (error) {
        console.error("Error en obtenerSesiones():", error);
        return null;
    }
}

/**
 * Logout del usuario
 */
async function logout() {
    const token = localStorage.getItem("auth_token");
    
    if (!token) {
        console.warn("No hay token guardado");
        return false;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/usuarios/me/logout`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            // Limpiar datos de sesión
            localStorage.removeItem("auth_token");
            localStorage.removeItem("user_email");
            localStorage.removeItem("user_nombre");
            
            console.log("✓ Logout exitoso");
            mostrarNotificacion("Has cerrado sesión", "success");
            
            // Actualizar UI después del logout
            actualizarUIPostLogout();
            
            return true;
        } else {
            console.error("✗ Error en logout:", data.body.error);
            return false;
        }
    } catch (error) {
        console.error("Error en logout():", error);
        return false;
    }
}

// ============================================
// 🎨 FUNCIONES DE UI
// ============================================

/**
 * Mostrar notificaciones al usuario
 */
function mostrarNotificacion(mensaje, tipo = "info") {
    const container = document.getElementById("toast-container");
    if (!container) {
        console.warn("⚠️ No se encontró #toast-container, creando uno...");
        const newContainer = document.createElement("div");
        newContainer.id = "toast-container";
        newContainer.className = "toast-container position-fixed top-0 end-0 p-3";
        newContainer.style.zIndex = "9999";
        document.body.appendChild(newContainer);
        return mostrarNotificacion(mensaje, tipo); // Llamar recursivamente
    }

    const toast = document.createElement("div");
    toast.className = `alert alert-${tipo === "success" ? "success" : tipo === "error" ? "danger" : "info"} alert-dismissible fade show`;
    toast.setAttribute("role", "alert");
    toast.style.minWidth = "300px";
    toast.innerHTML = `
        ${mensaje}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    container.appendChild(toast);
    
    console.log(`✓ Notificación mostrada: ${mensaje} (${tipo})`);
    
    // Remover automáticamente después de 5 segundos
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

/**
 * Actualizar UI después del login
 */
function actualizarUIPostLogin(usuario) {
    const guestActions = document.getElementById("guest-actions");
    const userActions = document.getElementById("user-actions");
    const userDropdownName = document.getElementById("user-dropdown-name");
    
    if (guestActions) guestActions.style.display = "none";
    if (userActions) userActions.style.display = "flex";
    if (userDropdownName) userDropdownName.textContent = usuario.nombre || usuario.email;
    // Intentar inyectar enlace Admin si corresponde
    try { maybeInjectAdminLink(); } catch (e) { /* noop */ }
}

/**
 * Actualizar UI después del logout
 */
function actualizarUIPostLogout() {
    const guestActions = document.getElementById("guest-actions");
    const userActions = document.getElementById("user-actions");
    
    if (guestActions) guestActions.style.display = "flex";
    if (userActions) userActions.style.display = "none";
}

/**
 * Verificar si el usuario está autenticado
 */
function estaAutenticado() {
    return !!localStorage.getItem("auth_token");
}

/**
 * Obtener el token guardado
 */
function obtenerToken() {
    return localStorage.getItem("auth_token");
}

/**
 * Requerir autenticación - Redirige a inicio si no está autenticado
 */
function requireAuth() {
    if (!estaAutenticado()) {
        mostrarNotificacion("Debes iniciar sesión para acceder a esta página", "error");
        setTimeout(() => {
            window.location.href = '/app/inicio/';
        }, 1500);
        return false;
    }
    return true;
}

// ============================================
// 🔄 INICIALIZACIÓN AL CARGAR LA PÁGINA
// ============================================

document.addEventListener("DOMContentLoaded", function() {
    // Restaurar estado de autenticación si el usuario ya estaba logueado
    if (estaAutenticado()) {
        let nombre = localStorage.getItem("user_nombre");
        let email = localStorage.getItem("user_email");

        // Si falta el nombre o email en localStorage, intentamos obtenerlos del API
        if (!nombre || !email) {
            obtenerDatosUsuario()
                .then((data) => {
                    if (data) {
                        localStorage.setItem("user_nombre", data.nombre || "");
                        localStorage.setItem("user_email", data.email || "");
                        actualizarUIPostLogin({ nombre: data.nombre, email: data.email });
                        if (data.es_admin) { maybeInjectAdminLink(true); }
                    } else {
                        actualizarUIPostLogin({ nombre: nombre || email || "", email: email || "" });
                    }
                })
                .catch(() => {
                    actualizarUIPostLogin({ nombre: nombre || email || "", email: email || "" });
                });
        } else {
            actualizarUIPostLogin({ nombre, email });
            // Verificar admin en segundo plano
            obtenerDatosUsuario().then(d => { if (d && d.es_admin) { maybeInjectAdminLink(true); } });
        }
    }
});

// Inyecta enlace "Admin" en el menú del usuario si es admin
async function maybeInjectAdminLink(force = false) {
    try {
        const dropdownMenu = document.querySelector('#user-actions .dropdown-menu');
        if (!dropdownMenu) return;
        if (dropdownMenu.querySelector('#admin-link-item')) return; // ya existe

        let isAdmin = false;
        if (force) {
            isAdmin = true;
        } else {
            const me = await obtenerDatosUsuario();
            isAdmin = !!(me && me.es_admin);
        }
        if (!isAdmin) return;

        const li = document.createElement('li');
        li.id = 'admin-link-item';
        li.innerHTML = '<a class="dropdown-item" href="/app/admin/">Admin</a>';
        dropdownMenu.insertBefore(li, dropdownMenu.firstChild);
    } catch (_) { /* noop */ }
}

// ============================================
// 📤 EXPORTAR FUNCIONES (para usar en otros scripts)
// ============================================

// Si usas módulos ES6, puedes hacer:
// export { registrar, login, logout, obtenerDatosUsuario, obtenerActividades };

// Si usas global, simplemente están disponibles como window.registrar, window.login, etc.
try {
    window.registrar = registrar;
    window.login = login;
    window.openRecoverModal = function(e){
        if (e) e.preventDefault();
        const m = document.getElementById('recoverModal');
        if (m){
            const modal = bootstrap.Modal.getInstance(m) || new bootstrap.Modal(m);
            // Reset pasos por si acaso
            const s1 = m.querySelector('#recover-step-1');
            const s2 = m.querySelector('#recover-step-2');
            if (s1) s1.style.display = '';
            if (s2) s2.style.display = 'none';
            modal.show();
        }
    };
    window.handlePasswordRecovery = async function(event){
        event.preventDefault();
        const form = event.target;
        const email = form.querySelector('input[type="email"]').value;
        try {
            const res = await fetch(`${API_BASE_URL}/api/auth/recuperar-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            // Respuesta genérica
            const m = document.getElementById('recoverModal');
            const s1 = m.querySelector('#recover-step-1');
            const s2 = m.querySelector('#recover-step-2');
            if (s1) s1.style.display = 'none';
            if (s2) s2.style.display = '';
        } catch(err){
            mostrarNotificacion('No se pudo procesar la solicitud', 'error');
        }
    };
    window.handleLogin = handleLogin;
    window.handleRegister = handleRegister;
    window.logout = logout;
    window.obtenerDatosUsuario = obtenerDatosUsuario;
    window.obtenerSesiones = obtenerSesiones;
    window.obtenerActividades = obtenerActividades;
    window.mostrarNotificacion = mostrarNotificacion;
    console.log("✅ auth.js cargado correctamente. Funciones disponibles:", {
        handleLogin: typeof handleLogin,
        handleRegister: typeof handleRegister,
        registrar: typeof registrar,
        login: typeof login
    });
} catch (e) {
    console.error("❌ Error al cargar auth.js:", e);
}
