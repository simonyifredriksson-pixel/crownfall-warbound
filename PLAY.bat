@echo off
REM Starts Crownfall: Warbound. The game uses ES modules, which browsers refuse to load
REM straight off the disk, so it has to be served over http.
cd /d "%~dp0"
echo.
echo   CROWNFALL: WARBOUND
echo   ------------------
echo   Opening http://localhost:8080
echo.
echo   Leave this window open while you play. Close it to stop.
echo.
start "" http://localhost:8080
python -m http.server 8080
