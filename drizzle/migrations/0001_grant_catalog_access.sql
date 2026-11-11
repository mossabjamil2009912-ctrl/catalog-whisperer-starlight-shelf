GRANT ALL ON public.categories, public.catalogs, public.catalog_chunks, public.catalog_profiles TO service_role;
GRANT SELECT ON public.categories, public.catalogs TO anon, authenticated;