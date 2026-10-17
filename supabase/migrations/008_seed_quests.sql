-- ============================================================
-- LIFE-RPG PROTOCOL — Seed Data
-- Starter quests available to all users
-- ============================================================

INSERT INTO public.quests (title, description, difficulty, skill_type, xp_reward, aura_reward, duration_minutes, requires_proof)
VALUES
  -- Focus quests
  ('Deep Work Sprint',       'Complete a 25-minute focused work session without distractions.',           'easy',      'focus',    200,   10,   25,  TRUE),
  ('Focus Marathon',         'Sustain 60 minutes of uninterrupted deep work.',                            'medium',    'focus',    500,   25,   60,  TRUE),
  ('Deep Work',              'Complete a 90-minute focused session. No distractions. Pure discipline.',    'hard',      'focus',    800,   50,   90,  TRUE),
  ('The Iron Mind',          'Complete a legendary 120-minute focus session. Only the worthy survive.',    'legendary', 'focus',   1500,  120,  120,  TRUE),

  -- Coding quests
  ('Bug Squasher',           'Find and fix a bug in your codebase. Document what you found.',              'easy',      'coding',   150,    5,   30,  TRUE),
  ('Ship a Feature',         'Complete and deploy a new feature to production.',                           'hard',      'coding',  1000,   60,  120,  TRUE),
  ('Code Review Warrior',    'Review 3 pull requests with meaningful, constructive feedback.',             'medium',    'coding',   400,   20,   45,  TRUE),
  ('Open Source Contribution','Make a meaningful contribution to an open source project.',                 'legendary', 'coding',  2000,  100,  180,  TRUE),

  -- Fitness quests
  ('Morning Stretch',        'Complete a 15-minute stretching or yoga routine.',                           'easy',      'fitness',  100,    5,   15,  TRUE),
  ('Cardio Burst',           'Complete a 30-minute cardio session (running, cycling, swimming).',          'medium',    'fitness',  350,   15,   30,  TRUE),
  ('Iron Temple',            'Complete a full strength training workout. Push your limits.',                'hard',      'fitness',  700,   40,   60,  TRUE),
  ('Ultra Endurance',        'Complete a 90+ minute endurance activity. Mind over body.',                   'legendary', 'fitness', 1200,   80,   90,  TRUE),

  -- Creative quests
  ('Sketch Session',         'Spend 20 minutes sketching, drawing, or designing.',                         'easy',      'creative', 120,    5,   20,  TRUE),
  ('Write 500 Words',        'Write at least 500 words — blog post, journal, story, anything.',            'medium',    'creative', 300,   15,   40,  TRUE),
  ('Create & Publish',       'Create a piece of content and publish it publicly.',                          'hard',      'creative', 800,   50,   60,  TRUE),
  ('Masterwork',             'Complete a significant creative project — video, article, design system.',    'legendary', 'creative',1800,  100,  180,  TRUE);
