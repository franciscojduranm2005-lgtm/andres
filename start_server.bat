@echo off
echo ══════════════════════════════════════════════════════════
echo   CONECTADOS EXPRESS - Background Removal Server
echo ══════════════════════════════════════════════════════════
echo.

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python no está instalado. Instálalo desde https://python.org
    pause
    exit /b
)

:: Install dependencies if needed
echo 📦 Verificando dependencias...
pip install -r "%~dp0requirements.txt" -q

echo.
echo ✨ Iniciando servidor de remoción de fondo...
echo    Abre el admin panel y el servidor procesará las imágenes.
echo    Presiona Ctrl+C para detener.
echo.

python "%~dp0bg_server.py"
pause
