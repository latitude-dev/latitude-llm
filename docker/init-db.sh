#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE latitude_production;
    CREATE DATABASE latitude_development;
    CREATE DATABASE latitude_test;
    CREATE DATABASE temporal;
EOSQL
