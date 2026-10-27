@echo off
title Essence Autoroute - Waze Guide
echo ========================================================
echo   Lancement de l'application Essence Autoroute
echo ========================================================
cd /d "%~dp0"
python serve.py
pause
