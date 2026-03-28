$env:ADMIN_API_KEY = 'local-admin-key'
$env:FIREBASE_SERVICE_ACCOUNT_PATH = 'C:\dev\secrets\web-wrapper-delivery-driver-firebase-adminsdk-fbsvc-9a8e5ea54c.json'
Set-Location $PSScriptRoot
npm start
