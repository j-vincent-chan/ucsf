-- Ensure AI companion feedback rows are tied to the writer's workspace.
-- Requires community_id to match (no cross-tenant spoofing). Depends on
-- public.current_profile_community_id() from 20260514120000_profiles_select_same_community.sql

drop policy if exists "ai_companion_signal_feedback_insert_own" on public.ai_companion_signal_feedback;

create policy "ai_companion_signal_feedback_insert_own"
  on public.ai_companion_signal_feedback for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.current_profile_community_id() is not null
    and community_id = public.current_profile_community_id()
  );
