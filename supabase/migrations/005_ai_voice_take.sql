alter table public.listings
  add column if not exists ai_voice_script text,
  add column if not exists ai_voice_url text,
  add column if not exists ai_voice_persona text,
  add column if not exists ai_voice_voice text,
  add column if not exists ai_voice_script_model text,
  add column if not exists ai_voice_tts_model text,
  add column if not exists ai_voice_prompt_version text,
  add column if not exists ai_voice_generated_at timestamptz;

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/ogg'
]
where id = 'listing-media';
