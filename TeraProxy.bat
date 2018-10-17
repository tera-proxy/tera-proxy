@echo off
title TERA Proxy
cd /d "%~dp0"

where node > NUL 2> NUL
if %errorlevel% NEQ 0 (
	echo Node.JS not found.
	echo Please install the latest Current from https://nodejs.org/
	pause
	exit
)

node --harmony-bigint -e "" 2> NUL
if %errorlevel% NEQ 0 (
	echo Your version of Node.JS is outdated.
	echo Please install the latest Current from https://nodejs.org/
	pause
	exit
)

if not exist ./bin/config.json (
	echo Please select your gameserver region in the prompt and press OK.
	start /wait server-select
	cls
)

node --harmony-bigint .
pause