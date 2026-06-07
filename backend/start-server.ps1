$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5432/insta_growth"
$env:JWT_SECRET = "ig-dev-secret-change-in-production"
$env:OWNER_EMAIL = "admin@instagrowth.com"

Set-Location -LiteralPath "D:\insta\backend"
node server.js
