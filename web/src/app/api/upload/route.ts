import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_IMAGE = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * Stores a token's image and metadata JSON in public storage and returns the metadata URL,
 * which the launch uses as its tokenUri.
 */
export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (process.env.ZEPHYR_LOCAL_CONFIG) return NextResponse.json({ tokenUri: '', image: '' });
    return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const form = await req.formData();
  const clean = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max);
  const name = clean('name', 64);
  const symbol = clean('symbol', 16);
  if (!name || !symbol) return NextResponse.json({ error: 'Name and ticker are required' }, { status: 400 });

  const id = crypto.randomUUID();
  let image = '';
  const file = form.get('image');
  if (file instanceof File && file.size > 0) {
    const ext = TYPES[file.type];
    if (!ext) return NextResponse.json({ error: 'Image must be PNG, JPG, WEBP or GIF' }, { status: 400 });
    if (file.size > MAX_IMAGE) return NextResponse.json({ error: 'Image must be under 2 MB' }, { status: 400 });
    const path = `img/${id}.${ext}`;
    const { error } = await db.storage.from('tokens').upload(path, await file.arrayBuffer(), { contentType: file.type, cacheControl: '31536000' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    image = db.storage.from('tokens').getPublicUrl(path).data.publicUrl;
  }

  const link = (k: string) => {
    const v = clean(k, 200);
    return /^https:\/\//.test(v) ? v : '';
  };
  const meta = {
    name,
    symbol,
    description: clean('description', 1000),
    image,
    website: link('website'),
    twitter: link('twitter'),
    telegram: link('telegram'),
  };
  const path = `meta/${id}.json`;
  const { error } = await db.storage.from('tokens').upload(path, JSON.stringify(meta), { contentType: 'application/json', cacheControl: '31536000' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tokenUri: db.storage.from('tokens').getPublicUrl(path).data.publicUrl, image });
}
