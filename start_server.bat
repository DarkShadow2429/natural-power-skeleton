@echo off
setlocal
:: Ir a la carpeta de este script (maneja rutas con espacios)
cd /d "%~dp0"

:: Variables de entorno por defecto
set "HOST=127.0.0.1"
set "PORT=8004"
set "PYTHONPATH=%cd%"

:: Preferir Python del entorno virtual si existe
if exist ".venv\Scripts\python.exe" (
    echo Usando Python del entorno virtual .venv
    ".venv\Scripts\python.exe" run_server.py
) else if exist "%LocalAppData%\Microsoft\WindowsApps\python3.11.exe" (
    echo Usando Python del sistema (WindowsApps python3.11.exe)
    "%LocalAppData%\Microsoft\WindowsApps\python3.11.exe" run_server.py
) else (
    echo Intentando con el lanzador py -3.11
    py -3.11 run_server.py
)

pause
