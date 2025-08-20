#!/bin/bash

SCRIPT_DIR=$(dirname "$(realpath "$0")")
PACKAGE_VERSION=$(jq -r .version "${SCRIPT_DIR}/package.json")

echo "Creating tag for version v${PACKAGE_VERSION}..."
git tag "v${PACKAGE_VERSION}" HEAD
git push --tags
