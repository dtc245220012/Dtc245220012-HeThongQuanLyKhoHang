#!/bin/bash
set -euo pipefail
# MySQL initialization runs ONLY when data volume is first created.
# Quote-safe base64url passwords (>=24 chars) are enforced at startup.
if [[ ! "$MYSQL_EXPORTER_PASSWORD" =~ ^[a-zA-Z0-9_-]{24,}$ ]]; then
  echo 'MYSQL_EXPORTER_PASSWORD: use at least 24 [a-zA-Z0-9_-] characters' >&2
  exit 1
fi
mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS 'exporter'@'%' IDENTIFIED BY '${MYSQL_EXPORTER_PASSWORD}' WITH MAX_USER_CONNECTIONS 3;
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'%';
SQL
