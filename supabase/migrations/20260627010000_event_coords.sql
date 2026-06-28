-- Event coordinates (for the itinerary map) + a geocode cache.
-- Idempotent.

alter table events add column if not exists lat double precision;
alter table events add column if not exists lng double precision;

-- Cache geocoded venue queries so we don't re-hit Nominatim
create table if not exists geocode_cache (
  query      text        primary key,   -- normalized "venue, destination"
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now()
);
