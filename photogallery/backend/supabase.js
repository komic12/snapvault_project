const { createClient } = require('@supabase/supabase-js');
const { Readable } = require('stream');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'snapvault-images';

let supabase = null;

function isSupabaseEnabled() {
    return !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY !== 'your-service-role-key';
}

function initSupabase() {
    if (!isSupabaseEnabled()) return null;
    if (!supabase) {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
            global: { headers: { 'x-supabase-client': 'snapvault-backend' } }
        });
        console.log(`✅ Supabase storage enabled (${SUPABASE_BUCKET})`);
    }
    return supabase;
}

function getStorageBucket() {
    return SUPABASE_BUCKET;
}

async function toNodeStream(data) {
    if (Buffer.isBuffer(data)) return Readable.from(data);
    if (typeof data.pipe === 'function') return data;
    if (typeof data.arrayBuffer === 'function') {
        const buffer = Buffer.from(await data.arrayBuffer());
        return Readable.from(buffer);
    }
    if (typeof data[Symbol.asyncIterator] === 'function') {
        return Readable.from(data);
    }
    throw new Error('Unsupported Supabase download result type.');
}

async function uploadFile(objectPath, fileBuffer, contentType) {
    const client = initSupabase();
    if (!client) {
        throw new Error('Supabase storage is not configured.');
    }

    const { error } = await client.storage
        .from(SUPABASE_BUCKET)
        .upload(objectPath, fileBuffer, {
            contentType,
            upsert: false
        });

    if (error) {
        throw error;
    }
}

async function downloadFile(objectPath) {
    const client = initSupabase();
    if (!client) {
        throw new Error('Supabase storage is not configured.');
    }

    const { data, error } = await client.storage
        .from(SUPABASE_BUCKET)
        .download(objectPath);

    if (error) {
        throw error;
    }

    return await toNodeStream(data);
}

async function createSignedUrl(objectPath, expiresInSeconds = 3600) {
    const client = initSupabase();
    if (!client) {
        throw new Error('Supabase storage is not configured.');
    }

    const { data, error } = await client.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(objectPath, expiresInSeconds);

    if (error) {
        throw error;
    }

    return data.signedUrl;
}

async function deleteFile(objectPath) {
    const client = initSupabase();
    if (!client) {
        throw new Error('Supabase storage is not configured.');
    }

    const { error } = await client.storage.from(SUPABASE_BUCKET).remove([objectPath]);
    if (error) {
        throw error;
    }
}

module.exports = {
    isSupabaseEnabled,
    initSupabase,
    getStorageBucket,
    uploadFile,
    downloadFile,
    createSignedUrl,
    deleteFile
};