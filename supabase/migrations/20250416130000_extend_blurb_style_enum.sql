-- Extend blurb styles for digest export formats.
-- Safe to run once; enum values cannot be removed.
alter type public.blurb_style add value if not exists 'linkedin';
alter type public.blurb_style add value if not exists 'bluesky_x';
alter type public.blurb_style add value if not exists 'instagram';

