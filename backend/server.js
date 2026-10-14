require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false }));
const region = process.env.AWS_REGION || 'us-east-1';
const bucket = process.env.S3_BUCKET;
if (!bucket) throw new Error('Falta S3_BUCKET en .env');
const s3 = new S3Client({ region });
const permitted = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 5 * 1024 * 1024;
const prefix = 'originales/';
const apiError = (res, status, message) => res.status(status).json({ error: message });
const safeKey = (key) => typeof key === 'string' && key.startsWith(prefix) && key.length > prefix.length && !key.includes('..') && !key.includes('\\') && !key.includes('//');
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.post('/api/upload-url', asyncRoute(async (req, res) => {
  const { filename, contentType, sizeBytes } = req.body || {};
  if (typeof filename !== 'string' || filename.length < 1 || filename.length > 160) return apiError(res, 400, 'Nombre de archivo invalido');
  if (!permitted.has(contentType)) return apiError(res, 400, 'Tipo de archivo no permitido');
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes >= maxBytes) return apiError(res, 400, 'El archivo debe pesar menos de 5 MB');
  const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[contentType];
  const key = `${prefix}${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`;
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ServerSideEncryption: 'AES256' });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });
  res.json({ uploadUrl, key, expiresIn: 300, headers: { 'Content-Type': contentType, 'x-amz-server-side-encryption': 'AES256' } });
}));

app.post('/api/validate-upload', asyncRoute(async (req, res) => {
  const { key, contentType } = req.body || {};
  if (!safeKey(key) || !permitted.has(contentType)) return apiError(res, 400, 'Datos invalidos');
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const valid = head.ContentLength > 0 && head.ContentLength < maxBytes && head.ContentType === contentType;
  if (!valid) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return apiError(res, 400, 'Archivo rechazado tras verificar metadatos en S3');
  }
  res.json({ valid: true, size: head.ContentLength });
}));

app.get('/api/images', asyncRoute(async (req, res) => {
  const objects = [];
  let token;
  do {
    const result = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const item of result.Contents || []) if (item.Key !== prefix && (item.Size || 0) > 0) objects.push(item);
    token = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (token && objects.length < 300);
  objects.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
  const images = await Promise.all(objects.slice(0, 300).map(async item => ({
    key: item.Key, size: item.Size, lastModified: item.LastModified,
    url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: item.Key }), { expiresIn: 900 })
  })));
  res.json(images);
}));

// Ruta literal exigida por la guia: la clave se pasa codificada como un segmento URL.
app.delete('/api/images/:key', asyncRoute(async (req, res) => {
  const key = req.params.key;
  if (!safeKey(key)) return apiError(res, 400, 'Clave de imagen invalida');
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  res.json({ deleted: true, key });
}));

app.delete('/api/images', asyncRoute(async (req, res) => {
  const key = req.query.key;
  if (!safeKey(key)) return apiError(res, 400, 'Clave de imagen invalida');
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  res.json({ deleted: true, key });
}));

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use((err, req, res, next) => {
  console.error(err.name, err.message);
  res.status(err.$metadata?.httpStatusCode || 500).json({ error: 'No se pudo completar la operacion; revise permisos y configuracion de AWS.' });
});
app.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Galeria disponible: http://localhost:${process.env.PORT || 3000}`));
