require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bucket = process.env.SUPABASE_STORAGE_BUCKET;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);
const paths = ['', '4', '5', '4/'];
(async () => {
  console.log('bucket=', bucket);
  for (const p of paths) {
    console.log('\nLIST path=' + JSON.stringify(p));
    try {
      const res = await supabase.storage.from(bucket).list(p, { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });
      console.log(JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('error', e && e.message ? e.message : e);
    }
  }
})();
