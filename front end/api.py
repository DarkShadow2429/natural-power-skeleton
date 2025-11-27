# main.py
# API Completa de Natural Power en un solo archivo.

import uvicorn
import os
from fastapi import FastAPI, Path, Body, Query, status, Depends, Header, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, Field as PydField
from typing import List, Optional, Any, Dict
import secrets
import hashlib
import smtplib
from email.message import EmailMessage
from datetime import date, time, datetime, timezone, timedelta
from sqlmodel import SQLModel, Field, Session, create_engine, select
from passlib.context import CryptContext
from jose import JWTError, jwt
# MercadoPago es opcional en arranque: si no está instalado, el backend igual levanta
try:
    import mercadopago  # type: ignore
    MP_AVAILABLE = True
except Exception:
    mercadopago = None  # type: ignore
    MP_AVAILABLE = False
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# --- 2. CONFIGURACIÓN DE SEGURIDAD ---
# Usamos argon2 para mayor seguridad en las contraseñas (compatible con Windows)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# Configuración JWT para tokens de autenticación
SECRET_KEY = "natural-power-secret-key-produccion"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# HTTPBearer para validar tokens en headers
oauth2_scheme = HTTPBearer()

# --- Configuración de la base de datos (SQLite + SQLModel) ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'database.db')}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# --- 1. Configuración de la Aplicación FastAPI ---

app = FastAPI(
    title="Natural Power API (Versión Monolito)",
    description="Todos los endpoints y modelos DTO en un solo archivo.",
    version="1.0.0",
    swagger_ui_parameters={
        "displayOperationId": False,
        "docExpansion": "none",
    }
)

# Configurar esquema de seguridad para Swagger UI
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="Natural Power API (Versión Monolito)",
        version="1.0.0",
        description="Todos los endpoints y modelos DTO en un solo archivo.",
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "HTTPBearer": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT Token obtenido del endpoint /api/auth/login"
        }
    }
    openapi_schema["security"] = [{"HTTPBearer": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from os import getenv

# --- Middleware para rastrear actividad de usuarios ---
class ActivityTrackingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        
        # Solo rastrear endpoints /api/ que no sean /static o /app
        if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/auth/login") and not request.url.path.startswith("/api/auth/recuperar"):
            auth_header = request.headers.get("authorization")
            if auth_header:
                email = obtener_email_del_token(auth_header)
                if email:
                    try:
                        with Session(engine) as session:
                            activity = UserActivity(
                                user_email=email,
                                action=f"{request.method} {request.url.path}",
                                details=f"Status: {response.status_code}"
                            )
                            session.add(activity)
                            session.commit()
                    except:
                        pass  # Silenciar errores en tracking
        
        return response

# --- Utilidades Admin ---
admin_env = getenv("ADMIN_EMAILS", "").strip()
ADMIN_EMAILS = set([e.strip().lower() for e in admin_env.split(",") if e.strip()])

# Configuración MercadoPago
MP_ACCESS_TOKEN = getenv("MP_ACCESS_TOKEN", "").strip()
FRONTEND_BASE_URL = getenv("FRONTEND_BASE_URL", "http://127.0.0.1:8004").strip()

def es_admin(email: Optional[str]) -> bool:
    if not email:
        return False
    email_norm = email.lower()
    # Si hay correos configurados en ADMIN_EMAILS, solo esos son admin
    if len(ADMIN_EMAILS) > 0:
        return email_norm in ADMIN_EMAILS
    # Fallback (solo cuando no hay ADMIN_EMAILS): primer usuario (id=1)
    try:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.email == email)).first()
            return bool(user and user.id == 1)
    except Exception:
        return False

def require_admin(authorization: Optional[str]) -> Optional[str]:
    email = extraer_email_del_header(authorization)
    if not email or not es_admin(email):
        raise HTTPException(status_code=403, detail="Admin requerido")
    return email

