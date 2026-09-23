#!/bin/bash 
@echo off
cd /d "%~dp0"
start "" cmd /c "python -m http.server 8000"
timeout /t 2 >nul
start "" http://localhost:8000