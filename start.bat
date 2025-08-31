@echo off
echo Starting Discord Bot Panel...
echo.

echo Starting main bot...
start "Main Bot" cmd /k "npm start"

timeout /t 3 /nobreak > nul

echo Starting Arma 3 status bot...
start "Arma 3 Bot" cmd /k "npm run arma-bot"

echo.
echo Both bots are starting...
echo Web panel will be available at http://localhost:3000
echo.
pause