@echo off
title Uninstall TERA Proxy
cd /d "%~dp0"

sc stop windivert > NUL
sc delete windivert > NUL
if %errorlevel% == 5 (
	echo Access denied. Right click Uninstall.bat and select 'Run as administrator'.
	pause
	exit
)

echo Driver unloaded successfully. You may now delete TERA Proxy.
pause