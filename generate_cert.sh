#!/bin/bash

openssl req -x509 -newkey rsa:4096 -keyout key.pem -out 2cert.pem -days 365 -nodes