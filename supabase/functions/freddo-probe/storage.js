// Only a missing object is a negative lookup. Never hide authorization,
// bucket configuration or service failures as a missing completion marker.
export async function readProbeObject(bucket, path) {
  const { data, error } = await bucket.download(path);
  if (error) {
    const code = error.code ?? error.error;
    const status = String(error.statusCode ?? error.status);
    if (code === 'NoSuchKey' || (['400', '404'].includes(status) && error.message === 'Object not found')) return null;
    throw new Error('Download failed');
  }
  if (!data) throw new Error('Download returned no data');
  return new Uint8Array(await data.arrayBuffer());
}
