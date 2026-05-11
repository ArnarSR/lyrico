create table if not exists songs (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  composer text,
  voice_part text,
  lyrics text not null,
  audio_url text,
  audio_name text,
  concert_date bigint,
  created_at bigint not null
);

create table if not exists cards (
  id text primary key,
  song_id text references songs(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  line_index integer not null,
  text text not null,
  interval_days real not null,
  repetitions integer not null,
  ease_factor real not null,
  next_due bigint not null,
  last_quality integer,
  difficulty integer not null
);

alter table songs enable row level security;
alter table cards enable row level security;

create policy "songs: own rows" on songs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cards: own rows" on cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
