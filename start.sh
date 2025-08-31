#!/bin/bash
echo "Starting Discord Bot Panel..."
echo

echo "Starting main bot..."
npm start &
MAIN_PID=$!

sleep 3

echo "Starting Arma 3 status bot..."
npm run arma-bot &
ARMA_PID=$!

echo
echo "Both bots are running..."
echo "Main Bot PID: $MAIN_PID"
echo "Arma 3 Bot PID: $ARMA_PID"
echo "Web panel available at http://localhost:3000"
echo
echo "Press Ctrl+C to stop all processes"

# Wait for user interrupt
trap "echo 'Stopping bots...'; kill $MAIN_PID $ARMA_PID; exit" INT
wait