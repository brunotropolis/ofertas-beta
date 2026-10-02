alter table public.offers
  drop column if exists kind,
  drop column if exists coupon_code,
  drop column if exists coupon_meta,
  drop column if exists source_channel;
