#!/bin/bash

# Generate log files for testing
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/test_logs"
LOG_LEVELS=("INFO" "WARNING" "ERROR")
LOGGED_FILES=("chrome/browser/file1.cpp" "chrome/browser/file2.cpp" "chrome/browser/file3.cpp" "")
LOG_MESSAGES=(
    "Some random log message"
    "Warning! Something is happening"
    "Fatal failure!"
    "Log message"
    "It's ok"
    "Error, but I'm a flaky bug to ignore!"
)

# Trim "${LOG_FILE}"
true > "${LOG_FILE}"

while true; do
    LOG_LEVEL=${LOG_LEVELS[RANDOM % ${#LOG_LEVELS[@]}]}
    LOGGED_FILE=${LOGGED_FILES[RANDOM % ${#LOGGED_FILES[@]}]}
    LOG_MESSAGE=${LOG_MESSAGES[RANDOM % ${#LOG_MESSAGES[@]}]}
    TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[${TIMESTAMP}] [${LOG_LEVEL}] [${LOGGED_FILE}] ${LOG_MESSAGE}" >> "${LOG_FILE}"
    sleep "$(awk -v r=$RANDOM 'BEGIN { printf "%.1f", (r % 10) * 0.1 }')"
done