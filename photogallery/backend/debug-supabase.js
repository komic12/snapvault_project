require('dotenv').config();
const db = require('./database');
const { createClient } = require('@supabase/supabase-js');
const bucket = process.env.SUPABASE_STORAGE_BUCKET;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('bucket=', bucket);
console.log('url=', url);
console.log('keySet=', !!key);
const supabase = createClient(url, key);
const image = db.prepare('SELECT id, folder_id, filename, original_name, created_at FROM images ORDER BY created_at DESC LIMIT 1').get();
if (!image) {
  console.log('NO IMAGE');
  process.exit(0);
}
console.log('image=', image);
(async () => {
  try {
    const listRes = await supabase.storage.from(bucket).list(`${image.folder_id}`);
    console.log('listRes=', JSON.stringify(listRes, null, 2));
  } catch (e) {
    console.error('listRes error=', e);
  }
  try {
    const signed = await supabase.storage.from(bucket).createSignedUrl(`${image.folder_id}/${image.filename}`, 60);
    console.log('signed=', JSON.stringify(signed, null, 2));
  } catch (e) {
    console.error('signed error=', e);
  }
  try {
    const download = await supabase.storage.from(bucket).download(`${image.folder_id}/${image.filename}`);
    console.log('download=', JSON.stringify({ error: download.error, dataType: download.data && typeof download.data }, null, 2));
    if (download.data) {
      const buf = Buffer.from(await download.data.arrayBuffer());
      console.log('download len=', buf.length, 'head=', buf.slice(0, 16).toString('hex'));
    }
  } catch (e) {
    console.error('download exception=', e);
  }
})();
