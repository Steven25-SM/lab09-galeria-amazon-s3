# Laboratorio 09 - Galería privada Amazon S3

Frontend HTML/CSS/JS + Node.js 20+ + Express + AWS SDK v3. Subida directa mediante URL prefirmada, listados privados y borrado lógico con versionado. Endpoint de eliminación: DELETE /api/images/:key (con la clave URL-encoded).

## Requisitos
- Cuenta AWS, bucket `us-east-1` privado con CORS para http://localhost:3000.
- AWS CLI con perfil `app-user` que tenga ListBucket, GetObject, PutObject y DeleteObject en el bucket/prefijo correspondiente.
- Node.js 20+ y npm.

## Iniciar en PowerShell
```powershell
cd backend
Copy-Item .env.example .env
notepad .env
npm install
$env:AWS_PROFILE='app-user'
npm start
```
Abre http://localhost:3000. No uses Live Server; Express sirve frontend y API desde el mismo origen.

## Configuracion AWS
En carpeta `aws/` hay plantillas para política IAM, política HTTPS, CORS y lifecycle. Reemplaza `REEMPLAZAR_BUCKET` antes de aplicarlas. Para CORS pega el array JSON desde la consola S3. Configura SSE-S3 como cifrado predeterminado y versionado habilitado.

## Seguridad y alcance
No hay autenticación de usuarios finales: aplicación educativa que **solo escucha en localhost**. Nunca exponer el puerto 3000 directamente a Internet. Las URLs prefirmadas son secretos temporales. La validación posterior a la subida comprueba los **metadatos** de S3, pero NO los bytes mágicos del archivo; una aplicación productiva necesita inspección de contenido/antivirus y controles adicionales (por ejemplo, cuarentena y procesado en backend/Lambda). Aunque se valida el tamaño informado antes de firmar, la URL PUT no limita criptográficamente la carga al tamaño declarado; se verifica el tamaño real al confirmar. Sin autenticación, no desplegar esta API pública.

## Posible problema con claves AWS
El backend usa el proveedor de credenciales predeterminado del SDK: selecciona el perfil CLI `app-user` configurando `AWS_PROFILE`. No copies claves al repo ni a archivos frontend.

## Versionado y eliminación
El DELETE estándar produce un delete marker y las versiones antiguas permanecen almacenadas. Lifecycle configura expiración de versiones no actuales a 365 días, no garantiza recuperación de un objeto borrado a 30 días: para una política de retención de al menos 30 días sin intervención se requieren medidas adicionales adecuadas al caso (por ejemplo Object Lock, con costos y configuración específica).
