alter table public.campaigns drop column if exists categoria;
delete from public.offers where source = 'fraldabarata';
alter table public.offers drop constraint if exists offers_source_check;
alter table public.offers add constraint offers_source_check check (source = any (array['manual','telegram','whatsapp','auto']));
