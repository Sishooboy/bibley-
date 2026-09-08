-- The trigger runs as the table owner, so API roles never need to call this
-- directly. Removing EXECUTE keeps it off the exposed RPC surface.
revoke execute on function public.touch_journal_updated_at() from public;
revoke execute on function public.touch_journal_updated_at() from anon;
revoke execute on function public.touch_journal_updated_at() from authenticated;
