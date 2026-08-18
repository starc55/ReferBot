-- Keep Prisma's internal migration history inaccessible through the Supabase Data API.
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM anon, authenticated;
