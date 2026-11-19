drop trigger if exists queue_amazon_links on public.publication_queue;
drop function if exists public.trg_queue_amazon_links();
drop function if exists public.amazon_tag_campanha(uuid);
drop table if exists public.amazon_links;
