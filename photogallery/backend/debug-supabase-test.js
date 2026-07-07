require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const bucket = process.env.SUPABASE_STORAGE_BUCKET;
(async () => {
  console.log('bucket', bucket);
  const uploadResult = await supabase.storage.from(bucket).upload('debug/test-supa.txt', Buffer.from('supa-test'), { upsert: true });
  console.log('upload', JSON.stringify(uploadResult, null, 2));
  const listResult = await supabase.storage.from(bucket).list('debug', { limit: 100, offset: 0 });
  console.log('list debug', JSON.stringify(listResult, null, 2));
  const downloadResult = await supabase.storage.from(bucket).download('debug/test-supa.txt');
  console.log('download', JSON.stringify({error:downloadResult.error, dataType: downloadResult.data && typeof downloadResult.data}, null,2));
  if (downloadResult.data) {
    const buf = Buffer.from(await downloadResult.data.arrayBuffer());
    console.log('download len', buf.length, 'text', buf.toString());
  }
  process.exit(0);
})();