# Configurar CORS para permitir peticiones del frontend
app.add_middleware(ActivityTrackingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Montar archivos estáticos (CSS, JS, imágenes) ---
static_dir = os.path.join(BASE_DIR, "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Servir carpeta de imágenes si existe en BASE_DIR/imagenes
imagenes_dir = os.path.join(BASE_DIR, "imagenes")
if os.path.isdir(imagenes_dir):
    app.mount("/imagenes", StaticFiles(directory=imagenes_dir), name="imagenes")

# Ruta para favicon.ico
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    favicon_path = os.path.join(static_dir, "favicon.ico")
    if os.path.isfile(favicon_path):
        return FileResponse(favicon_path, media_type="image/x-icon")
    # Si no existe, devolver un 204 No Content en lugar de 404
    from fastapi.responses import Response
    return Response(status_code=204)

# Ruta específica para test_auth.html
@app.get("/test_auth.html")
async def test_auth():
    test_file = os.path.join(BASE_DIR, "test_auth.html")
    if os.path.isfile(test_file):
        return FileResponse(test_file)
    raise HTTPException(status_code=404, detail="test_auth.html not found")

# --- Montar frontend (historias) como aplicación SPA ---
frontend_dir = os.path.join(BASE_DIR, "frontend", "historias")
if os.path.isdir(frontend_dir):
    # Montaje estático para servir archivos y assets
    # StaticFiles con html=True automáticamente sirve index.html para directorios
    app.mount("/app", StaticFiles(directory=frontend_dir, html=True), name="app")

# --- Endpoint de salud ---
@app.get("/api/health", tags=["Infra"])
async def health():
    return {"status": 200, "body": {
        "ok": True,
        "mp_available": MP_AVAILABLE,
        "mp_configured": bool(MP_ACCESS_TOKEN),
        "time": datetime.now(timezone.utc).isoformat()
    }}

# --- 2. Modelos DTO (Pydantic) ---
# Clases que definen los datos de entrada (Input) y salida (Response)

# Modelo de Respuesta Genérica
class Response(BaseModel):
    status: int
    body: Any

# DTOs: Autenticación (Diagramas 2, 3)
class LoginInput(BaseModel):
    email: EmailStr
    contrasena: str

class RecuperacionInput(BaseModel):
    email: EmailStr

class ResetPasswordInput(BaseModel):
    token: str
    nueva_contrasena: str

# ====== Pagos (MercadoPago) DTOs ======
class MPItem(BaseModel):
    title: str
    quantity: int = PydField(gt=0)
    unit_price: float = PydField(gt=0)
    picture_url: Optional[str] = None
    currency_id: Optional[str] = 'CLP'

class MPPreferenceInput(BaseModel):
    items: List[MPItem]
    metadata: Optional[Dict[str, Any]] = None

# ====== Endpoints: Pagos (MercadoPago) ======
@app.post("/api/pagos/crear-preferencia")
def crear_preferencia_mp(pref: MPPreferenceInput, authorization: Optional[str] = Header(default=None)):
    if not MP_AVAILABLE:
        # Permite levantar backend aunque no esté MercadoPago
        raise HTTPException(status_code=503, detail="MercadoPago no disponible en el servidor")
    if not MP_ACCESS_TOKEN:
        raise HTTPException(status_code=503, detail="MercadoPago no configurado: falta MP_ACCESS_TOKEN")

    try:
        sdk = mercadopago.SDK(MP_ACCESS_TOKEN)

        # 1) Crear pedido previo con los items recibidos y el usuario
        user_email = extraer_email_del_header(authorization)
        total = sum([float(it.unit_price) * int(it.quantity) for it in pref.items])
        with Session(engine) as session:
            order = Order(user_email=user_email, total=total)
            session.add(order)
            session.commit()
            session.refresh(order)
            # Agregar items del pedido
            for it in pref.items:
                oi = OrderItem(order_id=order.id, product_id=0, name=it.title, price=float(it.unit_price), quantity=int(it.quantity))
                session.add(oi)
            session.commit()

        # 2) Armar items para la preferencia
        items = []
        for it in pref.items:
            items.append({
                "title": it.title,
                "quantity": int(it.quantity),
                "unit_price": float(it.unit_price),
                "currency_id": it.currency_id or 'CLP',
                **({"picture_url": it.picture_url} if it.picture_url else {})
            })

        preference_data = {
            "items": items,
            "back_urls": {
                "success": f"{FRONTEND_BASE_URL}/app/cuenta/?pago=ok",
                "failure": f"{FRONTEND_BASE_URL}/app/checkout/?pago=fail",
                "pending": f"{FRONTEND_BASE_URL}/app/cuenta/?pago=pending"
            },
            "auto_return": "approved",
            "metadata": {**(pref.metadata or {}), "order_id": order.id}
        }

        result = sdk.preference().create(preference_data)
        resp = result.get("response", {})
        init_point = resp.get("init_point") or resp.get("sandbox_init_point")
        pref_id = resp.get("id")

        if not init_point:
            raise HTTPException(status_code=500, detail="No se obtuvo init_point de MercadoPago")

        return {"status": 200, "body": {"preference_id": pref_id, "init_point": init_point}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando preferencia: {str(e)}")


@app.post("/api/pagos/webhook")
async def mp_webhook(payload: Dict[str, Any] = Body(default_factory=dict)):
    """Webhook de MercadoPago: confirma pago y marca pedido como pagado.
    Espera notificaciones con `type` payment y `data.id` (payment_id).
    """
    if not MP_AVAILABLE or not MP_ACCESS_TOKEN:
        return {"status": 200, "body": {"ok": False, "reason": "mp_not_configured"}}
    try:
        notif_type = payload.get("type") or payload.get("action")
        data_id = None
        if isinstance(payload.get("data"), dict):
            data_id = payload["data"].get("id")
        elif payload.get("resource"):
            # resource URL .../payments/<id>
            try:
                data_id = str(payload.get("resource")).rstrip('/').split('/')[-1]
            except Exception:
                data_id = None
        if notif_type != "payment" or not data_id:
            return {"status": 200, "body": {"ok": True, "ignored": True}}

        sdk = mercadopago.SDK(MP_ACCESS_TOKEN)
        payment = sdk.payment().get(data_id).get("response", {})
        status_mp = payment.get("status")
        metadata = payment.get("metadata", {}) or {}
        order_id = metadata.get("order_id")
        if status_mp == "approved" and order_id:
            with Session(engine) as session:
                order = session.get(Order, int(order_id))
                if order:
                    # Registrar actividad y actualizar vendidos a partir de OrderItem
                    items = session.exec(select(OrderItem).where(OrderItem.order_id == order.id)).all()
                    for it in items:
                        # incrementar vendidos si existe Product
                        prod = session.exec(select(Product).where(Product.nombre == it.name)).first()
                        if prod:
                            # Podríamos mantener un campo vendidos; por simplicidad omitimos si no existe
                            pass
                    session.commit()
            return {"status": 200, "body": {"ok": True, "order_id": order_id, "status": "approved"}}
        return {"status": 200, "body": {"ok": True, "status": status_mp, "order_id": order_id}}
    except Exception as e:
        return {"status": 200, "body": {"ok": False, "error": str(e)}}

# DTOs: Usuarios (Diagrama 1)
class RegistroInput(BaseModel):
    nombre: str
    email: EmailStr
    contrasena: str
    direccion: str

# DTOs: Productos (Diagramas 4, 5, 6)
class ProductoQueryInput(BaseModel):
    pagina: int = 1
    limite: int = 10

class ProductoFilterInput(BaseModel):
    tipo: Optional[List[str]] = PydField(default_factory=list)
    ingredientes: Optional[List[str]] = PydField(default_factory=list)
    beneficios: Optional[List[str]] = PydField(default_factory=list)

class StockInput(BaseModel):
    stock: int = PydField(..., gt=0)

class ProductoCreateInput(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    precio: float = PydField(..., gt=0)
    image: Optional[str] = "/static/imagenes/jugo_tropical.png"
    stock: int = PydField(..., ge=0)
    tipo: Optional[str] = None

class ProductoUpdateInput(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    precio: Optional[float] = PydField(default=None, gt=0)
    image: Optional[str] = None
    stock: Optional[int] = PydField(default=None, ge=0)
    tipo: Optional[str] = None

# DTOs: Carrito (Diagramas 7, 8, 18)
class CarritoItemInput(BaseModel):
    productoId: int
    cantidad: int
    personalizacion: Optional[Dict[str, Any]] = None

class CuponInput(BaseModel):
    codigo: str

# DTOs: Pedidos (Diagrama 9)
class CancelarInput(BaseModel):
    motivo: str
# (Diagramas 11 y 14 no tienen DTO de entrada)

# DTOs: Pagos (Diagrama 10)
class IniciarPagoInput(BaseModel):
    pedidoId: str
    metodoPago: str

# DTOs: Documentos (Diagrama 12)
class EnviarBoletaInput(BaseModel):
    pedidoId: str

# DTOs: Reportes (Diagramas 15, 16)
class ReporteInput(BaseModel):
    fechaInicio: date
    fechaFin: date

class ExportarInput(BaseModel):
    fechaInicio: date
    fechaFin: date
    formato: str

# DTOs: Notificaciones (Diagrama 20)
class NotificacionOfertaInput(BaseModel):
    titulo: str
    mensaje: str
    segmento: str


# --- Modelos de persistencia (SQLModel) ---

class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    descripcion: Optional[str] = None
    precio: float
    image: Optional[str] = None
    stock: int = 0
    tipo: Optional[str] = None


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str
    email: str
    hashed_password: str
    direccion: Optional[str] = None


class CartItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_email: Optional[str] = None
    product_id: int
    name: str
    price: float
    image: Optional[str] = None
    description: Optional[str] = None
    quantity: int = 1


class Order(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_email: Optional[str] = None
    total: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OrderItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: int
    product_id: int
    name: str
    price: float
    quantity: int


class UserSession(SQLModel, table=True):
    """Tabla para rastrear sesiones activas y actividad del usuario"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_email: str
    token: str
    login_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ip_address: Optional[str] = None
    is_active: bool = True


class UserActivity(SQLModel, table=True):
    """Tabla para registrar todas las acciones del usuario"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_email: str
    action: str
    details: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ip_address: Optional[str] = None


class PasswordResetToken(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str
    token_hash: str
    expira: datetime
    usado: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Crear tablas y datos semilla
def create_db_and_seed():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Si no hay productos, insertar algunos de ejemplo
        count = session.exec(select(Product)).all()
        if len(count) == 0:
            sample = [
                Product(nombre="Verde Detox", descripcion="Mezcla purificante", precio=3990, image="/static/imagenes/jugo_verde.png", stock=10, tipo="detox"),
                Product(nombre="Naranja Boost", descripcion="Energía y vitamina C", precio=3990, image="/static/imagenes/jugo_naranja.png", stock=5, tipo="energia"),
                Product(nombre="Rojo Pasión", descripcion="Antioxidante", precio=4290, image="/static/imagenes/jugo_rojo.png", stock=0, tipo="antioxidante"),
                Product(nombre="Amanecer Tropical", descripcion="Dulzura natural", precio=4500, image="/static/imagenes/jugo_tropical.png", stock=15, tipo="energia"),
            ]
            session.add_all(sample)
            session.commit()


# Crear tablas al iniciar la aplicación
@app.on_event("startup")
def on_startup():
    create_db_and_seed()


# --- 3. FUNCIONES HELPER DE SEGURIDAD ---

def verificar_contraseña(plain_password: str, hashed_password: str) -> bool:
    """Verifica una contraseña en texto plano contra su hash con bcrypt
    
    Args:
        plain_password: Contraseña en texto plano
        hashed_password: Contraseña hasheada almacenada en la BD
    
    Returns:
        True si coinciden, False en caso contrario
    """
    return pwd_context.verify(plain_password, hashed_password)


def hashear_contraseña(password: str) -> str:
    """Hashea una contraseña usando bcrypt para almacenarla de forma segura
    
    Args:
        password: Contraseña en texto plano
    
    Returns:
        Contraseña hasheada con bcrypt
    """
    return pwd_context.hash(password)


def crear_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crea un JWT token con expiracion configurable
    
    Args:
        data: Diccionario con los datos a codificar (ej: {"sub": "email@example.com"})
        expires_delta: Timedelta personalizado para expiracion (default: 30 minutos)
    
    Returns:
        Token JWT codificado
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _send_reset_email(to_email: str, reset_link: str) -> bool:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "0") or 0)
    user = os.getenv("SMTP_USER")
    pwd = os.getenv("SMTP_PASS")
    sender = os.getenv("SMTP_FROM", user or "")
    if not host or not port or not sender:
        # Sin SMTP configurado: loguear y retornar False, pero no fallar
        print(f"[RESET] SMTP no configurado. Link para {to_email}: {reset_link}")
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = "Restablecer tu contraseña"
        msg["From"] = sender
        msg["To"] = to_email
        msg.set_content(f"Hola,\n\nPara restablecer tu contraseña, usa este enlace (expira en 30 minutos):\n{reset_link}\n\nSi no solicitaste esto, ignora este mensaje.")
        with smtplib.SMTP(host, port) as server:
            server.starttls()
            if user and pwd:
                server.login(user, pwd)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"[RESET] Error enviando email: {e}. Link: {reset_link}")
        return False


def obtener_email_del_token(token: str) -> Optional[str]:
    """Extrae el email del JWT token validando su firma
    
    Args:
        token: JWT token a decodificar
    
    Returns:
        Email del usuario si el token es válido, None en caso contrario
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError:
        return None


def extraer_email_del_header(authorization: Optional[str]) -> Optional[str]:
    """Extrae el email del JWT token del header Authorization
    
    Args:
        authorization: Header Authorization que puede ser "Bearer <token>" o None
    
    Returns:
        Email del usuario si el token es válido, None en caso contrario
    """
    if not authorization:
        return None
    
    # Extraer token de "Bearer <token>"
    token = None
    if authorization.startswith("Bearer "):
        token = authorization[7:]  # Quitar "Bearer "
    else:
        token = authorization  # Por compatibilidad con tokens directos
    
    return obtener_email_del_token(token)

# --- 3. Definición de Endpoints (Rutas de la API) ---

print("Cargando todos los endpoints de Natural Power...")

# --- Endpoints: Autenticación (/api/auth) ---

@app.post("/api/auth/login", tags=["Autenticación"], response_model=Response)
async def auth_login(input: LoginInput = Body(...)):
    """Diagrama 2: Iniciar sesión - Guarda sesión y actividad"""
    print(f"Intento de login para: {input.email}")
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == input.email)).first()
        if not user:
            # Registrar intento fallido
            activity = UserActivity(
                user_email=input.email,
                action="LOGIN_FALLIDO",
                details="Usuario no encontrado"
            )
            session.add(activity)
            session.commit()
            return Response(status=status.HTTP_401_UNAUTHORIZED, body={"error": "Email o contraseña incorrectos"})
        
        if not verificar_contraseña(input.contrasena, user.hashed_password):
            # Registrar intento fallido
            activity = UserActivity(
                user_email=input.email,
                action="LOGIN_FALLIDO",
                details="Contraseña incorrecta"
            )
            session.add(activity)
            session.commit()
            return Response(status=status.HTTP_401_UNAUTHORIZED, body={"error": "Email o contraseña incorrectos"})

        # Crear token JWT
        token = crear_access_token({"sub": user.email, "user_id": user.id})
        
        # Guardar sesión activa
        user_session = UserSession(
            user_email=user.email,
            token=token,
            is_active=True
        )
        session.add(user_session)
        
        # Registrar login exitoso
        activity = UserActivity(
            user_email=user.email,
            action="LOGIN_EXITOSO",
            details=f"Usuario {user.nombre} inició sesión"
        )
        session.add(activity)
        session.commit()
        
        return Response(status=status.HTTP_200_OK, body={
            "token": token,
            "usuario": {
                "id": user.id,
                "nombre": user.nombre,
                "email": user.email
            }
        })

@app.post("/api/auth/recuperar-password", tags=["Autenticación"], response_model=Response)
async def auth_recuperar_password(input: RecuperacionInput = Body(...)):
    """Solicita un enlace de recuperación (respuesta genérica para evitar enumeración)."""
    email = input.email.lower().strip()
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if user:
            token = secrets.token_urlsafe(48)
            token_hash = _hash_token(token)
            expira = datetime.now(timezone.utc) + timedelta(minutes=30)
            prt = PasswordResetToken(email=email, token_hash=token_hash, expira=expira, usado=False)
            session.add(prt)
            session.commit()
            frontend_base = os.getenv("FRONTEND_BASE_URL", "http://127.0.0.1:8004/app")
            reset_link = f"{frontend_base}/reset/?token={token}"
            _send_reset_email(email, reset_link)
    return Response(status=status.HTTP_200_OK, body={"message": "Si tu correo existe, recibirás un enlace de restablecimiento"})

# --- Endpoints: Usuarios (/api/usuarios) ---

@app.post("/api/usuarios/registrar", tags=["Usuarios"], response_model=Response)
async def usuarios_registrar(input: RegistroInput = Body(...)):
    """Diagrama 1: Registrar nuevo usuario - Guarda actividad"""
    print(f"Registrando nuevo usuario: {input.nombre}")
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == input.email)).first()
        if existing:
            return Response(status=status.HTTP_400_BAD_REQUEST, body={"error": "Email ya registrado"})

        hashed = hashear_contraseña(input.contrasena)
        new_user = User(
            nombre=input.nombre, 
            email=input.email, 
            hashed_password=hashed,
            direccion=input.direccion
        )
        session.add(new_user)
        session.commit()
        session.refresh(new_user)
        
        # Registrar actividad de registro
        activity = UserActivity(
            user_email=new_user.email,
            action="REGISTRO_EXITOSO",
            details=f"Usuario {new_user.nombre} se registró"
        )
        session.add(activity)
        session.commit()

        nuevo_usuario = {"id": new_user.id, "nombre": new_user.nombre, "email": new_user.email}
        return Response(status=status.HTTP_201_CREATED, body=nuevo_usuario)

@app.get("/api/usuarios/me", tags=["Usuarios"], response_model=Response)
async def usuarios_me(authorization: Optional[str] = Header(None)):
    """Obtener información completa del usuario autenticado"""
    email = extraer_email_del_header(authorization)
    if not email:
        return Response(status=status.HTTP_401_UNAUTHORIZED, body={"error": "Autenticación requerida"})
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            return Response(status=status.HTTP_404_NOT_FOUND, body={"error": "Usuario no encontrado"})
        
        # Obtener sesiones activas
        sessions = session.exec(select(UserSession).where(
            UserSession.user_email == email, 
            UserSession.is_active == True
        )).all()
        
        return Response(status=status.HTTP_200_OK, body={
            "id": user.id, 
            "nombre": user.nombre, 
            "email": user.email,
            "direccion": user.direccion,
            "sesiones_activas": len(sessions),
            "es_admin": es_admin(email)
        })

@app.get("/api/usuarios/me/actividad", tags=["Usuarios"], response_model=Response)
async def usuarios_me_actividad(authorization: Optional[str] = Header(None), limite: int = Query(20)):
    """Obtener historial de actividad del usuario autenticado"""
    email = extraer_email_del_header(authorization)
    if not email:
        return Response(status=status.HTTP_401_UNAUTHORIZED, body={"error": "Autenticación requerida"})
    
    with Session(engine) as session:
        actividades = session.exec(
            select(UserActivity)
            .where(UserActivity.user_email == email)
            .order_by(UserActivity.timestamp.desc())
            .limit(limite)
        ).all()
        
        actividad_list = [
            {
                "id": act.id,
                "action": act.action,
                "details": act.details,
                "timestamp": act.timestamp.isoformat(),
            }
            for act in actividades
        ]
        
        return Response(status=status.HTTP_200_OK, body={"actividades": actividad_list})

@app.get("/api/usuarios/me/sesiones", tags=["Usuarios"], response_model=Response)
async def usuarios_me_sesiones(authorization: Optional[str] = Header(None)):
    """Obtener todas las sesiones activas del usuario"""
    email = extraer_email_del_header(authorization)
    if not email:
        return Response(status=status.HTTP_401_UNAUTHORIZED, body={"error": "Autenticación requerida"})
    
    with Session(engine) as session:
        sessions = session.exec(
            select(UserSession)
            .where(UserSession.user_email == email, UserSession.is_active == True)
            .order_by(UserSession.login_time.desc())
        ).all()
        
        sesiones_list = [
            {
                "id": s.id,
                "login_time": s.login_time.isoformat(),
                "last_activity": s.last_activity.isoformat(),
                "is_active": s.is_active
            }
            for s in sessions
        ]
        
        return Response(status=status.HTTP_200_OK, body={"sesiones": sesiones_list})

@app.post("/api/usuarios/me/logout", tags=["Usuarios"], response_model=Response)
async def usuarios_logout(authorization: Optional[str] = Header(None)):
    """Cerrar sesión del usuario autenticado"""
    email = extraer_email_del_header(authorization)
    if not email:
        return Response(status=status.HTTP_401_UNAUTHORIZED, body={"error": "Autenticación requerida"})
    
    with Session(engine) as session:
        # Marcar sesión como inactiva
        sessions = session.exec(
            select(UserSession)
            .where(UserSession.user_email == email, UserSession.is_active == True)
        ).all()
        
        for s in sessions:
            s.is_active = False
        
        # Registrar logout
        activity = UserActivity(
            user_email=email,
            action="LOGOUT",
            details="Usuario cerró sesión"
        )
        session.add(activity)
        session.commit()
        
        return Response(status=status.HTTP_200_OK, body={"mensaje": "Sesión cerrada correctamente"})

@app.get("/api/usuarios/me/puntos", tags=["Usuarios"], response_model=Response)
async def usuarios_get_puntos():
    """Diagrama 17: Consultar puntos de lealtad"""
    user_id = 1 
    print(f"Consultando puntos para usuario: {user_id}")
    return Response(
        status=status.HTTP_200_OK,
        body={"usuarioId": user_id, "puntos": 150}
    )

# --- Endpoints: Productos (/api/productos) ---

@app.get("/api/productos", tags=["Productos"], response_model=Response)
async def productos_query(params: ProductoQueryInput = Depends()): # <- Depends() se usa aquí
    """Diagrama 4: Obtener productos con paginación"""
    print(f"Consultando productos desde DB: Página {params.pagina}, Límite {params.limite}")
    offset = (params.pagina - 1) * params.limite
    with Session(engine) as session:
        statement = select(Product).offset(offset).limit(params.limite)
        results = session.exec(statement).all()
        # Mapear a dict para respuesta
        productos = []
        for p in results:
            productos.append({
                "id": p.id,
                "nombre": p.nombre,
                "name": p.nombre,
                "precio": p.precio,
                "price": p.precio,
                "image": p.image,
                "descripcion": p.descripcion,
                "description": p.descripcion,
                "stock": p.stock,
                "tipo": p.tipo,
            })

    return Response(
        status=status.HTTP_200_OK,
        body=productos
    )

@app.get("/api/productos/filtrar", tags=["Productos"], response_model=Response)
async def productos_filtrar(params: ProductoFilterInput = Depends()): # <- Depends() se usa aquí
    """Diagrama 5: Filtrar productos por criterios"""
    print(f"Filtrando productos por: {params.model_dump_json()}")
    productos_filtrados = [
        {"id": 101, "nombre": "Jugo Detox Verde", "tipo": "jugo", "ingredientes": ["espinaca", "manzana"]}
    ]
    return Response(
        status=status.HTTP_200_OK,
        body=productos_filtrados
    )

@app.put("/api/productos/{id}/stock", tags=["Productos"], response_model=Response)
async def productos_update_stock(id: int = Path(..., gt=0), input: StockInput = Body(...)):
    """Diagrama 6: Actualizar stock de un producto"""
    print(f"Actualizando stock para producto ID {id}: {input.stock}")
    producto_actualizado = {
        "id": id, "stock": input.stock
    }
    return Response(
        status=status.HTTP_200_OK,
        body=producto_actualizado
    )

# --- Endpoints: Carrito (/api/carrito) ---

@app.post("/api/carrito/items", tags=["Carrito"], response_model=Response)
async def carrito_add_item(input: CarritoItemInput = Body(...), authorization: Optional[str] = Header(None)):
    """Añadir item al carrito (persistente) - usa user del token si está presente. Si el producto ya existe, aumenta la cantidad."""
    from fastapi import Header
    print(f"Añadiendo item al carrito: Producto ID {input.productoId}, Cantidad {input.cantidad}")
    user_email = extraer_email_del_header(authorization)

    with Session(engine) as session:
        # Manejo especial para jugos personalizados (productoId = -1)
        if input.productoId == -1:
            # Jugo personalizado
            personalizacion = input.personalizacion or {}
            custom_name = personalizacion.get('customName', 'Jugo Personalizado')
            custom_description = personalizacion.get('customDescription', 'Jugo personalizado')
            custom_price = personalizacion.get('customPrice', 0)
            
            print(f"Jugo personalizado: {custom_name}, ${custom_price}, descripción: {custom_description}")
            print(f"Guardando para usuario: {user_email}")
            
            # Para jugos personalizados, siempre crear un nuevo item (no deduplicar)
            cart_item = CartItem(
                user_email=user_email,
                product_id=-1,  # ID especial para personalizados
                name=custom_name,
                price=custom_price,
                image='/static/imagenes/jugo_tropical.png',
                description=custom_description,
                quantity=input.cantidad
            )
            session.add(cart_item)
            session.commit()
            session.refresh(cart_item)
            
            print(f"Item guardado con ID: {cart_item.id}")
            
            return Response(status=status.HTTP_201_CREATED, body={
                "id": cart_item.id,
                "product_id": cart_item.product_id,
                "name": cart_item.name,
                "price": cart_item.price,
                "image": cart_item.image,
                "quantity": cart_item.quantity,
                "description": custom_description
            })
        
        # Flujo normal para productos regulares
        product = session.get(Product, input.productoId)
        if not product:
            return Response(status=status.HTTP_404_NOT_FOUND, body={"error": "Producto no encontrado"})

        # Deduplicación: si ya existe un item para este usuario y producto, actualizar cantidad
        existing_item = session.exec(
            select(CartItem).where(
                (CartItem.user_email == user_email) & (CartItem.product_id == input.productoId)
            )
        ).first()

        if existing_item:
            # Actualizar cantidad del item existente
            existing_item.quantity += input.cantidad
            session.add(existing_item)
            session.commit()
            session.refresh(existing_item)
            cart_item = existing_item
        else:
            # Crear nuevo item
            cart_item = CartItem(user_email=user_email, product_id=product.id, name=product.nombre, price=product.precio, image=product.image, quantity=input.cantidad)
            session.add(cart_item)
            session.commit()
            session.refresh(cart_item)

        return Response(status=status.HTTP_201_CREATED, body={
            "id": cart_item.id,
            "product_id": cart_item.product_id,
            "name": cart_item.name,
            "price": cart_item.price,
            "image": cart_item.image,
            "quantity": cart_item.quantity,
        })


@app.put("/api/carrito/items/{id}", tags=["Carrito"], response_model=Response)
async def carrito_update_item(id: int = Path(...), input: CarritoItemInput = Body(...), authorization: Optional[str] = Header(None)):
    """Actualizar cantidad de un item del carrito (solo propietario autenticado)."""
    user_email = extraer_email_del_header(authorization)
    if not user_email:
        return Response(status=status.HTTP_401_UNAUTHORIZED, body={"error": "Autenticación requerida"})

    with Session(engine) as session:
        item = session.get(CartItem, id)
        if not item:
            return Response(status=status.HTTP_404_NOT_FOUND, body={"error": "Item no encontrado"})
        if item.user_email != user_email:
            return Response(status=status.HTTP_403_FORBIDDEN, body={"error": "No autorizado"})

        # Validar stock si se proporciona productoId o usar el product_id actual
        prod_id = input.productoId if getattr(input, 'productoId', None) else item.product_id
        product = session.get(Product, prod_id) if prod_id else None
        if product and input.cantidad > product.stock:
            return Response(status=status.HTTP_400_BAD_REQUEST, body={"error": "Stock insuficiente"})

        item.quantity = input.cantidad
        if getattr(input, 'productoId', None):
            item.product_id = input.productoId
        session.add(item)
        session.commit()
        session.refresh(item)

        return Response(status=status.HTTP_200_OK, body={
            "id": item.id,
            "product_id": item.product_id,
            "name": item.name,
            "price": item.price,
            "image": item.image,
            "quantity": item.quantity,
        })

@app.post("/api/carrito/aplicar-cupon", tags=["Carrito"], response_model=Response)
async def carrito_aplicar_cupon(input: CuponInput = Body(...)):
    """Diagrama 18: Aplicar cupón de descuento"""
    print(f"Aplicando cupón: {input.codigo}")
    if input.codigo.upper() == "NATURAL10":
        carrito_actualizado = {
            "id": 1, "total_anterior": 10000, "descuento": 1000, "total_nuevo": 9000
        }
        return Response(
            status=status.HTTP_200_OK,
            body=carrito_actualizado
        )
    return Response(
        status=status.HTTP_404_NOT_FOUND,
        body={"error": "Cupón no válido o expirado"}
    )


@app.get("/api/carrito", tags=["Carrito"], response_model=Response)
async def carrito_get_items(authorization: Optional[str] = Header(None)):
    """Obtener items del carrito para el usuario autenticado. Si no hay usuario, devuelve lista vacía."""
    user_email = extraer_email_del_header(authorization)
    if not user_email:
        return Response(status=status.HTTP_200_OK, body=[])

    with Session(engine) as session:
        items = session.exec(select(CartItem).where(CartItem.user_email == user_email)).all()
        body = []
        for it in items:
            body.append({
                "id": it.id,
                "product_id": it.product_id,
                "name": it.name,
                "price": it.price,
                "image": it.image,
                "quantity": it.quantity,
                "description": it.description or "",
            })
    return Response(status=status.HTTP_200_OK, body=body)


@app.delete("/api/carrito/items/{id}", tags=["Carrito"], response_model=Response)
async def carrito_delete_item(id: int = Path(...), authorization: Optional[str] = Header(None)):
    """Eliminar item del carrito (si pertenece al usuario autenticado)."""
    user_email = extraer_email_del_header(authorization)
    with Session(engine) as session:
        item = session.get(CartItem, id)
        if not item:
            return Response(status=status.HTTP_404_NOT_FOUND, body={"error": "Item no encontrado"})
        if item.user_email != user_email:
            return Response(status=status.HTTP_403_FORBIDDEN, body={"error": "No autorizado"})
        session.delete(item)
        session.commit()
    return Response(status=status.HTTP_200_OK, body={"deleted": id})

# --- Endpoints: Pedidos (/api/pedidos) ---

@app.put("/api/pedidos/{id}/cancelar", tags=["Pedidos"], response_model=Response)
async def pedidos_cancelar(id: str = Path(...), input: CancelarInput = Body(...)):
    """Diagrama 9: Cancelar un pedido"""
    print(f"Cancelando pedido ID {id}. Motivo: {input.motivo}")
    pedido_cancelado = {
        "id": id, "estado": "Cancelado"
    }
    return Response(
        status=status.HTTP_200_OK,
        body=pedido_cancelado
    )

@app.post("/api/auth/reset-password", tags=["Autenticación"], response_model=Response)
async def auth_reset_password(input: ResetPasswordInput = Body(...)):
    """Restablecer contraseña usando un token de un solo uso."""
    now = datetime.now(timezone.utc)
    token_hash = _hash_token(input.token)
    with Session(engine) as session:
        prt = session.exec(
            select(PasswordResetToken)
            .where(PasswordResetToken.token_hash == token_hash)
            .order_by(PasswordResetToken.created_at.desc())
        ).first()
        if (not prt) or prt.usado or prt.expira < now:
            return Response(status=status.HTTP_400_BAD_REQUEST, body={"error": "Token inválido o expirado"})
        user = session.exec(select(User).where(User.email == prt.email)).first()
        if not user:
            return Response(status=status.HTTP_400_BAD_REQUEST, body={"error": "Token inválido o expirado"})
        user.hashed_password = hashear_contraseña(input.nueva_contrasena)
        prt.usado = True
        session.add(user)
        session.add(prt)
        # Revocar sesiones activas
        sesiones = session.exec(select(UserSession).where(UserSession.user_email == user.email, UserSession.is_active == True)).all()
        for s in sesiones:
            s.is_active = False
            session.add(s)
        session.commit()
        return Response(status=status.HTTP_200_OK, body={"message": "Contraseña actualizada"})

@app.put("/api/pedidos/{id}/confirmar-pago", tags=["Pedidos"], response_model=Response)
async def pedidos_confirmar_pago(id: str = Path(...)):
    """Diagrama 11: Confirmar pago (Webhook)"""
    print(f"Confirmando pago para pedido ID {id}.")
    pedido_confirmado = {
        "id": id, "estado": "Pagado", "timestamp_pago": datetime.now()
    }
    return Response(
        status=status.HTTP_200_OK,
        body=pedido_confirmado
    )

@app.get("/api/pedidos/{id}/seguimiento", tags=["Pedidos"], response_model=Response)
async def pedidos_seguimiento(id: str = Path(...)):
    """Diagrama 14: Obtener seguimiento de pedido"""
    print(f"Consultando seguimiento para pedido ID {id}.")
    seguimiento_info = {
        "id": id, "estado": "En preparación", "horaEstimada": time(14, 30)
    }
    return Response(
        status=status.HTTP_200_OK,
        body=seguimiento_info
    )

# --- Endpoints: Pagos (/api/pagos) ---

@app.post("/api/pagos/iniciar-transaccion", tags=["Pagos"], response_model=Response)
async def pagos_iniciar(input: IniciarPagoInput = Body(...)):
    """Diagrama 10: Iniciar transacción de pago"""
    print(f"Iniciando pago para Pedido ID {input.pedidoId} con {input.metodoPago}")
    total_pedido = 12500.0
    link_pago = f"https://pasarela.pago.cl/pagar?id={input.pedidoId}&monto={total_pedido}"
    
    return Response(
        status=status.HTTP_201_CREATED,
        body={"url_pago": link_pago, "transaccion_id": "txn_123abc"}
    )


class PedidoInput(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None

class ResetPasswordInput(BaseModel):
    token: str
    nueva_contrasena: str


@app.post("/api/pedidos", tags=["Pedidos"], response_model=Response)
async def crear_pedido(input: PedidoInput = Body(...), authorization: Optional[str] = Header(None)):
    """Crear un pedido a partir del carrito del usuario autenticado.
    - Prioriza el email del token. Si no hay token, usa input.email.
    - Campos del input son opcionales para evitar 422 si la UI no los envía.
    """
    try:
        token_email = extraer_email_del_header(authorization)
        user_email = (token_email or (input.email if input and input.email else None))
        if not user_email:
            return Response(status=status.HTTP_401_UNAUTHORIZED, body={"error": "Autenticación requerida"})

        with Session(engine) as session:
            items = session.exec(select(CartItem).where(CartItem.user_email == user_email)).all()
            print(f"[PEDIDO] Crear pedido para {user_email} - items={len(items) if items else 0}")
            if not items:
                return Response(status=status.HTTP_400_BAD_REQUEST, body={"error": "Carrito vacío"})

            total = sum([float(it.price) * int(it.quantity) for it in items])
            order = Order(user_email=user_email, total=total)
            session.add(order)
            session.commit()
            session.refresh(order)

            for it in items:
                oi = OrderItem(order_id=order.id, product_id=it.product_id, name=it.name, price=it.price, quantity=it.quantity)
                session.add(oi)
                # Reducir stock si corresponde
                prod = session.get(Product, it.product_id)
                if prod:
                    prod.stock = max(0, int(prod.stock) - int(it.quantity))
                    session.add(prod)

            # Limpiar carrito
            for it in items:
                session.delete(it)

            session.commit()

            # Preparar respuesta segura (serializable)
            body = {"id": order.id, "total": float(order.total), "created_at": order.created_at.isoformat()}

        return Response(status=status.HTTP_201_CREATED, body=body)
    except Exception as e:
        print(f"[PEDIDO][ERROR] {e}")
        return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR, body={"error": "No se pudo crear el pedido"})

@app.get("/api/pedidos", tags=["Pedidos"], response_model=Response)
async def obtener_pedidos_usuario(authorization: Optional[str] = Header(None)):
    """Obtener todos los pedidos del usuario autenticado."""
    user_email = extraer_email_del_header(authorization)
    if not user_email:
        return Response(status=status.HTTP_401_UNAUTHORIZED, body={"error": "Autenticación requerida"})
    
    with Session(engine) as session:
        orders = session.exec(select(Order).where(Order.user_email == user_email).order_by(Order.created_at.desc())).all()
        
        result = []
        for order in orders:
            # Obtener items del pedido
            items = session.exec(select(OrderItem).where(OrderItem.order_id == order.id)).all()
            
            result.append({
                "id": order.id,
                "total": order.total,
                "created_at": order.created_at.isoformat(),
                "items": [{
                    "name": item.name,
                    "price": item.price,
                    "quantity": item.quantity
                } for item in items]
            })
        
        return Response(status=status.HTTP_200_OK, body=result)

# --- Endpoints: Documentos (/api/boletas) ---

@app.post("/api/boletas/enviar-email", tags=["Documentos"], response_model=Response)
async def documentos_enviar_boleta(input: EnviarBoletaInput = Body(...)):
    """Diagrama 12: Enviar boleta por email"""
    print(f"Generando y enviando boleta para Pedido ID {input.pedidoId}")
    boleta_generada = {
        "id": 901, "pedidoId": input.pedidoId, "numero": "B-001234", "pdfUrl": "https://storage.azure.com/boletas/B-001234.pdf", "email_enviado": True
    }
    return Response(
        status=status.HTTP_200_OK,
        body=boleta_generada
    )

# --- Endpoints: Reportes (/api/reportes) ---

@app.get("/api/reportes/ventas", tags=["Reportes"], response_model=Response)
async def reportes_ventas(params: ReporteInput = Depends()): # <- Depends() se usa aquí
    """Diagrama 15: Obtener reporte de ventas (JSON)"""
    print(f"Generando reporte de ventas desde {params.fechaInicio} hasta {params.fechaFin}")
    reporte_data = {
        "rango_fechas": f"{params.fechaInicio} a {params.fechaFin}",
        "total_ventas": 1500000.0,
        "pedidos_completados": 120
    }
    return Response(
        status=status.HTTP_200_OK,
        body=reporte_data
    )

@app.get("/api/reportes/ventas/exportar", tags=["Reportes"], response_model=Response)
async def reportes_exportar_ventas(params: ExportarInput = Depends()): # <- Depends() se usa aquí
    """Diagrama 16: Exportar reporte de ventas (Archivo)"""
    print(f"Exportando reporte de ventas ({params.formato}) desde {params.fechaInicio} hasta {params.fechaFin}")
    respuesta_archivo = {
        "formato": params.formato,
        "url_descarga": f"https://storage.azure.com/reportes/ventas_{params.fechaInicio}_{params.fechaFin}.{params.formato}",
        "expira": "2025-11-03T22:00:00Z"
    }
    return Response(
        status=status.HTTP_200_OK,
        body=respuesta_archivo
    )

# --- Endpoints: Notificaciones (/api/notificaciones) ---

@app.post("/api/notificaciones/ofertas", tags=["Notificaciones"], response_model=Response)
async def notificaciones_enviar_oferta(input: NotificacionOfertaInput = Body(...)):
    """Diagrama 20: Enviar notificaciones push/email de ofertas"""
    print(f"Enviando notificación de oferta '{input.titulo}' al segmento '{input.segmento}'")
    notificacion_creada = {
        "id": 801, "titulo": input.titulo, "mensaje": input.mensaje, "estado": "Enviada"
    }
    return Response(
        status=status.HTTP_201_CREATED,
        body=notificacion_creada
    )

# --- Endpoints: Admin (/api/admin) ---

@app.get("/api/admin/productos", tags=["Admin"], response_model=Response)
async def admin_get_productos(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    """Obtener todos los productos con stock actual para el panel admin"""
    with Session(engine) as session:
        productos = session.exec(select(Product)).all()
        productos_list = []
        for p in productos:
            productos_list.append({
                "id": p.id,
                "nombre": p.nombre,
                "precio": p.precio,
                "stock": p.stock,
                "image": p.image,
                "descripcion": p.descripcion,
                "tipo": p.tipo,
            })
        return Response(status=status.HTTP_200_OK, body=productos_list)


@app.post("/api/admin/productos", tags=["Admin"], response_model=Response)
async def admin_create_producto(input: ProductoCreateInput, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    """Crear nuevo producto desde el panel admin"""
    with Session(engine) as session:
        nuevo_producto = Product(
            nombre=input.nombre,
            descripcion=input.descripcion,
            precio=input.precio,
            image=input.image,
            stock=input.stock,
            tipo=input.tipo
        )
        session.add(nuevo_producto)
        session.commit()
        session.refresh(nuevo_producto)
        return Response(status=status.HTTP_201_CREATED, body={
            "id": nuevo_producto.id,
            "nombre": nuevo_producto.nombre,
            "descripcion": nuevo_producto.descripcion,
            "precio": nuevo_producto.precio,
            "image": nuevo_producto.image,
            "stock": nuevo_producto.stock,
            "tipo": nuevo_producto.tipo
        })


@app.put("/api/admin/productos/{id}", tags=["Admin"], response_model=Response)
async def admin_update_producto(id: int = Path(..., gt=0), input: ProductoUpdateInput = Body(...), authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    """Actualizar un producto (campos parciales)"""
    with Session(engine) as session:
        producto = session.get(Product, id)
        if not producto:
            return Response(status=status.HTTP_404_NOT_FOUND, body={"error": "Producto no encontrado"})
        # Aplicar solo campos provistos
        if input.nombre is not None:
            producto.nombre = input.nombre
        if input.descripcion is not None:
            producto.descripcion = input.descripcion
        if input.precio is not None:
            producto.precio = input.precio
        if input.image is not None:
            producto.image = input.image
        if input.stock is not None:
            producto.stock = input.stock
        if input.tipo is not None:
            producto.tipo = input.tipo
        session.add(producto)
        session.commit()
        session.refresh(producto)
        return Response(status=status.HTTP_200_OK, body={
            "id": producto.id,
            "nombre": producto.nombre,
            "precio": producto.precio,
            "stock": producto.stock,
            "image": producto.image,
            "descripcion": producto.descripcion,
            "tipo": producto.tipo
        })


@app.delete("/api/admin/productos/{id}", tags=["Admin"], response_model=Response)
async def admin_delete_producto(id: int = Path(..., gt=0), authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    """Eliminar un producto"""
    with Session(engine) as session:
        producto = session.get(Product, id)
        if not producto:
            return Response(status=status.HTTP_404_NOT_FOUND, body={"error": "Producto no encontrado"})
        
        session.delete(producto)
        session.commit()
        return Response(status=status.HTTP_200_OK, body={"message": f"Producto {id} eliminado"})


@app.get("/api/admin/usuarios", tags=["Admin"], response_model=Response)
async def admin_get_usuarios(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    """Obtener todos los usuarios registrados para el panel admin"""
    with Session(engine) as session:
        usuarios = session.exec(select(User)).all()
        usuarios_list = []
        for u in usuarios:
            usuarios_list.append({
                "id": u.id,
                "nombre": u.nombre,
                "email": u.email,
                "registered": u.id,  # Usar id como proxy para orden de registro
                "status": "Activo",
            })
        return Response(status=status.HTTP_200_OK, body=usuarios_list)


@app.get("/api/admin/dashboard", tags=["Admin"], response_model=Response)
async def admin_dashboard(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    """Obtener estadísticas del dashboard admin"""
    with Session(engine) as session:
        # Contar usuarios, pedidos y calcular ingresos
        total_usuarios = session.exec(select(User)).all()
        total_orders = session.exec(select(Order)).all()
        
        total_revenue = 0.0
        for order in total_orders:
            total_revenue += order.total
        
        return Response(status=status.HTTP_200_OK, body={
            "revenue": total_revenue,
            "orders": len(total_orders),
            "newUsers": len(total_usuarios),
        })

# --- Endpoint: Raíz ---

@app.get("/", tags=["Root"])
async def read_root():
    """Endpoint de bienvenida"""
    return {"message": "Bienvenido a la API de Natural Power (Versión Monolito)"}

# --- 4. Ejecución del Servidor ---

if __name__ == "__main__":
    print("Iniciando servidor uvicorn en http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
