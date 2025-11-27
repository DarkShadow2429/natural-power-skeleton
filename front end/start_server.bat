@echo off
setlocal EnableExtensions
REM Ir a la carpeta de este script (maneja rutas con espacios)
cd /d "%~dp0"

REM Variables de entorno por defecto
set "HOST=127.0.0.1"
set "PORT=8004"
set "PYTHONPATH=%cd%"

REM Detectar puerto libre automáticamente empezando en PORT
for /f "tokens=2 delims=:" %%A in ("%PORT%") do set "_start_port=%%A"
if not defined _start_port set "_start_port=%PORT%"

setlocal EnableDelayedExpansion
set "_port=!_start_port!"
:find_free_port
REM Comprueba si el puerto está en uso; si está en uso, incrementa
netstat -ano | findstr /r ":!_port! .*LISTENING" >nul
if not errorlevel 1 (
  set /a _port+=1
  goto find_free_port
)
endlocal & set "PORT=%_port%"
echo Usando HOST=%HOST% PORT=%PORT%

REM Preferir Python del entorno virtual si existe
if exist ".venv\Scripts\python.exe" (
    echo Usando Python del entorno virtual .venv
    set "PYEXE=.venv\Scripts\python.exe"
) else if exist "%LocalAppData%\Microsoft\WindowsApps\python3.11.exe" (
    echo Usando Python del sistema (WindowsApps python3.11.exe)
    set "PYEXE=%LocalAppData%\Microsoft\WindowsApps\python3.11.exe"
) else (
    echo Intentando con el lanzador py -3.11
    set "PYEXE=py -3.11"
)

REM Ejecutar servidor con variables HOST/PORT
if "%PYEXE%"=="py -3.11" (
    py -3.11 run_server.py
) else (
    "%PYEXE%" run_server.py
)

pause
